import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AnimatePresence, motion } from 'framer-motion'
import TodoPanel from './components/TodoPanel'
import SettingsPanel from './components/SettingsPanel'
import AgentPanel from './components/AgentPanel'
import OnboardingPanel from './components/OnboardingPanel'
import NotificationBubble from './components/NotificationBubble'
import OfficePanel from './components/office/OfficePanel'
import AnalyticsPanel from './components/AnalyticsPanel'
import ErrorBoundary from './components/ErrorBoundary'

// ── CRITICAL: macOS transparent window + WebGL config ────────────
// Without premultipliedAlpha:false the character is invisible on macOS
// transparent windows. This constant must NEVER be modified or inlined.
const CANVAS_GL = Object.freeze({ alpha: true, antialias: true, premultipliedAlpha: false })

// R3F v8 defaults to ACESFilmic tone mapping which can tint transparent regions.
// This component also re-applies premultipliedAlpha as a safety net.
function TransparentBg() {
  const { gl, scene } = useThree()
  useEffect(() => {
    gl.setClearColor(0x000000, 0)
    gl.setClearAlpha(0)
    gl.toneMapping = THREE.NoToneMapping
    // Safety net: force premultipliedAlpha off even if gl prop was somehow dropped
    if (gl.getContextAttributes()?.premultipliedAlpha !== false) {
      console.warn('[TransparentBg] premultipliedAlpha was not false — character may be invisible')
    }
    scene.background = null
  }, [gl, scene])
  return null
}

// ── Manual rotation group (drag-to-rotate) ───────────────────────
function RotationGroup({ manualRotRef, children }) {
  const gRef = useRef()
  useFrame(() => {
    if (gRef.current) gRef.current.rotation.y = manualRotRef.current
  })
  return <group ref={gRef}>{children}</group>
}

// ── Character registry ───────────────────────────────────────────
const CHARACTERS = [
  { id: 'walle',   name: 'Wall·E',  icon: '🤖' },
  { id: 'pikachu', name: 'Pikachu', icon: '⚡'  },
  { id: 'chopper', name: 'Chopper', icon: '🦌'  },
  { id: 'zoro',    name: 'Zoro',    icon: '⚔️'  },
  { id: 'luffy',   name: 'Luffy',   icon: '🏴‍☠️' },
  { id: 'po',      name: 'Po',      icon: '🐼'  },
  { id: 'riri',    name: 'Riri',    icon: '👩‍💼' },
]
const PICKER = [{ id: 'all', name: 'Auto', icon: '✨' }, ...CHARACTERS]

const charModules = {
  walle:   () => import('./characters/WallE'),
  pikachu: () => import('./characters/Pikachu'),
  chopper: () => import('./characters/Chopper'),
  zoro:    () => import('./characters/Zoro'),
  luffy:   () => import('./characters/Luffy'),
  po:      () => import('./characters/Po'),
  riri:    () => import('./characters/Riri'),
}

function CharacterRenderer({ charId, animState, onAnimComplete }) {
  const [Comp, setComp] = useState(null)
  useEffect(() => {
    let cancelled = false
    charModules[charId]?.().then(m => { if (!cancelled) setComp(() => m.default) })
    return () => { cancelled = true }
  }, [charId])
  if (!Comp) return null
  return (
    <Suspense fallback={null}>
      <Comp animState={animState} onAnimComplete={onAnimComplete} />
    </Suspense>
  )
}

