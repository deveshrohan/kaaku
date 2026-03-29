import Anthropic from '@anthropic-ai/sdk'
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk'
import OpenAI from 'openai'
import https from 'https'
import { getSystemPrompt } from './prompts.js'
import { getToolDefsForClaude, isWriteTool, isAutoApprovable, executeTool } from './tools.js'
import { getMemoryForPrompt } from './memory.js'

const CLAUDE_MODEL   = 'claude-sonnet-4-20250514'
const BEDROCK_MODEL  = 'us.anthropic.claude-sonnet-4-20250514-v1:0'
const GEMINI_MODEL   = 'gemini-2.0-flash'
const GROQ_MODEL     = 'llama-3.3-70b-versatile'
const GROQ_BASE_URL  = 'https://api.groq.com/openai/v1'
const MAX_ITERATIONS = 40
const RETRY_DELAYS   = [10000, 30000, 60000]  // exponential backoff for 429s
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Provider adapters ────────────────────────────────────────────────
// Each adapter normalizes a different LLM SDK into the same interface:
//   init()            → create client + initial messages
//   call(messages)    → raw response
//   parse(raw)        → { text, toolCalls: [{id, name, args}] }
//   pushAssistant()   → append assistant response to messages
//   pushToolResults() → append tool results to messages
//   pushUserReply()   → append user reply to messages

function createClaudeAdapter(settings, systemPrompt, tools) {
  const client = new Anthropic({ apiKey: settings.claudeApiKey })

  return {
    createMessages: (userMessage) => [{ role: 'user', content: userMessage }],

    call: (messages) => client.messages.create({
      model: CLAUDE_MODEL, max_tokens: 4096,
      system: systemPrompt, tools, messages,
    }),

    parse: (raw) => {
      let text = ''
      const toolCalls = []
      for (const block of raw.content) {
        if (block.type === 'text') text += block.text
        else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input })
      }
      return { text, toolCalls }
    },

    pushAssistant: (messages, raw) => {
      messages.push({ role: 'assistant', content: raw.content })
    },

    pushToolResults: (messages, results) => {
      messages.push({
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result', tool_use_id: r.id,
          content: r.content, ...(r.isError ? { is_error: true } : {}),
        })),
      })
    },

    pushUserReply: (messages, text) => {
      messages.push({ role: 'user', content: text })
    },
  }
}

function createBedrockAdapter(settings, systemPrompt, tools) {
  const client = new AnthropicBedrock({
    awsAccessKey: settings.bedrockAccessKeyId,
    awsSecretKey: settings.bedrockSecretAccessKey,
    awsRegion: settings.bedrockRegion || 'us-east-1',
  })

  return {
    createMessages: (userMessage) => [{ role: 'user', content: userMessage }],

    call: (messages) => client.messages.create({
      model: BEDROCK_MODEL, max_tokens: 4096,
      system: systemPrompt, tools, messages,
    }),

    parse: (raw) => {
      let text = ''
      const toolCalls = []
      for (const block of raw.content) {
        if (block.type === 'text') text += block.text
        else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input })
      }
      return { text, toolCalls }
    },

    pushAssistant: (messages, raw) => {
      messages.push({ role: 'assistant', content: raw.content })
    },

    pushToolResults: (messages, results) => {
      messages.push({
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result', tool_use_id: r.id,
          content: r.content, ...(r.isError ? { is_error: true } : {}),
        })),
      })
    },

    pushUserReply: (messages, text) => {
      messages.push({ role: 'user', content: text })
    },
  }
}

// ── Gemini rate limiting ─────────────────────────────────────────────
const sleepMs = ms => new Promise(r => setTimeout(r, ms))
let lastGeminiCall = 0

