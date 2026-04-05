// ── Kaaku MCP worker — exposes Kaaku tools to the Claude Code CLI ────
// Spawned by the `claude` binary per --mcp-config.
// Communicates with the Kaaku Electron process via HTTP on the Unix socket.
// Implements MCP (Model Context Protocol) JSON-RPC 2.0 over stdio.
//
// Env vars (set by claude-code-executor.js):
//   KAAKU_SOCKET_PATH  — path to the Unix socket (e.g. /tmp/kaaku.sock)
//   KAAKU_RUN_ID       — parent run ID
//   KAAKU_AGENT_TYPE   — agent type (pm, review-prd, etc.)
//   KAAKU_SETTINGS_JSON — JSON-encoded credentials

import http from 'http'
import { getToolDefsForClaude, executeTool, isWriteTool, isAutoApprovable } from './agent/tools.js'

const SOCKET_PATH  = process.env.KAAKU_SOCKET_PATH  || '/tmp/kaaku.sock'
const RUN_ID       = process.env.KAAKU_RUN_ID       || 'unknown'
const AGENT_TYPE   = process.env.KAAKU_AGENT_TYPE   || 'pm'
const settings     = JSON.parse(process.env.KAAKU_SETTINGS_JSON || '{}')

// Get scoped tool list for this agent type
const toolDefs = getToolDefsForClaude(AGENT_TYPE, settings)

// ── MCP JSON-RPC 2.0 over stdio ──────────────────────────────────────

let inputBuffer = ''
process.stdin.setEncoding('utf8')

process.stdin.on('data', chunk => {
  inputBuffer += chunk
  const lines = inputBuffer.split('\n')
  inputBuffer = lines.pop() // keep incomplete line
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) {
      try { dispatch(JSON.parse(trimmed)) } catch {}
    }
  }
})

process.stdin.on('end', () => process.exit(0))

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

async function dispatch(msg) {
  // Notifications (no id) get no response
  if (msg.id === undefined || msg.id === null) return

  switch (msg.method) {
    case 'initialize':
      respond(msg.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'kaaku', version: '1.0.1' },
      })
      break

    case 'tools/list':
      respond(msg.id, {
        tools: toolDefs.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.input_schema,
        })),
      })
      break

    case 'tools/call': {
      const { name, arguments: args } = msg.params
      try {
        const result = await callTool(name, args || {})
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        respond(msg.id, {
          content: [{ type: 'text', text: text.length > 8000 ? text.slice(0, 8000) + '\n\n[truncated]' : text }],
          isError: false,
        })
      } catch (err) {
        respond(msg.id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        })
      }
      break
    }

    default:
      respondError(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}

// ── Tool execution ────────────────────────────────────────────────────

async function callTool(name, args) {
  // ── Internal tools ─────────────────────────────────────────────────
  if (name === 'ask_user') {
    const response = await socketPost('/mcp/ask', { runId: RUN_ID, question: args.question || '' })
    return response.reply || '(no reply)'
  }

  if (name === 'save_memory') {
    await socketPost('/mcp/memory', { runId: RUN_ID, key: args.key, value: args.value })
    return `Remembered: ${args.key}`
  }

  if (name === 'delegate_to_specialist') {
    const response = await socketPost('/mcp/delegate', {
      runId:        RUN_ID,
      specialist:   args.specialist,
      task_summary: args.task_summary,
      context:      args.context || '',
    })
    if (response.error) throw new Error(response.error)
    return response.result || ''
  }

  // ── Write tools requiring draft approval ────────────────────────────
  if (isWriteTool(name) && !isAutoApprovable(name)) {
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const response = await socketPost('/mcp/draft', {
      runId:       RUN_ID,
      draftId,
      tool:        name,
      args,
      preview:     buildPreview(name, args),
      consequence: buildConsequence(name, args),
    })
    if (!response.approved) {
      return 'User rejected this action. Try an alternative approach or ask for clarification.'
    }
  }

  // ── Execute via integration layer ───────────────────────────────────
  const result = await executeTool(name, args, settings)
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2)
}

// ── HTTP via Unix socket back to Kaaku Electron ───────────────────────

function socketPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request(
      {
        socketPath: SOCKET_PATH,
        path,
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      res => {
        let data = ''
        res.on('data', d => (data += d))
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch { resolve({}) }
        })
      }
    )
    req.on('error', err => reject(new Error(`Socket error: ${err.message}`)))
    req.write(payload)
    req.end()
  })
}

// ── Draft preview/consequence helpers ────────────────────────────────

function buildPreview(toolName, input) {
  switch (toolName) {
    case 'jira_create_issue':
      return `Create Jira issue in ${input.project_key}:\n**${input.summary}**\n\n${(input.description || '').slice(0, 300)}`
    case 'jira_add_comment':
      return `Comment on ${input.issue_key}:\n\n${(input.comment || '').slice(0, 300)}`
    case 'jira_update_issue':
      return `Update ${input.issue_key}:\n${JSON.stringify(input.fields, null, 2).slice(0, 300)}`
    case 'jira_transition_issue':
      return `Move ${input.issue_key} → "${input.transition}"`
    case 'github_create_branch':
      return `Create branch \`${input.branch_name}\` from \`${input.base_branch || 'main'}\` in ${input.owner}/${input.repo}`
    case 'github_create_or_update_file':
      return `Write \`${input.path}\` on \`${input.branch}\` in ${input.owner}/${input.repo}\n\n${(input.content || '').slice(0, 500)}`
    case 'github_create_pr':
      return `Open PR in ${input.owner}/${input.repo}:\n**${input.title}**\n\n${(input.body || '').slice(0, 300)}`
    case 'slack_post_message':
      return `Send to Slack ${input.channel}:\n\n${(input.text || '').slice(0, 300)}`
    case 'gmail_send':
      return `Email to ${input.to}:\n**Subject:** ${input.subject}\n\n${(input.body || '').slice(0, 300)}`
    default:
      return JSON.stringify(input, null, 2).slice(0, 400)
  }
}

function buildConsequence(toolName, input) {
  switch (toolName) {
    case 'jira_create_issue':         return `Creates a new Jira issue in ${input.project_key}`
    case 'jira_add_comment':          return `Adds a comment to ${input.issue_key}`
    case 'jira_update_issue':         return `Updates fields on ${input.issue_key}`
    case 'jira_transition_issue':     return `Moves ${input.issue_key} to "${input.transition}"`
    case 'github_create_branch':      return `Creates branch '${input.branch_name}' in ${input.owner}/${input.repo}`
    case 'github_create_or_update_file': return `Writes ${input.path} to GitHub`
    case 'github_create_pr':          return `Opens a pull request in ${input.owner}/${input.repo}`
    case 'slack_post_message':        return `Posts to Slack channel ${input.channel}`
    case 'gmail_send':                return `Sends an email to ${input.to}`
    default:                          return `Executes ${toolName}`
  }
}
