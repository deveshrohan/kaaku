import { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, nativeImage, Menu } from 'electron'
import { join } from 'path'
import fs from 'fs'
import http from 'http'
import AutoLaunch from 'electron-auto-launch'
import { syncSlack, diagnoseSlack } from './slack.js'
import { connectGmail, syncGmail, checkGmailResolutions } from './gmail.js'
import { testJiraConnection } from './atlassian.js'
import { testRedashConnection } from './redash.js'
import { testGithubConnection } from './github.js'
import { createRun, updateRun, addStep, addDraft, resolveDraft, getRun, listRuns } from './agent/runs.js'
import { scoreRun, detectStuckRuns, aggregateEvals, extractAndSaveMemories } from './agent/evals.js'
import { runAgent } from './agent/executor.js'
import { routeQuery, getTypeMeta } from './agent/router.js'

export const SOCKET_PATH = '/tmp/kaaku.sock'

const autoLauncher = new AutoLaunch({ name: 'Kaaku', isHidden: true })

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }

let mainWindow
let syncTimer  = null
let syncLocked = false   // prevent concurrent syncs

const TODOS_FILE    = join(app.getPath('userData'), 'todos.json')
const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

const COMPACT  = { w: 132, h: 200 }
const BUBBLE   = { w: 300, h: 320 }

// ── Atomic file writes (crash-safe: write tmp then rename) ────────
function atomicWriteFileSync(filePath, data, options) {
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, data, options)
  fs.renameSync(tmpPath, filePath)
}

// ── Todos ─────────────────────────────────────────────────────────
function loadTodos() {
  try {
    if (fs.existsSync(TODOS_FILE)) {
      const todos = JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8'))
      // Backfill: set completedAt for done tasks missing it (one-time migration)
      let migrated = false
      for (const t of todos) {
        if (t.done && !t.completedAt) {
          t.completedAt = t.createdAt || Date.now()
          migrated = true
        }
      }
      if (migrated) {
        try { atomicWriteFileSync(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf8') } catch {}
      }
      return todos
    }
  } catch {}
  return []
}
function saveTodos(todos) {
  atomicWriteFileSync(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf8')
}

// ── Settings ──────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  slackToken: '',
  slackUserToken: '',
  claudeApiKey: '',
  groqApiKey: '',
  llmProvider: 'groq',       // 'claude' | 'groq'
  syncIntervalMinutes: 30,
  lookbackHours: 24,
  processedIds: [],
  lastSyncedAt: null,
  lastSyncError: null,
  lastSyncAdded: 0,
  // Gmail
  gmailTokens:        null,
  gmailEmail:         '',
  gmailProcessedIds:  [],
  gmailLastSyncedAt:  null,
  gmailLastSyncError: null,
  // Jira Cloud
  atlassianDomain:   '',
  atlassianEmail:    '',
  atlassianApiToken: '',
  jiraVerified:      false,
  // Redash
  redashUrl:         '',
  redashApiKey:      '',
  redashVerified:    false,
  // GitHub
  githubToken:       '',
  githubOrg:         '',
  githubVerified:    false,
  // Agent
  agentProvider:     'groq',     // 'groq' | 'claude' | 'gemini' | 'bedrock'
  geminiApiKey:      '',
  bedrockRegion:         'us-east-1',
  bedrockApiKey:         '',  // Bedrock API Key (starts with ABSK) — simplest auth
  bedrockAccessKeyId:    '',
  bedrockSecretAccessKey: '',
  // Onboarding
  onboardingComplete: false,
  // Theme
  theme: 'auto',
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }
    }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s) {
  atomicWriteFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 })
}

// Keys the renderer is allowed to write via settings:save
const SAVEABLE_SETTINGS = new Set([
  'slackToken', 'slackUserToken', 'claudeApiKey', 'groqApiKey', 'llmProvider',
  'syncIntervalMinutes', 'lookbackHours',
  'atlassianDomain', 'atlassianEmail', 'atlassianApiToken',
  'redashUrl', 'redashApiKey',
  'githubToken', 'githubOrg',
  'agentProvider', 'geminiApiKey',
  'bedrockRegion', 'bedrockApiKey', 'bedrockAccessKeyId', 'bedrockSecretAccessKey',
  'onboardingComplete',
  'theme',
])

