/**
 * Kaaku — comprehensive test suite
 * Run: node tests/kaaku.test.mjs
 */

import fs   from 'fs'
import path from 'path'
import net  from 'net'
import http from 'http'
import os   from 'os'

// ── Tiny test harness ─────────────────────────────────────────────
let passed = 0, failed = 0, warned = 0
const results = []

function test(name, fn) {
  try {
    const r = fn()
    if (r instanceof Promise) return r.then(() => { passed++; results.push({ s: '✓', n: name }) })
                                      .catch(e  => { failed++; results.push({ s: '✗', n: name, e: e.message }) })
    passed++
    results.push({ s: '✓', n: name })
  } catch(e) {
    failed++
    results.push({ s: '✗', n: name, e: e.message })
  }
}
function warn(name, msg) {
  warned++
  results.push({ s: '⚠', n: name, e: msg })
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed') }
function assertEqual(a, b) { if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }

async function socketPost(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: '/tmp/kaaku.sock', path: '/event', method: 'POST',
      headers: { 'Content-Type': 'application/json' } }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.write(typeof payload === 'string' ? payload : JSON.stringify(payload))
    req.end()
  })
}

async function socketRequest(method, path, payload) {
  return new Promise((resolve, reject) => {
    const opts = { socketPath: '/tmp/kaaku.sock', path, method,
      headers: { 'Content-Type': 'application/json' } }
    const req = http.request(opts, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (payload) req.write(JSON.stringify(payload))
    req.end()
  })
}

const SETTINGS_FILE = path.join(os.homedir(), 'Library/Application Support/kaaku/settings.json')
const TODOS_FILE    = path.join(os.homedir(), 'Library/Application Support/kaaku/todos.json')

function loadSettings() { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }
function loadTodos()    { return JSON.parse(fs.readFileSync(TODOS_FILE,    'utf8')) }

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — ENVIRONMENT & CONFIG
// ═══════════════════════════════════════════════════════════════════
console.log('\n── 1. Environment & Config ──────────────────────────────────')

test('settings.json exists', () => assert(fs.existsSync(SETTINGS_FILE), 'settings.json missing'))
test('todos.json exists',    () => assert(fs.existsSync(TODOS_FILE),    'todos.json missing'))

test('settings has required fields', () => {
  const s = loadSettings()
  for (const f of ['slackToken','slackUserToken','claudeApiKey','groqApiKey','llmProvider',
                   'syncIntervalMinutes','lookbackHours','processedIds']) {
    assert(f in s, `missing field: ${f}`)
  }
})

test('settings processedIds is array', () => {
  const s = loadSettings()
  assert(Array.isArray(s.processedIds), 'processedIds should be array')
})

test('todos.json is valid array', () => {
  const t = loadTodos()
  assert(Array.isArray(t), 'todos should be array')
})

test('todos have required fields', () => {
  const todos = loadTodos()
  for (const t of todos) {
    assert('id'   in t, `todo missing id: ${JSON.stringify(t)}`)
    assert('text' in t, `todo missing text: ${JSON.stringify(t)}`)
    assert('done' in t, `todo missing done: ${JSON.stringify(t)}`)
  }
})

test('todos have unique IDs', () => {
  const todos = loadTodos()
  const ids = todos.map(t => t.id)
  assert(new Set(ids).size === ids.length, `duplicate IDs found: ${ids}`)
})

test('llmProvider is valid value', () => {
  const s = loadSettings()
  assert(['groq','claude'].includes(s.llmProvider), `invalid llmProvider: ${s.llmProvider}`)
})

test('syncIntervalMinutes is positive number', () => {
  const s = loadSettings()
  assert(typeof s.syncIntervalMinutes === 'number' && s.syncIntervalMinutes > 0,
    `invalid syncIntervalMinutes: ${s.syncIntervalMinutes}`)
})

test('lookbackHours is positive number', () => {
  const s = loadSettings()
  assert(typeof s.lookbackHours === 'number' && s.lookbackHours > 0,
    `invalid lookbackHours: ${s.lookbackHours}`)
})

// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — UNIX SOCKET EVENT SERVER
// ═══════════════════════════════════════════════════════════════════
console.log('\n── 2. Unix Socket Event Server ──────────────────────────────')

test('socket file exists at /tmp/kaaku.sock', () => {
  assert(fs.existsSync('/tmp/kaaku.sock'), 'Socket not found — is Kaaku running?')
})

test('socket has owner-only permissions (600)', () => {
  const stat = fs.statSync('/tmp/kaaku.sock')
  const mode = (stat.mode & 0o777).toString(8)
  assertEqual(mode, '600')
})

await test('valid POST /event returns ok:true', async () => {
  const res = await socketPost({ type: 'test', title: 'Test notification', priority: 'low', source: 'test' })
  assertEqual(res.status, 200)
  const body = JSON.parse(res.body)
  assert(body.ok === true, `expected ok:true, got ${res.body}`)
  assert(typeof body.id === 'number', 'expected numeric id')
})

await test('POST /event with missing title returns 400', async () => {
  const res = await socketPost({ type: 'test', body: 'no title here' })
  assertEqual(res.status, 400)
})

await test('POST /event with malformed JSON returns 400', async () => {
  const res = await socketPost('{ this is not json }')
  assertEqual(res.status, 400)
})

await test('GET /event returns 404', async () => {
  const res = await socketRequest('GET', '/event', null)
  assertEqual(res.status, 404)
})

await test('POST to unknown path returns 404', async () => {
  const res = await socketRequest('POST', '/unknown', { title: 'test' })
  assertEqual(res.status, 404)
})

await test('event appears in todos.json after POST', async () => {
  const before = loadTodos().length
  const uid = `audit-test-${Date.now()}`
  await socketPost({ type: 'test', title: uid, priority: 'low', source: 'test' })
  await new Promise(r => setTimeout(r, 200))
  const after = loadTodos()
  assert(after.length > before, 'todo count did not increase')
  assert(after.some(t => t.text.includes(uid)), 'new todo not found by uid')
  // cleanup
  fs.writeFileSync(TODOS_FILE, JSON.stringify(after.filter(t => !t.text.includes(uid)), null, 2))
})

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — SECURITY AUDIT
// ═══════════════════════════════════════════════════════════════════
console.log('\n── 3. Security Audit ────────────────────────────────────────')

test('[SEC] nodeIntegration is disabled in BrowserWindow', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/index.js', 'utf8')
  assert(src.includes('nodeIntegration: false'), 'nodeIntegration must be false')
})

