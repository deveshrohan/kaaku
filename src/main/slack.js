import { WebClient } from '@slack/web-api'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const GROQ_BASE_URL  = 'https://api.groq.com/openai/v1'
const GROQ_MODEL     = 'llama-3.3-70b-versatile'
const CLAUDE_MODEL   = 'claude-haiku-4-5-20251001'
const CHANNEL_CAP    = 40    // max channels to scan per sync
const API_DELAY_MS   = 300   // pause between conversations.history calls

const sleep = ms => new Promise(r => setTimeout(r, ms))

const COMPLETION_EMOJIS = new Set([
  'white_check_mark', 'heavy_check_mark', 'ballot_box_with_check',
  'done', 'ticket', 'jira', 'check', 'checkered_flag',
])

// Module-level user name cache — persists across syncs in the same session
const nameCache = new Map()
let nameCachePopulated = false

// Bulk-populate name cache via users.list (requires users:read).
// Called once per session; subsequent calls are no-ops.
async function populateNameCache(slack) {
  if (nameCachePopulated) return
  try {
    let cursor
    do {
      const res = await slack.users.list({ limit: 200, cursor })
      for (const user of res.members || []) {
        if (user.deleted || user.is_bot) continue
        const n = user.profile?.display_name_normalized
               || user.profile?.display_name
               || user.real_name
               || user.name
               || user.id
        nameCache.set(user.id, n)
      }
      cursor = res.response_metadata?.next_cursor
    } while (cursor)
    nameCachePopulated = true
  } catch (err) {
    // users:read scope unavailable — fall back to per-user lookups
    console.warn('users.list failed, falling back to users.info per-lookup:', err.message)
  }
}

async function getName(slack, uid) {
  if (!uid) return 'unknown'
  if (nameCache.has(uid)) return nameCache.get(uid)
  try {
    const r = await slack.users.info({ user: uid })
    const n = r.user?.profile?.display_name_normalized
           || r.user?.profile?.display_name
           || r.user?.real_name
           || r.user?.name
           || uid
    nameCache.set(uid, n)
    return n
  } catch (err) {
    console.warn(`users.info failed for ${uid}:`, err.message)
    nameCache.set(uid, uid)
    return uid
  }
}