// ── Sync ──────────────────────────────────────────────────────────
async function runSync() {
  if (syncLocked) { console.log('Sync already in progress, skipping'); return }
  syncLocked = true
  const settings  = loadSettings()
  const hasSlack  = !!(settings.slackUserToken || settings.slackToken)
  const hasApiKey = !!(settings.groqApiKey || settings.claudeApiKey)
  const hasGmail  = !!(settings.gmailTokens?.refresh_token)

  if ((!hasSlack && !hasGmail) || !hasApiKey) { syncLocked = false; return }

  try {
    let updatedTodos  = loadTodos()
    let settingsUpdate = {}

    // ── Slack ────────────────────────────────────────────────────
    if (hasSlack) {
      const pendingSlackTasks = updatedTodos.filter(t => !t.done && t.source === 'slack' && t.slackChannel)
      try {
        const result = await syncSlack({
          slackToken:       settings.slackToken,
          slackUserToken:   settings.slackUserToken,
          claudeApiKey:     settings.claudeApiKey,
          groqApiKey:       settings.groqApiKey,
          provider:         settings.llmProvider,
          processedIds:     settings.processedIds,
          lookbackHours:    settings.lookbackHours,
          pendingSlackTasks,
        })

        if (result.resolvedIds?.length > 0) {
          updatedTodos = updatedTodos.map(t =>
            result.resolvedIds.includes(t.id) ? { ...t, done: true, completedAt: Date.now() } : t
          )
          if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('todos:resolved', result.resolvedIds) } catch {}
          }
        }
        if (result.updatedTasks?.length > 0) {
          const updatedMap = new Map(result.updatedTasks.map(t => [t.id, t]))
          updatedTodos = updatedTodos.map(t => updatedMap.has(t.id) ? updatedMap.get(t.id) : t)
        }
        if (result.todos.length > 0) {
          // ── Dedup: one task per conversation (active OR recently completed) ──
          // Check against active tasks AND tasks completed within the
          // lookback window. This prevents the same DM task from being
          // re-created immediately after the user marks it done.
          //
          // Keys:
          //   DMs       → channelId (one task per person)
          //   Threads   → channelId:threadTs (one task per thread root)
          //   Mentions  → channelId:threadTs (threadTs = msg.ts, unique)
          const lookbackMs = (settings.lookbackHours || 24) * 3600 * 1000
          const recentCutoff = Date.now() - lookbackMs
          const activeDmChannels = new Set()
          const activeThreadKeys = new Set()
          for (const t of updatedTodos) {
            if (t.source !== 'slack' || !t.slackChannel) continue
            // Include active tasks AND tasks completed within lookback window
            const isActive = !t.done
            const isRecentlyDone = t.done && t.createdAt && t.createdAt > recentCutoff
            if (!isActive && !isRecentlyDone) continue
            if (!t.slackThreadTs) activeDmChannels.add(t.slackChannel)
            else activeThreadKeys.add(`${t.slackChannel}:${t.slackThreadTs}`)
          }
          // Collect recent task texts for text-similarity dedup (normalised)
          const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
          const recentTexts = updatedTodos
            .filter(t => t.source === 'slack' && t.createdAt && t.createdAt > recentCutoff)
            .map(t => normalize(t.text))

          const newTodos = result.todos.filter(t => {
            if (!t.slackChannel) return true
            // Layer 1: structural dedup (channel / thread key)
            if (!t.slackThreadTs && activeDmChannels.has(t.slackChannel)) {
              console.log(`[sync] dedup: DM channel ${t.slackChannelName || t.slackChannel} already has active task`)
              return false
            }
            if (t.slackThreadTs && activeThreadKeys.has(`${t.slackChannel}:${t.slackThreadTs}`)) {
              console.log(`[sync] dedup: thread ${t.slackChannelName}:${t.slackThreadTs} already has active task`)
              return false
            }
            // Layer 2: text similarity — skip if a recent task has near-identical text
            const norm = normalize(t.text)
            if (norm.length > 0 && recentTexts.some(existing => existing === norm || (norm.length > 10 && existing.includes(norm)) || (existing.length > 10 && norm.includes(existing)))) {
              console.log(`[sync] dedup: text match — "${t.text}" already exists`)
              return false
            }
            // Track within this batch to prevent intra-sync duplicates
            if (!t.slackThreadTs) activeDmChannels.add(t.slackChannel)
            else activeThreadKeys.add(`${t.slackChannel}:${t.slackThreadTs}`)
            recentTexts.push(norm)
            return true
          })
          if (newTodos.length > 0) {
            updatedTodos = [...updatedTodos, ...newTodos]
            if (mainWindow && !mainWindow.isDestroyed()) {
              try { mainWindow.webContents.send('todos:pushed', newTodos) } catch {}
            }
          }
          if (newTodos.length < result.todos.length) {
            console.log(`[sync] deduped ${result.todos.length - newTodos.length} of ${result.todos.length} Slack task(s)`)
          }
        }

        const syncedOk = !result.error
        if (result.error) console.error('[sync] Slack error:', result.error)
        const actualAdded = result.todos.length > 0 ? (newTodos?.length ?? result.todos.length) : 0
        settingsUpdate = {
          ...settingsUpdate,
          processedIds:  result.processedIds,
          lastSyncedAt:  syncedOk ? Date.now() : settings.lastSyncedAt,
          lastSyncError: result.error || null,
          lastSyncAdded: actualAdded,
        }
      } catch (err) {
        console.error('[sync] Slack sync threw:', err.message)
        settingsUpdate = { ...settingsUpdate, lastSyncError: err.message }
      }
    }

    // ── Gmail ────────────────────────────────────────────────────
    if (hasGmail) {
      try {
        // Check if user replied to threads with pending Gmail TODOs
        const pendingGmailTasks = updatedTodos.filter(t => !t.done && t.source === 'gmail' && t.gmailThreadId)
        if (pendingGmailTasks.length > 0) {
          const gmailRes = await checkGmailResolutions(settings.gmailTokens, pendingGmailTasks)
          if (gmailRes.resolvedIds.length > 0) {
            updatedTodos = updatedTodos.map(t =>
              gmailRes.resolvedIds.includes(t.id) ? { ...t, done: true, completedAt: Date.now() } : t
            )
            if (mainWindow && !mainWindow.isDestroyed()) {
              try { mainWindow.webContents.send('todos:resolved', gmailRes.resolvedIds) } catch {}
            }
          }
        }

        const result = await syncGmail({
          tokens:        settings.gmailTokens,
          lookbackHours: settings.lookbackHours,
          claudeApiKey:  settings.claudeApiKey,
          groqApiKey:    settings.groqApiKey,
          provider:      settings.llmProvider,
          processedIds:  settings.gmailProcessedIds || [],
        })
        if (result.todos.length > 0) {
          // ── Gmail dedup: three layers ──────────────────────────
          // Layer 1: gmailId (exact email)
          const existingGmailIds = new Set(
            updatedTodos.filter(t => t.source === 'gmail' && t.gmailId).map(t => t.gmailId)
          )
          // Layer 2: threadId (same thread = same TODO)
          const existingThreadIds = new Set(
            updatedTodos.filter(t => t.source === 'gmail' && t.gmailThreadId).map(t => t.gmailThreadId)
          )
          // Layer 3: text+sender similarity (catches "review deal" x4)
          const gmailNormalize = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
          const gmailLookbackMs = (settings.lookbackHours || 24) * 3600 * 1000
          const gmailRecentCutoff = Date.now() - gmailLookbackMs
          const recentGmailTexts = updatedTodos
            .filter(t => t.source === 'gmail' && t.createdAt && t.createdAt > gmailRecentCutoff)
            .map(t => ({ norm: gmailNormalize(t.text), from: gmailNormalize(t.gmailFrom || '') }))

          const newTodos = result.todos.filter(t => {
            // Layer 1: exact gmailId
            if (t.gmailId && existingGmailIds.has(t.gmailId)) {
              console.log(`[sync] gmail dedup: id ${t.gmailId} already exists`)
              return false
            }
            // Layer 2: same thread already has a TODO
            if (t.gmailThreadId && existingThreadIds.has(t.gmailThreadId)) {
              console.log(`[sync] gmail dedup: thread ${t.gmailThreadId} already has task`)
              return false
            }
            // Layer 3: same text from same sender recently
            const norm = gmailNormalize(t.text)
            const fromNorm = gmailNormalize(t.gmailFrom || '')
            if (norm.length > 0 && recentGmailTexts.some(ex =>
              (ex.norm === norm || (norm.length > 10 && ex.norm.includes(norm)) || (ex.norm.length > 10 && norm.includes(ex.norm)))
              && fromNorm && ex.from && (ex.from.includes(fromNorm.split('<')[0].trim()) || fromNorm.includes(ex.from.split('<')[0].trim()))
            )) {
              console.log(`[sync] gmail dedup: text+sender match — "${t.text}"`)
              return false
            }
            // Track within batch
            if (t.gmailId) existingGmailIds.add(t.gmailId)
            if (t.gmailThreadId) existingThreadIds.add(t.gmailThreadId)
            recentGmailTexts.push({ norm, from: fromNorm })
            return true
          })
          if (newTodos.length < result.todos.length) {
            console.log(`[sync] deduped ${result.todos.length - newTodos.length} Gmail task(s)`)
          }
          if (newTodos.length > 0) {
            updatedTodos = [...updatedTodos, ...newTodos]
            if (mainWindow && !mainWindow.isDestroyed()) {
              try { mainWindow.webContents.send('todos:pushed', newTodos) } catch {}
            }
          }
        }
        settingsUpdate = {
          ...settingsUpdate,
          gmailTokens:        result.tokens,
          gmailProcessedIds:  result.processedIds,
          gmailLastSyncedAt:  Date.now(),
          gmailLastSyncError: null,
        }
      } catch (err) {
        console.error('[sync] Gmail sync threw:', err.message)
        settingsUpdate = { ...settingsUpdate, gmailLastSyncError: err.message }
      }
    }

    saveTodos(updatedTodos)
    saveSettings({ ...settings, ...settingsUpdate })

    // Notify renderer of sync result
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('sync:status', {
          slackError: settingsUpdate.lastSyncError || null,
          gmailError: settingsUpdate.gmailLastSyncError || null,
          slackAdded: settingsUpdate.lastSyncAdded || 0,
          at: Date.now(),
        })
      } catch {}
    }
  } finally {
    syncLocked = false
  }
}

