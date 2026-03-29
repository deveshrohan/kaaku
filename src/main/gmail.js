import https from 'https'
import http  from 'http'
import { exec } from 'child_process'

// ── Google OAuth credentials ───────────────────────────────────────
// Loaded from src/main/google-creds.js (gitignored).
// Copy google-creds.example.js → google-creds.js and fill in your credentials.
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './google-creds.js'

// ── HTTP helpers ───────────────────────────────────────────────────
function httpsPost(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString()
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function httpsGet(urlStr, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'GET',
      headers:  { Authorization: `Bearer ${token}` },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
    })
    req.on('error', reject)
    req.end()
  })
}

// ── Token management ───────────────────────────────────────────────
export async function refreshTokenIfNeeded(tokens) {
  if (!tokens?.refresh_token) return tokens
  if (tokens.expiry_date && Date.now() < tokens.expiry_date - 5 * 60 * 1000) return tokens

  const result = await httpsPost('https://oauth2.googleapis.com/token', {
    client_id:     GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
    grant_type:    'refresh_token',
  })
  if (!result.access_token) return tokens
  return {
    ...tokens,
    access_token: result.access_token,
    expiry_date:  Date.now() + (result.expires_in || 3600) * 1000,
  }
}

// ── OAuth connect ──────────────────────────────────────────────────
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export function connectGmail() {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('YOUR_')) {
      reject(new Error('Google credentials not configured'))
      return
    }

    console.log('[gmail] starting OAuth flow...')

    let port, redirectUri, timeout

    const server = http.createServer(async (req, res) => {
      try {
        console.log('[gmail] callback received:', req.url)
        const u = new URL(req.url, `http://127.0.0.1:${port}`)
        if (u.pathname !== '/callback') { res.writeHead(404).end(); return }

        const code  = u.searchParams.get('code')
        const error = u.searchParams.get('error')
        console.log('[gmail] code:', code ? 'received' : 'none', '| error:', error || 'none')

        const html = error
          ? `<html><body style="font-family:system-ui;text-align:center;padding:80px;color:#333"><h2>❌ Cancelled</h2><p>You can close this tab and return to Kaaku.</p></body></html>`
          : `<html><body style="font-family:system-ui;text-align:center;padding:80px;color:#333"><h2 style="color:#1a73e8">✅ Gmail connected!</h2><p>You can close this tab and return to Kaaku.</p></body></html>`
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(html)

        clearTimeout(timeout)
        server.close()

        if (error) { reject(new Error('Sign-in was cancelled')); return }
        if (!code)  { reject(new Error('No authorisation code received')); return }

        const tokenRes = await httpsPost('https://oauth2.googleapis.com/token', {
          code,
          client_id:     GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
        })
        console.log('[gmail] token exchange:', { ok: !!tokenRes.access_token, error: tokenRes.error })

        if (!tokenRes.access_token) {
          reject(new Error(tokenRes.error_description || tokenRes.error || 'Token exchange failed'))
          return
        }

        const tokens = {
          access_token:  tokenRes.access_token,
          refresh_token: tokenRes.refresh_token,
          expiry_date:   Date.now() + (tokenRes.expires_in || 3600) * 1000,
        }
        const userInfo = await httpsGet('https://www.googleapis.com/oauth2/v2/userinfo', tokens.access_token)
        resolve({ tokens, email: userInfo.email || '' })
      } catch (err) {
        console.error('[gmail] callback handler error:', err.message)
        reject(err)
      }
    })

    server.on('error', err => {
      console.error('[gmail] server error:', err.message)
      reject(err)
    })

    server.listen(0, '127.0.0.1', () => {
      try {
        port = server.address().port
        redirectUri = `http://127.0.0.1:${port}/callback`
        console.log('[gmail] callback server listening on port', port)

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
        authUrl.searchParams.set('client_id',     GOOGLE_CLIENT_ID)
        authUrl.searchParams.set('redirect_uri',  redirectUri)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('scope',         SCOPES)
        authUrl.searchParams.set('access_type',   'offline')
        authUrl.searchParams.set('prompt',        'consent')

        timeout = setTimeout(() => {
          server.close()
          reject(new Error('Sign-in timed out — please try again'))
        }, 5 * 60 * 1000)

        const openUrl = authUrl.toString()
        console.log('[gmail] opening:', openUrl.slice(0, 80) + '...')
        exec(`open "${openUrl}"`, (err) => {
          if (err) {
            console.error('[gmail] open failed:', err.message)
            clearTimeout(timeout)
            server.close()
            reject(new Error('Could not open browser: ' + err.message))
          } else {
            console.log('[gmail] browser opened')
          }
        })
      } catch (err) {
        console.error('[gmail] listen callback error:', err.message)
        server.close()
        reject(err)
      }
    })
  })
}

