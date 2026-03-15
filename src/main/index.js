import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import fs from 'fs'
import AutoLaunch from 'electron-auto-launch'

const autoLauncher = new AutoLaunch({ name: 'Kaaku', isHidden: true })

// ── Single-instance lock — prevents duplicate windows ────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }

let mainWindow

const TODOS_FILE = join(app.getPath('userData'), 'todos.json')

const COMPACT  = { w: 132, h: 200 }   // wider + taller → room for jump animations
const EXPANDED = { w: 320, h: 490 }   // todo + rename + char picker + canvas

function loadTodos() {
  try {
    if (fs.existsSync(TODOS_FILE)) return JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8'))
  } catch {}
  return []
}

function saveTodos(todos) {
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf8')
}

function getBottomCenter(w, h) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return { x: Math.floor(width / 2 - w / 2), y: height - h }
}

function createWindow() {
  const pos = getBottomCenter(COMPACT.w, COMPACT.h)

  mainWindow = new BrowserWindow({
    width:  COMPACT.w,
    height: COMPACT.h,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.setAlwaysOnTop(true, 'floating', 1)
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../../renderer/index.html'))
  }

  // Focus second instance → bring existing window to front
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // Resize while keeping bottom edge + centre-X fixed
  ipcMain.handle('set-panel-open', (_, open) => {
    const dim      = open ? EXPANDED : COMPACT
    const [cx, cy] = mainWindow.getPosition()
    const [cw, ch] = mainWindow.getSize()
    const bottomY  = cy + ch
    const centerX  = cx + Math.floor(cw / 2)
    mainWindow.setSize(dim.w, dim.h)
    mainWindow.setPosition(centerX - Math.floor(dim.w / 2), bottomY - dim.h)
  })

  ipcMain.handle('move-window',  (_, { dx, dy }) => {
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + dx, y + dy)
  })

  ipcMain.handle('todos:load', ()        => loadTodos())
  ipcMain.handle('todos:save', (_, data) => { saveTodos(data); return true })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()
  createWindow()
  // Enable auto-launch at login (only in packaged app)
  if (app.isPackaged) {
    autoLauncher.isEnabled().then(enabled => {
      if (!enabled) autoLauncher.enable()
    })
  }
})

app.on('window-all-closed', () => app.quit())
