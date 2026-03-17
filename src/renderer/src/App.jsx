import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AnimatePresence, motion } from 'framer-motion'
import TodoPanel from './components/TodoPanel'
import SettingsPanel from './components/SettingsPanel'
import NotificationBubble from './components/NotificationBubble'

// ── Force truly transparent canvas background ────────────────────
// R3F v8 defaults to ACESFilmic tone mapping which can tint transparent regions.
// Disable it here and ensure clearColor alpha is 0.
function TransparentBg() {
  const { gl, scene } = useThree()
  gl.setClearColor(0x000000, 0)
  gl.setClearAlpha(0)
  gl.toneMapping = THREE.NoToneMapping
  scene.background = null
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

// ── App ──────────────────────────────────────────────────────────
export default function App() {
  const [todos, setTodos]               = useState([])
  const [showTodo, setShowTodo]         = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [animState, setAnimState]       = useState('idle')
  const [notifQueue, setNotifQueue]     = useState([])   // pending bubbles
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

  // ── dismiss on click-outside (window blur) ───────────────────
  useEffect(() => {
    const onBlur = () => { if (showTodo) closePanel() }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [showTodo])

  // ── persistence ──────────────────────────────────────────────
  const todosLoaded = useRef(false)
  useEffect(() => {
    window.wallE?.loadTodos().then(d => {
      if (Array.isArray(d)) setTodos(d)
      todosLoaded.current = true
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
  function openPanel()  { setShowTodo(true);  window.wallE?.setPanelOpen(true)  }
  function closePanel() { setShowTodo(false); setShowSettings(false); window.wallE?.setPanelOpen(false) }

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
    if (showSettings) return   // don't collapse panel while settings is open
    if (showTodo) closePanel()
    else          openPanel()
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

  return (
    <div className={`app-root ${showTodo ? 'expanded' : 'compact'}`}>

      {/* ── Expanded panel ──────────────────────────────────── */}
      <AnimatePresence>
        {showTodo && (
          <motion.div
            className="panel-wrap"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <AnimatePresence mode="wait">
              {showSettings ? (
                <SettingsPanel key="settings" onClose={() => setShowSettings(false)} />
              ) : (
                <TodoPanel
                  key="todo"
                  todos={todos}
                  setTodos={setTodos}
                  onTaskComplete={handleTaskComplete}
                  onClose={closePanel}
                  onOpenSettings={() => setShowSettings(true)}
                />
              )}
            </AnimatePresence>
            <div className="panel-chevron" />
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── Bottom row: [←] character [→] ───────────────────── */}
      <div className="bottom-row" onMouseDown={onMouseDown}>
        <AnimatePresence>
          {showTodo && (
            <motion.button className="nav-arrow" onClick={prevChar}
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }} whileTap={{ scale: 0.82 }}>‹</motion.button>
          )}
        </AnimatePresence>

        {/* Canvas — fixed size, never changes */}
        <div className="walle-canvas-wrap"
          onClick={handleCharClick}
          onContextMenu={handleRightClick}
          onMouseDown={onCanvasMouseDown}>
          {pendingCount > 0 && !showTodo && (
            <div className="task-badge">{pendingCount}</div>
          )}
          <div className="char-ground-shadow" />
          <Canvas
            camera={{ position: [0, 0.6, 5.8], fov: 38 }}
            onCreated={s => { s.camera.lookAt(0, 0.75, 0); s.camera.updateProjectionMatrix() }}
            gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
            style={{ background: 'transparent' }}
          >
            <TransparentBg />
            {/* Better lighting for higher fidelity */}
            <hemisphereLight args={['#B0CCE8', '#7A6040', 0.55]} />
            <ambientLight intensity={0.35} />
            <directionalLight position={[4, 9, 6]}  intensity={1.6} castShadow />
            <directionalLight position={[-4, 3, -3]} intensity={0.5} color="#FFB070" />
            <pointLight       position={[0, 4, 3]}   intensity={0.7} color="#FFFFFF" />
            <RotationGroup manualRotRef={manualRotRef}>
              <CharacterRenderer charId={charId} animState={animState} onAnimComplete={handleCelebDone} />
            </RotationGroup>
          </Canvas>
        </div>

        <AnimatePresence>
          {showTodo && (
            <motion.button className="nav-arrow" onClick={nextChar}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }} whileTap={{ scale: 0.82 }}>›</motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Character label (expanded only) */}
      <AnimatePresence>
        {showTodo && (
          <motion.div key={charMeta.id} className="char-label"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {charMeta.icon} {charMeta.name}
            {isAuto && <span className="char-label-auto"> · auto</span>}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
