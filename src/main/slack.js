import { WebClient } from '@slack/web-api'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const GROQ_MODEL    = 'llama-3.3-70b-versatile'
const CLAUDE_MODEL  = 'claude-haiku-4-5-20251001'

async function classify({ provider, claudeApiKey, groqApiKey, userId, msgBlock }) {
  const prompt = `Analyze these Slack messages and identify action items for the user (ID: ${userId}).

Messages:
${msgBlock}

For each message that requires action from the user, output a JSON array item:
{"idx": <0-based index>, "text": "<concise task, max 70 chars>", "priority": "high|medium|low"}

Priority:
- high: urgent, has deadline, blocking someone, explicit request needed soon
- medium: important follow-up, no immediate deadline
- low: informational, nice-to-have, low-stakes

Return ONLY a valid JSON array. If no actionables, return [].`

  let rawText

  if (provider === 'groq') {
    const groq = new OpenAI({ apiKey: groqApiKey, baseURL: GROQ_BASE_URL })
    const res = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    rawText = res.choices[0].message.content ?? ''
  } else {
    const anthropic = new Anthropic({ apiKey: claudeApiKey })
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    rawText = res.content[0].text ?? ''
  }

  return rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

export async function diagnoseSlack({ slackToken, claudeApiKey, groqApiKey, provider = 'groq', lookbackHours = 6 }) {
  const steps = []
  if (!slackToken) return [{ ok: false, label: 'Slack token', detail: 'No token entered' }]

  const slack = new WebClient(slackToken)

  // Step 1: auth
  let userId
  try {
    const auth = await slack.auth.test()
    userId = auth.user_id
    steps.push({ ok: true, label: 'Slack auth', detail: `Connected as @${auth.user} (${auth.team})` })
  } catch (err) {
    steps.push({ ok: false, label: 'Slack auth', detail: err.message })
    return steps
  }

  // Step 2: channels
  let joinedChannels = []
  try {
    const res = await slack.conversations.list({
      types: 'public_channel,private_channel,mpim,im',
      exclude_archived: true, limit: 100,
    })
    joinedChannels = (res.channels || []).filter(c => c.is_member)
    steps.push({ ok: joinedChannels.length > 0, label: 'Channels accessible', detail: joinedChannels.length > 0 ? `${joinedChannels.length} channel(s): ${joinedChannels.slice(0,5).map(c => '#' + (c.name || c.id)).join(', ')}` : 'Bot is not in any channels — use /invite @YourBotName in Slack' })
  } catch (err) {
    steps.push({ ok: false, label: 'Channels accessible', detail: err.message })
    return steps
  }

  // Step 3: messages in lookback window
  const oldest = String((Date.now() / 1000) - lookbackHours * 3600)
  let totalMsgs = 0
  for (const ch of joinedChannels.slice(0, 10)) {
    try {
      const hist = await slack.conversations.history({ channel: ch.id, oldest, limit: 20 })
      totalMsgs += (hist.messages || []).filter(m => !m.subtype && !m.bot_id).length
    } catch {}
  }
  steps.push({ ok: totalMsgs > 0, label: `Messages (last ${lookbackHours}h)`, detail: totalMsgs > 0 ? `${totalMsgs} message(s) found` : 'No messages found in lookback window — try increasing "Look back" hours or send a test message' })

  // Step 4: AI key
  const keyOk = provider === 'groq' ? !!groqApiKey : !!claudeApiKey
  steps.push({ ok: keyOk, label: `${provider === 'groq' ? 'Groq' : 'Claude'} API key`, detail: keyOk ? 'Key is set' : 'No API key entered' })

  return steps
}

export async function syncSlack({
  slackToken, claudeApiKey, groqApiKey, provider = 'claude',
  processedIds = [], lookbackHours = 6,
}) {
  if (!slackToken) return { todos: [], processedIds, error: 'Missing Slack token' }
  if (provider === 'groq' && !groqApiKey)    return { todos: [], processedIds, error: 'Missing Groq API key' }
  if (provider === 'claude' && !claudeApiKey) return { todos: [], processedIds, error: 'Missing Claude API key' }

  const slack = new WebClient(slackToken)

  try {
    const auth   = await slack.auth.test()
    const userId = auth.user_id
    const oldest = String((Date.now() / 1000) - lookbackHours * 3600)
    const processedSet = new Set(processedIds)
    const messages = []

    let cursor
    do {
      const res = await slack.conversations.list({
        types: 'public_channel,private_channel,mpim,im',
        exclude_archived: true,
        limit: 100,
        cursor,
      })
      for (const ch of res.channels || []) {
        if (!ch.is_member) continue
        try {
          const hist = await slack.conversations.history({ channel: ch.id, oldest, limit: 20 })
          for (const msg of hist.messages || []) {
            const key = `${ch.id}:${msg.ts}`
            if (processedSet.has(key) || msg.subtype || msg.bot_id) continue
            messages.push({ key, channel: ch.name || ch.id, text: msg.text || '' })
          }
        } catch {} // no permission for this channel
      }
      cursor = res.response_metadata?.next_cursor
    } while (cursor)

    if (messages.length === 0) {
      return { todos: [], processedIds: [...processedSet].slice(-2000) }
    }

    const msgBlock = messages
      .slice(0, 40)
      .map((m, i) => `[${i}] #${m.channel}: ${m.text.slice(0, 200)}`)
      .join('\n')

    const raw = await classify({ provider, claudeApiKey, groqApiKey, userId, msgBlock })

    let actionables = []
    try { actionables = JSON.parse(raw) } catch {
      // Don't mark as processed — let them be re-evaluated next sync
      return { todos: [], processedIds: [...processedSet].slice(-2000) }
    }

    const todos = []
    for (const a of actionables) {
      const msg = messages[a.idx]
      if (!msg) continue
      // Only mark messages that produced a todo as processed (avoid re-adding same task)
      processedSet.add(msg.key)
      todos.push({
        id: Date.now() + Math.random(),
        text: a.text,
        done: false,
        priority: ['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'low',
        source: 'slack',
        slackChannel: msg.channel,
      })
    }

    // Mark non-actionable messages as processed too — but only messages older than 1h
    // to avoid silently ignoring very recent messages that might need another pass
    const oneHourAgo = (Date.now() / 1000) - 3600
    for (const msg of messages) {
      const ts = parseFloat(msg.key.split(':')[1] || '0')
      if (ts < oneHourAgo) processedSet.add(msg.key)
    }

    return { todos, processedIds: [...processedSet].slice(-2000) }
  } catch (err) {
    return { todos: [], processedIds, error: err.message }
  }
}