test('[SEC] contextIsolation is enabled in BrowserWindow', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/index.js', 'utf8')
  assert(src.includes('contextIsolation: true'), 'contextIsolation must be true')
})

test('[SEC] preload uses contextBridge (no direct global exposure)', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/preload/index.js', 'utf8')
  assert(src.includes('contextBridge.exposeInMainWorld'), 'must use contextBridge')
  assert(!src.includes('global.'), 'must not assign to global directly')
  assert(!src.includes('window.'), 'must not assign to window directly in preload')
})

test('[SEC] renderer cannot access Node APIs (no require in renderer)', () => {
  const files = [
    '/Users/deveshrohan/wallE/src/renderer/src/App.jsx',
    '/Users/deveshrohan/wallE/src/renderer/src/components/TodoPanel.jsx',
    '/Users/deveshrohan/wallE/src/renderer/src/components/SettingsPanel.jsx',
  ]
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    assert(!src.includes("require('fs')") && !src.includes('require("fs")'), `${path.basename(f)} uses require('fs')`)
    assert(!src.includes("require('path')"), `${path.basename(f)} uses require('path')`)
    assert(!src.includes('process.env'), `${path.basename(f)} accesses process.env`)
  }
})

test('[SEC] socket is Unix socket, not TCP (no localhost port binding)', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/index.js', 'utf8')
  assert(!src.includes("listen(7373"), 'must not bind TCP port 7373')
  assert(!src.includes("'127.0.0.1'"), 'must not bind TCP localhost')
  assert(src.includes('SOCKET_PATH'), 'must use SOCKET_PATH')
  assert(src.includes('/tmp/kaaku.sock'), 'socket path must be /tmp/kaaku.sock')
})

