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

    for (const msg of messages) processedSet.add(msg.key)

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
      return { todos: [], processedIds: [...processedSet].slice(-2000) }
    }

    const todos = []
    for (const a of actionables) {
      const msg = messages[a.idx]
      if (!msg) continue
      todos.push({
        id: Date.now() + Math.random(),
        text: a.text,
        done: false,
        priority: ['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'low',
        source: 'slack',
        slackChannel: msg.channel,
      })
    }

    return { todos, processedIds: [...processedSet].slice(-2000) }
  } catch (err) {
    return { todos: [], processedIds, error: err.message }
  }
}
