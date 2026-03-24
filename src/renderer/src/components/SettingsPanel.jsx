import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const INTERVALS = [
  { label: '5 min',   value: 5   },
  { label: '15 min',  value: 15  },
  { label: '30 min',  value: 30  },
  { label: '1 hour',  value: 60  },
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
  const [expanded, setExpanded]     = useState(false)
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
      <div className="conn-card-top" onClick={() => setExpanded(e => !e)}>
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
              <p className="conn-hint conn-hint-spaced">One-click sign-in. Kaaku reads your inbox to find tasks — never sends emails.</p>
              {!connected && !connecting && (
                <button className="google-signin-btn" onClick={connect}>
                  <GoogleGIcon />
                  Sign in with Google
                </button>
              )}
              {connecting && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="conn-hint" style={{ padding: 0 }}>
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
          </motion.div>
        )}
      </AnimatePresence>
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
              <p className="conn-hint conn-hint-spaced">Get your User Token at api.slack.com &gt; Your Apps &gt; OAuth &amp; Permissions</p>
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

// ── Integration connection card (Jira / Redash / GitHub) ────────────
function IntegrationCard({ icon, iconColor, name, fields, cfg, set, testFn, onSave, dirty, verifiedKey, reloadSettings, hint }) {
  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting]   = useState(false)
  const [status, setStatus]     = useState('')
  const [shows, setShows]       = useState({})

  const configured = fields.every(f => cfg[f.key])
  const verified = !!cfg[verifiedKey]

  function flash(msg) { setStatus(msg); setTimeout(() => setStatus(''), 4000) }
  function toggleShow(key) { setShows(prev => ({ ...prev, [key]: !prev[key] })) }

  async function testConnection() {
    if (!testFn) {
      flash('Restart the app to enable connection tests')
      return
    }
    // Always save first so credentials persist even if test fails
    await onSave()
    setTesting(true); setStatus('Testing...')
    try {
      const result = await testFn()
      // Reload settings to pick up the verified flag persisted by main process
      await reloadSettings()
      if (result?.ok) flash(`Connected as ${result.user}`)
      else flash(`Error: ${(result?.error || 'Unknown').slice(0, 60)}`)
    } catch (err) {
      flash(`Error: ${(err.message || 'Connection failed').slice(0, 60)}`)
    } finally {
      setTesting(false)
    }
  }

  const statusLabel = verified
    ? 'Connected'
    : configured ? 'Not verified — click Test' : 'Not connected'

  return (
    <div className={`conn-card${verified ? ' connected' : ''}`}>
      <div className="conn-card-top" onClick={() => setExpanded(e => !e)}>
        <div className="conn-icon-wrap" style={{ background: `${iconColor}18`, borderColor: `${iconColor}30` }}>
          <span style={{ fontSize: 18, color: iconColor }}>{icon}</span>
        </div>
        <div className="conn-info">
          <div className="conn-name">{name}</div>
          <div className="conn-sub">
            {verified
              ? <><span className="conn-dot active" />{statusLabel}</>
              : <><span className="conn-dot" />{statusLabel}</>
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
              {hint && <p className="conn-hint conn-hint-spaced">{hint}</p>}
              {fields.map(f => (
                <div key={f.key} className="settings-field">
                  <label className="settings-label">{f.label}</label>
                  <div className="settings-input-wrap">
                    <input
                      type={f.secret && !shows[f.key] ? 'password' : 'text'}
                      className="settings-input"
                      placeholder={f.placeholder}
                      value={cfg[f.key] || ''}
                      onChange={e => set(f.key, e.target.value)}
                      spellCheck={false}
                    />
                    {f.secret && (
                      <button className="peek-btn" onClick={() => toggleShow(f.key)}>
                        {shows[f.key] ? '🙈' : '👁'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="conn-actions">
                {dirty && <button className="settings-save-btn" onClick={onSave}>Save</button>}
                <button className="settings-diag-btn" onClick={testConnection} disabled={testing || !configured}>
                  {testing ? 'Testing...' : '🔍 Test'}
                </button>
              </div>
              {status && <div className="settings-status">{status}</div>}
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
export default function SettingsPanel() {
  const [tab, setTab] = useState('connections')
  const [cfg, setCfg] = useState({
    slackToken: '', slackUserToken: '', claudeApiKey: '', groqApiKey: '',
    llmProvider: 'groq', syncIntervalMinutes: 30, lookbackHours: 24,
    lastSyncedAt: null, lastSyncError: null, lastSyncAdded: 0,
    gmailConnected: false, gmailEmail: '',
    gmailLastSyncedAt: null, gmailLastSyncError: null,
    atlassianDomain: '', atlassianEmail: '', atlassianApiToken: '', jiraVerified: false,
    redashUrl: '', redashApiKey: '', redashVerified: false,
    githubToken: '', githubOrg: '', githubVerified: false,
    agentProvider: 'gemini', geminiApiKey: '',
    theme: 'auto',
  })
  const [syncing,    setSyncing]    = useState(false)
  const [status,     setStatus]     = useState('')
  const [diagSteps,  setDiagSteps]  = useState(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [showKey,    setShowKey]    = useState(false)
  const [dirty,      setDirty]      = useState(false)

  async function reloadSettings() {
    const s = await window.wallE?.loadSettings()
    if (s) {
      setCfg(s)
      document.documentElement.setAttribute('data-theme', s.theme || 'auto')
    }
  }

  useEffect(() => { reloadSettings() }, [])

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
      atlassianDomain:     cfg.atlassianDomain,
      atlassianEmail:      cfg.atlassianEmail,
      atlassianApiToken:   cfg.atlassianApiToken,
      redashUrl:           cfg.redashUrl,
      redashApiKey:        cfg.redashApiKey,
      githubToken:         cfg.githubToken,
      githubOrg:           cfg.githubOrg,
      agentProvider:       cfg.agentProvider,
      geminiApiKey:        cfg.geminiApiKey,
      theme:               cfg.theme,
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
    <div
      className="settings-panel"
    >
      {/* Header */}
      <div className="todo-header">
        <span className="todo-title">Settings</span>
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
            {(() => {
              const n = [
                !!(cfg.slackUserToken || cfg.slackToken),
                !!cfg.gmailConnected,
                !!cfg.jiraVerified,
                !!cfg.redashVerified,
                !!cfg.githubVerified,
              ].filter(Boolean).length
              return <div className="conn-summary">{n} of 5 connected</div>
            })()}
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
            <IntegrationCard
              icon="▲"
              iconColor="#1868DB"
              name="Jira Cloud"
              hint="Get your API token at id.atlassian.com > Manage Profile > Security > API Tokens"
              fields={[
                { key: 'atlassianDomain', label: 'Domain', placeholder: 'orgname.atlassian.net' },
                { key: 'atlassianEmail', label: 'Email', placeholder: 'you@company.com' },
                { key: 'atlassianApiToken', label: 'API Token', placeholder: 'ATATT3x...', secret: true },
              ]}
              cfg={cfg}
              set={set}
              testFn={window.wallE?.testJira}
              onSave={save}
              dirty={dirty}
              verifiedKey="jiraVerified"
              reloadSettings={reloadSettings}
            />
            <IntegrationCard
              icon="◈"
              iconColor="#FF6B35"
              name="Redash"
              hint="Find your API key in Redash > User Profile > API Key"
              fields={[
                { key: 'redashUrl', label: 'URL', placeholder: 'https://redash.company.com' },
                { key: 'redashApiKey', label: 'API Key', placeholder: 'Your Redash API key', secret: true },
              ]}
              cfg={cfg}
              set={set}
              testFn={window.wallE?.testRedash}
              onSave={save}
              dirty={dirty}
              verifiedKey="redashVerified"
              reloadSettings={reloadSettings}
            />
            <IntegrationCard
              icon="⬡"
              iconColor="#7B68EE"
              name="GitHub"
              hint="Create a Personal Access Token at github.com/settings/tokens (needs: repo, read:org)"
              fields={[
                { key: 'githubToken', label: 'Personal Access Token', placeholder: 'ghp_...', secret: true },
                { key: 'githubOrg', label: 'Default Org (optional)', placeholder: 'your-org' },
              ]}
              cfg={cfg}
              set={set}
              testFn={window.wallE?.testGithub}
              onSave={save}
              dirty={dirty}
              verifiedKey="githubVerified"
              reloadSettings={reloadSettings}
            />
            {COMING_SOON.filter(c => c.id !== 'github').map(c => (
              <ComingSoonCard key={c.id} {...c} />
            ))}
            <p className="conn-hint">
              All tokens are stored locally — they never leave your machine.
            </p>
          </div>
        )}

        {/* ── Preferences tab ─────────────────────────────────── */}
        {tab === 'preferences' && (
          <div className="pref-list">

            {/* ── Theme ───────────────────────────────────────── */}
            <div className="settings-field">
              <label className="settings-label">Theme</label>
              <div className="provider-toggle">
                <button
                  className={`provider-btn${cfg.theme === 'auto' ? ' active' : ''}`}
                  onClick={() => { set('theme', 'auto'); document.documentElement.setAttribute('data-theme', 'auto') }}
                >Auto</button>
                <button
                  className={`provider-btn${cfg.theme === 'light' ? ' active' : ''}`}
                  onClick={() => { set('theme', 'light'); document.documentElement.setAttribute('data-theme', 'light') }}
                >Light</button>
                <button
                  className={`provider-btn${cfg.theme === 'dark' ? ' active' : ''}`}
                  onClick={() => { set('theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark') }}
                >Dark</button>
              </div>
            </div>

            {/* ── AI Provider (summarization) ─────────────────── */}
            <div className="settings-field">
              <label className="settings-label">AI <span style={{ opacity: 0.4, fontSize: 9 }}>summarization</span></label>
              <div className="provider-toggle">
                <button
                  className={`provider-btn${!isGroq ? ' active' : ''}`}
                  onClick={() => set('llmProvider', 'claude')}
                >Claude</button>
                <button
                  className={`provider-btn${isGroq ? ' active' : ''}`}
                  onClick={() => set('llmProvider', 'groq')}
                >Groq <span style={{ opacity: 0.5, fontSize: 9 }}>free</span></button>
              </div>
            </div>

            {/* AI API key */}
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

            {/* ── Agent Provider (delegated tasks) ────────────── */}
            <div className="settings-divider" />
            <div className="settings-field">
              <label className="settings-label">Agent <span style={{ opacity: 0.4, fontSize: 9 }}>delegated tasks</span></label>
              <div className="provider-toggle">
                <button
                  className={`provider-btn${cfg.agentProvider === 'groq' ? ' active' : ''}`}
                  onClick={() => set('agentProvider', 'groq')}
                >Groq <span style={{ opacity: 0.5, fontSize: 9 }}>free</span></button>
                <button
                  className={`provider-btn${cfg.agentProvider === 'claude' ? ' active' : ''}`}
                  onClick={() => set('agentProvider', 'claude')}
                >Claude</button>
                <button
                  className={`provider-btn${cfg.agentProvider === 'gemini' ? ' active' : ''}`}
                  onClick={() => set('agentProvider', 'gemini')}
                >Gemini</button>
                <button
                  className={`provider-btn${cfg.agentProvider === 'bedrock' ? ' active' : ''}`}
                  onClick={() => set('agentProvider', 'bedrock')}
                >Bedrock</button>
              </div>
            </div>

            {/* Agent API key — Groq reuses the AI key, others show their own */}
            {cfg.agentProvider === 'groq' && !cfg.groqApiKey && (
              <p className="conn-hint" style={{ padding: '4px 0' }}>
                Uses your Groq API key from AI section above.
              </p>
            )}
            {cfg.agentProvider === 'groq' && cfg.groqApiKey && (
              <p className="conn-hint" style={{ color: 'rgba(52,199,89,0.7)', padding: '4px 0' }}>
                Using your Groq API key (Llama 3.3 70B).
              </p>
            )}
            {cfg.agentProvider === 'gemini' && (
              <div className="settings-field">
                <label className="settings-label">
                  Gemini API Key <span style={{ opacity: 0.4, fontSize: 9 }}>aistudio.google.com</span>
                </label>
                <div className="settings-input-wrap">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="settings-input"
                    placeholder="AIza..."
                    value={cfg.geminiApiKey}
                    onChange={e => set('geminiApiKey', e.target.value)}
                    spellCheck={false}
                  />
                  <button className="peek-btn" onClick={() => setShowKey(v => !v)}>
                    {showKey ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
            )}
            {cfg.agentProvider === 'claude' && (
              <div className="settings-field">
                <label className="settings-label">
                  Claude API Key <span style={{ opacity: 0.4, fontSize: 9 }}>for agents</span>
                </label>
                <div className="settings-input-wrap">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="settings-input"
                    placeholder="sk-ant-..."
                    value={cfg.claudeApiKey}
                    onChange={e => set('claudeApiKey', e.target.value)}
                    spellCheck={false}
                  />
                  <button className="peek-btn" onClick={() => setShowKey(v => !v)}>
                    {showKey ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
            )}
            {cfg.agentProvider === 'bedrock' && (
              <>
                <div className="settings-field">
                  <label className="settings-label">
                    AWS Region <span style={{ opacity: 0.4, fontSize: 9 }}>Bedrock region</span>
                  </label>
                  <input
                    className="settings-input"
                    placeholder="us-east-1"
                    value={cfg.bedrockRegion || ''}
                    onChange={e => set('bedrockRegion', e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-label">Access Key ID</label>
                  <div className="settings-input-wrap">
                    <input
                      type={showKey ? 'text' : 'password'}
                      className="settings-input"
                      placeholder="AKIA..."
                      value={cfg.bedrockAccessKeyId || ''}
                      onChange={e => set('bedrockAccessKeyId', e.target.value)}
                      spellCheck={false}
                    />
                    <button className="peek-btn" onClick={() => setShowKey(v => !v)}>
                      {showKey ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Secret Access Key</label>
                  <div className="settings-input-wrap">
                    <input
                      type={showKey ? 'text' : 'password'}
                      className="settings-input"
                      placeholder="wJalr..."
                      value={cfg.bedrockSecretAccessKey || ''}
                      onChange={e => set('bedrockSecretAccessKey', e.target.value)}
                      spellCheck={false}
                    />
                    <button className="peek-btn" onClick={() => setShowKey(v => !v)}>
                      {showKey ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Save */}
            <div className="pref-save-area">
              {dirty && (
                <button className="settings-save-btn" style={{ flex: 1 }} onClick={save}>
                  Save preferences
                </button>
              )}
            </div>

            {status && <div className="settings-status">{status}</div>}

          </div>
        )}

      </div>
    </div>
  )
}
