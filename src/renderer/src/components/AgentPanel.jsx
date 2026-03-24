import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DraftApproval from './DraftApproval'
import { humanizeStep, humanizeResult, humanizeThinking, derivePhase } from '../utils/humanizeSteps'

// Type metadata — labels, icons, example queries
const AGENT_TYPES = [
  { id: 'generic',       icon: '🤖', name: 'Anything',      example: '' },
  { id: 'review-prd',    icon: '🔍', name: 'Review PRD',    example: 'Review PROJ-123' },
  { id: 'create-prd',    icon: '📝', name: 'Create PRD',    example: 'Create a PRD for...' },
  { id: 'review-sprint', icon: '📋', name: 'Sprint Review',  example: 'How\'s the sprint?' },
  { id: 'implement-prd', icon: '⚙',  name: 'Implement',     example: 'Implement PROJ-456' },
  { id: 'lookup-reply',  icon: '💬', name: 'Lookup + Reply', example: 'Find data on...' },
]

// Shortcut pills — exclude generic (it's the default)
const SHORTCUT_TYPES = AGENT_TYPES.filter(a => a.id !== 'generic')

const STATUS_COLORS = {
  running:             'rgba(100,180,255,0.8)',
  'awaiting-approval': 'rgba(255,180,50,0.8)',
  'awaiting-reply':    'rgba(180,130,255,0.8)',
  completed:           'rgba(52,199,89,0.8)',
  failed:              'rgba(255,69,58,0.8)',
  cancelled:           'rgba(150,150,150,0.6)',
}

const STEP_ICONS = {
  llm_call:       '🧠',
  thinking:       '💭',
  tool_call:      '🔧',
  tool_result:    '✓',
  tool_error:     '✗',
  draft_approved: '✅',
  draft_rejected: '❌',
}

function friendlyError(err) {
  if (!err) return 'Unknown error'
  if (/401|unauthorized|invalid.*key/i.test(err)) return 'API key is invalid or expired. Check Settings.'
  if (/403|forbidden/i.test(err)) return 'Access denied. Check your API key permissions.'
  if (/429|rate.?limit|too many/i.test(err)) return 'Rate limit hit. Wait a minute and try again.'
  if (/timeout|timed.?out|ETIMEDOUT/i.test(err)) return 'Request timed out. Check your connection and try again.'
  if (/400|failed to call/i.test(err)) return 'The AI provider returned an error. Try a different agent provider in Settings.'
  if (/network|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(err)) return 'Network error. Check your internet connection.'
  if (/500|502|503|server/i.test(err)) return 'The AI service is temporarily down. Try again shortly.'
  return err
}