function relTime(ts) {
  const mins = Math.round((Date.now() / 1000 - parseFloat(ts)) / 60)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

// Replace <@UXXX> with @name using cache
function resolveText(text) {
  return (text || '').replace(/<@(U[A-Z0-9]+)>/g, (_, uid) => `@${nameCache.get(uid) || uid}`)
}

// Fetch all channels the user is in, sorted by most recently active first
async function fetchActiveChannels(slack, userId, oldest) {
  const all = []
  let cursor
  do {
    const res = await slack.users.conversations({
      types: 'public_channel,private_channel,mpim,im',
      exclude_archived: true, limit: 200, user: userId, cursor,
    })
    for (const ch of res.channels || []) {
      if (ch.latest?.ts && parseFloat(ch.latest.ts) < parseFloat(oldest)) continue
      all.push(ch)
    }
    cursor = res.response_metadata?.next_cursor
  } while (cursor)

  const priority = ch => ch.is_im ? 0 : ch.is_mpim ? 1 : ch.is_private ? 2 : 3
  all.sort((a, b) => {
    const pd = priority(a) - priority(b)
    if (pd !== 0) return pd
    return parseFloat(b.latest?.ts || 0) - parseFloat(a.latest?.ts || 0)
  })
  return all
}

// Build conversation units from all active channels
// Each unit = { type, channelId, channelName, messages[], threadTs, latestTs, keys[] }
async function buildConversationUnits(slack, userId, oldest, processedSet) {
  // Bulk-populate name cache upfront so all message senders resolve correctly
  await populateNameCache(slack)

  const allChannels = await fetchActiveChannels(slack, userId, oldest)
  const channels    = allChannels.slice(0, CHANNEL_CAP)   // cap to avoid rate limits
  console.log(`Slack sync: scanning ${channels.length} of ${allChannels.length} active channels`)
  const units = []

  for (const ch of channels) {
    await sleep(API_DELAY_MS)   // be kind to Slack rate limits
    try {
      const hist = await slack.conversations.history({ channel: ch.id, oldest, limit: 50 })
      const msgs = (hist.messages || []).filter(m => !m.subtype && !m.bot_id)
      if (msgs.length === 0) continue

      if (ch.is_im || ch.is_mpim) {
        // DM / Group DM: entire lookback window = one conversation unit
        const sorted = [...msgs].reverse() // oldest first
        const newKeys = sorted
          .filter(m => !processedSet.has(`${ch.id}:${m.ts}`))
          .map(m => `${ch.id}:${m.ts}`)
        if (newKeys.length === 0) continue

        // Resolve any senders not already in cache
        for (const m of sorted) await getName(slack, m.user)

        // For 1-on-1 DMs: use the other person's display name as channel name.
        // For group DMs: clean up the auto-generated "mpdm-alice--bob-1" format.
        let channelName = ch.name || ch.id
        if (ch.is_im && ch.user) {
          const otherName = await getName(slack, ch.user)
          if (otherName !== ch.user) channelName = otherName
        } else if (ch.is_mpim && ch.name) {
          // "mpdm-alice--bob--charlie-1" → "alice, bob, charlie"
          const cleaned = ch.name.replace(/^mpdm-/, '').replace(/-\d+$/, '').split('--').join(', ')
          if (cleaned) channelName = cleaned
        }

        units.push({
          type: ch.is_im ? 'dm' : 'group_dm',
          channelId: ch.id,
          channelName,
          messages: sorted.map(m => ({
            ts: m.ts, user: m.user, isMe: m.user === userId,
            text: m.text || '', reactions: m.reactions || [],
          })),
          threadTs: null,
          latestTs: sorted[sorted.length - 1]?.ts,
          keys: newKeys,
        })
      } else {
        // Channel: group by thread, only include threads/mentions involving the user
        for (const msg of msgs) {
          const msgKey   = `${ch.id}:${msg.ts}`
          const isMention = (msg.text || '').includes(`<@${userId}>`)
          const inThread  = (msg.reply_users || []).includes(userId)

          if (!isMention && !inThread) {
            // Not relevant — mark processed so we never revisit
            processedSet.add(msgKey)
            continue
          }

          if (msg.reply_count > 0 || inThread) {
            await sleep(API_DELAY_MS)
            try {
              const thread = await slack.conversations.replies({
                channel: ch.id, ts: msg.thread_ts || msg.ts, oldest, limit: 50,
              })
              const threadMsgs = (thread.messages || []).filter(m => !m.subtype && !m.bot_id)
              const newKeys = threadMsgs
                .filter(m => !processedSet.has(`${ch.id}:${m.ts}`))
                .map(m => `${ch.id}:${m.ts}`)
              if (newKeys.length === 0) continue

              // Pre-resolve names
              for (const m of threadMsgs) await getName(slack, m.user)

              const latestTs = thread.messages?.[0]?.latest_reply
                            || threadMsgs[threadMsgs.length - 1]?.ts

              units.push({
                type: 'thread',
                channelId: ch.id,
                channelName: ch.name || ch.id,
                messages: threadMsgs.map(m => ({
                  ts: m.ts, user: m.user, isMe: m.user === userId,
                  text: m.text || '', reactions: m.reactions || [],
                })),
                threadTs: msg.thread_ts || msg.ts,
                latestTs,
                keys: newKeys,
              })
            } catch {}
          } else if (isMention) {
            // Standalone @mention (no thread)
            if (processedSet.has(msgKey)) continue
            await getName(slack, msg.user)
            units.push({
              type: 'channel_mention',
              channelId: ch.id,
              channelName: ch.name || ch.id,
              messages: [{
                ts: msg.ts, user: msg.user, isMe: msg.user === userId,
                text: msg.text || '', reactions: msg.reactions || [],
              }],
              threadTs: msg.ts,
              latestTs: msg.ts,
              keys: [msgKey],
            })
          }
        }
      }
    } catch {}
  }

  return units
}

// Format conversation units into a readable block for the AI
function formatUnitsForAI(units) {
  return units.map((unit, i) => {
    const typeLabel = {
      dm:              'Direct Message',
      group_dm:        'Group DM',
      thread:          `Thread in #${unit.channelName}`,
      channel_mention: `Channel #${unit.channelName} (@mentioned)`,
    }[unit.type] || unit.type

    const lines = [`=== UNIT ${i} ===`, `Type: ${typeLabel}`]
    for (const msg of unit.messages) {
      const who  = msg.isMe ? 'you' : `@${nameCache.get(msg.user) || msg.user}`
      const time = relTime(msg.ts)
      const text = resolveText(msg.text).slice(0, 400)
      lines.push(`  ${who} [${time}]: ${text}`)
    }
    return lines.join('\n')
  }).join('\n\n')
}

// Classify conversation units — returns richer task objects
async function classify({ provider, claudeApiKey, groqApiKey, unitBlock }) {
  const prompt = `You are an intelligent assistant helping a busy professional stay on top of their Slack.

Analyze these conversation units and identify what requires action from "you".

RULES:
- "you" = the user in the conversation. Messages from "you" are messages YOU sent.
- CRITICAL: If "you" asked or assigned something to someone else (e.g. "you: can you check X?", "you: please do Y"), that is NOT your task — it's pending on THEM. Set pendingOnMe=false or skip entirely.
- Only extract items where SOMEONE ELSE is asking YOU to do something, or where YOU acknowledged a task but haven't delivered yet.
- DMs where the other person asked you to do something = high priority
- DMs where YOU asked them to do something = NOT your task, skip it
- @mentions in channels where someone asks you = high priority
- If "you" said "will check", "on it", "sure", "looking into it", "noted" → the task is STILL PENDING on you
- If "you" said "done", "sent", "fixed", "raised ticket", "PR up", "deployed", "merged" → resolved, skip it
- If "you" asked a question back → pending on them, skip it

For each actionable unit output one JSON object:
{
  "unitIdx": <number>,
  "action": "<specific action — include names, what, why — 60-100 chars>",
  "context": "<who asked, where, any urgency — max 60 chars>",
  "from": "<display name of the person asking, or 'multiple'>",
  "type": "task|reply|fyi|deadline",
  "priority": "high|medium|low",
  "pendingOnMe": true|false
}

Types: task=concrete thing to do, reply=someone waiting for your response, fyi=important info no action, deadline=time-sensitive

Priority: high=urgent/blocking/DM/acknowledged-but-undelivered, medium=should respond soon, low=FYI/indirect

Conversation units:
${unitBlock}

Return ONLY a valid JSON array. If nothing actionable, return [].`

  let rawText

  if (provider === 'groq') {
    const groq = new OpenAI({ apiKey: groqApiKey, baseURL: GROQ_BASE_URL })
    const res = await groq.chat.completions.create({
      model: GROQ_MODEL, max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    rawText = res.choices[0].message.content ?? ''
  } else {
    const anthropic = new Anthropic({ apiKey: claudeApiKey })
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL, max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    rawText = res.content[0].text ?? ''
  }

  return rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

// Check if a set of new messages signals task completion
function isResolved(msgs, userId) {
  const COMPLETION = /\b(done|sent|fixed|deployed|shipped|raised|created.{0,10}(ticket|jira)|pr.?up|merged|resolved|handled|sorted|completed|finished|pushed|uploaded|shared|updated|lgtm|approved|closing|closed)\b/i

  for (const msg of msgs) {
    // Emoji reaction from user on any message
    for (const reaction of (msg.reactions || [])) {
      if (COMPLETION_EMOJIS.has(reaction.name) && (reaction.users || []).includes(userId)) {
        return true
      }
    }
    // User sent a completion message
    if (msg.user === userId && COMPLETION.test(msg.text || '')) {
      return true
    }
  }
  return false
}

// Check pending Slack tasks for resolution — only re-fetches threads with new activity
export async function checkResolutions(slack, userId, pendingTasks) {
  const resolvedIds  = []
  const updatedTasks = [] // tasks with updated latestTs

  const CAP = 30 // max re-checks per sync cycle
  let checked = 0

  for (const task of pendingTasks) {
    if (!task.slackChannel || checked >= CAP) break
    checked++

    try {
      if (task.slackThreadTs) {
        // Thread — check if latest_reply changed
        const hist = await slack.conversations.history({
          channel: task.slackChannel,
          latest:    String(parseFloat(task.slackThreadTs) + 1),
          oldest:    String(parseFloat(task.slackThreadTs) - 1),
          limit: 1, inclusive: true,
        })
        const parent = hist.messages?.[0]
        if (!parent) continue

        const currentLatest = parent.latest_reply || parent.ts
        if (currentLatest === task.slackLatestTs) continue // no new activity

        // New activity — fetch only new replies
        const thread = await slack.conversations.replies({
          channel: task.slackChannel,
          ts:      task.slackThreadTs,
          oldest:  task.slackLatestTs || task.slackThreadTs,
          limit:   20,
        })
        const newMsgs = (thread.messages || []).filter(
          m => parseFloat(m.ts) > parseFloat(task.slackLatestTs || '0') && !m.subtype
        )

        if (isResolved(newMsgs, userId)) {
          resolvedIds.push(task.id)
        } else {
          updatedTasks.push({ ...task, slackLatestTs: currentLatest })
        }
      } else if (task.slackChannel) {
        // DM — check for new messages since last seen ts
        const hist = await slack.conversations.history({
          channel: task.slackChannel,
          oldest:  task.slackLatestTs || String(Date.now() / 1000 - 3600),
          limit:   20,
        })
        const newMsgs = (hist.messages || []).filter(
          m => parseFloat(m.ts) > parseFloat(task.slackLatestTs || '0') && !m.subtype && !m.bot_id
        )
        if (newMsgs.length === 0) continue

        if (isResolved(newMsgs, userId)) {
          resolvedIds.push(task.id)
        } else {
          const latestTs = newMsgs[0]?.ts || task.slackLatestTs
          updatedTasks.push({ ...task, slackLatestTs: latestTs })
        }
      }
    } catch {}
  }

  return { resolvedIds, updatedTasks }
}

export async function diagnoseSlack({ slackToken, slackUserToken, claudeApiKey, groqApiKey, provider = 'groq', lookbackHours = 6 }) {
  const steps = []
  const activeToken = slackUserToken || slackToken
  if (!activeToken) return [{ ok: false, label: 'Slack token', detail: 'No token entered' }]

  const tokenType = slackUserToken ? 'User token (xoxp)' : 'Bot token (xoxb)'
  const slack = new WebClient(activeToken)

  let userId
  try {
    const auth = await slack.auth.test()
    userId = auth.user_id
    steps.push({ ok: true, label: 'Slack auth', detail: `Connected as @${auth.user} (${auth.team}) · ${tokenType}` })
  } catch (err) {
    steps.push({ ok: false, label: 'Slack auth', detail: err.message })
    return steps
  }

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
  steps.push({
    ok: totalMsgs > 0,
    label: `Messages (last ${lookbackHours}h)`,
    detail: totalMsgs > 0
      ? `${totalMsgs} message(s) found across ${Math.min(activeChannels.length, 10)} channels (sample)`
      : 'No messages found — try increasing "Look back" hours',
  })

  const keyOk = provider === 'groq' ? !!groqApiKey : !!claudeApiKey
  steps.push({ ok: keyOk, label: `${provider === 'groq' ? 'Groq' : 'Claude'} API key`, detail: keyOk ? 'Key is set' : 'No API key entered' })

  return steps
}

export async function syncSlack({
  slackToken, slackUserToken, claudeApiKey, groqApiKey, provider = 'groq',
  processedIds = [], lookbackHours = 24,
  pendingSlackTasks = [],
}) {
  const activeToken = slackUserToken || slackToken
  if (!activeToken)                            return { todos: [], resolvedIds: [], updatedTasks: [], processedIds, error: 'Missing Slack token' }
  if (provider === 'groq'   && !groqApiKey)   return { todos: [], resolvedIds: [], updatedTasks: [], processedIds, error: 'Missing Groq API key' }
  if (provider === 'claude' && !claudeApiKey) return { todos: [], resolvedIds: [], updatedTasks: [], processedIds, error: 'Missing Claude API key' }

  const slack = new WebClient(activeToken)

  try {
    const auth   = await slack.auth.test()
    const userId = auth.user_id
    const oldest = String((Date.now() / 1000) - lookbackHours * 3600)

    // ── processedIds: only keep keys within the lookback window + 1 day buffer.
    // slice(-2000) was wrong — irrelevant channel messages filled the cap and
    // pushed out DM keys, causing them to be re-classified as duplicate tasks.
    const cutoff = (Date.now() / 1000) - (lookbackHours + 24) * 3600
    const processedSet = new Set(
      processedIds.filter(key => {
        const ts = parseFloat(key.split(':').pop())
        return !isNaN(ts) && ts >= cutoff
      })
    )
    console.log(`[sync] processedSet: ${processedSet.size} live keys (trimmed from ${processedIds.length})`)

    // ── Step 1: Check resolutions for existing pending Slack tasks ──
    const { resolvedIds, updatedTasks } = await checkResolutions(slack, userId, pendingSlackTasks)
    if (resolvedIds.length) console.log(`[sync] resolved ${resolvedIds.length} tasks`)

    // ── Step 2: Build conversation units for new messages ──
    const units = await buildConversationUnits(slack, userId, oldest, processedSet)
    console.log(`[sync] ${units.length} conversation units to classify`)

    if (units.length === 0) {
      return { todos: [], resolvedIds, updatedTasks, processedIds: [...processedSet] }
    }

    // ── Step 3: Classify in batches — per-batch errors don't abort the whole sync ──
    const BATCH = 20
    const todos = []

    for (let i = 0; i < units.length; i += BATCH) {
      const batch = units.slice(i, i + BATCH)
      try {
        const unitBlock = formatUnitsForAI(batch)

        // Attempt LLM call with one retry on failure
        let raw
        try {
          raw = await classify({ provider, claudeApiKey, groqApiKey, unitBlock })
        } catch (err) {
          console.warn(`[sync] LLM failed (batch ${i}), retrying in 3s:`, err.message)
          await sleep(3000)
          raw = await classify({ provider, claudeApiKey, groqApiKey, unitBlock })
        }

        let actionables = []
        try {
          actionables = JSON.parse(raw)
        } catch {
          console.warn(`[sync] JSON parse failed for batch ${i}, raw:`, raw?.slice(0, 200))
        }

        for (const a of actionables) {
          const unit = batch[a.unitIdx]
          if (!unit) continue
          if (!a.pendingOnMe) continue

          todos.push({
            id:               crypto.randomUUID(),
            text:             a.action,
            context:          a.context || '',
            from:             a.from || '',
            type:             ['task', 'reply', 'fyi', 'deadline'].includes(a.type) ? a.type : 'task',
            done:             false,
            priority:         ['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium',
            source:           'slack',
            createdAt:        Date.now(),
            slackChannel:     unit.channelId,
            slackChannelName: unit.channelName,
            slackThreadTs:    unit.threadTs,
            slackLatestTs:    unit.latestTs,
          })
        }

        console.log(`[sync] batch ${i}: ${actionables.length} actionable(s), ${todos.length} total so far`)
      } catch (err) {
        // Batch failed after retry — don't mark keys processed so they retry next sync
        console.error(`[sync] batch ${i} failed permanently, will retry next sync:`, err.message)
        continue
      }

      // Mark all keys in this batch as processed (success path)
      for (const unit of batch) {
        for (const key of unit.keys) processedSet.add(key)
      }
    }

    console.log(`[sync] done — ${todos.length} new task(s)`)
    return { todos, resolvedIds, updatedTasks, processedIds: [...processedSet] }
  } catch (err) {
    console.error('[sync] fatal error:', err.message)
    return { todos: [], resolvedIds: [], updatedTasks: [], processedIds, error: err.message }
  }
}

// ── Post a message to Slack (used by agents) ─────────────────────────
export async function postSlackMessage(token, channel, text, threadTs) {
  if (!token) throw new Error('No Slack token')
  if (!channel) throw new Error('Missing channel ID')
  if (!text) throw new Error('Missing message text')

  const slack = new WebClient(token)
  const opts = { channel, text }
  if (threadTs) opts.thread_ts = threadTs

  const result = await slack.chat.postMessage(opts)
  return { ok: result.ok, ts: result.ts, channel: result.channel }
}
