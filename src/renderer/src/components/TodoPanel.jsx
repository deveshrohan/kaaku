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

const SOURCE_CONFIG = {
  slack: { icon: '💬', label: 'Slack' },
  gmail: { icon: '📧', label: 'Gmail' },
}

// ── Agent type recommendation from task content ─────────────────────
const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/

function recommendAgent(todo) {
  const fullText = todo.text + (todo.context ? ' ' + todo.context : '')
  const text = fullText.toLowerCase()
  const jiraMatch = fullText.match(JIRA_KEY_RE)
  // Task description becomes agent context so the agent knows what was asked
  const taskContext = fullText

  if (/\b(review|feedback|check|look at|go through)\b.*\b(prd|spec|requirement|doc|proposal)\b/.test(text)
      || /\b(prd|spec|requirement)\b.*\b(review|feedback)\b/.test(text)) {
    return { type: 'review-prd', input: jiraMatch ? { jiraKey: jiraMatch[0], context: taskContext } : { context: taskContext } }
  }
  if (/\b(write|create|draft)\b.*\b(prd|spec|requirement|proposal)\b/.test(text)) {
    return { type: 'create-prd', input: { context: taskContext } }
  }
  if (/\b(sprint|backlog|board|standup|velocity)\b/.test(text)) {
    return { type: 'review-sprint', input: { context: taskContext } }
  }
  if (/\b(implement|build|code|develop|pr\b|pull request|branch)\b/.test(text)) {
    return { type: 'implement-prd', input: jiraMatch ? { jiraKey: jiraMatch[0], context: taskContext } : { context: taskContext } }
  }
  // If it has a Jira key, default to review-prd
  if (jiraMatch) {
    return { type: 'review-prd', input: { jiraKey: jiraMatch[0], context: taskContext } }
  }
  // Reply-type tasks or anything from Slack/Gmail → lookup-reply
  if (todo.type === 'reply' || todo.source === 'slack' || todo.source === 'gmail') {
    return {
      type: 'lookup-reply',
      input: {
        query: todo.text,
        target: todo.slackChannel || todo.gmailFrom || '',
        context: taskContext,
      },
    }
  }
  return { type: 'lookup-reply', input: { query: todo.text, context: taskContext } }
}

const GROUP_ORDER = ['Today', 'This week', 'Older']
const SORT_LABELS = { priority: '↑↓ priority', newest: '↑↓ newest', deadline: '↑↓ deadline', source: '↑↓ source' }

function DeadlineTag({ deadline }) {
  if (!deadline) return null
  const now = Date.now()
  const diff = deadline - now
  const DAY = 86400000
  const isOverdue = diff < 0
  const isDueSoon = diff >= 0 && diff < DAY
  const cls = isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : ''
  const label = isOverdue
    ? `${Math.ceil(-diff / DAY)}d overdue`
    : diff < DAY ? 'Due today'
    : diff < 2 * DAY ? 'Tomorrow'
    : `${Math.ceil(diff / DAY)}d`
  return <span className={`todo-deadline ${cls}`}>{label}</span>
}

function TypeBadge({ type }) {
  if (!type || type === 'task') return null
  const cfg = TYPE_CONFIG[type]
  if (!cfg) return null
  return <span className="type-badge" style={{ background: cfg.bg, color: cfg.text }}>{cfg.label}</span>
}

function getGroup(todo) {
  const ts = todo.createdAt || Date.now()
  const diff = Date.now() - ts
  const day = 86400000
  if (diff < day)     return 'Today'
  if (diff < 7 * day) return 'This week'
  return 'Older'
}