function geminiPostRaw(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => {
        if (res.statusCode >= 400) { reject({ statusCode: res.statusCode, body: raw.slice(0, 300) }); return }
        try { resolve(JSON.parse(raw)) } catch { reject({ statusCode: res.statusCode, body: 'Invalid JSON' }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function geminiPost(apiKey, body) {
  const now = Date.now()
  const elapsed = now - lastGeminiCall
  if (elapsed < 13000) await sleepMs(13000 - elapsed)
  lastGeminiCall = Date.now()

  for (let attempt = 0; attempt <= 4; attempt++) {
    try {
      return await geminiPostRaw(apiKey, body)
    } catch (err) {
      if (err.statusCode === 429 && attempt < 4) {
        const delay = Math.min(15000 * Math.pow(2, attempt), 60000)
        console.log(`[gemini] 429 rate limited, retrying in ${delay}ms`)
        await sleepMs(delay)
        lastGeminiCall = Date.now()
        continue
      }
      throw new Error(err.statusCode ? `Gemini ${err.statusCode}: ${err.body}` : err.message)
    }
  }
}

function createGeminiAdapter(settings, systemPrompt, claudeTools) {
  const apiKey = settings.geminiApiKey
  const tools = [{
    functionDeclarations: claudeTools.map(t => ({
      name: t.name, description: t.description, parameters: t.input_schema,
    })),
  }]

  return {
    createMessages: (userMessage) => [{ role: 'user', parts: [{ text: userMessage }] }],

    call: (contents) => geminiPost(apiKey, {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents, tools,
      tool_config: { function_calling_config: { mode: 'AUTO' } },
      generationConfig: { maxOutputTokens: 4096 },
    }),

    parse: (raw) => {
      const parts = raw.candidates?.[0]?.content?.parts || []
      const text = parts.filter(p => p.text).map(p => p.text).join('')
      const toolCalls = parts.filter(p => p.functionCall).map((p, i) => ({
        id: `fc-${i}`, name: p.functionCall.name, args: p.functionCall.args || {},
      }))
      return { text, toolCalls }
    },

    pushAssistant: (contents, raw) => {
      const parts = raw.candidates?.[0]?.content?.parts || []
      contents.push({ role: 'model', parts })
    },

    pushToolResults: (contents, results) => {
      contents.push({
        role: 'user',
        parts: results.map(r => ({
          functionResponse: { name: r.name, response: { content: r.content } },
        })),
      })
    },

    pushUserReply: (contents, text) => {
      contents.push({ role: 'user', parts: [{ text }] })
    },
  }
}

function createGroqAdapter(settings, systemPrompt, claudeTools) {
  const client = new OpenAI({ apiKey: settings.groqApiKey, baseURL: GROQ_BASE_URL })
  const tools = claudeTools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))

  return {
    createMessages: (userMessage) => [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],

    call: (messages) => client.chat.completions.create({
      model: GROQ_MODEL, max_tokens: 4096, tools, messages,
    }),

    parse: (raw) => {
      const choice = raw.choices?.[0]
      if (!choice) return { text: '', toolCalls: [] }
      const msg = choice.message
      const text = msg.content || ''
      const toolCalls = (msg.tool_calls || []).map(tc => {
        let args = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
        return { id: tc.id, name: tc.function.name, args }
      })
      return { text, toolCalls }
    },

    pushAssistant: (messages, raw) => {
      messages.push(raw.choices[0].message)
    },

    pushToolResults: (messages, results) => {
      for (const r of results) {
        messages.push({ role: 'tool', tool_call_id: r.id, content: r.content })
      }
    },

    pushUserReply: (messages, text) => {
      messages.push({ role: 'user', content: text })
    },
  }
}

// ── Unified agent loop ───────────────────────────────────────────────

// ── Specialist type mapping ─────────────────────────────────────────
const SPECIALIST_AGENT_TYPE = {
  architect: 'review-prd',
  developer: 'implement-prd',
  analyst:   'lookup-reply',
  qa:        'review-sprint',
}

export async function runAgent({ run, settings, onStep, onDraft, onAskUser, onComplete, onFail, isCancelled, onDelegation }) {
  const provider = settings.agentProvider || 'groq'
  const memoryContext = getMemoryForPrompt(run.type)
  const systemPrompt = getSystemPrompt(run.type, memoryContext)
  const claudeTools = getToolDefsForClaude(run.type, settings)
  const userMessage = buildUserMessage(run.type, run.input)

  const adapter = provider === 'bedrock' ? createBedrockAdapter(settings, systemPrompt, claudeTools)
               : provider === 'gemini'  ? createGeminiAdapter(settings, systemPrompt, claudeTools)
               : provider === 'groq'    ? createGroqAdapter(settings, systemPrompt, claudeTools)
               :                           createClaudeAdapter(settings, systemPrompt, claudeTools)

  const messages = adapter.createMessages(userMessage)

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (isCancelled()) return

      onStep(run.id, { ts: Date.now(), type: 'llm_call', content: `Iteration ${iteration + 1}` })

      let raw
      // Retry with exponential backoff on rate limits (429)
      let lastErr
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        try {
          raw = await adapter.call(messages)
          lastErr = null
          break
        } catch (apiErr) {
          lastErr = apiErr
          const is429 = apiErr?.status === 429 || String(apiErr?.message || '').includes('429')
          const isSchemaErr = String(apiErr?.message || '').includes('Failed to call a function')
          if ((is429 || isSchemaErr) && attempt < RETRY_DELAYS.length) {
            const delay = RETRY_DELAYS[attempt]
            console.log(`[agent] ${is429 ? '429 rate limit' : 'schema error'}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS.length})`)
            onStep(run.id, { ts: Date.now(), type: 'thinking', content: `Rate limited — retrying in ${delay / 1000}s...` })
            await sleep(delay)
            if (isCancelled()) return
            continue
          }
          break
        }
      }
      if (lastErr) {
        const errMsg = lastErr?.status
          ? `${provider} API error ${lastErr.status}: ${(lastErr.message || '').slice(0, 200)}`
          : `${provider} API error: ${(lastErr.message || String(lastErr)).slice(0, 300)}`
        throw new Error(errMsg)
      }

      if (isCancelled()) return

      const { text, toolCalls } = adapter.parse(raw)

      if (text) onStep(run.id, { ts: Date.now(), type: 'thinking', content: text })

      // No tool calls → done (autonomous — don't block on questions)
      if (toolCalls.length === 0) {
        onComplete(run.id, text)
        return
      }

      // Execute tool calls in parallel
      adapter.pushAssistant(messages, raw)
      const results = await Promise.all(toolCalls.map(async (tc) => {
        if (isCancelled()) return { id: tc.id, name: tc.name, content: 'Cancelled', isError: true }
        const result = await executeToolCall(run.id, tc.name, tc.args, settings, onStep, onDraft, onDelegation)
        return { id: tc.id, name: tc.name, content: result.content, isError: result.isError }
      }))
      if (isCancelled()) return
      adapter.pushToolResults(messages, results)
    }

    onComplete(run.id, 'Reached maximum iterations. Partial results may be available in the step log above.')
  } catch (err) {
    if (!isCancelled()) onFail(run.id, err.message)
  }
}

