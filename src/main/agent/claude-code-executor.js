// ── Claude Code CLI executor ─────────────────────────────────────────
// Replaces the API-based runAgent() for the 'claude-code' provider.
// Each run spawns a `claude` subprocess with our custom MCP server.
// Same callback interface as runAgent() so index.js wires in identically.

import { spawn } from 'child_process'
import { join }  from 'path'
import { existsSync } from 'fs'
import os        from 'os'
import { app }   from 'electron'
import { getSystemPrompt }    from './prompts.js'
import { getMemoryForPrompt } from './memory.js'
import { AGENT_TOOLS }        from './tools.js'

const SOCKET_PATH = '/tmp/kaaku.sock'

// Agent type for each specialist role (mirrors executor.js)
const SPECIALIST_AGENT_TYPE = {
  architect: 'review-prd',
  developer: 'implement-prd',
  analyst:   'lookup-reply',
  qa:        'review-sprint',
}

// ── Binary resolution ─────────────────────────────────────────────────

let claudePathCache = null

function resolveClaude(override) {
  if (override && existsSync(override)) return override
  if (claudePathCache) return claudePathCache

  const candidates = [
    join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ]
  for (const p of candidates) {
    if (existsSync(p)) { claudePathCache = p; return p }
  }

  // Fall back to PATH
  return 'claude'
}

// ── MCP config builder ────────────────────────────────────────────────

function buildMcpConfig(runId, agentType, settings) {
  const workerPath = app.isPackaged
    ? join(process.resourcesPath, 'mcp-worker.js')
    : join(__dirname, '..', 'mcp-worker.js')  // out/main/ → src/main/ in dev

  // Strip sensitive/unneeded keys before serialising into env
  const settingsForWorker = {
    atlassianDomain:      settings.atlassianDomain,
    atlassianEmail:       settings.atlassianEmail,
    atlassianApiToken:    settings.atlassianApiToken,
    redashUrl:            settings.redashUrl,
    redashApiKey:         settings.redashApiKey,
    githubToken:          settings.githubToken,
    githubOrg:            settings.githubOrg,
    slackToken:           settings.slackToken,
    slackUserToken:       settings.slackUserToken,
    gmailTokens:          settings.gmailTokens,
    gmailEmail:           settings.gmailEmail,
  }

  return {
    mcpServers: {
      kaaku: {
        type:    'stdio',
        command: process.execPath.includes('node') ? process.execPath : 'node',
        args:    [workerPath],
        env: {
          KAAKU_SOCKET_PATH:    SOCKET_PATH,
          KAAKU_RUN_ID:         runId,
          KAAKU_AGENT_TYPE:     agentType,
          KAAKU_SETTINGS_JSON:  JSON.stringify(settingsForWorker),
        },
      },
    },
  }
}

// ── Allowed tools list for this agent type ────────────────────────────

function buildAllowedTools(agentType) {
  const toolNames = AGENT_TOOLS[agentType] || AGENT_TOOLS['pm']
  return toolNames.map(n => `mcp__kaaku__${n}`).join(',')
}

// ── User message builder (mirrors executor.js) ────────────────────────

function buildUserMessage(agentType, input) {
  const ctx = input.context ? `\n\nAdditional context: ${input.context}` : ''
  switch (agentType) {
    case 'generic':
    case 'pm':
      return (input.query || input.context || JSON.stringify(input)) + ctx
    case 'review-prd':
      if (input.jiraKey) return `Please review the PRD in Jira issue ${input.jiraKey}.${ctx}`
      return (input.query || JSON.stringify(input)) + ctx
    case 'create-prd':
      if (input.brief) return `Create a PRD for the following:\n\n${input.brief}\n\nTarget Jira project: ${input.projectKey}${ctx}`
      return (input.query || JSON.stringify(input)) + ctx
    case 'review-sprint':
      if (input.boardId) return `Review the sprint. Board ID: ${input.boardId}.${ctx}`
      return (input.query || JSON.stringify(input)) + ctx
    case 'implement-prd':
      if (input.jiraKey) return `Implement the PRD in Jira issue ${input.jiraKey}. Target repo: ${input.owner}/${input.repo}.${ctx}`
      return (input.query || JSON.stringify(input)) + ctx
    case 'lookup-reply':
      if (input.target) return `${input.query}\n\nReply target: ${input.target} (${input.targetType || 'slack'})${ctx}`
      return (input.query || JSON.stringify(input)) + ctx
    default:
      return (input.query || JSON.stringify(input)) + ctx
  }
}

