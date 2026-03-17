import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import fs from 'fs'
import http from 'http'
import AutoLaunch from 'electron-auto-launch'
import { syncSlack, diagnoseSlack } from './slack.js'

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
const EXPANDED = { w: 440, h: 680 }

// ── Todos ─────────────────────────────────────────────────────────
function loadTodos() {
  try {
    if (fs.existsSync(TODOS_FILE)) return JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8'))
  } catch {}
  return []
}
function saveTodos(todos) {
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf8')
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
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 })
}

// ── Sync ──────────────────────────────────────────────────────────
async function runSync() {
  if (syncLocked) { console.log('Sync already in progress, skipping'); return }
  syncLocked = true
  const settings = loadSettings()
  const hasToken  = settings.slackUserToken || settings.slackToken
  const hasApiKey = settings.groqApiKey || settings.claudeApiKey
  if (!hasToken || !hasApiKey) { syncLocked = false; return }

  try {
    // Pass existing unresolved Slack tasks so resolution can be checked
    const allTodos          = loadTodos()
    const pendingSlackTasks = allTodos.filter(t => !t.done && t.source === 'slack' && t.slackChannel)

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

    let updatedTodos = allTodos

    // Mark resolved tasks as done
    if (result.resolvedIds?.length > 0) {
      updatedTodos = updatedTodos.map(t =>
        result.resolvedIds.includes(t.id) ? { ...t, done: true } : t
      )
      if (mainWindow && !mainWindow.isDestroyed()) {
        try { mainWindow.webContents.send('todos:resolved', result.resolvedIds) } catch {}
      }
    }

    // Update latestTs on tasks that had new activity but aren't resolved yet
    if (result.updatedTasks?.length > 0) {
      const updatedMap = new Map(result.updatedTasks.map(t => [t.id, t]))
      updatedTodos = updatedTodos.map(t => updatedMap.has(t.id) ? updatedMap.get(t.id) : t)
    }

    // Add new todos
    if (result.todos.length > 0) {
      updatedTodos = [...updatedTodos, ...result.todos]
      if (mainWindow && !mainWindow.isDestroyed()) {
        try { mainWindow.webContents.send('todos:pushed', result.todos) } catch {}
      }
    }

    saveTodos(updatedTodos)

    saveSettings({
      ...settings,
      processedIds:  result.processedIds,
      lastSyncedAt:  Date.now(),
      lastSyncError: result.error || null,
      lastSyncAdded: result.todos.length,
    })
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
    id: Date.now() + Math.random(),
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
            id: Date.now() + Math.random(),
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

// ── Window ────────────────────────────────────────────────────────
function getBottomCenter(w, h) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return { x: Math.floor(width / 2 - w / 2), y: height - h }
}

function createWindow() {
  const pos = getBottomCenter(COMPACT.w, COMPACT.h)

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

  ipcMain.handle('set-panel-open', (_, open) => resizeTo(open ? EXPANDED : COMPACT))
  ipcMain.handle('set-bubble-open', (_, open) => resizeTo(open ? BUBBLE : COMPACT))

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
    // Return everything except processedIds (too large for IPC)
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
    }
  })

  ipcMain.handle('settings:save', (_, config) => {
    const current = loadSettings()
    const updated = { ...current, ...config }
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
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()
  createWindow()
  startEventServer()
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

app.on('window-all-closed', () => app.quit())
