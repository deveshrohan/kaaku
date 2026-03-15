import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import fs from 'fs'
import AutoLaunch from 'electron-auto-launch'
import { syncSlack, diagnoseSlack } from './slack.js'

const autoLauncher = new AutoLaunch({ name: 'Kaaku', isHidden: true })

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }

let mainWindow
let syncTimer = null

const TODOS_FILE    = join(app.getPath('userData'), 'todos.json')
const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

const COMPACT  = { w: 132, h: 200 }
const EXPANDED = { w: 320, h: 490 }

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
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf8')
}

// ── Sync ──────────────────────────────────────────────────────────
async function runSync() {
  const settings = loadSettings()
  if (!settings.slackToken || !settings.claudeApiKey) return

  const result = await syncSlack({
    slackToken:    settings.slackToken,
    claudeApiKey:  settings.claudeApiKey,
    groqApiKey:    settings.groqApiKey,
    provider:      settings.llmProvider,
    processedIds:  settings.processedIds,
    lookbackHours: settings.lookbackHours,
  })

  if (result.todos.length > 0) {
    const todos = loadTodos()
    saveTodos([...todos, ...result.todos])
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('todos:pushed', result.todos)
    }
  }

  saveSettings({
    ...settings,
    processedIds: result.processedIds,
    lastSyncedAt: Date.now(),
    lastSyncError: result.error || null,
    lastSyncAdded: result.todos.length,
  })
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
    transparent: true, frame: false, alwaysOnTop: true,
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
    mainWindow.loadFile(join(__dirname, '../../renderer/index.html'))
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // ── IPC ─────────────────────────────────────────────────────────
  ipcMain.handle('set-panel-open', (_, open) => {
    const dim = open ? EXPANDED : COMPACT
    const [cx, cy] = mainWindow.getPosition()
    const [cw, ch] = mainWindow.getSize()
    mainWindow.setSize(dim.w, dim.h)
    mainWindow.setPosition(cx + Math.floor(cw / 2) - Math.floor(dim.w / 2), cy + ch - dim.h)
  })

  ipcMain.handle('move-window', (_, { dx, dy }) => {
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + dx, y + dy)
  })

  ipcMain.handle('todos:load', () => loadTodos())
  ipcMain.handle('todos:save', (_, data) => { saveTodos(data); return true })

  ipcMain.handle('settings:load', () => {
    const s = loadSettings()
    // Return everything except processedIds (too large for IPC)
    return {
      slackToken:          s.slackToken,
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

  ipcMain.handle('slack:diagnose', async () => {
    const s = loadSettings()
    return diagnoseSlack({
      slackToken:   s.slackToken,
      claudeApiKey: s.claudeApiKey,
      groqApiKey:   s.groqApiKey,
      provider:     s.llmProvider,
      lookbackHours: s.lookbackHours,
    })
  })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()
  createWindow()
  if (app.isPackaged) {
    autoLauncher.isEnabled().then(enabled => { if (!enabled) autoLauncher.enable() })
  }
  const settings = loadSettings()
  if (settings.slackToken && settings.claudeApiKey) {
    startSyncTimer(settings.syncIntervalMinutes)
  }
})

app.on('window-all-closed', () => app.quit())