// ── Stream-JSON event parser ──────────────────────────────────────────

function summarizeArgs(args) {
  const parts = []
  for (const [k, v] of Object.entries(args || {})) {
    const s = String(v)
    parts.push(`${k}: ${s.length > 60 ? s.slice(0, 60) + '...' : s}`)
  }
  return parts.join(', ')
}

function handleStreamEvent(event, runId, onStep, onComplete, onFail, resultReceived) {
  if (!event?.type) return

  if (event.type === 'system' && event.subtype === 'init') {
    onStep(runId, { ts: Date.now(), type: 'llm_call', content: 'Claude Code starting…' })
    return
  }

  if (event.type === 'assistant') {
    for (const block of event.message?.content || []) {
      if (block.type === 'text' && block.text?.trim()) {
        onStep(runId, { ts: Date.now(), type: 'thinking', content: block.text })
      } else if (block.type === 'tool_use') {
        // Strip mcp__kaaku__ prefix so UI labels match ACTION_LABELS
        const toolName = block.name.replace(/^mcp__[^_]+__/, '')
        onStep(runId, {
          ts: Date.now(), type: 'tool_call',
          tool: toolName,
          args: summarizeArgs(block.input),
          input: block.input,
        })
      }
    }
    return
  }

  if (event.type === 'user') {
    for (const block of event.message?.content || []) {
      if (block.type === 'tool_result') {
        const contentBlocks = Array.isArray(block.content) ? block.content : []
        const text = contentBlocks.filter(c => c.type === 'text').map(c => c.text).join('')
        onStep(runId, {
          ts: Date.now(), type: 'tool_result',
          result: text.slice(0, 200),
          fullResult: text.slice(0, 8000),
        })
      }
    }
    return
  }

  if (event.type === 'result') {
    resultReceived.value = true
    if (!event.is_error && event.subtype === 'success') {
      onComplete(runId, event.result || '')
    } else {
      onFail(runId, event.result || `Claude Code exited with subtype: ${event.subtype}`)
    }
  }
}

// ── Main executor ─────────────────────────────────────────────────────

export async function runClaudeCodeAgent({
  run, settings, onStep, onDraft, onAskUser, onComplete, onFail, isCancelled, onDelegation,
}) {
  const claudePath  = resolveClaude(settings.claudeCodePath)
  const agentType   = run.type || 'pm'
  const memory      = getMemoryForPrompt(agentType)
  const systemPrompt = getSystemPrompt(agentType, memory)
  const userMessage  = buildUserMessage(agentType, run.input)
  const mcpConfig    = buildMcpConfig(run.id, agentType, settings)
  const allowedTools = buildAllowedTools(agentType)

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--system-prompt',  systemPrompt,
    '--mcp-config',     JSON.stringify(mcpConfig),
    '--allowedTools',   allowedTools,
    '--dangerously-skip-permissions',
    '--',          // end of flags — prevents task text starting with '-' being parsed as a CLI option
    userMessage,
  ]

  let proc
  try {
    // Strip ANTHROPIC_API_KEY so the CLI uses its own OAuth session, not the API key
    const { ANTHROPIC_API_KEY: _stripped, ...cleanEnv } = process.env
    proc = spawn(claudePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanEnv,
    })
  } catch (err) {
    onFail(run.id, `Failed to spawn Claude Code: ${err.message}. Is 'claude' installed?`)
    return
  }

  const resultReceived = { value: false }
  let lineBuffer = ''

  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', chunk => {
    lineBuffer += chunk
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const event = JSON.parse(trimmed)
        if (!isCancelled()) handleStreamEvent(event, run.id, onStep, onComplete, onFail, resultReceived)
      } catch {}
    }
  })

  let stderrBuf = ''
  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', d => { stderrBuf += d })

  proc.on('close', code => {
    if (resultReceived.value || isCancelled()) return
    const errMsg = stderrBuf.trim().slice(0, 300) || `Claude Code exited with code ${code}`
    onFail(run.id, errMsg)
  })

  // Poll for cancellation — terminate the subprocess when the run is cancelled
  const cancelPoll = setInterval(() => {
    if (isCancelled() && proc && !proc.killed) {
      proc.kill('SIGTERM')
      clearInterval(cancelPoll)
    }
  }, 500)

  proc.on('close', () => clearInterval(cancelPoll))
}

// ── Sub-agent factory (used by /mcp/delegate handler in index.js) ─────
// Returns the agent type string for a given specialist name.
export function specialistAgentType(specialist) {
  return SPECIALIST_AGENT_TYPE[specialist] || 'pm'
}
