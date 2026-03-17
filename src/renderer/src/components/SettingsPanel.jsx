import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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

// ── Connection cards config ────────────────────────────────────────
const COMING_SOON = [
  {
    id: 'github',
    icon: '⬡',
    name: 'GitHub',
    desc: 'PR reviews, assigned issues, CI failures, @mentions',
    color: '#7B68EE',
  },
  {
    id: 'linear',
    icon: '◈',
    name: 'Linear',
    desc: 'Assigned issues, due dates, comment mentions',
    color: '#5E6AD2',
  },
  {
    id: 'notion',
    icon: '◻',
    name: 'Notion',
    desc: 'Action items assigned to you, page mentions',
    color: '#ffffff',
  },
]

// ── Gmail SVG icon ────────────────────────────────────────────────
function GmailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" fill="#fff" fillOpacity="0"/>
      <path d="M20 4H4L12 13l8-9z" fill="#EA4335"/>
      <path d="M2 6l10 7 10-7v12H2V6z" fill="#fff" fillOpacity="0"/>
      <path d="M4 4h16l-8 9L4 4z" fill="#EA4335"/>
      <path d="M2 6v12l6-6L2 6z" fill="#C5221F"/>
      <path d="M22 6v12l-6-6 6-6z" fill="#C5221F"/>
      <path d="M2 18l6-6h8l6 6H2z" fill="#fff" fillOpacity="0"/>
      <path d="M20 18H4l6-6h4l6 6z" fill="#FBBC04"/>
    </svg>
  )
}

// ── Google G logo ──────────────────────────────────────────────────
function GoogleGIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