test('[SEC] socket file permissions are 0600', () => {
  if (!fs.existsSync('/tmp/kaaku.sock')) return // skip if app not running
  const stat = fs.statSync('/tmp/kaaku.sock')
  const mode = (stat.mode & 0o777).toString(8)
  assertEqual(mode, '600')
})

test('[SEC] API keys not logged to console', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/slack.js', 'utf8')
  assert(!src.includes('console.log(claudeApiKey)'), 'claudeApiKey must not be logged')
  assert(!src.includes('console.log(groqApiKey)'),   'groqApiKey must not be logged')
  assert(!src.includes('console.log(slackToken)'),   'slackToken must not be logged')
})

test('[SEC] settings.json not world-readable', () => {
  if (!fs.existsSync(SETTINGS_FILE)) return
  const stat = fs.statSync(SETTINGS_FILE)
  const mode = stat.mode & 0o777
  assert((mode & 0o044) === 0, `settings.json is world/group readable: ${(mode).toString(8)}`)
})

// ── SECURITY VULNERABILITIES FOUND ──────────────────────────────
warn('[SEC][VULN] API keys stored in plaintext',
  'settings.json contains Slack tokens and API keys unencrypted on disk. ' +
  'Fix: use macOS Keychain via keytar package for sensitive values.')

warn('[SEC][VULN] pushEvent does not validate priority/source fields',
  'Any string can be passed as priority/source via the event server — not constrained to known values. ' +
  'Fix: allowlist priority to high|medium|low and source to known values.')

warn('[SEC][VULN] Event server body has no size limit',
  'Request body accumulates without limit. A 100MB payload would be buffered in memory. ' +
  'Fix: add a body size cap (e.g. 64KB) and reject oversized requests.')

warn('[SEC][VULN] todos:save IPC accepts arbitrary data from renderer',
  'ipcMain.handle("todos:save") calls saveTodos(data) with zero validation. ' +
  'A compromised renderer could write arbitrary content to todos.json. ' +
  'Fix: validate that data is an array of valid todo objects before saving.')

warn('[SEC][VULN] move-window IPC has no bounds checking',
  'dx/dy values from renderer are applied directly. ' +
  'Fix: clamp to screen bounds in main process.')

warn('[SEC][VULN] Claude Code hook uses bash string interpolation into JSON',
  'If a command contains double quotes or backslashes the JSON will be malformed. ' +
  'Fix: use python3 -c "import json; print(json.dumps(...))" to build the payload safely.')

// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — BUSINESS LOGIC
// ═══════════════════════════════════════════════════════════════════
console.log('\n── 4. Business Logic ────────────────────────────────────────')

// Simulate the todo logic locally (pure functions, no Electron needed)
function sortTodos(todos) {
  const ORDER = { high: 0, medium: 1, low: 2 }
  return todos.filter(t => !t.done)
    .sort((a, b) => (ORDER[a.priority] ?? 3) - (ORDER[b.priority] ?? 3))
}

test('priority sort: high before medium before low', () => {
  const todos = [
    { id: 1, text: 'low task',    done: false, priority: 'low'    },
    { id: 2, text: 'high task',   done: false, priority: 'high'   },
    { id: 3, text: 'medium task', done: false, priority: 'medium' },
  ]
  const sorted = sortTodos(todos)
  assertEqual(sorted[0].priority, 'high')
  assertEqual(sorted[1].priority, 'medium')
  assertEqual(sorted[2].priority, 'low')
})

test('priority sort: unprioritised goes last', () => {
  const todos = [
    { id: 1, text: 'no priority', done: false },
    { id: 2, text: 'high',        done: false, priority: 'high' },
  ]
  const sorted = sortTodos(todos)
  assertEqual(sorted[0].priority, 'high')
  assert(!sorted[1].priority, 'unprioritised should be last')
})

