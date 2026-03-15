import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const INTERVALS = [
  { label: '15 min', value: 15  },
  { label: '30 min', value: 30  },
  { label: '1 hour', value: 60  },
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
    slackToken: '', slackUserToken: '', claudeApiKey: '', groqApiKey: '',
    llmProvider: 'groq', syncIntervalMinutes: 30, lookbackHours: 24,
    lastSyncedAt: null, lastSyncError: null, lastSyncAdded: 0,
  })
  const [syncing,    setSyncing]    = useState(false)
  const [status,     setStatus]     = useState('')
  const [diagSteps,  setDiagSteps]  = useState(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [showSlack,  setShowSlack]  = useState(false)
  const [showUser,   setShowUser]   = useState(false)
  const [showKey,    setShowKey]    = useState(false)
  const [dirty,      setDirty]      = useState(false)

  useEffect(() => {
    window.wallE?.loadSettings().then(s => { if (s) setCfg(s) })
  }, [])

  function set(key, val) {
    setCfg(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  async function save() {
    await window.wallE?.saveSettings({
      slackToken:          cfg.slackToken,
      slackUserToken:      cfg.slackUserToken,
      claudeApiKey:        cfg.claudeApiKey,
      groqApiKey:          cfg.groqApiKey,
      llmProvider:         cfg.llmProvider,
      syncIntervalMinutes: cfg.syncIntervalMinutes,
      lookbackHours:       cfg.lookbackHours,
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

  async function clearAndResync() {
    if (dirty) await save()
    await window.wallE?.clearProcessedIds()
    setSyncing(true)
    setStatus('Full resync…')
    const result = await window.wallE?.syncSlack()
    setSyncing(false)
    if (result?.error) flash(`Error: ${result.error.slice(0, 55)}`)
    else flash(result?.added ? `✓ ${result.added} task${result.added !== 1 ? 's' : ''} added` : '✓ Nothing new')
  }

  function flash(msg) {
    setStatus(msg)
    setTimeout(() => setStatus(''), 3500)
  }

  async function diagnose() {
    if (dirty) await save()
    setDiagnosing(true)
    setDiagSteps(null)
    const steps = await window.wallE?.diagnoseSlack()
    setDiagSteps(steps || [])
    setDiagnosing(false)
  }

  const isGroq   = cfg.llmProvider === 'groq'
  const apiKey   = isGroq ? cfg.groqApiKey   : cfg.claudeApiKey
  const setKey   = val => set(isGroq ? 'groqApiKey' : 'claudeApiKey', val)
  const keyPlaceholder = isGroq ? 'gsk_…' : 'sk-ant-…'

  const canSync = !syncing && (cfg.slackUserToken || cfg.slackToken) && apiKey

  const lastSyncText = cfg.lastSyncedAt
    ? `Last synced ${Math.round((Date.now() - cfg.lastSyncedAt) / 60000)}m ago`
    : 'Never synced'

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

        {/* LLM provider toggle */}
        <div className="settings-field">
          <label className="settings-label">AI Provider</label>
          <div className="provider-toggle">
            <button
              className={`provider-btn ${!isGroq ? 'active' : ''}`}
              onClick={() => set('llmProvider', 'claude')}
            >
              Claude
            </button>
            <button
              className={`provider-btn ${isGroq ? 'active' : ''}`}
              onClick={() => set('llmProvider', 'groq')}
            >
              Groq
            </button>
          </div>
        </div>

        {/* User token — reads the user's own Slack messages */}
        <div className="settings-field">
          <label className="settings-label">
            Slack User Token <span className="settings-label-rec">★ recommended</span>
          </label>
          <div className="settings-input-wrap">
            <input
              type={showUser ? 'text' : 'password'}
              className="settings-input"
              placeholder="xoxp-… (reads your own messages)"
              value={cfg.slackUserToken}
              onChange={e => set('slackUserToken', e.target.value)}
              spellCheck={false}
            />
            <button className="peek-btn" onClick={() => setShowUser(v => !v)}>
              {showUser ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {/* Bot token — fallback, only reads channels bot is invited to */}
        <div className="settings-field">
          <label className="settings-label">Slack Bot Token <span style={{opacity:0.5}}>(fallback)</span></label>
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

        {/* Dynamic API key field */}
        <div className="settings-field">
          <label className="settings-label">{isGroq ? 'Groq' : 'Claude'} API Key</label>
          <div className="settings-input-wrap">
            <input
              type={showKey ? 'text' : 'password'}
              className="settings-input"
              placeholder={keyPlaceholder}
              value={apiKey}
              onChange={e => setKey(e.target.value)}
              spellCheck={false}
            />
            <button className="peek-btn" onClick={() => setShowKey(v => !v)}>
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {/* Sync interval + lookback */}
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

        {/* Actions */}
        <div className="settings-actions">
          {dirty && <button className="settings-save-btn" onClick={save}>Save</button>}
          <button className="settings-diag-btn" onClick={diagnose} disabled={diagnosing || !cfg.slackToken} title="Test connection">
            {diagnosing ? '…' : '🔍'}
          </button>
          <button className="settings-sync-btn" onClick={syncNow} disabled={!canSync}>
            {syncing ? '…' : '⟳'} Sync
          </button>
          <button className="settings-sync-btn" onClick={clearAndResync} disabled={!canSync} title="Clear history and rescan all messages">
            ↺ Full
          </button>
        </div>

        {/* Diagnostic results */}
        {diagSteps && (
          <div className="diag-steps">
            {diagSteps.map((s, i) => (
              <div key={i} className="diag-step">
                <span className={`diag-dot ${s.ok ? 'ok' : 'fail'}`}>{s.ok ? '✓' : '✗'}</span>
                <div className="diag-body">
                  <span className="diag-label">{s.label}</span>
                  <span className="diag-detail">{s.detail}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!diagSteps && (status
          ? <div className="settings-status">{status}</div>
          : <div className="settings-status muted">{lastSyncText}</div>
        )}

      </div>
    </motion.div>
  )
}