// ── Gmail Connection Card ──────────────────────────────────────────
function GmailCard({ cfg }) {
  const [connecting, setConnecting] = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [status,     setStatus]     = useState('')
  const [local,      setLocal]      = useState(null)   // optimistic UI updates

  const connected  = local?.connected  ?? cfg.gmailConnected
  const email      = local?.email      ?? cfg.gmailEmail
  const lastSynced = local?.lastSyncedAt ?? cfg.gmailLastSyncedAt

  const lastSyncText = lastSynced
    ? `Synced ${Math.round((Date.now() - lastSynced) / 60000)}m ago`
    : 'Never synced'

  function flash(msg) { setStatus(msg); setTimeout(() => setStatus(''), 4000) }

  async function connect() {
    setConnecting(true)
    setStatus('Opening Google sign-in…')
    try {
      const result = await window.wallE?.gmailConnect()
      if (result?.error) flash(`Error: ${result.error.slice(0, 70)}`)
      else if (result?.email) { setLocal({ connected: true, email: result.email, lastSyncedAt: null }); flash('Connected ✓') }
      else flash('No response — check that the app restarted after the last code change')
    } catch (err) {
      flash(`Error: ${err.message?.slice(0, 70) || 'Unknown error'}`)
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect() {
    await window.wallE?.gmailDisconnect()
    setLocal({ connected: false, email: '', lastSyncedAt: null })
    setStatus('')
  }

  async function syncNow() {
    setSyncing(true); setStatus('Syncing…')
    const result = await window.wallE?.gmailSync()
    setSyncing(false)
    if (result?.error) flash(`Error: ${result.error.slice(0, 60)}`)
    else flash(result?.added ? `✓ ${result.added} task${result.added !== 1 ? 's' : ''} added` : '✓ Nothing new')
    setLocal(prev => ({ ...prev, lastSyncedAt: Date.now() }))
  }

  return (
    <div className={`conn-card${connected ? ' connected' : ''}`}>
      <div className="conn-card-top" style={{ cursor: 'default' }}>
        <div className="conn-icon-wrap" style={{ background: 'rgba(234,67,53,0.12)', borderColor: 'rgba(234,67,53,0.28)' }}>
          <GmailIcon />
        </div>
        <div className="conn-info">
          <div className="conn-name">Gmail</div>
          <div className="conn-sub">
            {connected
              ? <><span className="conn-dot active" />{email || 'Connected'} — {lastSyncText}</>
              : <><span className="conn-dot" />Not connected</>
            }
          </div>
        </div>
      </div>

      <div className="conn-expand-inner" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
        {!connected && !connecting && (
          <button className="google-signin-btn" onClick={connect}>
            <GoogleGIcon />
            Sign in with Google
          </button>
        )}
        {connecting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="conn-hint" style={{ color: 'rgba(255,255,255,0.5)', padding: 0 }}>
              ⏳ Waiting for Google sign-in in your browser…
            </p>
            <button className="settings-diag-btn" onClick={() => { setConnecting(false); setStatus('') }}>
              Cancel
            </button>
          </div>
        )}
        {connected && (
          <div className="conn-actions">
            <button className="settings-sync-btn" onClick={syncNow} disabled={syncing}>
              {syncing ? '…' : '⟳'} Sync
            </button>
            <button className="settings-diag-btn" onClick={disconnect}>Disconnect</button>
          </div>
        )}
        {status && <div className="settings-status">{status}</div>}
      </div>
    </div>
  )
}

// ── Slack Connection Card ──────────────────────────────────────────
function SlackCard({ cfg, set, onSave, onSync, onClearSync, onDiagnose, syncing, diagnosing, dirty, status, diagSteps }) {
  const [expanded, setExpanded] = useState(false)
  const [showUser, setShowUser] = useState(false)
  const [showBot,  setShowBot]  = useState(false)

  const connected = !!(cfg.slackUserToken || cfg.slackToken)
  const hasApiKey = !!(cfg.groqApiKey || cfg.claudeApiKey)
  const canSync   = !syncing && connected && hasApiKey

  const lastSyncText = cfg.lastSyncedAt
    ? `Synced ${Math.round((Date.now() - cfg.lastSyncedAt) / 60000)}m ago`
    : 'Never synced'

  return (
    <div className={`conn-card${connected ? ' connected' : ''}`}>
      <div className="conn-card-top" onClick={() => setExpanded(e => !e)}>
        <div className="conn-icon-wrap" style={{ background: 'rgba(74,21,75,0.35)', borderColor: 'rgba(224,30,90,0.3)' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path d="M6 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 0 1 4 0v5a2 2 0 0 1-4 0v-5zm2-9a2 2 0 1 1 2-2v2H9zm0 1a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4h5zm9 2a2 2 0 1 1 2 2h-2V9zm-1 0a2 2 0 0 1-4 0V4a2 2 0 0 1 4 0v5zm-2 9a2 2 0 1 1-2 2v-2h2zm0-1a2 2 0 0 1 0-4h5a2 2 0 0 1 0 4h-5z" fill="#E01E5A"/>
          </svg>
        </div>
        <div className="conn-info">
          <div className="conn-name">Slack</div>
          <div className="conn-sub">
            {connected
              ? <><span className="conn-dot active" />Connected — {lastSyncText}</>
              : <><span className="conn-dot" />Not connected</>
            }
          </div>
        </div>
        <span className="conn-chevron">{expanded ? '▾' : '›'}</span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="conn-expand"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="conn-expand-inner">
              <div className="settings-field">
                <label className="settings-label">
                  User Token <span className="settings-label-rec">★ recommended</span>
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

              <div className="settings-field">
                <label className="settings-label">
                  Bot Token <span style={{ opacity: 0.4 }}>(fallback)</span>
                </label>
                <div className="settings-input-wrap">
                  <input
                    type={showBot ? 'text' : 'password'}
                    className="settings-input"
                    placeholder="xoxb-…"
                    value={cfg.slackToken}
                    onChange={e => set('slackToken', e.target.value)}
                    spellCheck={false}
                  />
                  <button className="peek-btn" onClick={() => setShowBot(v => !v)}>
                    {showBot ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              <div className="conn-actions">
                {dirty && (
                  <button className="settings-save-btn" onClick={onSave}>Save</button>
                )}
                <button className="settings-diag-btn" onClick={onDiagnose}
                  disabled={diagnosing || !cfg.slackToken} title="Test connection">
                  {diagnosing ? '…' : '🔍'}
                </button>
                <button className="settings-sync-btn" onClick={onSync} disabled={!canSync}>
                  {syncing ? '…' : '⟳'} Sync
                </button>
                <button className="settings-sync-btn" onClick={onClearSync} disabled={!canSync}
                  title="Clear history and rescan all messages">
                  ↺ Full
                </button>
              </div>

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

              {!diagSteps && status && (
                <div className="settings-status">{status}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Coming-soon card ───────────────────────────────────────────────
function ComingSoonCard({ icon, name, desc, color }) {
  return (
    <div className="conn-card coming-soon">
      <div className="conn-card-top">
        <div className="conn-icon-wrap" style={{ background: `${color}18`, borderColor: `${color}30` }}>
          <span style={{ fontSize: 18, color }}>{icon}</span>
        </div>
        <div className="conn-info">
          <div className="conn-name">{name}</div>
          <div className="conn-sub">{desc}</div>
        </div>
        <span className="conn-soon-badge">Soon</span>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────
export default function SettingsPanel({ onClose }) {
  const [tab, setTab] = useState('connections')
  const [cfg, setCfg] = useState({
    slackToken: '', slackUserToken: '', claudeApiKey: '', groqApiKey: '',
    llmProvider: 'groq', syncIntervalMinutes: 30, lookbackHours: 24,
    lastSyncedAt: null, lastSyncError: null, lastSyncAdded: 0,
    gmailConnected: false, gmailEmail: '',
    gmailLastSyncedAt: null, gmailLastSyncError: null,
  })
  const [syncing,    setSyncing]    = useState(false)
  const [status,     setStatus]     = useState('')
  const [diagSteps,  setDiagSteps]  = useState(null)
  const [diagnosing, setDiagnosing] = useState(false)
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
    setSyncing(true); setStatus('Syncing…')
    const result = await window.wallE?.syncSlack()
    setSyncing(false)
    if (result?.error) flash(`Error: ${result.error.slice(0, 55)}`)
    else flash(result?.added ? `✓ ${result.added} task${result.added !== 1 ? 's' : ''} added` : '✓ Nothing new')
  }

  async function clearAndResync() {
    if (dirty) await save()
    await window.wallE?.clearProcessedIds()
    setSyncing(true); setStatus('Full resync…')
    const result = await window.wallE?.syncSlack()
    setSyncing(false)
    if (result?.error) flash(`Error: ${result.error.slice(0, 55)}`)
    else flash(result?.added ? `✓ ${result.added} task${result.added !== 1 ? 's' : ''} added` : '✓ Nothing new')
  }

  function flash(msg) { setStatus(msg); setTimeout(() => setStatus(''), 3500) }

  async function diagnose() {
    if (dirty) await save()
    setDiagnosing(true); setDiagSteps(null)
    const steps = await window.wallE?.diagnoseSlack()
    setDiagSteps(steps || []); setDiagnosing(false)
  }

  const isGroq         = cfg.llmProvider === 'groq'
  const apiKey         = isGroq ? cfg.groqApiKey   : cfg.claudeApiKey
  const setKey         = val => set(isGroq ? 'groqApiKey' : 'claudeApiKey', val)
  const keyPlaceholder = isGroq ? 'gsk_…' : 'sk-ant-…'

  return (
    <motion.div
      className="settings-panel"
      initial={{ y: 40, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      {/* Header */}
      <div className="todo-header">
        <span className="todo-title">⚙ Settings</span>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="settings-tabs">
        <button
          className={`settings-tab${tab === 'connections' ? ' active' : ''}`}
          onClick={() => setTab('connections')}
        >
          Connections
        </button>
        <button
          className={`settings-tab${tab === 'preferences' ? ' active' : ''}`}
          onClick={() => setTab('preferences')}
        >
          Preferences
        </button>
      </div>

      {/* Body */}
      <div className="settings-body">

        {/* ── Connections tab ─────────────────────────────────── */}
        {tab === 'connections' && (
          <div className="conn-list">
            <SlackCard
              cfg={cfg}
              set={set}
              onSave={save}
              onSync={syncNow}
              onClearSync={clearAndResync}
              onDiagnose={diagnose}
              syncing={syncing}
              diagnosing={diagnosing}
              dirty={dirty}
              status={status}
              diagSteps={diagSteps}
            />
            <GmailCard cfg={cfg} />
            {COMING_SOON.map(c => (
              <ComingSoonCard key={c.id} {...c} />
            ))}
            <p className="conn-hint">
              More integrations coming. Each connection is stored locally — your tokens never leave your machine.
            </p>
          </div>
        )}

        {/* ── Preferences tab ─────────────────────────────────── */}
        {tab === 'preferences' && (
          <div className="pref-list">

            {/* AI Provider */}
            <div className="settings-field">
              <label className="settings-label">AI Provider</label>
              <div className="provider-toggle">
                <button
                  className={`provider-btn${!isGroq ? ' active' : ''}`}
                  onClick={() => set('llmProvider', 'claude')}
                >Claude</button>
                <button
                  className={`provider-btn${isGroq ? ' active' : ''}`}
                  onClick={() => set('llmProvider', 'groq')}
                >Groq</button>
              </div>
            </div>

            {/* API key */}
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

            {/* Save */}
            {dirty && (
              <div className="settings-actions">
                <button className="settings-save-btn" style={{ flex: 1 }} onClick={save}>
                  Save preferences
                </button>
              </div>
            )}

            {status && <div className="settings-status">{status}</div>}

          </div>
        )}

      </div>
    </motion.div>
  )
}
