import { WebClient } from '@slack/web-api'
import Anthropic from '@anthropic-ai/sdk'

export async function syncSlack({ slackToken, claudeApiKey, processedIds = [], lookbackHours = 6 }) {
  if (!slackToken || !claudeApiKey) {
    return { todos: [], processedIds, error: 'Missing Slack token or Claude API key' }
  }

  const slack = new WebClient(slackToken)
  const anthropic = new Anthropic({ apiKey: claudeApiKey })

  try {
    const auth = await slack.auth.test()
    const userId = auth.user_id
    const oldest = String((Date.now() / 1000) - lookbackHours * 3600)
    const processedSet = new Set(processedIds)
    const messages = []

    // Fetch all joined channels + DMs
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

    // Mark all fetched messages as seen to avoid re-scanning
    for (const msg of messages) processedSet.add(msg.key)

    if (messages.length === 0) {
      return { todos: [], processedIds: [...processedSet].slice(-2000) }
    }

    const msgBlock = messages
      .slice(0, 40)
      .map((m, i) => `[${i}] #${m.channel}: ${m.text.slice(0, 200)}`)
      .join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyze these Slack messages and identify action items for the user (ID: ${userId}).

Messages:
${msgBlock}

For each message that requires action from the user, output a JSON array item:
{"idx": <0-based index>, "text": "<concise task, max 70 chars>", "priority": "high|medium|low"}

Priority guide:
- high: urgent, has deadline, blocking someone, explicit request needed soon
- medium: important follow-up, no immediate deadline
- low: informational, nice-to-have, low-stakes

Return ONLY a valid JSON array. If no actionables, return [].`,
      }],
    })

    let actionables = []
    try {
      const raw = response.content[0].text.trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      actionables = JSON.parse(raw)
    } catch {
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