export default function AgentPanel({ onClose, onOpenSettings, prefill }) {
  const [view, setView]       = useState('home')  // home | running | history
  const [query, setQuery]     = useState('')
  const [routeInfo, setRouteInfo] = useState(null) // { type, label, icon } from router
  const [runId, setRunId]     = useState(null)
  const [steps, setSteps]     = useState([])
  const [draft, setDraft]     = useState(null)
  const [ask, setAsk]         = useState(null)
  const [replyText, setReplyText] = useState('')
  const [status, setStatus]   = useState('running')
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)
  const [runs, setRuns]       = useState([])
  const [stepsOpen, setStepsOpen] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState(new Set())
  const logRef = useRef()
  const inputRef = useRef()

  const runIdRef = useRef(null)
  const statusRef = useRef('running')

  const [hasKey, setHasKey] = useState(true)
  useEffect(() => {
    window.wallE?.loadSettings().then(s => {
      if (!s) return
      const provider = s.agentProvider || 'groq'
      if (provider === 'claude' && !s.claudeApiKey) setHasKey(false)
      else if (provider === 'gemini' && !s.geminiApiKey) setHasKey(false)
      else if (provider === 'groq' && !s.groqApiKey) setHasKey(false)
      else setHasKey(true)
    })
  }, [])

  // Auto-scroll step log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [steps])

  // If prefill provided, start immediately
  useEffect(() => {
    if (prefill?.type && prefill?.input) {
      startDirectRun(prefill.type, prefill.input)
    }
  }, [])

  // Subscribe to agent events
  useEffect(() => {
    const cleanups = [
      window.wallE?.onAgentRouted((rid, info) => {
        if (rid === runIdRef.current) setRouteInfo(info)
      }),
      window.wallE?.onAgentStep((rid, step) => {
        if (rid === runIdRef.current) setSteps(prev => [...prev, step])
      }),
      window.wallE?.onAgentDraft((rid, d) => {
        if (rid === runIdRef.current) { setDraft(d); setStatus('awaiting-approval'); statusRef.current = 'awaiting-approval' }
      }),
      window.wallE?.onAgentAskUser((rid, a) => {
        if (rid === runIdRef.current) { setAsk(a); setStatus('awaiting-reply'); statusRef.current = 'awaiting-reply' }
      }),
      window.wallE?.onAgentCompleted((rid, res) => {
        if (rid === runIdRef.current && statusRef.current !== 'cancelled') {
          setStatus('completed'); statusRef.current = 'completed'; setResult(res)
        }
      }),
      window.wallE?.onAgentFailed((rid, err) => {
        if (rid === runIdRef.current && statusRef.current !== 'cancelled') {
          setStatus('failed'); statusRef.current = 'failed'; setError(err)
        }
      }),
    ]
    return () => cleanups.forEach(c => c?.())
  }, [])

  // ── Start from natural language query (router decides type) ──
  async function startFromQuery() {
    if (!query.trim()) return
    setSteps([])
    setDraft(null)
    setResult(null)
    setError(null)
    setRouteInfo(null)
    setStatus('running')
    statusRef.current = 'running'
    setExpandedSteps(new Set())
    setStepsOpen(false)
    setView('running')

    // type=null tells main process to use router
    const res = await window.wallE?.startAgent(null, { query: query.trim() })
    if (res?.error) { setError(res.error); setStatus('failed'); statusRef.current = 'failed'; return }
    runIdRef.current = res.runId
    setRunId(res.runId)
  }

  // ── Start from explicit type (shortcut pill or prefill) ──
  async function startDirectRun(type, input) {
    const meta = AGENT_TYPES.find(a => a.id === type)
    setRouteInfo({ type, label: meta?.name || type, icon: meta?.icon || '🤖' })
    setSteps([])
    setDraft(null)
    setResult(null)
    setError(null)
    setStatus('running')
    statusRef.current = 'running'
    setExpandedSteps(new Set())
    setStepsOpen(false)
    setView('running')

    const res = await window.wallE?.startAgent(type, input)
    if (res?.error) { setError(res.error); setStatus('failed'); statusRef.current = 'failed'; return }
    runIdRef.current = res.runId
    setRunId(res.runId)
  }

  // ── Shortcut pill click → prefill query ──
  function fillShortcut(example) {
    setQuery(example)
    inputRef.current?.focus()
  }

  async function cancelRun() {
    if (runIdRef.current) await window.wallE?.cancelAgent(runIdRef.current)
    setStatus('cancelled')
    statusRef.current = 'cancelled'
  }

  async function approveDraft() {
    if (runIdRef.current && draft) {
      await window.wallE?.approveDraft(runIdRef.current, draft.id)
      setDraft(null)
      setStatus('running')
      statusRef.current = 'running'
    }
  }

  async function rejectDraft() {
    if (runIdRef.current && draft) {
      await window.wallE?.rejectDraft(runIdRef.current, draft.id, 'User rejected')
      setDraft(null)
      setStatus('running')
      statusRef.current = 'running'
    }
  }

  async function sendReply() {
    if (runIdRef.current && ask && replyText.trim()) {
      await window.wallE?.replyToAgent(runIdRef.current, ask.id, replyText.trim())
      setAsk(null)
      setReplyText('')
      setStatus('running')
      statusRef.current = 'running'
    }
  }

  async function showHistory() {
    const r = await window.wallE?.listAgentRuns()
    setRuns(r || [])
    setView('history')
  }

  async function loadRun(r) {
    const meta = AGENT_TYPES.find(a => a.id === r.type)
    setRouteInfo({ type: r.type, label: meta?.name || r.type, icon: meta?.icon || '🤖' })
    runIdRef.current = r.id
    setRunId(r.id)
    setSteps(r.steps || [])
    setResult(r.result)
    setError(r.error)
    setStatus(r.status)
    statusRef.current = r.status
    setDraft(null)
    setExpandedSteps(new Set())
    setStepsOpen(true)
    setView('running')
  }

  function toggleStep(idx) {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function goHome() {
    setView('home')
    setQuery('')
    setRouteInfo(null)
  }

  const phase = status === 'running' ? derivePhase(steps, status) : null
  const lastThinking = steps.filter(s => s.type === 'thinking').pop()?.content
  const visibleSteps = steps.filter(s => s.type !== 'llm_call')
  const stepCount = visibleSteps.length
  const headerTitle = view === 'home' ? 'Delegate'
    : view === 'history' ? 'History'
    : routeInfo?.label || 'Agent'

  return (
    <motion.div
      className="todo-panel agent-panel"
      initial={{ y: 40, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      {/* Header */}
      <div className="todo-header">
        <div className="todo-title-group">
          {view !== 'home' && (
            <button className="agent-back-btn" onClick={goHome} aria-label="Back">‹</button>
          )}
          <span className="todo-title">
            {view === 'running' && routeInfo?.icon && <span style={{ marginRight: 6 }}>{routeInfo.icon}</span>}
            {headerTitle}
          </span>
        </div>
        <div className="todo-header-actions">
          {view === 'home' && (
            <button className="todo-icon-btn" onClick={showHistory} title="History" aria-label="Agent history">📜</button>
          )}
          <button className="close-btn" onClick={onClose} aria-label="Close agent panel">✕</button>
        </div>
      </div>

      <div className="settings-body">
        {/* ── Home: single input + shortcuts ───────────────── */}
        {view === 'home' && (
          <div className="agent-home">
            <div className="agent-query-wrap">
              <input
                ref={inputRef}
                className="agent-query-input"
                placeholder="What do you need?"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startFromQuery() } }}
                autoFocus
              />
              <button
                className="agent-query-send"
                disabled={!query.trim() || !hasKey}
                onClick={startFromQuery}
                aria-label="Start agent"
              >
                →
              </button>
            </div>

            {!hasKey && (
              <div className="agent-key-warning">
                Agent API key missing.{' '}
                {onOpenSettings
                  ? <span className="empty-link" style={{ color: '#C8A44A' }} onClick={onOpenSettings}>Go to Settings</span>
                  : 'Check Settings → Preferences'
                }
                {' '}to add your key.
              </div>
            )}

            <div className="agent-shortcuts">
              {SHORTCUT_TYPES.map(a => (
                <button
                  key={a.id}
                  className="agent-shortcut-pill"
                  onClick={() => fillShortcut(a.example)}
                >
                  <span className="agent-shortcut-icon">{a.icon}</span>
                  <span className="agent-shortcut-name">{a.name}</span>
                </button>
              ))}
            </div>

            {/* Recent runs */}
            <RecentRuns onLoad={loadRun} />
          </div>
        )}

        {/* ── Running view: phase hero + collapsible steps ── */}
        {view === 'running' && (
          <div className="agent-run-view">
            {/* Phase hero */}
            <div className="agent-phase-hero">
              <div className="agent-phase-indicator">
                <span
                  className={`agent-phase-dot${status === 'running' ? ' pulsing' : ''}`}
                  style={{ background: STATUS_COLORS[status] }}
                />
                <span className="agent-phase-text">
                  {status === 'completed' ? 'Completed'
                    : status === 'failed' ? 'Failed'
                    : status === 'cancelled' ? 'Cancelled'
                    : phase || 'Starting...'}
                </span>
              </div>
              {status === 'running' && lastThinking && (
                <div className="agent-phase-sub">
                  {humanizeThinking(lastThinking)}
                </div>
              )}
              {status === 'running' && (
                <button className="agent-cancel-link" onClick={cancelRun}>Cancel</button>
              )}
            </div>

            {/* Draft approval overlay */}
            <AnimatePresence>
              {draft && (
                <DraftApproval
                  draft={draft}
                  lastThinking={lastThinking}
                  onApprove={approveDraft}
                  onReject={rejectDraft}
                />
              )}
            </AnimatePresence>

            {/* User reply input */}
            {ask && (
              <div className="agent-reply-box">
                <div className="agent-reply-question">{ask.question.slice(0, 300)}{ask.question.length > 300 ? '...' : ''}</div>
                <div className="agent-reply-input-row">
                  <input
                    className="settings-input agent-reply-input"
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                    autoFocus
                  />
                  <button className="settings-save-btn agent-reply-btn" onClick={sendReply} disabled={!replyText.trim()}>
                    Send
                  </button>
                </div>
              </div>
            )}

            {/* Collapsible step log */}
            <div className="agent-steps-section">
              <button
                className="agent-steps-toggle"
                onClick={() => setStepsOpen(!stepsOpen)}
              >
                <span className="agent-steps-toggle-label">
                  Steps {stepCount > 0 && <span className="agent-steps-count">{stepCount}</span>}
                </span>
                <span className="agent-steps-chevron">{stepsOpen ? '▾' : '▸'}</span>
              </button>

              {stepsOpen && (
                <div className="agent-log" ref={logRef}>
                  {visibleSteps.map((s, i) => {
                    const realIdx = steps.indexOf(s)
                    const isExpanded = expandedSteps.has(realIdx)
                    const canExpand = (s.type === 'tool_result' && (s.fullResult || (s.result && s.result.length > 80)))
                      || (s.type === 'tool_error' && s.result && s.result.length > 80)
                      || (s.type === 'thinking' && s.content && s.content.length > 120)

                    return (
                      <div
                        key={i}
                        className={`agent-step agent-step-${s.type}${canExpand ? ' agent-step-expandable' : ''}`}
                        onClick={canExpand ? () => toggleStep(realIdx) : undefined}
                      >
                        <span className="agent-step-icon">{STEP_ICONS[s.type] || '·'}</span>
                        <div className="agent-step-body">
                          {s.type === 'tool_call' && (
                            <span className="agent-step-tool">{humanizeStep(s) || s.tool}</span>
                          )}
                          {s.type === 'tool_call' && !humanizeStep(s) && s.args && (
                            <span className="agent-step-args">{s.args}</span>
                          )}
                          {s.type === 'tool_result' && (
                            <span className="agent-step-result">
                              {isExpanded
                                ? (s.fullResult || s.result)
                                : (humanizeResult(s.tool, s.fullResult || s.result) || (s.result?.slice(0, 80) + (s.result?.length > 80 ? '...' : '')))}
                            </span>
                          )}
                          {s.type === 'tool_error' && (
                            <span className="agent-step-result">
                              {isExpanded ? s.result : (s.result?.slice(0, 80) + (s.result?.length > 80 ? '...' : ''))}
                            </span>
                          )}
                          {s.type === 'thinking' && (
                            <span className="agent-step-content">
                              {isExpanded ? s.content : humanizeThinking(s.content)}
                            </span>
                          )}
                          {s.type === 'draft_approved' && (
                            <span className="agent-step-tool">Approved: {s.tool}</span>
                          )}
                          {s.type === 'draft_rejected' && (
                            <span className="agent-step-tool">Rejected: {s.tool}</span>
                          )}
                          {canExpand && (
                            <span className="agent-step-chevron">{isExpanded ? '▾' : '▸'}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {status === 'running' && steps.length > 0 && (
                    <div className="agent-step agent-step-loading">
                      <span className="agent-step-icon">⏳</span>
                      <span className="agent-step-body">Working...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Final result */}
            {status === 'completed' && result && (
              <div className="agent-result">
                <div className="agent-result-label">Result</div>
                <div className="agent-result-text">{result}</div>
              </div>
            )}
            {status === 'failed' && error && (
              <div className="agent-result agent-result-error">
                <div className="agent-result-label">Error</div>
                <div className="agent-result-text">{friendlyError(error)}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="settings-save-btn agent-retry-btn" onClick={() => startFromQuery()}>
                    Retry
                  </button>
                  <button
                    className="settings-save-btn agent-retry-btn"
                    style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
                    onClick={goHome}
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── History ─────────────────────────────────────── */}
        {view === 'history' && (
          <div className="agent-history">
            {runs.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">📜</span>
                <span className="empty-title">No runs yet</span>
              </div>
            )}
            {runs.map(r => {
              const meta = AGENT_TYPES.find(a => a.id === r.type)
              return (
                <button key={r.id} className="agent-history-item" onClick={() => loadRun(r)}>
                  <span className="agent-history-type">{meta?.icon || '?'}</span>
                  <div className="agent-history-info">
                    <span className="agent-history-name">{meta?.name || r.type}</span>
                    <span className="agent-history-meta">
                      <span className="agent-status-dot" style={{ background: STATUS_COLORS[r.status], width: 6, height: 6 }} />
                      {r.status} — {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Recent runs mini-list ──────────────────────────────────────────
function RecentRuns({ onLoad }) {
  const [recent, setRecent] = useState([])

  useEffect(() => {
    window.wallE?.listAgentRuns().then(r => {
      if (Array.isArray(r)) setRecent(r.slice(0, 3))
    })
  }, [])

  if (recent.length === 0) return null

  return (
    <div className="agent-recent">
      <div className="agent-recent-label">Recent</div>
      {recent.map(r => {
        const meta = AGENT_TYPES.find(a => a.id === r.type)
        const inputSummary = r.input?.query || r.input?.jiraKey || r.input?.brief?.slice(0, 40) || r.type
        return (
          <button key={r.id} className="agent-recent-item" onClick={() => onLoad(r)}>
            <span className="agent-recent-icon">{meta?.icon || '🤖'}</span>
            <span className="agent-recent-text">{inputSummary}</span>
            <span
              className="agent-recent-dot"
              style={{ background: STATUS_COLORS[r.status] }}
            />
          </button>
        )
      })}
    </div>
  )
}
