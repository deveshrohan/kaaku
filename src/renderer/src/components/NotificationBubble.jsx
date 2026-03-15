import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SOURCE_ICON = {
  slack:         '💬',
  'claude-code': '🤖',
  system:        '⚡',
  cli:           '⌨️',
}

const PRIORITY_COLOR = {
  high:   '#FF453A',
  medium: '#FF9F0A',
  low:    '#32D74B',
}

const AUTO_DISMISS_MS = {
  high:   0,       // stays until actioned
  medium: 10000,
  low:    6000,
}

export default function NotificationBubble({ notification, onDismiss, onOpen }) {
  const timerRef = useRef(null)
  const { text, priority = 'medium', source = 'system', eventType,
          permissionId, requiresResponse } = notification

  useEffect(() => {
    // Never auto-dismiss permission requests — user must explicitly respond
    if (requiresResponse) return
    const delay = AUTO_DISMISS_MS[priority] ?? 8000
    if (delay > 0) {
      timerRef.current = setTimeout(onDismiss, delay)
    }
    return () => clearTimeout(timerRef.current)
  }, [notification.id])

  function respond(action) {
    if (permissionId) window.wallE?.respondPermission(permissionId, action)
    onDismiss()
  }

  const isClaudeCode = source === 'claude-code' || eventType === 'claude-permission'
  const icon = SOURCE_ICON[source] ?? '🔔'
  const dot  = PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.medium

  return (
    <motion.div
      className="notif-bubble"
      initial={{ opacity: 0, y: 12, scale: 0.92 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: 8,  scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      onClick={!requiresResponse ? onOpen : undefined}
    >
      <div className="notif-bar" style={{ background: dot }} />

      <div className="notif-body">
        <div className="notif-header">
          <span className="notif-icon">{icon}</span>
          <span className="notif-source">
            {isClaudeCode ? 'Claude Code' : source}
          </span>
          <div className="notif-dot" style={{ background: dot }} />
        </div>
        <p className="notif-text">{text}</p>

        <div className="notif-actions" onClick={e => e.stopPropagation()}>
          {requiresResponse ? (
            <>
              <button className="notif-btn notif-btn-allow" onClick={() => respond('allow')}>
                ✓ Allow
              </button>
              <button className="notif-btn notif-btn-deny" onClick={() => respond('deny')}>
                ✕ Deny
              </button>
            </>
          ) : (
            <>
              {isClaudeCode && (
                <span className="notif-fyi">FYI</span>
              )}
              <button className="notif-btn notif-btn-open" onClick={onOpen}>
                View all
              </button>
              <button className="notif-btn notif-btn-dismiss" onClick={onDismiss} title="Dismiss">
                ✕
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