// ── Shared tool execution ───────────────────────────────────────────

async function executeToolCall(runId, toolName, toolInput, settings, onStep, onDraft, onDelegation) {
  // Intercept delegation tool — spawn sub-agent
  if (toolName === 'delegate_to_specialist') {
    return await handleDelegation(runId, toolInput, settings, onStep, onDraft, onDelegation)
  }

  onStep(runId, {
    ts: Date.now(), type: 'tool_call', tool: toolName,
    args: summarizeArgs(toolInput), input: toolInput,
  })

  if (isWriteTool(toolName)) {
    if (isAutoApprovable(toolName)) {
      // Safe write — auto-approve (Jira comments, GitHub branches/files, issue updates)
      onStep(runId, { ts: Date.now(), type: 'draft_approved', tool: toolName, auto: true })
    } else {
      // External-facing action — needs user approval (email, Slack, PRs, issue creation)
      const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const approved = await onDraft(runId, {
        id: draftId, tool: toolName, args: toolInput,
        preview: buildDraftPreview(toolName, toolInput),
        consequence: buildDraftConsequence(toolName, toolInput),
      })
      if (!approved) {
        onStep(runId, { ts: Date.now(), type: 'draft_rejected', tool: toolName })
        return { content: 'User rejected this action. Try an alternative approach.', isError: false }
      }
      onStep(runId, { ts: Date.now(), type: 'draft_approved', tool: toolName })
    }
  }

  try {
    const result = await executeTool(toolName, toolInput, settings)
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    const truncated = resultStr.length > 8000
      ? resultStr.slice(0, 8000) + '\n\n[... truncated, showing first 8000 chars]'
      : resultStr
    onStep(runId, { ts: Date.now(), type: 'tool_result', tool: toolName, result: truncated.slice(0, 200), fullResult: truncated })
    return { content: truncated, isError: false }
  } catch (err) {
    onStep(runId, { ts: Date.now(), type: 'tool_error', tool: toolName, result: err.message })
    return { content: `Error: ${err.message}`, isError: true }
  }
}