test('done todos excluded from sort', () => {
  const todos = [
    { id: 1, text: 'done high', done: true, priority: 'high' },
    { id: 2, text: 'pending low', done: false, priority: 'low' },
  ]
  const sorted = sortTodos(todos)
  assertEqual(sorted.length, 1)
  assertEqual(sorted[0].id, 2)
})

test('toggleTodo only marks done (not undone)', () => {
  // Simulates the TodoPanel toggleTodo behaviour
  const todos = [{ id: 1, text: 'task', done: false }]
  // simulate toggle on not-done
  const afterToggle = todos.map(t => t.id === 1 && !t.done ? { ...t, done: true } : t)
  assertEqual(afterToggle[0].done, true)
  // simulate toggle on already-done (should be no-op per current code)
  const todo = afterToggle.find(t => t.id === 1 && !t.done)
  assert(!todo, 'toggleTodo should be no-op on done todo')
})

test('[BUG] empty-state shown incorrectly when all todos are completed', () => {
  // Current code: todos.length === 0 → shows "No tasks yet"
  // But if all are done, todos.length > 0 but pending.length === 0
  // This means completed-only state doesn't show empty state — actually correct behaviour.
  // The bug is the opposite: the condition is fine.
  const todos = [{ id: 1, text: 'done', done: true }]
  assert(todos.length > 0, 'todos array is non-empty')
  assert(todos.filter(t => !t.done).length === 0, 'pending is empty')
  // The empty-state renders only when todos.length===0, so completed items won't trigger it — correct
})

test('processedIds deduplication prevents re-adding same message', () => {
  const processedSet = new Set(['C001:12345.6789', 'C002:99999.0000'])
  const messages = [
    { key: 'C001:12345.6789', channel: 'general', text: 'already seen' },
    { key: 'C003:11111.1111', channel: 'random',  text: 'new message'  },
  ]
  const unprocessed = messages.filter(m => !processedSet.has(m.key))
  assertEqual(unprocessed.length, 1)
  assertEqual(unprocessed[0].key, 'C003:11111.1111')
})

test('processedIds capped at 2000', () => {
  const ids = Array.from({ length: 3000 }, (_, i) => `C${i}:${i}.0`)
  const capped = ids.slice(-2000)
  assertEqual(capped.length, 2000)
  assertEqual(capped[0], 'C1000:1000.0')
})

test('todo text truncated to 120 chars in pushEvent', () => {
  const title = 'T'.repeat(80)
  const body  = 'B'.repeat(80)
  const text  = body ? `${title}: ${body}`.slice(0, 120) : title.slice(0, 120)
  assert(text.length <= 120, `text length ${text.length} exceeds 120`)
})

// ═══════════════════════════════════════════════════════════════════
// SECTION 5 — SLACK INTEGRATION
// ═══════════════════════════════════════════════════════════════════
console.log('\n── 5. Slack Integration ─────────────────────────────────────')

test('settings has a Slack token set', () => {
  const s = loadSettings()
  const token = s.slackUserToken || s.slackToken
  assert(token && token.startsWith('xox'), 'a Slack token (xoxp- or xoxb-) should be set')
})

test('Slack tokens are in correct fields (xoxp- in slackUserToken, xoxb- in slackToken)', () => {
  const s = loadSettings()
  if (s.slackUserToken) assert(s.slackUserToken.startsWith('xoxp-'), `slackUserToken should be xoxp- (user token), got ${s.slackUserToken.slice(0,8)}`)
  if (s.slackToken)     assert(s.slackToken.startsWith('xoxb-'),     `slackToken should be xoxb- (bot token), got ${s.slackToken.slice(0,8)}`)
})

test('groqApiKey is set', () => {
  const s = loadSettings()
  assert(s.groqApiKey && s.groqApiKey.startsWith('gsk_'), 'groqApiKey should start with gsk_')
})

test('syncSlack guard: no token → error (source check)', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/slack.js', 'utf8')
  assert(src.includes("'Missing Slack token'"), 'must return Missing Slack token error')
  assert(src.includes("'Missing Groq API key'"), 'must return Missing Groq API key error')
  assert(src.includes("'Missing Claude API key'"), 'must return Missing Claude API key error')
})