// ── Command Palette ──────────────────────────────────────────────
function CommandPalette({ actions, onClose }) {
  const [query, setQuery] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  const inputRef = useRef()

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = query.trim()
    ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : actions

  useEffect(() => { setSelIdx(0) }, [query])

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[selIdx]) { filtered[selIdx].action() }
    if (e.key === 'Escape') { onClose() }
  }

  return (
    <motion.div className="cmd-palette-overlay" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="cmd-palette" onClick={e => e.stopPropagation()}
        initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}>
        <input
          ref={inputRef}
          className="cmd-palette-input"
          placeholder="Type a command..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="cmd-palette-list">
          {filtered.length === 0 && (
            <div className="cmd-palette-empty">No matching commands</div>
          )}
          {filtered.map((a, i) => (
            <div
              key={a.label}
              className={`cmd-palette-item${i === selIdx ? ' selected' : ''}`}
              onClick={a.action}
              onMouseEnter={() => setSelIdx(i)}
            >
              <span className="cmd-palette-item-icon">{a.icon}</span>
              <span className="cmd-palette-item-label">{a.label}</span>
              {a.shortcut && <span className="cmd-palette-item-shortcut">{a.shortcut}</span>}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── App ──────────────────────────────────────────────────────────
export default function App() {
  const [todos, setTodos]               = useState([])
  const [showTodo, setShowTodo]         = useState(false)
  const [activeTab, setActiveTab]       = useState('office')  // 'office' | 'insights' | 'settings'
  const [showAgent, setShowAgent]       = useState(false)
  const [agentPrefill, setAgentPrefill] = useState(null)
  const [animState, setAnimState]       = useState('idle')
  const [notifQueue, setNotifQueue]     = useState([])   // pending bubbles
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [showCmdPalette, setShowCmdPalette]   = useState(false)
  const [showCharTip, setShowCharTip]         = useState(false)
  const charTipShown = useRef(false)
  const currentNotif = notifQueue[0] ?? null

  // ── character picker ─────────────────────────────────────────
  const [pickerIdx, setPickerIdx] = useState(1)       // 0=auto, 1-6=chars
  const [autoIdx,   setAutoIdx]   = useState(0)

  const selected = PICKER[pickerIdx]
  const isAuto   = selected.id === 'all'
  const charId   = isAuto ? CHARACTERS[autoIdx].id : selected.id
  const charMeta = isAuto ? CHARACTERS[autoIdx] : (CHARACTERS.find(c => c.id === selected.id) ?? CHARACTERS[0])

  useEffect(() => {
    if (!isAuto) return
    const id = setInterval(() => setAutoIdx(i => (i + 1) % CHARACTERS.length), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [isAuto])

  // ── click-through for transparent areas ──────────────────────
  // Transparent parts of the window pass mouse events to the desktop.
  // Don't start in ignore mode — let the first mousemove naturally set state.
  useEffect(() => {
    let ignored = null   // null = unknown, let first move decide
    function onMouseMove(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const overUI = el && el !== document.documentElement && el !== document.body
      const shouldIgnore = !overUI
      if (shouldIgnore !== ignored) {
        ignored = shouldIgnore
        window.wallE?.ignoreMouse(shouldIgnore)
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  // Refs for sub-panel state (used by event listeners)
  const showSettingsRef = useRef(false)
  const showAgentRef    = useRef(false)
  showSettingsRef.current = activeTab === 'settings'
  showAgentRef.current    = showAgent

  // ── persistence ──────────────────────────────────────────────
  const todosLoaded = useRef(false)
  useEffect(() => {
    // Sync window size to compact on mount/HMR — prevents the character
    // from being invisible after hot-reload when the window was in office mode.
    window.wallE?.setPanelOpen(false)

    window.wallE?.loadTodos().then(d => {
      if (Array.isArray(d)) setTodos(d)
      todosLoaded.current = true
    })
    // Detect if onboarding is needed + apply theme
    window.wallE?.loadSettings().then(s => {
      if (!s) return
      document.documentElement.setAttribute('data-theme', s.theme || 'auto')
      const hasAny = !!(s.slackUserToken || s.slackToken || s.gmailConnected || s.groqApiKey || s.claudeApiKey)
      setNeedsOnboarding(!s.onboardingComplete && !hasAny)
    })
  }, [])
  useEffect(() => {
    if (todosLoaded.current) window.wallE?.saveTodos(todos)
  }, [todos])

  // ── Slack / system push: new todos from main process ─────────
  useEffect(() => {
    const cleanup = window.wallE?.onTodosPushed(newTodos => {
      setTodos(prev => [...prev, ...newTodos])
      // Queue each new item as a bubble notification
      setNotifQueue(prev => [...prev, ...newTodos])
    })
    return cleanup
  }, [])

  // ── Slack resolution: mark todos done when resolved remotely ──
  useEffect(() => {
    const cleanup = window.wallE?.onTodosResolved(resolvedIds => {
      setTodos(prev => prev.map(t =>
        resolvedIds.includes(t.id) ? { ...t, done: true } : t
      ))
      setAnimState('celebrate')
    })
    return cleanup
  }, [])

  // ── Agent animation bridge ──────────────────────────────────
  // Character reacts to agent state even when panel is closed
  const agentAnimTimer = useRef(null)
  useEffect(() => {
    const cleanups = [
      window.wallE?.onAgentStep((_rid, step) => {
        if (!showAgentRef.current && !showSettingsRef.current) return
        // Map step types to character animations (debounced to avoid jitter)
        if (agentAnimTimer.current) clearTimeout(agentAnimTimer.current)
        if (step.type === 'tool_call') setAnimState('click')
        else if (step.type === 'thinking') setAnimState('idle')
      }),
      window.wallE?.onAgentCompleted(() => {
        setAnimState('celebrate')
        agentAnimTimer.current = setTimeout(() => setAnimState('idle'), 3000)
      }),
      window.wallE?.onAgentFailed(() => {
        setAnimState('special1')
        agentAnimTimer.current = setTimeout(() => setAnimState('idle'), 2000)
      }),
    ]
    return () => {
      cleanups.forEach(c => c?.())
      if (agentAnimTimer.current) clearTimeout(agentAnimTimer.current)
    }
  }, [])

  // ── keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e) {
      // Cmd+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (showTodo) setShowCmdPalette(v => !v)
      }
      // Escape → close palette or panel
      if (e.key === 'Escape') {
        if (showCmdPalette) { setShowCmdPalette(false); return }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showTodo, showCmdPalette])

  // ── notification bubble ───────────────────────────────────────
  function dismissNotif() {
    // Remove permission requests from the todo list — they're transient, not tasks
    if (currentNotif?.requiresResponse) {
      setTodos(prev => prev.filter(t => t.id !== currentNotif.id))
    }
    setNotifQueue(prev => prev.slice(1))
    if (!showTodo) window.wallE?.setBubbleOpen(false)
  }
  function openFromNotif() {
    setNotifQueue(prev => prev.slice(1))
    openPanel()
  }

  // Tell main process to resize for bubble when one appears / disappears
  useEffect(() => {
    if (!showTodo) window.wallE?.setBubbleOpen(!!currentNotif)
  }, [currentNotif?.id, showTodo])

  // ── panel ────────────────────────────────────────────────────
  const minimizedRef = useRef(false)

  function openPanel()  {
    setNotifQueue([])
    setShowTodo(true)
    minimizedRef.current = false
    window.wallE?.setPanelOpen(true)
  }
  function minimizePanel() {
    minimizedRef.current = true
    setShowTodo(false)
    window.wallE?.setPanelOpen(false)
    // State (settings, agent, todos, etc.) is NOT cleared — will restore on reopen
  }
  function restorePanel() {
    minimizedRef.current = false
    setShowTodo(true)
    window.wallE?.setPanelOpen(true)
  }
  function closePanel() {
    minimizedRef.current = false
    setShowTodo(false)
    setActiveTab('office')
    setShowAgent(false)
    setAgentPrefill(null)
    window.wallE?.setPanelOpen(false)
  }

  // ── character interactions ───────────────────────────────────
  const specialIdxRef  = useRef(0)
  const manualRotRef   = useRef(0)
  const canvasDrag     = useRef({ active: false, startX: 0, startRotY: 0, moved: false })

  function handleRightClick(e) {
    e.preventDefault()
    const specials = ['special1', 'special2', 'special3']
    setAnimState(specials[specialIdxRef.current % 3])
    specialIdxRef.current++
  }

  function onCanvasMouseDown(e) {
    // right-click: always handle as special animation
    if (e.button === 2) { e.stopPropagation(); handleRightClick(e); return }
    // panel closed → reset moved flag so click fires, then bubble for window drag
    if (!showTodo) { canvasDrag.current.moved = false; return }
    // panel open → intercept for rotation
    e.stopPropagation()
    canvasDrag.current = { active: true, startX: e.screenX, startRotY: manualRotRef.current, moved: false }
    window.addEventListener('mousemove', onCanvasMouseMove)
    window.addEventListener('mouseup',   onCanvasMouseUp)
  }
  function onCanvasMouseMove(e) {
    if (!canvasDrag.current.active) return
    const dx = e.screenX - canvasDrag.current.startX
    if (Math.abs(dx) > 3) {
      canvasDrag.current.moved = true
      manualRotRef.current = canvasDrag.current.startRotY + dx * 0.016
    }
  }
  function onCanvasMouseUp() {
    canvasDrag.current.active = false
    window.removeEventListener('mousemove', onCanvasMouseMove)
    window.removeEventListener('mouseup',   onCanvasMouseUp)
  }

  const drag = useRef({ dragging: false, startX: 0, startY: 0, moved: false })
  function handleCharClick() {
    if (drag.current.moved || canvasDrag.current.moved) return
    setAnimState('click')
    setTimeout(() => setAnimState('idle'), 1200)
    if (minimizedRef.current) { restorePanel(); return }
    if (showAgent) return   // don't collapse panel while agent overlay is open
    if (showTodo) minimizePanel()
    else openPanel()
  }

  // ── arrow nav ────────────────────────────────────────────────
  function prevChar(e) {
    e.stopPropagation()
    setPickerIdx(i => (i - 1 + PICKER.length) % PICKER.length)
    setAnimState('idle')
    manualRotRef.current = 0
    specialIdxRef.current = 0
  }
  function nextChar(e) {
    e.stopPropagation()
    setPickerIdx(i => (i + 1) % PICKER.length)
    setAnimState('idle')
    manualRotRef.current = 0
    specialIdxRef.current = 0
  }

  // ── task complete ────────────────────────────────────────────
  const handleTaskComplete = useCallback(() => {
    setAnimState('celebrate')
  }, [])
  const handleCelebDone = useCallback(() => {
    setAnimState('idle')
  }, [])

  // ── drag window ──────────────────────────────────────────────
  function onMouseDown(e) {
    drag.current = { dragging: true, startX: e.screenX, startY: e.screenY, moved: false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
  }
  function onMouseMove(e) {
    if (!drag.current.dragging) return
    const dx = e.screenX - drag.current.startX
    const dy = e.screenY - drag.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.current.moved = true
      window.wallE?.moveWindow({ dx, dy })
      drag.current.startX = e.screenX
      drag.current.startY = e.screenY
    }
  }
  function onMouseUp() {
    drag.current.dragging = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup',   onMouseUp)
  }

  const pendingCount = todos.filter(t => !t.done && !t.requiresResponse).length

  // ── command palette actions ──────────────────────────────────
  const cmdActions = [
    { icon: '📊', label: 'Open Insights',   shortcut: '',      action: () => { setActiveTab('insights'); setShowCmdPalette(false) } },
    { icon: '⚙',  label: 'Open Settings',   shortcut: '',      action: () => { setActiveTab('settings'); setShowCmdPalette(false) } },
    { icon: '🤖', label: 'Launch Agent',     shortcut: '',      action: () => { setShowAgent(true); setShowCmdPalette(false) } },
    { icon: '🔄', label: 'Sync Now',         shortcut: '',      action: () => { window.wallE?.syncSlack(); setShowCmdPalette(false) } },
    { icon: '📧', label: 'Sync Gmail',       shortcut: '',      action: () => { window.wallE?.gmailSync(); setShowCmdPalette(false) } },
    { icon: '—',  label: 'Minimize',          shortcut: '',      action: () => { minimizePanel(); setShowCmdPalette(false) } },
    { icon: '✕',  label: 'Close & Reset',     shortcut: '',      action: () => { closePanel(); setShowCmdPalette(false) } },
  ]

  return (
    <div className={`app-root ${showTodo ? 'office' : 'compact'}`}>

      {/* ── Office mode (near-fullscreen) ─────────────────── */}
      {showTodo && (
        <>
          {needsOnboarding ? (
            <motion.div key="onboarding-wrap" className="office-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <OnboardingPanel
                onComplete={() => {
                  setNeedsOnboarding(false)
                  window.wallE?.syncSlack()
                }}
              />
            </motion.div>
          ) : (
            <>
              {/* Tab bar */}
              <div className="app-tabs-header">
                <div className="app-tabs">
                  {[
                    { id: 'office', label: 'Office' },
                    { id: 'insights', label: 'Insights' },
                    { id: 'settings', label: 'Settings' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      className={`app-tab${activeTab === tab.id ? ' active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="app-tabs-actions">
                  <button className="minimize-btn" onClick={minimizePanel} title="Minimize — click assistant to restore">&#8211;</button>
                  <button className="close-btn" onClick={closePanel}>&#10005;</button>
                </div>
              </div>

              {/* Tab content */}
              <div className="app-tab-content">
                <div className="app-tab-pane" style={{ display: activeTab === 'office' ? 'flex' : 'none' }}>
                  <ErrorBoundary key="office-eb">
                    <OfficePanel
                      key="office"
                      todos={todos}
                      setTodos={setTodos}
                      onOpenAgent={(prefill) => { setShowAgent(true); setAgentPrefill(prefill || null) }}
                      onTaskComplete={handleTaskComplete}
                    />
                  </ErrorBoundary>
                </div>
                {activeTab === 'insights' && (
                  <AnalyticsPanel todos={todos} />
                )}
                {activeTab === 'settings' && (
                  <SettingsPanel />
                )}

                {/* Agent overlay */}
                <AnimatePresence>
                  {showAgent && (
                    <motion.div key="agent-wrap" className="office-overlay"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <AgentPanel
                        onClose={() => { setShowAgent(false); setAgentPrefill(null) }}
                        onOpenSettings={() => { setShowAgent(false); setActiveTab('settings') }}
                        prefill={agentPrefill}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Notification bubble (compact mode only) ─────────── */}
      <AnimatePresence>
        {!showTodo && currentNotif && (
          <NotificationBubble
            key={currentNotif.id}
            notification={currentNotif}
            onDismiss={dismissNotif}
            onOpen={openFromNotif}
          />
        )}
      </AnimatePresence>

      {/* ── Command palette ──────────────────────────────────────── */}
      <AnimatePresence>
        {showCmdPalette && (
          <CommandPalette
            actions={cmdActions}
            onClose={() => setShowCmdPalette(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Character canvas (compact mode only) ─────────────────── */}
      {!showTodo && (
        <div className="bottom-row" onMouseDown={onMouseDown}>
          <div className="walle-canvas-wrap"
            onClick={handleCharClick}
            onContextMenu={handleRightClick}
            onMouseDown={onCanvasMouseDown}
            onMouseEnter={() => {
              if (!charTipShown.current) {
                charTipShown.current = true
                setShowCharTip(true)
                setTimeout(() => setShowCharTip(false), 4000)
              }
            }}>
            {pendingCount > 0 && (
              <div className="task-badge">{pendingCount}</div>
            )}
            <AnimatePresence>
              {showCharTip && (
                <motion.div className="char-tooltip"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}>
                  Click to open &middot; Drag to rotate &middot; Right-click for surprises
                </motion.div>
              )}
            </AnimatePresence>
            <div className="char-ground-shadow" />
            <ErrorBoundary fallback={
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, cursor: 'pointer' }}
                onClick={handleCharClick}>{charMeta.icon}</div>
            }>
              <Canvas
                camera={{ position: [0, 0.6, 5.8], fov: 38 }}
                onCreated={s => { s.camera.lookAt(0, 0.75, 0); s.camera.updateProjectionMatrix() }}
                gl={CANVAS_GL}
                style={{ background: 'transparent' }}
              >
                <TransparentBg />
                <hemisphereLight args={['#B0CCE8', '#7A6040', 0.55]} />
                <ambientLight intensity={0.35} />
                <directionalLight position={[4, 9, 6]}  intensity={1.6} castShadow />
                <directionalLight position={[-4, 3, -3]} intensity={0.5} color="#FFB070" />
                <pointLight       position={[0, 4, 3]}   intensity={0.7} color="#FFFFFF" />
                <RotationGroup manualRotRef={manualRotRef}>
                  <CharacterRenderer charId={charId} animState={animState} onAnimComplete={handleCelebDone} />
                </RotationGroup>
              </Canvas>
            </ErrorBoundary>
          </div>
        </div>
      )}

    </div>
  )
}
