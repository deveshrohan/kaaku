import { WebClient } from '@slack/web-api'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const GROQ_MODEL    = 'llama-3.3-70b-versatile'
const CLAUDE_MODEL  = 'claude-haiku-4-5-20251001'

async function classify({ provider, claudeApiKey, groqApiKey, userId, msgBlock }) {
  const prompt = `You are an intelligent assistant helping a busy professional named Devesh stay on top of their Slack workspace.

Analyze these Slack messages and extract EVERYTHING important for the user (ID: ${userId}).

Context:
- Channels starting with D are direct messages with the user — high importance
- "[thread]" prefix means it's a reply in a thread where the user was mentioned
- <@${userId}> means the user is directly addressed

Capture ALL of the following:
1. Direct action items, requests, or tasks assigned to the user
2. Questions directed at the user that need a response
3. Important decisions, updates, or announcements the user should know about
4. Deadlines, meetings, or time-sensitive items
5. Things others are waiting on from the user (blockers)
6. Anything the user was specifically @mentioned for

Messages:
${msgBlock}

For each important item, output a JSON array item:
{"idx": <0-based index>, "text": "<concise summary, max 80 chars>", "priority": "high|medium|low"}

Priority:
- high: direct request/task to user, urgent, deadline, blocking someone, @mentioned
- medium: should respond soon, decisions affecting user, important FYI
- low: useful context, informational, indirect relevance

Be thorough — it is better to surface too much than miss something important.
Return ONLY a valid JSON array. If nothing important, return [].`

  let rawText

  if (provider === 'groq') {
    const groq = new OpenAI({ apiKey: groqApiKey, baseURL: GROQ_BASE_URL })
    const res = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    rawText = res.choices[0].message.content ?? ''
  } else {
    const anthropic = new Anthropic({ apiKey: claudeApiKey })
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    rawText = res.content[0].text ?? ''
  }

  return rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

// Fetch all channels the user is in, sorted by most recently active first
async function fetchActiveChannels(slack, userId, oldest) {
  const all = []
  let cursor
  do {
    const res = await slack.users.conversations({
      types: 'public_channel,private_channel,mpim,im',
      exclude_archived: true,
      limit: 200,
      user: userId,
      cursor,
    })
    for (const ch of res.channels || []) {
      // Skip channels with no activity in the lookback window
      if (ch.latest?.ts && parseFloat(ch.latest.ts) < parseFloat(oldest)) continue
      all.push(ch)
    }
    cursor = res.response_metadata?.next_cursor
  } while (cursor)

  // Sort: DMs first, then MPDMs, then private, then public — each group by recency
  const priority = ch => ch.is_im ? 0 : ch.is_mpim ? 1 : ch.is_private ? 2 : 3
  all.sort((a, b) => {
    const pd = priority(a) - priority(b)
    if (pd !== 0) return pd
    return parseFloat(b.latest?.ts || 0) - parseFloat(a.latest?.ts || 0)
  })
  return all
}

export async function diagnoseSlack({ slackToken, slackUserToken, claudeApiKey, groqApiKey, provider = 'groq', lookbackHours = 6 }) {
  const steps = []
  const activeToken = slackUserToken || slackToken
  if (!activeToken) return [{ ok: false, label: 'Slack token', detail: 'No token entered' }]

  const tokenType = slackUserToken ? 'User token (xoxp)' : 'Bot token (xoxb)'
  const slack = new WebClient(activeToken)

  // Step 1: auth
  let userId
  try {
    const auth = await slack.auth.test()
    userId = auth.user_id
    steps.push({ ok: true, label: 'Slack auth', detail: `Connected as @${auth.user} (${auth.team}) · ${tokenType}` })
  } catch (err) {
    steps.push({ ok: false, label: 'Slack auth', detail: err.message })
    return steps
  }

  // Step 2: active channels in lookback window
  const oldest = String((Date.now() / 1000) - lookbackHours * 3600)
  let activeChannels = []
  try {
    activeChannels = await fetchActiveChannels(slack, userId, oldest)
    steps.push({
      ok: activeChannels.length > 0,
      label: 'Active channels',
      detail: activeChannels.length > 0
        ? `${activeChannels.length} channel(s) with recent activity`
        : 'No channels had activity in lookback window',
    })
  } catch (err) {
    steps.push({ ok: false, label: 'Active channels', detail: err.message })
    return steps
  }

  // Step 3: sample messages
  let totalMsgs = 0
  for (const ch of activeChannels.slice(0, 10)) {
    try {
      const hist = await slack.conversations.history({ channel: ch.id, oldest, limit: 20 })
      for (const msg of hist.messages || []) {
        if (msg.subtype || msg.bot_id) continue
        totalMsgs++
        if (msg.reply_count > 0 && (msg.reply_users || []).includes(userId)) {
          const thread = await slack.conversations.replies({ channel: ch.id, ts: msg.thread_ts || msg.ts, oldest, limit: 50 }).catch(() => ({ messages: [] }))
          totalMsgs += (thread.messages || []).slice(1).filter(r => !r.subtype && !r.bot_id && (r.text || '').includes(`<@${userId}>`)).length
        }
      }
    } catch {}
  }
  steps.push({ ok: totalMsgs > 0, label: `Messages (last ${lookbackHours}h)`, detail: totalMsgs > 0 ? `${totalMsgs} message(s) found across ${Math.min(activeChannels.length, 10)} channels (sample)` : 'No messages found — try increasing "Look back" hours' })

  // Step 4: AI key
  const keyOk = provider === 'groq' ? !!groqApiKey : !!claudeApiKey
  steps.push({ ok: keyOk, label: `${provider === 'groq' ? 'Groq' : 'Claude'} API key`, detail: keyOk ? 'Key is set' : 'No API key entered' })

  return steps
}

export async function syncSlack({
  slackToken, slackUserToken, claudeApiKey, groqApiKey, provider = 'claude',
  processedIds = [], lookbackHours = 6,
}) {
  const activeToken = slackUserToken || slackToken
  if (!activeToken) return { todos: [], processedIds, error: 'Missing Slack token' }
  if (provider === 'groq' && !groqApiKey)    return { todos: [], processedIds, error: 'Missing Groq API key' }
  if (provider === 'claude' && !claudeApiKey) return { todos: [], processedIds, error: 'Missing Claude API key' }

  const slack = new WebClient(activeToken)

  try {
    const auth   = await slack.auth.test()
    const userId = auth.user_id
    const oldest = String((Date.now() / 1000) - lookbackHours * 3600)
    const processedSet = new Set(processedIds)
    const messages = []

    // Only channels that had activity in the lookback window — covers all 1000+ channels efficiently
    const activeChannels = await fetchActiveChannels(slack, userId, oldest)

    for (const ch of activeChannels) {
      try {
        const hist = await slack.conversations.history({ channel: ch.id, oldest, limit: 30 })
        for (const msg of hist.messages || []) {
          if (msg.subtype || msg.bot_id) continue

          const key = `${ch.id}:${msg.ts}`
          if (!processedSet.has(key)) {
            messages.push({ key, channel: ch.name || ch.id, text: msg.text || '' })
          }

          // Thread replies that mention the user
          if (msg.reply_count > 0 && (msg.reply_users || []).includes(userId)) {
            try {
              const thread = await slack.conversations.replies({ channel: ch.id, ts: msg.thread_ts || msg.ts, oldest, limit: 50 })
              for (const reply of (thread.messages || []).slice(1)) {
                if (reply.subtype || reply.bot_id) continue
                const rkey = `${ch.id}:${reply.ts}`
                if (processedSet.has(rkey)) continue
                if ((reply.text || '').includes(`<@${userId}>`)) {
                  messages.push({ key: rkey, channel: ch.name || ch.id, text: `[thread] ${reply.text || ''}` })
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    if (messages.length === 0) {
      return { todos: [], processedIds: [...processedSet].slice(-2000) }
    }

    // Process in batches of 60 to avoid token limits
    const BATCH = 60
    const todos = []

    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH)
      const msgBlock = batch.map((m, j) => `[${j}] #${m.channel}: ${m.text.slice(0, 300)}`).join('\n')

      const raw = await classify({ provider, claudeApiKey, groqApiKey, userId, msgBlock })
      let actionables = []
      try { actionables = JSON.parse(raw) } catch { continue }

      for (const a of actionables) {
        const msg = batch[a.idx]
        if (!msg) continue
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
    }

    // Mark non-actionable messages older than 1h as processed
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