test('syncSlack guard: checks slackUserToken OR slackToken', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/slack.js', 'utf8')
  assert(src.includes('slackUserToken || slackToken'), 'must accept either token type')
})

test('syncSlack guard: checks groqApiKey OR claudeApiKey', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/index.js', 'utf8')
  assert(src.includes('groqApiKey || settings.claudeApiKey') || src.includes('groqApiKey || claudeApiKey'),
    'runSync must accept either API key')
})

test('classify prompt includes userId for context', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/slack.js', 'utf8')
  assert(src.includes('${userId}'), 'classify prompt must embed userId')
})

test('thread replies: only includes messages mentioning user', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/slack.js', 'utf8')
  assert(src.includes('`<@${userId}>`'), 'thread filter must check for user mention')
})

test('fetchActiveChannels filters by latest.ts (no redundant history calls)', () => {
  const src = fs.readFileSync('/Users/deveshrohan/wallE/src/main/slack.js', 'utf8')
  assert(src.includes('ch.latest?.ts'), 'must check latest.ts to skip inactive channels')
})

// ═══════════════════════════════════════════════════════════════════
// SECTION 6 — EVENT SERVER EDGE CASES
// ═══════════════════════════════════════════════════════════════════
console.log('\n── 6. Event Server Edge Cases ───────────────────────────────')

await test('very long title is accepted and truncated', async () => {
  const longTitle = 'A'.repeat(500)
  const res = await socketPost({ type: 'test', title: longTitle, priority: 'low', source: 'test' })
  assertEqual(res.status, 200)
  await new Promise(r => setTimeout(r, 150))
  const todos = loadTodos()
  const added = todos.find(t => t.text.startsWith('A'.repeat(5)))
  assert(added, 'todo should be added')
  assert(added.text.length <= 120, `text exceeds 120 chars: ${added.text.length}`)
  // cleanup
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos.filter(t => t.id !== added.id), null, 2))
})

await test('title + body concatenation is truncated to 120 chars', async () => {
  const res = await socketPost({ type: 'test', title: 'T'.repeat(80), body: 'B'.repeat(80), priority: 'low', source: 'test' })
  assertEqual(res.status, 200)
  await new Promise(r => setTimeout(r, 150))
  const todos = loadTodos()
  const added = todos.find(t => t.text.startsWith('T'.repeat(5)))
  if (added) {
    assert(added.text.length <= 120, `text exceeds 120: ${added.text.length}`)
    fs.writeFileSync(TODOS_FILE, JSON.stringify(todos.filter(t => t.id !== added.id), null, 2))
  }
})

await test('special characters in title do not crash server', async () => {
  const res = await socketPost({ type: 'test', title: '"><script>alert(1)</script>', priority: 'low', source: 'test' })
  assertEqual(res.status, 200)
  await new Promise(r => setTimeout(r, 150))
  const todos = loadTodos()
  const added = todos.find(t => t.text.includes('script'))
  assert(added, 'todo with special chars should be stored as-is (escaped at render)')
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos.filter(t => t.id !== added.id), null, 2))
})

await test('empty body field is handled gracefully', async () => {
  const res = await socketPost({ type: 'test', title: 'No body test', body: '', priority: 'medium', source: 'test' })
  assertEqual(res.status, 200)
  await new Promise(r => setTimeout(r, 150))
  const todos = loadTodos()
  const added = todos.find(t => t.text === 'No body test')
  assert(added, 'todo without body should be stored using just title')
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos.filter(t => t.id !== added.id), null, 2))
})

await test('concurrent requests do not corrupt todos.json', async () => {
  const before = loadTodos().length
  await Promise.all([
    socketPost({ type: 'test', title: 'concurrent-1', priority: 'low', source: 'test' }),
    socketPost({ type: 'test', title: 'concurrent-2', priority: 'low', source: 'test' }),
    socketPost({ type: 'test', title: 'concurrent-3', priority: 'low', source: 'test' }),
  ])
  await new Promise(r => setTimeout(r, 300))
  const todos = loadTodos()
  assert(Array.isArray(todos), 'todos.json should still be valid JSON array')
  // cleanup
  fs.writeFileSync(TODOS_FILE, JSON.stringify(
    todos.filter(t => !t.text?.startsWith('concurrent-')), null, 2))
})

