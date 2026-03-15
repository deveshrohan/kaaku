import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const PRIORITY_COLOR = { high: '#FF453A', medium: '#FF9F0A', low: '#32D74B' }
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

function PriorityBadge({ priority }) {
  if (!priority) return null
  return (
    <span
      className="priority-badge"
      style={{ background: PRIORITY_COLOR[priority] }}
      title={priority}
    >
      {priority[0].toUpperCase()}
    </span>
  )
}

export default function TodoPanel({ todos, setTodos, onTaskComplete, onClose, onOpenSettings, assistantName = 'My Assistant' }) {
  const [input, setInput] = useState('')
  const inputRef = useRef()

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  function addTodo() {
    const text = input.trim()
    if (!text) return
    setTodos(prev => [...prev, { id: Date.now(), text, done: false }])
    setInput('')
  }

  function toggleTodo(id) {
    const todo = todos.find(t => t.id === id && !t.done)
    if (!todo) return
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: true } : t))
    onTaskComplete()
  }

  function deleteTodo(id) {
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  function handleKey(e) {
    if (e.key === 'Enter') addTodo()
    if (e.key === 'Escape') onClose()
  }

  // Sort pending by priority: high → medium → low → no priority
  // Exclude transient permission requests (requiresResponse) — they belong in the bubble only
  const pending = todos
    .filter(t => !t.done && !t.requiresResponse)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
  const done = todos.filter(t => t.done && !t.requiresResponse)

  return (
    <motion.div
      className="todo-panel"
      initial={{ y: 40, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      {/* Header */}
      <div className="todo-header">
        <span className="todo-title">📋 {assistantName}'s Tasks</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="settings-gear-btn" onClick={onOpenSettings} title="Slack Integration">⚙</button>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Input */}
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

      {/* Task list */}
      <div className="todo-list">
        <AnimatePresence>
          {pending.map(todo => (
            <motion.div
              key={todo.id}
              className="todo-item"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <button className="check-btn" onClick={() => toggleTodo(todo.id)}>
                <span className="check-circle" />
              </button>
              <PriorityBadge priority={todo.priority} />
              <span className="todo-text">{todo.text}</span>
              {todo.source === 'slack' && (
                <span className="slack-source-badge" title={`#${todo.slackChannel}`}>#</span>
              )}
              <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>✕</button>
            </motion.div>
          ))}
        </AnimatePresence>

        {done.length > 0 && (
          <div className="done-section">
            <div className="done-label">Completed ✓</div>
            <AnimatePresence>
              {done.map(todo => (
                <motion.div
                  key={todo.id}
                  className="todo-item done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.55 }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <span className="check-done">✓</span>
                  <span className="todo-text">{todo.text}</span>
                  <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>✕</button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {todos.length === 0 && (
          <div className="empty-state">
            <span>No tasks yet!</span>
            <span style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Kaaku is waiting…</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