// ── Gmail sync ─────────────────────────────────────────────────────
async function fetchEmailDetails(token, messageIds) {
  const emails = []
  for (const id of messageIds) {
    try {
      const msg = await httpsGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}` +
        `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        token
      )
      if (!msg.id) continue
      const h = Object.fromEntries((msg.payload?.headers || []).map(h => [h.name, h.value]))
      emails.push({
        id:       msg.id,
        threadId: msg.threadId || null,
        subject:  (h.Subject || '(no subject)').slice(0, 100),
        from:     (h.From    || '').slice(0, 80),
        snippet:  (msg.snippet || '').slice(0, 250),
        internalDate: parseInt(msg.internalDate || '0', 10),
      })
    } catch { /* skip individual failures */ }
  }
  return emails
}

// Group emails by threadId, keeping only the latest per thread.
// Follow-up/reminder emails in the same thread shouldn't create separate TODOs.
function dedupeByThread(emails) {
  const threadMap = new Map()
  for (const e of emails) {
    const key = e.threadId || e.id  // fall back to id if no threadId
    const existing = threadMap.get(key)
    if (!existing || e.internalDate > existing.internalDate) {
      threadMap.set(key, e)
    }
  }
  return [...threadMap.values()]
}

async function classifyEmails({ emails, provider, claudeApiKey, groqApiKey }) {
  if (emails.length === 0) return []

  const block = emails.map((e, i) =>
    `[${i + 1}] From: ${e.from}\nSubject: ${e.subject}\nPreview: ${e.snippet}`
  ).join('\n\n')

  const prompt =
    `You are a strict personal assistant filter. From these emails, flag ONLY the ones where ` +
    `the recipient must personally take a specific action that will fail or block someone if ignored.\n\n` +
    `INCLUDE: direct requests for approval/decision, someone blocked waiting for your reply, ` +
    `you are explicitly asked to do something with a deadline, a contract/doc needs your signature.\n\n` +
    `EXCLUDE (do not flag these): meeting invites (calendar handles them), UAT/testing invites, ` +
    `newsletters, automated notifications, FYI emails, CC emails, status updates, ` +
    `marketing, receipts, "just keeping you in the loop" messages, anything that resolves itself ` +
    `without your involvement.\n\nEmails:\n${block}\n\n` +
    `Reply ONLY with a JSON array. Include only genuinely blocked/urgent items:\n` +
    `[{"index": N, "task": "specific action needed ≤80 chars", "priority": "high|medium|low"}]\n` +
    `If nothing truly requires action, reply with []. When in doubt, exclude it.`

  let raw = '[]'
  try {
    if (provider === 'groq') {
      const OpenAI = (await import('openai')).default
      const client = new OpenAI({ apiKey: groqApiKey, baseURL: 'https://api.groq.com/openai/v1' })
      const res = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0,
      })
      raw = res.choices[0]?.message?.content || '[]'
    } else {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client    = new Anthropic({ apiKey: claudeApiKey })
      const res       = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages:   [{ role: 'user', content: prompt }],
      })
      raw = res.content[0]?.text || '[]'
    }
  } catch (err) {
    console.error('[gmail] LLM classify error:', err.message)
    return []
  }

  const match = raw.match(/\[[\s\S]*\]/)
  const items = match ? JSON.parse(match[0]) : []

  return items.map(item => {
    const email = emails[item.index - 1]
    if (!email) return null
    return {
      id:            crypto.randomUUID(),
      text:          String(item.task || '').slice(0, 120),
      done:          false,
      createdAt:     Date.now(),
      priority:      ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
      source:        'gmail',
      gmailId:       email.id,
      gmailThreadId: email.threadId || null,
      gmailFrom:     email.from,
    }
  }).filter(Boolean)
}

const BATCH = 15

// Convert a Set of bare IDs into "id:timestamp" pairs for time-based expiry
function stampIds(idSet) {
  const now = Date.now()
  return [...idSet].map(id => `${id}:${now}`)
}