// ── Event server ──────────────────────────────────────────────────
// Any process on the machine can POST to localhost:7373/event to push
// a task/alert into Kaaku. Schema: { type, title, body?, priority?, source? }
const VALID_PRIORITIES = new Set(['high', 'medium', 'low'])
const VALID_SOURCES    = new Set(['slack', 'claude-code', 'system', 'cli', 'test'])

function pushEvent({ type, title, body = '', priority = 'high', source = 'system' }) {
  const safePriority = VALID_PRIORITIES.has(priority) ? priority : 'medium'
  const safeSource   = VALID_SOURCES.has(source)    ? source   : 'system'
  const todo = {
    id: crypto.randomUUID(),
    text: body ? `${title}: ${body}`.slice(0, 120) : title.slice(0, 120),
    done: false,
    priority: safePriority,
    source:   safeSource,
    eventType: String(type || 'system').slice(0, 50),
  }
  const todos = loadTodos()
  saveTodos([...todos, todo])
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('todos:pushed', [todo]) } catch {}
  }
  return todo
}

// Pending permission requests: id → { res, timer }
const pendingPermissions = new Map()

function startEventServer() {
  // Clean up stale socket from previous run
  try { fs.unlinkSync(SOCKET_PATH) } catch {}

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || ![ '/event', '/permission' ].includes(req.url)) {
      res.writeHead(404).end()
      return
    }

    let body = ''
    let bodySize = 0
    const MAX_BODY = 65536
    req.on('data', d => {
      bodySize += d.length
      if (bodySize > MAX_BODY) { res.writeHead(413).end('payload too large'); req.destroy(); return }
      body += d
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        if (!payload.title || typeof payload.title !== 'string') { res.writeHead(400).end('missing title'); return }

        if (req.url === '/event') {
          // Fire-and-forget: push to UI, respond immediately
          const todo = pushEvent(payload)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, id: todo.id }))

        } else {
          // /permission: hold connection open until user responds (or 30s timeout)
          const permId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const notification = {
            id: crypto.randomUUID(),
            text: payload.body
              ? `${payload.title}: ${payload.body}`.slice(0, 120)
              : payload.title.slice(0, 120),
            done: false,
            priority: 'high',
            source: 'claude-code',
            eventType: 'claude-permission',
            permissionId: permId,
            requiresResponse: true,
          }

          // Push bubble to renderer (do NOT save to todos — it's transient)
          if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('todos:pushed', [notification]) } catch {}
          }

          // Timeout: allow by default after 30s if user doesn't respond
          const timer = setTimeout(() => {
            if (pendingPermissions.has(permId)) {
              pendingPermissions.delete(permId)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ action: 'allow', reason: 'timeout' }))
            }
          }, 30000)

          pendingPermissions.set(permId, { res, timer })
        }
      } catch {
        res.writeHead(400).end('invalid json')
      }
    })
  })

  server.listen(SOCKET_PATH, () => {
    fs.chmodSync(SOCKET_PATH, 0o600) // owner-only access
    console.log(`Kaaku event server listening on ${SOCKET_PATH}`)
  })
  server.on('error', err => console.warn('Event server error:', err.message))
  app.on('before-quit', () => { try { fs.unlinkSync(SOCKET_PATH) } catch {} })
}

