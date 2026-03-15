import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const INTERVALS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
]
const LOOKBACKS = [
  { label: '2 hours',  value: 2  },
  { label: '6 hours',  value: 6  },
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
]

export default function SettingsPanel({ onClose }) {
  const [cfg, setCfg] = useState({
    slackToken: '', claudeApiKey: '',
    syncIntervalMinutes: 30, lookbackHours: 6,
    lastSyncedAt: null, lastSyncError: null, lastSyncAdded: 0,
  })
  const [syncing, setSyncing]     = useState(false)
  const [status,  setStatus]      = useState('')
  const [showSlack,  setShowSlack]  = useState(false)
  const [showClaude, setShowClaude] = useState(false)
  const [dirty,   setDirty]       = useState(false)

  useEffect(() => {
    window.wallE?.loadSettings().then(s => { if (s) setCfg(s) })
  }, [])

  function set(key, val) {
    setCfg(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  async function save() {
    await window.wallE?.saveSettings({
      slackToken: cfg.slackToken,
      claudeApiKey: cfg.claudeApiKey,
      syncIntervalMinutes: cfg.syncIntervalMinutes,
      lookbackHours: cfg.lookbackHours,
    })
    setDirty(false)
    flash('Saved ✓')
  }

  async function syncNow() {
    if (dirty) await save()
    setSyncing(true)
    setStatus('Syncing…')
    const result = await window.wallE?.syncSlack()
    setSyncing(false)
    if (result?.error) flash(`Error: ${result.error.slice(0, 55)}`)
    else flash(result?.added ? `✓ ${result.added} task${result.added !== 1 ? 's' : ''} added` : '✓ Nothing new')
  }

  function flash(msg) {
    setStatus(msg)
    setTimeout(() => setStatus(''), 3000)
  }

  const lastSyncText = cfg.lastSyncedAt
    ? `Last synced ${Math.round((Date.now() - cfg.lastSyncedAt) / 60000)}m ago`
    : 'Never synced'

  const canSync = !syncing && cfg.slackToken && cfg.claudeApiKey

  return (
    <motion.div
      className="settings-panel"
      initial={{ y: 40, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      <div className="todo-header">
        <span className="todo-title">⚙ Slack Integration</span>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="settings-body">
        <div className="settings-field">
          <label className="settings-label">Slack Bot Token</label>
          <div className="settings-input-wrap">
            <input
              type={showSlack ? 'text' : 'password'}
              className="settings-input"
              placeholder="xoxb-…"
              value={cfg.slackToken}
              onChange={e => set('slackToken', e.target.value)}
              spellCheck={false}
            />
            <button className="peek-btn" onClick={() => setShowSlack(v => !v)}>
              {showSlack ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label">Claude API Key</label>
          <div className="settings-input-wrap">
            <input
              type={showClaude ? 'text' : 'password'}
              className="settings-input"
              placeholder="sk-ant-…"
              value={cfg.claudeApiKey}
              onChange={e => set('claudeApiKey', e.target.value)}
              spellCheck={false}
            />
            <button className="peek-btn" onClick={() => setShowClaude(v => !v)}>
              {showClaude ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-field half">
            <label className="settings-label">Sync every</label>
            <select
              className="settings-select"
              value={cfg.syncIntervalMinutes}
              onChange={e => set('syncIntervalMinutes', Number(e.target.value))}
            >
              {INTERVALS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="settings-field half">
            <label className="settings-label">Look back</label>
            <select
              className="settings-select"
              value={cfg.lookbackHours}
              onChange={e => set('lookbackHours', Number(e.target.value))}
            >
              {LOOKBACKS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="settings-actions">
          {dirty && (
            <button className="settings-save-btn" onClick={save}>Save</button>
          )}
          <button className="settings-sync-btn" onClick={syncNow} disabled={!canSync}>
            {syncing ? '…' : '⟳'} Sync Now
          </button>
        </div>

        {status
          ? <div className="settings-status">{status}</div>
          : <div className="settings-status muted">{lastSyncText}</div>
        }
      </div>
    </motion.div>
  )
}