export async function syncGmail({ tokens, lookbackHours = 24, claudeApiKey, groqApiKey, provider = 'groq', processedIds = [] }) {
  const freshTokens = await refreshTokenIfNeeded(tokens)
  const token = freshTokens.access_token

  const afterEpoch = Math.floor((Date.now() - lookbackHours * 3600 * 1000) / 1000)
  // Exclude bulk/automated senders; focus on direct mail + starred
  const query = `(is:starred OR (is:unread in:inbox -category:promotions -category:social -category:updates -category:forums)) after:${afterEpoch}`
  console.log('[gmail] syncing, query:', query)

  const searchRes = await httpsGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
    token
  )

  const allMessages = searchRes.messages || []
  // Time-based cutoff for processedIds (lookback + 1 day buffer), matching Slack behavior.
  // The old slice(-3000) cap could evict IDs and cause re-processing.
  const cutoffMs = Date.now() - (lookbackHours + 24) * 3600 * 1000
  const processedSet = new Set(
    processedIds.filter(entry => {
      // processedIds are gmail message IDs (hex strings, not timestamps).
      // Keep entries that were added recently by storing them as "id:timestamp" pairs.
      // For backward compat, keep bare IDs (old format) for one full cycle.
      const parts = entry.split(':')
      if (parts.length === 2) {
        const ts = parseInt(parts[1], 10)
        return !isNaN(ts) && ts >= cutoffMs
      }
      return true // keep old-format bare IDs for one cycle
    }).map(entry => entry.split(':')[0]) // extract just the ID part
  )
  const newIds = allMessages.map(m => m.id).filter(id => !processedSet.has(id))

  console.log(`[gmail] ${allMessages.length} messages found, ${newIds.length} new`)

  if (newIds.length === 0) {
    return { todos: [], processedIds: stampIds(processedSet), tokens: freshTokens, error: null }
  }

  const allEmails = await fetchEmailDetails(token, newIds.slice(0, 50))
  // Group by thread — only classify the latest email per thread to avoid
  // follow-up/reminder emails creating duplicate TODOs
  const emails = dedupeByThread(allEmails)
  if (allEmails.length > emails.length) {
    console.log(`[gmail] thread dedup: ${allEmails.length} → ${emails.length} emails`)
  }
  const todos  = []

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH)
    try {
      const classified = await classifyEmails({ emails: batch, provider, claudeApiKey, groqApiKey })
      todos.push(...classified)
    } catch (err) {
      console.error('[gmail] classify batch failed:', err.message)
    }
    for (const e of batch) processedSet.add(e.id)
  }
  // Also mark thread-deduped emails as processed so they don't reappear
  for (const e of allEmails) processedSet.add(e.id)

  console.log(`[gmail] sync done — ${todos.length} action items`)
  return { todos, processedIds: stampIds(processedSet), tokens: freshTokens, error: null }
}

// ── Gmail auto-resolution ──────────────────────────────────────────
// Check if the user has replied to threads that have pending TODOs.
// If the user sent a message in the thread after the TODO was created,
// the task is likely handled — auto-resolve it.
export async function checkGmailResolutions(tokens, pendingTasks) {
  const resolvedIds = []
  if (!pendingTasks.length) return { resolvedIds }

  const freshTokens = await refreshTokenIfNeeded(tokens)
  const token = freshTokens.access_token

  const CAP = 20
  let checked = 0

  for (const task of pendingTasks) {
    if (!task.gmailThreadId || checked >= CAP) break
    checked++

    try {
      // Fetch all messages in the thread
      const thread = await httpsGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${task.gmailThreadId}` +
        `?format=metadata&metadataHeaders=From`,
        token
      )
      const messages = thread.messages || []

      // Check if any message AFTER the TODO was created is FROM the user
      // (Gmail labels sent messages with the SENT label)
      for (const msg of messages) {
        const msgDate = parseInt(msg.internalDate || '0', 10)
        if (msgDate <= task.createdAt) continue // older than the TODO
        const labels = msg.labelIds || []
        if (labels.includes('SENT')) {
          resolvedIds.push(task.id)
          break
        }
      }
    } catch { /* skip failures */ }
  }

  if (resolvedIds.length) console.log(`[gmail] auto-resolved ${resolvedIds.length} tasks`)
  return { resolvedIds }
}

// ── Send an email via Gmail (used by agents) ────────────────────────
export async function sendGmail(tokens, to, subject, body) {
  if (!to) throw new Error('Missing recipient email')
  if (!subject) throw new Error('Missing subject')

  const freshTokens = await refreshTokenIfNeeded(tokens)
  const token = freshTokens.access_token

  // Build RFC 2822 message and base64url-encode it
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body || '',
  ].join('\r\n')
  const encoded = Buffer.from(message).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return new Promise((resolve, reject) => {
    const postBody = JSON.stringify({ raw: encoded })
    const req = https.request({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages/send',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postBody),
      },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => {
        try {
          const data = JSON.parse(raw)
          if (data.error) reject(new Error(data.error.message || 'Gmail send failed'))
          else resolve({ ok: true, messageId: data.id, threadId: data.threadId })
        } catch { resolve({ ok: true }) }
      })
    })
    req.on('error', reject)
    req.write(postBody)
    req.end()
  })
}