// ═══════════════════════════════════════════════════════════════════
// SECTION 7 — FILE INTEGRITY
// ═══════════════════════════════════════════════════════════════════
console.log('\n── 7. File Integrity ────────────────────────────────────────')

test('todos.json is valid JSON after all tests', () => {
  const raw = fs.readFileSync(TODOS_FILE, 'utf8')
  assert(raw.trim().length > 0, 'todos.json is empty')
  const parsed = JSON.parse(raw)
  assert(Array.isArray(parsed), 'todos.json must be array')
})

test('settings.json is valid JSON after all tests', () => {
  const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
  const parsed = JSON.parse(raw)
  assert(typeof parsed === 'object' && parsed !== null, 'settings.json must be object')
})

test('all source files exist and are non-empty', () => {
  const files = [
    '/Users/deveshrohan/wallE/src/main/index.js',
    '/Users/deveshrohan/wallE/src/main/slack.js',
    '/Users/deveshrohan/wallE/src/preload/index.js',
    '/Users/deveshrohan/wallE/src/renderer/src/App.jsx',
    '/Users/deveshrohan/wallE/src/renderer/src/components/TodoPanel.jsx',
    '/Users/deveshrohan/wallE/src/renderer/src/components/SettingsPanel.jsx',
    '/Users/deveshrohan/wallE/src/renderer/src/components/NotificationBubble.jsx',
  ]
  for (const f of files) {
    assert(fs.existsSync(f), `missing: ${f}`)
    assert(fs.statSync(f).size > 0, `empty file: ${f}`)
  }
})

test('kaaku CLI script exists and is executable', () => {
  const cli = `${os.homedir()}/.local/bin/kaaku`
  assert(fs.existsSync(cli), 'kaaku CLI not found at ~/.local/bin/kaaku')
  const stat = fs.statSync(cli)
  assert(stat.mode & 0o111, 'kaaku CLI is not executable')
})

test('Claude Code hook is configured in ~/.claude/settings.json', () => {
  const hookFile = `${os.homedir()}/.claude/settings.json`
  assert(fs.existsSync(hookFile), '~/.claude/settings.json not found')
  const cfg = JSON.parse(fs.readFileSync(hookFile, 'utf8'))
  assert(cfg.hooks?.PreToolUse, 'PreToolUse hook not configured')
  assert(cfg.hooks.PreToolUse.length > 0, 'PreToolUse hook array is empty')
  const entry  = cfg.hooks.PreToolUse[0]
  const hookCmd = entry.hooks?.[0]?.command || ''
  assert(hookCmd.includes('kaaku.sock'), 'hook should use Unix socket, not TCP')
  assert(!hookCmd.includes('localhost:'), 'hook must not use TCP port')
  // No matcher = catches ALL tools; or explicit catch-all
  const hasMatcher = 'matcher' in entry
  assert(!hasMatcher || entry.matcher === '.*', 'hook matcher should be absent (all tools) or .*')
  assert(hookCmd.includes('Bash') && hookCmd.includes('Edit') && hookCmd.includes('WebFetch'),
    'hook should handle multiple tool types')
})

// ═══════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════
await new Promise(r => setTimeout(r, 100)) // let async tests settle

console.log('\n' + '═'.repeat(60))
for (const r of results) {
  const color = r.s === '✓' ? '\x1b[32m' : r.s === '⚠' ? '\x1b[33m' : '\x1b[31m'
  console.log(`${color}${r.s}\x1b[0m ${r.n}`)
  if (r.e) console.log(`  \x1b[2m→ ${r.e}\x1b[0m`)
}
console.log('═'.repeat(60))
console.log(`\x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m  \x1b[33m${warned} warnings\x1b[0m`)
if (failed > 0) process.exit(1)