// ── Sub-agent delegation ────────────────────────────────────────────

async function handleDelegation(runId, toolInput, settings, onStep, onDraft, onDelegation) {
  const { specialist, task_summary, context } = toolInput
  const agentType = SPECIALIST_AGENT_TYPE[specialist]
  if (!agentType) {
    return { content: `Unknown specialist: ${specialist}. Valid: architect, developer, analyst, qa.`, isError: true }
  }

  onStep(runId, {
    ts: Date.now(), type: 'sub_agent_step',
    content: `Delegating to ${specialist}: ${task_summary}`,
  })

  // Notify UI for walk animation
  if (onDelegation) onDelegation(runId, { specialist })

  const subRunInput = { query: task_summary, context: context || '' }

  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Sub-agent timed out after 5 minutes')), 5 * 60 * 1000)

      const subRun = { id: `sub-${runId}-${specialist}-${Date.now()}`, type: agentType, input: subRunInput }

      runAgent({
        run: subRun,
        settings,
        onStep: (subRunId, step) => {
          // Report sub-agent steps to parent
          onStep(runId, { ...step, type: 'sub_agent_step', subAgent: specialist })
        },
        onDraft: (_subRunId, draft) => onDraft(runId, draft), // bubble to parent runId for IPC approval
        onAskUser: null,
        onComplete: (subRunId, text) => { clearTimeout(timeout); resolve(text) },
        onFail: (subRunId, error) => { clearTimeout(timeout); reject(new Error(error)) },
        isCancelled: () => false,
        onDelegation: null, // no recursive delegation
      })
    })

    onStep(runId, {
      ts: Date.now(), type: 'sub_agent_step',
      content: `${specialist} completed: ${String(result).slice(0, 200)}`,
    })

    return { content: `[${specialist} result]\n${result}`, isError: false }
  } catch (err) {
    onStep(runId, {
      ts: Date.now(), type: 'sub_agent_step',
      content: `${specialist} failed: ${err.message}`,
    })
    return { content: `Delegation to ${specialist} failed: ${err.message}`, isError: true }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildUserMessage(agentType, input) {
  // Context suffix used by several types
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

function summarizeArgs(args) {
  const parts = []
  for (const [k, v] of Object.entries(args || {})) {
    const s = String(v)
    parts.push(`${k}: ${s.length > 60 ? s.slice(0, 60) + '...' : s}`)
  }
  return parts.join(', ')
}

function buildDraftConsequence(toolName, input) {
  switch (toolName) {
    case 'jira_create_issue':       return `This will create a new Jira issue in project ${input.project_key}`
    case 'jira_add_comment':        return `This will add a comment to ${input.issue_key}`
    case 'jira_update_issue':       return `This will update fields on ${input.issue_key}`
    case 'jira_transition_issue':   return `This will move ${input.issue_key} to "${input.transition}"`
    case 'github_create_branch': return `This will create branch '${input.branch_name}' in ${input.owner}/${input.repo}`
    case 'github_create_or_update_file': return `This will write ${input.path} on branch ${input.branch} in ${input.owner}/${input.repo}`
    case 'github_create_pr':     return `This will open a pull request in ${input.owner}/${input.repo}`
    case 'slack_post_message':   return `This will post a message to Slack channel ${input.channel}`
    case 'gmail_send':           return `This will send an email to ${input.to}`
    default:                     return `This will execute ${toolName}`
  }
}

function buildDraftPreview(toolName, input) {
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
      return `Write file \`${input.path}\` on branch \`${input.branch}\` in ${input.owner}/${input.repo}\n\nCommit: ${input.message}\n\n\`\`\`\n${(input.content || '').slice(0, 500)}\n\`\`\``
    case 'github_create_pr':
      return `Open PR in ${input.owner}/${input.repo}:\n**${input.title}**\n\n${(input.body || '').slice(0, 300)}`
    case 'slack_post_message':
      return `Send to Slack channel ${input.channel}${input.thread_ts ? ` (thread)` : ''}:\n\n${(input.text || '').slice(0, 300)}`
    case 'gmail_send':
      return `Send email to ${input.to}:\n**Subject:** ${input.subject}\n\n${(input.body || '').slice(0, 300)}`
    default:
      return JSON.stringify(input, null, 2).slice(0, 400)
  }
}