function startSyncTimer(intervalMinutes) {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null }
  if (intervalMinutes > 0) {
    syncTimer = setInterval(runSync, intervalMinutes * 60 * 1000)
  }
}

let onHideStateChanged = null  // set by tray setup to update menu label
let isHidden = false

function trapdoorShow() {
  if (!isHidden || !mainWindow || mainWindow.isDestroyed()) return
  const pos = getBottomCenter(COMPACT.w, COMPACT.h)
  mainWindow.setSize(COMPACT.w, COMPACT.h)
  mainWindow.setPosition(pos.x, pos.y)
  // Send event BEFORE showing so the renderer can position the character at Y=-3.
  // Delay show() so the hidden position is committed before the window becomes visible.
  mainWindow.webContents.send('trapdoor:start-show')
  setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show() }, 100)
  isHidden = false
  if (typeof onHideStateChanged === 'function') onHideStateChanged()
}

// ── Window ────────────────────────────────────────────────────────
function getBottomCenter(w, h) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return { x: Math.floor(width / 2 - w / 2), y: height - h }
}

function getOfficePosition() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  // Near-fullscreen with slight margin
  const margin = 40
  const w = Math.min(width - margin * 2, 1200)
  const h = Math.min(height - margin * 2, 800)
  return { x: Math.floor(width / 2 - w / 2), y: Math.floor(height / 2 - h / 2), w, h }
}

