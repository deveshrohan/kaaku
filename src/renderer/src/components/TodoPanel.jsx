import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const PRIORITY_COLOR = { high: '#FF453A', medium: '#FF9F0A', low: '#34C759' }
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const TYPE_CONFIG = {
  task:     { label: 'task',     bg: 'rgba(128,200,255,0.14)', text: '#80c8ff' },
  reply:    { label: 'reply',    bg: 'rgba(255,159,10,0.14)',  text: '#FF9F0A' },
  fyi:      { label: 'fyi',      bg: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.38)' },
  deadline: { label: 'deadline', bg: 'rgba(255,69,58,0.14)',   text: '#FF453A' },
}

const GROUP_ORDER = ['Today', 'This week', 'Older']
const SORT_LABELS = { priority: '↑↓ priority', newest: '↑↓ newest', source: '↑↓ source' }

function TypeBadge({ type }) {
  if (!type || type === 'task') return null
  const cfg = TYPE_CONFIG[type]
  if (!cfg) return null
  return <span className="type-badge" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>
}

function getGroup(todo) {
  const ts = todo.createdAt || (typeof todo.id === 'number' ? todo.id : Date.now())
  const diff = Date.now() - ts
  const day = 86400000
  if (diff < day)     return 'Today'
  if (diff < 7 * day) return 'This week'
  return 'Older'
}