export default function TodoPanel({ todos, setTodos, onTaskComplete, onClose, onOpenSettings, onOpenAgent }) {
  const [input, setInput]           = useState('')
  const [inputDeadline, setInputDeadline] = useState('')
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
    const todo = { id: crypto.randomUUID(), text, done: false, createdAt: Date.now() }
    if (inputDeadline) todo.deadline = new Date(inputDeadline + 'T23:59:59').getTime()
    setTodos(prev => [...prev, todo])
    setInput('')
    setInputDeadline('')
  }

  function toggleTodo(id) {
    const todo = todos.find(t => t.id === id)
    if (!todo) return
    const nowDone = !todo.done
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, done: nowDone, completedAt: nowDone ? Date.now() : undefined } : t
    ))
    if (nowDone) onTaskComplete()
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
    setSort(s => s === 'priority' ? 'newest' : s === 'newest' ? 'deadline' : s === 'deadline' ? 'source' : 'priority')
  }

  const pending = useMemo(() => {
    let items = todos.filter(t => !t.done && !t.requiresResponse)

    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(t =>
        t.text?.toLowerCase().includes(q) ||
        t.from?.toLowerCase().includes(q) ||
        t.gmailFrom?.toLowerCase().includes(q) ||
        t.slackChannelName?.toLowerCase().includes(q) ||
        t.context?.toLowerCase().includes(q)
      )
    }
    if (filterPriority.size > 0) items = items.filter(t => filterPriority.has(t.priority))
    if (filterType.size > 0)     items = items.filter(t => filterType.has(t.type || 'task'))

    if (sort === 'priority')    items.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
    else if (sort === 'newest') items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    else if (sort === 'deadline') items.sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity))
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
  const done         = todos.filter(t => t.done && !t.requiresResponse).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
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
            title="Search tasks" aria-label="Search tasks"
          >🔍</button>
          <button className="todo-icon-btn" onClick={() => onOpenAgent()} title="Delegate to agent" aria-label="Delegate to agent">🤖</button>
          <button className="settings-gear-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">⚙</button>
          <button className="close-btn" onClick={onClose} aria-label="Close panel">✕</button>
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

      {/* ── Filter bar (hidden when < 5 tasks) ─────────────────── */}
      {totalPending >= 5 && <div className="filter-bar">
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
      </div>}

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
        <input
          type="date"
          className="deadline-input"
          title="Set deadline"
          value={inputDeadline}
          onChange={e => setInputDeadline(e.target.value)}
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
            <span className="empty-sub">
              Add a task above, or{' '}
              <span className="empty-link" onClick={onOpenSettings}>connect Slack or Gmail</span>
              {' '}to auto-sync tasks.
            </span>
          </div>
        )}
        {pending.length === 0 && hasFilters && (() => {
          const n = filterPriority.size + filterType.size + (search.trim() ? 1 : 0)
          return (
          <div className="empty-state">
            <span className="empty-icon">🔍</span>
            <span className="empty-title">No matches</span>
            <span className="empty-sub">
              {n} filter{n !== 1 ? 's' : ''} active{' — '}
              <span className="empty-link" onClick={clearFilters}>clear all</span>
            </span>
          </div>
          )
        })()}

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
                  className={`todo-item${todo.deadline && todo.deadline < Date.now() ? ' overdue' : ''}`}
                  initial={{ x: -14, opacity: 0 }}
                  animate={{ x: 0,   opacity: 1 }}
                  exit={{ x: 20, opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                >
                  <div className="todo-item-inner">
                    <div
                      className="priority-dot"
                      style={{ background: PRIORITY_COLOR[todo.priority] || 'rgba(255,255,255,0.12)' }}
                    />
                    <button className="check-btn" onClick={() => toggleTodo(todo.id)} />
                    <div className="todo-content">
                      <span className="todo-action">
                        {todo.text}
                        <DeadlineTag deadline={todo.deadline} />
                      </span>
                      {todo.context && (
                        <span className="todo-subject">{todo.context}</span>
                      )}
                      {(todo.source === 'slack' || todo.source === 'gmail' || todo.from || todo.gmailFrom || todo.slackChannelName || (todo.type && todo.type !== 'task')) && (
                        <div className="todo-meta">
                          {SOURCE_CONFIG[todo.source] && (
                            <span className="todo-meta-source" title={SOURCE_CONFIG[todo.source].label}>
                              {SOURCE_CONFIG[todo.source].icon}
                            </span>
                          )}
                          {(todo.from || todo.gmailFrom) && (
                            <span className="todo-meta-from">@{todo.from || todo.gmailFrom}</span>
                          )}
                          <span className="todo-meta-extra">
                            {todo.slackChannelName && (
                              <span className="todo-meta-channel">
                                {todo.source === 'slack' ? `#${todo.slackChannelName}` : todo.slackChannelName}
                              </span>
                            )}
                            <TypeBadge type={todo.type} />
                            {todo.assignee && (
                              <span className="todo-assignee">{todo.assignee}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="todo-actions-hover">
                      <button
                        className="delegate-btn"
                        onClick={() => onOpenAgent(recommendAgent(todo))}
                        title="Delegate to agent"
                      >Delegate</button>
                      <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>✕</button>
                    </div>
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
                      <div className="todo-item-inner">
                        <button className="check-done" onClick={() => toggleTodo(todo.id)} title="Undo">✓</button>
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