function createWindow() {
  const pos = getBottomCenter(COMPACT.w, COMPACT.h)
  const display = screen.getPrimaryDisplay()
  console.log('[window] workArea:', display.workAreaSize, 'bounds:', display.bounds, 'pos:', pos, 'compact:', COMPACT)

  mainWindow = new BrowserWindow({
    width: COMPACT.w, height: COMPACT.h,
    x: pos.x, y: pos.y,
    transparent: true, backgroundColor: '#00000000',
    frame: false, alwaysOnTop: true,
    hasShadow: false, resizable: false, skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.setAlwaysOnTop(true, 'floating', 1)
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Pin zoom to 1.0 — connecting/disconnecting displays can drift it
  const pinZoom = () => mainWindow.webContents.setZoomFactor(1)
  mainWindow.webContents.on('did-finish-load', pinZoom)
  screen.on('display-added', pinZoom)
  screen.on('display-removed', pinZoom)
  screen.on('display-metrics-changed', pinZoom)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }


  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // ── IPC ─────────────────────────────────────────────────────────
  function resizeTo(dim) {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().bounds
    const [cx, cy] = mainWindow.getPosition()
    const [cw, ch] = mainWindow.getSize()

    // Anchor: keep the bottom-centre of the current window stationary
    let nx = cx + Math.floor(cw / 2) - Math.floor(dim.w / 2)
    let ny = cy + ch - dim.h

    // Clamp so the window never overflows any screen edge (8px breathing room)
    const EDGE = 8
    nx = Math.max(EDGE, Math.min(nx, sw - dim.w - EDGE))
    ny = Math.max(EDGE, Math.min(ny, sh - dim.h))

    mainWindow.setSize(dim.w, dim.h)
    mainWindow.setPosition(nx, ny)
  }

  function openOffice() {
    const pos = getOfficePosition()
    mainWindow.setSize(pos.w, pos.h)
    mainWindow.setPosition(pos.x, pos.y)
    mainWindow.setResizable(false)
  }

  function closeOffice() {
    const pos = getBottomCenter(COMPACT.w, COMPACT.h)
    mainWindow.setSize(COMPACT.w, COMPACT.h)
    mainWindow.setPosition(pos.x, pos.y)
    mainWindow.setResizable(false)
  }

  ipcMain.handle('set-panel-open', (_, open) => open ? openOffice() : closeOffice())
  ipcMain.handle('set-bubble-open', (_, open) => resizeTo(open ? BUBBLE : COMPACT))

  // ── Trapdoor hide/show ──────────────────────────────────────────
  ipcMain.handle('trapdoor:hide-complete', () => {
    mainWindow.hide()
    isHidden = true
    if (typeof onHideStateChanged === 'function') onHideStateChanged()
  })

  ipcMain.on('trapdoor:request-hide', () => {
    if (isHidden || !mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('trapdoor:start-hide')
  })

  ipcMain.handle('move-window', (_, { dx, dy }) => {
    const { width, height } = screen.getPrimaryDisplay().bounds
    const [x, y] = mainWindow.getPosition()
    const [w, h] = mainWindow.getSize()
    const nx = Math.max(0, Math.min(x + dx, width  - w))
    const ny = Math.max(0, Math.min(y + dy, height - h))
    mainWindow.setPosition(nx, ny)
  })

  ipcMain.handle('todos:load', () => loadTodos())
  ipcMain.handle('todos:save', (_, data) => {
    if (!Array.isArray(data)) return false
    // Validate each todo has required fields with correct types
    const valid = data.every(t =>
      t && typeof t.id !== 'undefined' &&
      typeof t.text === 'string' && t.text.length <= 500 &&
      typeof t.done === 'boolean'
    )
    if (!valid) return false
    saveTodos(data)
    return true
  })

  ipcMain.handle('settings:load', () => {
    const s = loadSettings()
    // Return everything except processedIds and gmailTokens (sensitive / too large)
    return {
      slackToken:          s.slackToken,
      slackUserToken:      s.slackUserToken,
      claudeApiKey:        s.claudeApiKey,
      groqApiKey:          s.groqApiKey,
      llmProvider:         s.llmProvider,
      syncIntervalMinutes: s.syncIntervalMinutes,
      lookbackHours:       s.lookbackHours,
      lastSyncedAt:        s.lastSyncedAt,
      lastSyncError:       s.lastSyncError,
      lastSyncAdded:       s.lastSyncAdded,
      // Gmail — never send tokens to renderer
      gmailConnected:      !!(s.gmailTokens?.refresh_token),
      gmailEmail:          s.gmailEmail,
      gmailLastSyncedAt:   s.gmailLastSyncedAt,
      gmailLastSyncError:  s.gmailLastSyncError,
      // Jira
      atlassianDomain:     s.atlassianDomain,
      atlassianEmail:      s.atlassianEmail,
      atlassianApiToken:   s.atlassianApiToken,
      jiraVerified:        s.jiraVerified,
      // Redash
      redashUrl:           s.redashUrl,
      redashApiKey:        s.redashApiKey,
      redashVerified:      s.redashVerified,
      // GitHub
      githubToken:         s.githubToken,
      githubOrg:           s.githubOrg,
      githubVerified:      s.githubVerified,
      // Agent
      agentProvider:       s.agentProvider,
      geminiApiKey:        s.geminiApiKey,
      // Onboarding
      onboardingComplete:  s.onboardingComplete,
      // Theme
      theme:               s.theme,
    }
  })

  ipcMain.handle('settings:save', (_, config) => {
    // Allowlist: only accept keys the renderer should modify
    const filtered = {}
    for (const key of Object.keys(config)) {
      if (SAVEABLE_SETTINGS.has(key)) filtered[key] = config[key]
    }
    // Validate critical numeric fields
    if ('syncIntervalMinutes' in filtered) {
      const v = Number(filtered.syncIntervalMinutes)
      if (isNaN(v) || v < 1 || v > 1440) delete filtered.syncIntervalMinutes
      else filtered.syncIntervalMinutes = v
    }
    if ('lookbackHours' in filtered) {
      const v = Number(filtered.lookbackHours)
      if (isNaN(v) || v < 1 || v > 168) delete filtered.lookbackHours
      else filtered.lookbackHours = v
    }
    const current = loadSettings()
    const updated = { ...current, ...filtered }
    saveSettings(updated)
    startSyncTimer(updated.syncIntervalMinutes)
    return true
  })

  ipcMain.handle('slack:sync', async () => {
    await runSync()
    const s = loadSettings()
    return { added: s.lastSyncAdded, error: s.lastSyncError }
  })

  ipcMain.handle('slack:clear-processed', () => {
    const s = loadSettings()
    saveSettings({ ...s, processedIds: [] })
    return true
  })

  ipcMain.on('ignore-mouse', (_, ignore) => {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true })
  })

  ipcMain.handle('permission:respond', (_, { id, action }) => {
    const pending = pendingPermissions.get(id)
    if (!pending) return false
    clearTimeout(pending.timer)
    pendingPermissions.delete(id)
    pending.res.writeHead(200, { 'Content-Type': 'application/json' })
    pending.res.end(JSON.stringify({ action }))
    return true
  })

  ipcMain.handle('slack:diagnose', async () => {
    const s = loadSettings()
    return diagnoseSlack({
      slackToken:     s.slackToken,
      slackUserToken: s.slackUserToken,
      claudeApiKey:   s.claudeApiKey,
      groqApiKey:     s.groqApiKey,
      provider:       s.llmProvider,
      lookbackHours:  s.lookbackHours,
    })
  })

  // ── Integration test IPC ───────────────────────────────────────
  function withTimeout(promise, ms = 15000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), ms)),
    ])
  }

  ipcMain.handle('jira:test', async () => {
    const s = loadSettings()
    if (!s.atlassianDomain || !s.atlassianEmail || !s.atlassianApiToken) {
      return { ok: false, error: 'Fill in all Jira fields first' }
    }
    try {
      const result = await withTimeout(testJiraConnection(s.atlassianDomain, s.atlassianEmail, s.atlassianApiToken))
      saveSettings({ ...loadSettings(), jiraVerified: result.ok })
      return result
    } catch (err) {
      saveSettings({ ...loadSettings(), jiraVerified: false })
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('redash:test', async () => {
    const s = loadSettings()
    if (!s.redashUrl || !s.redashApiKey) {
      return { ok: false, error: 'Fill in all Redash fields first' }
    }
    try {
      const result = await withTimeout(testRedashConnection(s.redashUrl, s.redashApiKey))
      saveSettings({ ...loadSettings(), redashVerified: result.ok })
      return result
    } catch (err) {
      saveSettings({ ...loadSettings(), redashVerified: false })
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('github:test', async () => {
    const s = loadSettings()
    if (!s.githubToken) {
      return { ok: false, error: 'Enter a GitHub token first' }
    }
    try {
      const result = await withTimeout(testGithubConnection(s.githubToken))
      saveSettings({ ...loadSettings(), githubVerified: result.ok })
      return result
    } catch (err) {
      saveSettings({ ...loadSettings(), githubVerified: false })
      return { ok: false, error: err.message }
    }
  })

  // ── Agent IPC ─────────────────────────────────────────────────
  const activeAgents = new Map()  // runId → { cancelled: bool }

  ipcMain.handle('agent:start', async (_, type, input) => {
    const s = loadSettings()
    const provider = s.agentProvider || 'groq'
    if (provider === 'claude' && !s.claudeApiKey) return { error: 'Claude API key required. Set it in Settings → Preferences → Agent.' }
    if (provider === 'gemini' && !s.geminiApiKey) return { error: 'Gemini API key required. Set it in Settings → Preferences → Agent.' }
    if (provider === 'groq' && !s.groqApiKey) return { error: 'Groq API key required. Set it in Settings → Preferences → AI.' }
    if (provider === 'bedrock') {
      const hasApiKey = !!(s.bedrockApiKey && s.bedrockApiKey.startsWith('ABSK'))
      const hasIamCreds = !!(s.bedrockAccessKeyId && s.bedrockSecretAccessKey)
      const hasEnvCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || !!process.env.AWS_PROFILE
      if (!hasApiKey && !hasIamCreds && !hasEnvCreds) {
        return { error: 'AWS credentials required. Provide a Bedrock API Key (ABSK...), Access Key + Secret Key, or set AWS env vars.' }
      }
    }

    // Route query → agent type if no explicit type given
    let resolvedType = type
    let resolvedInput = input
    let routeInfo = null

    if (!type && input?.query) {
      routeInfo = routeQuery(input.query)
      resolvedType = routeInfo.type
      // Merge extracted params with any user-provided context
      resolvedInput = { ...routeInfo.input, context: input.query }
    }

    const run = createRun(resolvedType, resolvedInput)

    // Notify renderer of routing result
    if (routeInfo && mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('agent:routed', run.id, routeInfo) } catch {}
    }
    const control = { cancelled: false }
    activeAgents.set(run.id, control)

    // Promise-based flows for draft approval and user replies
    const pendingDrafts = new Map()
    const pendingReplies = new Map()

    const agentCallbacks = {
      run,
      settings: s,
      isCancelled: () => control.cancelled,

      onStep: (runId, step) => {
        addStep(runId, step)
        if (mainWindow && !mainWindow.isDestroyed()) {
          try { mainWindow.webContents.send('agent:step-update', runId, step) } catch {}
        }
      },

      onDraft: (runId, draft) => {
        return new Promise((resolve) => {
          addDraft(runId, draft)
          pendingDrafts.set(draft.id, resolve)
          if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('agent:draft', runId, draft) } catch {}
          }
        })
      },

      onAskUser: (runId, question) => {
        return new Promise((resolve) => {
          const askId = `ask-${Date.now()}`
          pendingReplies.set(askId, resolve)
          if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('agent:ask-user', runId, { id: askId, question }) } catch {}
          }
        })
      },

      onComplete: (runId, result) => {
        updateRun(runId, { status: 'completed', result })
        // Score the run and extract reusable memories
        const completedRun = getRun(runId)
        if (completedRun) {
          const evalResult = scoreRun(completedRun)
          updateRun(runId, { eval: evalResult })
          extractAndSaveMemories(completedRun)
          console.log(`[agent] eval: run ${runId} scored ${evalResult.score}/100`)
        }
        activeAgents.delete(runId)
        if (mainWindow && !mainWindow.isDestroyed()) {
          try { mainWindow.webContents.send('agent:completed', runId, result) } catch {}
        }
      },

      onFail: (runId, error) => {
        updateRun(runId, { status: 'failed', error })
        // Score failed runs too — captures tool error patterns
        const failedRun = getRun(runId)
        if (failedRun) {
          const evalResult = scoreRun(failedRun)
          updateRun(runId, { eval: evalResult })
          console.log(`[agent] eval: run ${runId} scored ${evalResult.score}/100 (failed)`)
        }
        activeAgents.delete(runId)
        if (mainWindow && !mainWindow.isDestroyed()) {
          try { mainWindow.webContents.send('agent:failed', runId, error) } catch {}
        }
      },

      onDelegation: (runId, info) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try { mainWindow.webContents.send('agent:delegation', runId, info) } catch {}
        }
      },
    }

    // Store on control object so IPC handlers can access them
    control.pendingDrafts = pendingDrafts
    control.pendingReplies = pendingReplies

    // Run agent in background (non-blocking)
    runAgent(agentCallbacks).catch(err => {
      agentCallbacks.onFail(run.id, err.message)
    })

    return { runId: run.id }
  })

  ipcMain.handle('agent:cancel', (_, runId) => {
    const control = activeAgents.get(runId)
    if (control) {
      control.cancelled = true
      // Resolve any pending promises so the agent loop can exit cleanly
      for (const [, resolve] of control.pendingDrafts || []) resolve(false)
      control.pendingDrafts?.clear()
      for (const [, resolve] of control.pendingReplies || []) resolve('')
      control.pendingReplies?.clear()
      updateRun(runId, { status: 'cancelled' })
      activeAgents.delete(runId)
    }
    return { ok: true }
  })

  ipcMain.handle('agent:approve-draft', (_, runId, draftId) => {
    const control = activeAgents.get(runId)
    const resolve = control?.pendingDrafts?.get(draftId)
    if (resolve) {
      resolveDraft(runId, draftId, true)
      resolve(true)
      control.pendingDrafts.delete(draftId)
    }
    return { ok: true }
  })

  ipcMain.handle('agent:reject-draft', (_, runId, draftId, reason) => {
    const control = activeAgents.get(runId)
    const resolve = control?.pendingDrafts?.get(draftId)
    if (resolve) {
      resolveDraft(runId, draftId, false, reason || null)
      resolve(false)
      control.pendingDrafts.delete(draftId)
    }
    return { ok: true }
  })

  ipcMain.handle('agent:reply', (_, runId, askId, message) => {
    const control = activeAgents.get(runId)
    const resolve = control?.pendingReplies?.get(askId)
    if (resolve) {
      resolve(message)
      control.pendingReplies.delete(askId)
    }
    return { ok: true }
  })

  ipcMain.handle('agent:list-runs', () => {
    // Detect and clean up stuck runs on every list request
    const runs = listRuns()
    const stuckIds = detectStuckRuns(runs)
    for (const id of stuckIds) {
      updateRun(id, { status: 'failed', error: 'Timed out — stuck for over 1 hour' })
      const run = getRun(id)
      if (run && !run.eval) updateRun(id, { eval: scoreRun(run) })
      activeAgents.delete(id)
    }
    if (stuckIds.length) console.log(`[agent] cleaned ${stuckIds.length} stuck runs`)
    return listRuns()
  })
  ipcMain.handle('agent:get-run', (_, runId) => getRun(runId))

  // Aggregate eval stats for the dashboard
  ipcMain.handle('agent:eval-stats', () => {
    const runs = listRuns()
    // Backfill: score any terminal runs that don't have eval yet
    for (const r of runs) {
      if ((r.status === 'completed' || r.status === 'failed') && !r.eval) {
        updateRun(r.id, { eval: scoreRun(r) })
      }
    }
    return aggregateEvals(listRuns())
  })

  // ── Gmail IPC ──────────────────────────────────────────────────
  ipcMain.handle('gmail:connect', async () => {
    console.log('[ipc] gmail:connect called')
    try {
      const { tokens, email } = await connectGmail()
      saveSettings({ ...loadSettings(), gmailTokens: tokens, gmailEmail: email })
      console.log('[ipc] gmail:connect success, email:', email)
      return { email }
    } catch (err) {
      console.error('[ipc] gmail:connect error:', err.message)
      return { error: err.message }
    }
  })

  ipcMain.handle('gmail:disconnect', () => {
    const s = loadSettings()
    saveSettings({ ...s, gmailTokens: null, gmailEmail: '', gmailProcessedIds: [] })
    return true
  })

  ipcMain.handle('gmail:sync', async () => {
    const s = loadSettings()
    if (!s.gmailTokens) return { error: 'Gmail not connected' }
    try {
      const result = await syncGmail({
        tokens:        s.gmailTokens,
        lookbackHours: s.lookbackHours,
        claudeApiKey:  s.claudeApiKey,
        groqApiKey:    s.groqApiKey,
        provider:      s.llmProvider,
        processedIds:  s.gmailProcessedIds || [],
      })
      const allTodos = loadTodos()
      if (result.todos.length > 0) {
        // Dedup: skip tasks whose gmailId already exists (same logic as runSync)
        const existingGmailIds = new Set(
          allTodos.filter(t => t.source === 'gmail' && t.gmailId).map(t => t.gmailId)
        )
        const newTodos = result.todos.filter(t => {
          if (!t.gmailId) return true
          if (existingGmailIds.has(t.gmailId)) return false
          existingGmailIds.add(t.gmailId)
          return true
        })
        if (newTodos.length > 0) {
          saveTodos([...allTodos, ...newTodos])
          if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('todos:pushed', newTodos) } catch {}
          }
        }
        if (newTodos.length < result.todos.length) {
          console.log(`[gmail:sync] deduped ${result.todos.length - newTodos.length} task(s)`)
        }
      }
      saveSettings({
        ...loadSettings(),
        gmailTokens:        result.tokens,
        gmailProcessedIds:  result.processedIds,
        gmailLastSyncedAt:  Date.now(),
        gmailLastSyncError: null,
      })
      return { added: result.todos.length }
    } catch (err) {
      saveSettings({ ...loadSettings(), gmailLastSyncError: err.message })
      return { error: err.message }
    }
  })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()
  createWindow()
  startEventServer()

  // ── Tray icon ──────────────────────────────────────────────────
  // In packaged builds the icon lives in extraResources (process.resourcesPath);
  // in dev it's at the repo root build/ folder.
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png')
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
  // Do NOT use setTemplateImage — the icon is full-colour RGB with no alpha,
  // so template mode renders it invisible on certain menu bars.
  const tray = new Tray(trayIcon)
  tray.setToolTip('Kaaku')

  // Rebuild the tray context menu dynamically so the label reflects current state
  function updateTrayMenu() {
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: isHidden ? 'Show' : 'Hide',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          if (isHidden) {
            trapdoorShow()
          } else {
            mainWindow.webContents.send('trapdoor:start-hide')
          }
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]))
  }
  updateTrayMenu()
  onHideStateChanged = updateTrayMenu

  // ── Global shortcut ────────────────────────────────────────────
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (isHidden) {
      trapdoorShow()
    } else {
      mainWindow.webContents.send('trapdoor:start-hide')
    }
  })
  if (app.isPackaged) {
    autoLauncher.isEnabled().then(enabled => { if (!enabled) autoLauncher.enable() })
  }
  const settings = loadSettings()
  if ((settings.slackUserToken || settings.slackToken) && (settings.groqApiKey || settings.claudeApiKey)) {
    startSyncTimer(settings.syncIntervalMinutes)
    // Run immediately on startup if it has been longer than the interval since the last sync
    const msSinceLastSync = Date.now() - (settings.lastSyncedAt || 0)
    if (msSinceLastSync > settings.syncIntervalMinutes * 60 * 1000) {
      runSync()
    }
  }
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