export default function TodoPanel({ todos, setTodos, onTaskComplete, onClose, onOpenSettings }) {
  const [input, setInput]           = useState('')
  const [search, setSearch]         = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [filterPriority, setFilterP] = useState(new Set())
  const [filterType, setFilterT]    = useState(new Set())
  const [sort, setSort]             = useState('priority')
  const [doneOpen, setDoneOpen]     = useState(false)

  const inputRef  = useRef()
  const searchRef = useRef()

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 300) }, [])
  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 50)
    else setSearch('')
  }, [showSearch])

  function addTodo() {
    const text = input.trim()
    if (!text) return
    setTodos(prev => [...prev, { id: Date.now(), text, done: false, createdAt: Date.now() }])
    setInput('')
  }

  function toggleTodo(id) {
    if (!todos.find(t => t.id === id && !t.done)) return
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: true } : t))
    onTaskComplete()
  }

  function deleteTodo(id) { setTodos(prev => prev.filter(t => t.id !== id)) }
  function clearDone()    { setTodos(prev => prev.filter(t => !t.done)) }

  function handleKey(e) {
    if (e.key === 'Enter') addTodo()
    if (e.key === 'Escape') { if (showSearch) setShowSearch(false); else onClose() }
  }

  function togglePriority(p) {
    setFilterP(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  }
  function toggleType(t) {
    setFilterT(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
  }
  function cycleSort() {
    setSort(s => s === 'priority' ? 'newest' : s === 'newest' ? 'source' : 'priority')
  }

  const pending = useMemo(() => {
    let items = todos.filter(t => !t.done && !t.requiresResponse)

    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(t =>
        t.text?.toLowerCase().includes(q) ||
        t.from?.toLowerCase().includes(q) ||
        t.slackChannelName?.toLowerCase().includes(q) ||
        t.context?.toLowerCase().includes(q)
      )
    }
    if (filterPriority.size > 0) items = items.filter(t => filterPriority.has(t.priority))
    if (filterType.size > 0)     items = items.filter(t => filterType.has(t.type || 'task'))

    if (sort === 'priority')    items.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
    else if (sort === 'newest') items.sort((a, b) => (b.createdAt || b.id) - (a.createdAt || a.id))
    else if (sort === 'source') items.sort((a, b) => (a.source || 'manual').localeCompare(b.source || 'manual'))

    return items
  }, [todos, search, filterPriority, filterType, sort])

  const grouped = useMemo(() => {
    const map = {}
    for (const t of pending) {
      const g = getGroup(t)
      ;(map[g] = map[g] || []).push(t)
    }
    return GROUP_ORDER.filter(g => map[g]).map(g => ({ label: g, items: map[g] }))
  }, [pending])

  const totalPending = useMemo(() => todos.filter(t => !t.done && !t.requiresResponse).length, [todos])
  const done         = todos.filter(t => t.done && !t.requiresResponse)
  const hasFilters   = filterPriority.size > 0 || filterType.size > 0 || search.trim()

  function clearFilters() { setFilterP(new Set()); setFilterT(new Set()); setSearch(''); setShowSearch(false) }

  return (
    <motion.div
      className="todo-panel"
      initial={{ y: 40, opacity: 0, scale: 0.96 }}
      animate={{ y: 0,  opacity: 1, scale: 1    }}
      exit={{    y: 40, opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="todo-header">
        <div className="todo-title-group">
          <span className="todo-title">Kaaku</span>
          {totalPending > 0 && (
            <span className="todo-count">
              {hasFilters && pending.length !== totalPending
                ? `${pending.length} / ${totalPending}`
                : totalPending}
            </span>
          )}
        </div>
        <div className="todo-header-actions">
          <button
            className={`todo-icon-btn${showSearch ? ' active' : ''}`}
            onClick={() => setShowSearch(s => !s)}
            title="Search tasks"
          >🔍</button>
          <button className="settings-gear-btn" onClick={onOpenSettings} title="Settings">⚙</button>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            className="search-wrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <input
              ref={searchRef}
              className="todo-input search-input"
              placeholder="Search tasks, @sender, #channel…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setShowSearch(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="filter-bar">
        {/* Priority */}
        <div className="filter-group">
          {['high', 'medium', 'low'].map(p => {
            const active = filterPriority.has(p)
            return (
              <button
                key={p}
                className={`filter-pill${active ? ' active' : ''}`}
                style={active ? {
                  background: PRIORITY_COLOR[p] + '22',
                  borderColor: PRIORITY_COLOR[p] + 'aa',
                  color: PRIORITY_COLOR[p],
                } : {}}
                onClick={() => togglePriority(p)}
                title={p + ' priority'}
              >
                <span
                  className="filter-dot"
                  style={{ background: active ? PRIORITY_COLOR[p] : 'rgba(255,255,255,0.22)' }}
                />
                {p[0].toUpperCase()}
              </button>
            )
          })}
        </div>

        <div className="filter-sep" />

        {/* Type */}
        <div className="filter-group">
          {['reply', 'fyi', 'deadline'].map(t => {
            const active = filterType.has(t)
            const cfg = TYPE_CONFIG[t]
            return (
              <button
                key={t}
                className={`filter-pill${active ? ' active' : ''}`}
                style={active ? {
                  background: cfg?.bg,
                  borderColor: (cfg?.text || '#fff') + '88',
                  color: cfg?.text,
                } : {}}
                onClick={() => toggleType(t)}
              >{t}</button>
            )
          })}
        </div>

        <div className="filter-sep" />

        {/* Sort */}
        <button
          className={`filter-sort-btn${sort !== 'priority' ? ' active' : ''}`}
          onClick={cycleSort}
          title="Cycle sort order"
        >
          {SORT_LABELS[sort]}
        </button>

        {hasFilters && (
          <button className="filter-clear-btn" onClick={clearFilters} title="Clear filters">✕</button>
        )}
      </div>

      {/* ── Add task ───────────────────────────────────────────── */}
      <div className="todo-input-row">
        <input
          ref={inputRef}
          className="todo-input"
          placeholder="Add a task…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <button className="add-btn" onClick={addTodo}>+</button>
      </div>

      {/* ── Task list ──────────────────────────────────────────── */}
      <div className="todo-list">

        {/* Empty state */}
        {pending.length === 0 && !done.length && !hasFilters && (
          <div className="empty-state">
            <span className="empty-icon">✦</span>
            <span className="empty-title">All clear!</span>
            <span className="empty-sub">Add a task above or wait for Slack to sync.</span>
          </div>
        )}
        {pending.length === 0 && hasFilters && (
          <div className="empty-state">
            <span className="empty-icon">🔍</span>
            <span className="empty-title">No matches</span>
            <span className="empty-sub">Try adjusting your filters</span>
          </div>
        )}

        {/* Grouped task items */}
        <AnimatePresence>
          {grouped.map(({ label, items }) => (
            <div key={label} className="todo-group">
              <div className="todo-group-label">
                <span className="todo-group-label-text">{label}</span>
                <span className="todo-group-line" />
                <span className="todo-group-count">{items.length}</span>
              </div>
              {items.map(todo => (
                <motion.div
                  key={todo.id}
                  className="todo-item"
                  initial={{ x: -14, opacity: 0 }}
                  animate={{ x: 0,   opacity: 1 }}
                  exit={{ x: 20, opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                >
                  <div
                    className="priority-bar"
                    style={{ background: PRIORITY_COLOR[todo.priority] || 'rgba(255,255,255,0.12)' }}
                  />
                  <div className="todo-item-inner">
                    <button className="check-btn" onClick={() => toggleTodo(todo.id)} />
                    <div className="todo-content">
                      <span className="todo-action">{todo.text}</span>
                      {(todo.from || todo.slackChannelName || todo.context || (todo.type && todo.type !== 'task')) && (
                        <div className="todo-meta">
                          <TypeBadge type={todo.type} />
                          {todo.from && <span className="todo-meta-from">@{todo.from}</span>}
                          {todo.slackChannelName && (
                            <span className="todo-meta-channel">
                              {todo.source === 'slack' ? `#${todo.slackChannelName}` : todo.slackChannelName}
                            </span>
                          )}
                          {todo.context && (
                            <span className="todo-meta-context">{todo.context}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>✕</button>
                  </div>
                </motion.div>
              ))}
            </div>
          ))}
        </AnimatePresence>

        {/* Done accordion */}
        {done.length > 0 && (
          <div className="done-section">
            <button className="done-accordion-btn" onClick={() => setDoneOpen(o => !o)}>
              <span className="done-accordion-chevron">{doneOpen ? '▾' : '▸'}</span>
              <span className="done-accordion-label">Done ({done.length})</span>
              {doneOpen && (
                <span
                  className="done-clear-btn"
                  onClick={e => { e.stopPropagation(); clearDone() }}
                >Clear all</span>
              )}
            </button>
            <AnimatePresence>
              {doneOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden' }}
                >
                  {done.map(todo => (
                    <div key={todo.id} className="todo-item done">
                      <div className="priority-bar" style={{ background: 'rgba(255,255,255,0.08)' }} />
                      <div className="todo-item-inner">
                        <span className="check-done">✓</span>
                        <div className="todo-content">
                          <span className="todo-action">{todo.text}</span>
                        </div>
                        <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
}
