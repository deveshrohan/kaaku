import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import OfficeCanvas, { DESKS, deskWorldPos } from './OfficeScene'
import { ACCENT as ROLE_COLORS } from './sprites'
import ErrorBoundary from '../ErrorBoundary'

const PRIORITY_COLOR = { high: '#FF453A', medium: '#FF9F0A', low: '#34C759' }

const ROLE_LABELS = {
  pm: 'Product Manager',
  architect: 'Architect',
  developer: 'Developer',
  analyst: 'Analyst',
  qa: 'QA Engineer',
}

const SOURCE_ICON = { slack: '💬', gmail: '📧' }

const ROLE_PROMPTS = {
  pm: '', // PM uses its own system prompt from prompts.js
  architect: 'You are the Architect. Sweep code, evaluate feasibility, identify risks, draft technical designs. Act autonomously — read the code, don\'t ask what to read.',
  developer: 'You are the Developer. Implement features, fix bugs, write code, create PRs. Act autonomously — read the spec, write the code, open the PR.',
  analyst: 'You are the Analyst. Pull data from Redash, cross-reference Jira, surface insights. Act autonomously — search for relevant queries, fetch results, synthesize.',
  qa: 'You are the QA Engineer. Review code changes, identify edge cases, verify acceptance criteria. Act autonomously — read the PR, check the code, report findings.',
}

const ACTION_LABELS = {
  jira_create_issue:            { label: 'Create Jira Issue',    color: '#1868DB' },
  jira_add_comment:             { label: 'Add Jira Comment',     color: '#1868DB' },
  jira_update_issue:            { label: 'Update Jira Issue',    color: '#1868DB' },
  jira_transition_issue:        { label: 'Move Jira Issue',      color: '#1868DB' },
  github_create_branch:         { label: 'Create Git Branch',    color: '#7B68EE' },
  github_create_or_update_file: { label: 'Write File to GitHub', color: '#7B68EE' },
  github_create_pr:             { label: 'Open Pull Request',    color: '#7B68EE' },
  slack_post_message:           { label: 'Send Slack Message',   color: '#E01E5A' },
  gmail_send:                   { label: 'Send Email',           color: '#EA4335' },
}

export default function OfficePanel({
  todos,
  setTodos,
  onOpenAgent,
  onTaskComplete,
}) {
  const [selectedDesk, setSelectedDesk] = useState(null)
  const [agentPhases, setAgentPhases] = useState({})
  const [agentRunning, setAgentRunning] = useState({})
  const [agentResults, setAgentResults] = useState({})
  const [agentSteps, setAgentSteps] = useState({}) // keyed by role → array of steps
  const [attentionQueue, setAttentionQueue] = useState([]) // { id, type, runId, role, draft?, error?, result?, ts }
  const [lastThinking, setLastThinking] = useState('')
  const [search, setSearch] = useState('')
  const [syncToast, setSyncToast] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)

  // ── Attention queue helpers ─────────────────────────────────────────
  const pushAttention = useCallback((item) => {
    setAttentionQueue(prev => [...prev, { ...item, id: `attn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, ts: Date.now() }])
  }, [])

  const dismissAttention = useCallback((id) => {
    setAttentionQueue(prev => prev.filter(a => a.id !== id))
  }, [])

  const approveAttention = useCallback((item) => {
    window.wallE?.approveDraft(item.runId, item.draft.id)
    dismissAttention(item.id)
  }, [dismissAttention])

  const rejectAttention = useCallback((item) => {
    window.wallE?.rejectDraft(item.runId, item.draft.id, 'User rejected')
    dismissAttention(item.id)
  }, [dismissAttention])

  // ── Character position & animation state ─────────────────────────
  const [charStates, setCharStates] = useState(() => {
    const init = {}
    for (const d of DESKS) {
      init[d.role] = {
        position: deskWorldPos(d.pos),
        state: 'idle',
        walkTo: null,
      }
    }
    return init
  })

  function walkCharacter(role, targetRole) {
    const targetDesk = DESKS.find(d => d.role === targetRole)
    if (!targetDesk) return
    const target = deskWorldPos(targetDesk.pos)
    setCharStates(prev => ({
      ...prev,
      [role]: { ...prev[role], state: 'walk', walkTo: target },
    }))
  }

  function onWalkDone(role, targetPos) {
    setCharStates(prev => ({
      ...prev,
      [role]: { position: targetPos, state: 'idle', walkTo: null },
    }))
  }

  const characters = useMemo(() => {
    return DESKS.map(d => {
      const cs = charStates[d.role]
      const phase = agentPhases[d.role] || 'idle'
      const isError = phase === 'error'
      const isWorking = !isError && phase !== 'idle' && phase !== 'completed' && cs.state !== 'walk'
      return {
        role: d.role,
        position: cs.position,
        state: cs.state === 'walk' ? 'walk' : (isError ? 'error' : (isWorking ? 'work' : 'idle')),
        walkTo: cs.walkTo,
        walkDuration: 1.8,
        onWalkDone: () => onWalkDone(d.role, cs.walkTo || cs.position),
      }
    })
  }, [charStates, agentPhases])

  // Helper: find which role owns a runId
  function roleForRun(rid) {
    for (const [role, runId] of Object.entries(agentRunning)) {
      if (runId === rid) return role
    }
    return null
  }

  // Listen for agent events
  useEffect(() => {
    const cleanups = [
      window.wallE?.onAgentStep((_rid, step) => {
        if (step.type === 'tool_call') updatePhaseForRun(_rid, 'acting')
        else if (step.type === 'thinking') {
          updatePhaseForRun(_rid, 'analyzing')
          setLastThinking(step.content || '')
        }
        else if (step.type === 'llm_call') updatePhaseForRun(_rid, 'gathering')
        // Store step for activity log (skip llm_call noise)
        if (step.type !== 'llm_call') {
          const role = roleForRun(_rid)
          if (role) {
            setAgentSteps(prev => ({
              ...prev,
              [role]: [...(prev[role] || []), step],
            }))
          }
        }
      }),
      window.wallE?.onAgentCompleted((rid, result) => {
        updatePhaseForRun(rid, 'completed')
        for (const [role, runId] of Object.entries(agentRunning)) {
          if (runId === rid) {
            setAgentResults(prev => ({ ...prev, [role]: result }))
            setTodos(prev => prev.map(t =>
              t.delegatedTo === role && !t.done
                ? { ...t, done: true, completedAt: Date.now() }
                : t
            ))
            setAgentRunning(prev => { const n = { ...prev }; delete n[role]; return n })
            // Push completion to attention queue
            pushAttention({ type: 'result', runId: rid, role, result })
            break
          }
        }
        setTimeout(() => updatePhaseForRun(rid, 'idle'), 4000)
      }),
      window.wallE?.onAgentFailed((rid, error) => {
        updatePhaseForRun(rid, 'error')
        for (const [role, runId] of Object.entries(agentRunning)) {
          if (runId === rid) {
            const msg = error || 'Agent failed'
            setAgentResults(prev => ({ ...prev, [role]: `Error: ${msg}` }))
            setAgentRunning(prev => { const n = { ...prev }; delete n[role]; return n })
            // Push error to attention queue
            pushAttention({ type: 'error', runId: rid, role, error: msg })
            break
          }
        }
        setTimeout(() => updatePhaseForRun(rid, 'idle'), 4000)
      }),
      // PM delegation: walk PM character to specialist desk and back
      window.wallE?.onAgentDelegation?.((rid, { specialist }) => {
        if (agentRunning.pm === rid) {
          walkCharacter('pm', specialist)
          setTimeout(() => walkCharacter('pm', 'pm'), 4000)
        }
      }),
      // Claude Code sub-agent started: register specialist desk as running
      window.wallE?.onAgentSubStarted?.((subRunId, specialist) => {
        setAgentRunning(prev => ({ ...prev, [specialist]: subRunId }))
        setAgentPhases(prev => ({ ...prev, [specialist]: 'gathering' }))
      }),
      // Draft approval — push to attention queue (supports parallel)
      window.wallE?.onAgentDraft?.((rid, draft) => {
        const role = roleForRun(rid)
        pushAttention({ type: 'approval', runId: rid, role, draft })
      }),
      // Sync status
      window.wallE?.onSyncStatus?.(({ slackError, gmailError, slackAdded }) => {
        if (slackError || gmailError) {
          const msg = slackError ? `Slack: ${slackError.slice(0, 60)}` : `Gmail: ${gmailError.slice(0, 60)}`
          setSyncToast({ message: msg, isError: true })
          setTimeout(() => setSyncToast(null), 6000)
        } else if (slackAdded > 0) {
          setSyncToast({ message: `${slackAdded} new task${slackAdded > 1 ? 's' : ''} synced`, isError: false })
          setTimeout(() => setSyncToast(null), 3000)
        }
      }),
    ]
    return () => cleanups.forEach(c => c?.())
  }, [agentRunning])

  function updatePhaseForRun(runId, phase) {
    for (const [role, rid] of Object.entries(agentRunning)) {
      if (rid === runId) {
        setAgentPhases(prev => ({ ...prev, [role]: phase }))
        break
      }
    }
  }

  // ── Computed data ──────────────────────────────────────────────────
  const deskData = useMemo(() => {
    return DESKS.map(d => {
      const delegated = todos.filter(t => !t.done && t.delegatedTo === d.role)
      return {
        ...d,
        taskCount: delegated.length,
        agentPhase: agentPhases[d.role] || 'idle',
      }
    })
  }, [todos, agentPhases])

  const selectedTasks = useMemo(() => {
    if (!selectedDesk) return []
    return todos.filter(t => !t.done && t.delegatedTo === selectedDesk)
  }, [todos, selectedDesk])

  const pendingInbox = useMemo(() => {
    const items = todos.filter(t => !t.done && !t.delegatedTo && !t.requiresResponse)
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(t =>
      t.text?.toLowerCase().includes(q) ||
      t.context?.toLowerCase().includes(q) ||
      t.from?.toLowerCase().includes(q) ||
      t.slackChannelName?.toLowerCase().includes(q)
    )
  }, [todos, search])

  const inProgressTasks = useMemo(() => {
    const items = todos.filter(t => !t.done && t.delegatedTo)
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(t =>
      t.text?.toLowerCase().includes(q) ||
      t.context?.toLowerCase().includes(q) ||
      t.from?.toLowerCase().includes(q)
    )
  }, [todos, search])

  const allDone = useMemo(() =>
    todos.filter(t => t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
    [todos]
  )
  const completedTasks = useMemo(() => allDone.slice(0, 20), [allDone])
  const completedCount = allDone.length

  const totalDelegated = todos.filter(t => !t.done && t.delegatedTo).length

  // ── Auto-start agent when tasks arrive at an idle desk ─────────────
  const pendingAutoStart = useRef(null)

  useEffect(() => {
    const role = pendingAutoStart.current
    if (!role) return
    pendingAutoStart.current = null
    if (!agentRunning[role]) startDeskAgent(role)
  }, [todos])

  // ── Actions ────────────────────────────────────────────────────────
  function delegateTask(todoId, role = 'pm') {
    setTodos(prev => prev.map(t =>
      t.id === todoId ? { ...t, delegatedTo: role, delegatedAt: Date.now() } : t
    ))
    if (!agentRunning[role]) pendingAutoStart.current = role
  }

  function routeToRole(todoId, role) {
    walkCharacter('pm', role)
    setTimeout(() => {
      setTodos(prev => prev.map(t =>
        t.id === todoId ? { ...t, delegatedTo: role, routedAt: Date.now() } : t
      ))
      if (!agentRunning[role]) pendingAutoStart.current = role
      walkCharacter('pm', 'pm')
    }, 2000)
  }

  function recallTask(todoId) {
    setTodos(prev => prev.map(t =>
      t.id === todoId ? { ...t, delegatedTo: undefined, delegatedAt: undefined, routedAt: undefined } : t
    ))
  }

  function toggleDone(todoId) {
    setTodos(prev => prev.map(t => {
      if (t.id !== todoId) return t
      const nowDone = !t.done
      if (nowDone) onTaskComplete?.()
      return { ...t, done: nowDone, completedAt: nowDone ? Date.now() : undefined }
    }))
  }

  function deleteTask(todoId) {
    setTodos(prev => prev.filter(t => t.id !== todoId))
  }

  async function startDeskAgent(role) {
    const tasks = todos.filter(t => !t.done && t.delegatedTo === role)
    if (tasks.length === 0) return
    const taskSummary = tasks.map(t => {
      let line = `- ${t.text}`
      if (t.context) line += `: ${t.context}`
      if (t.deadline) {
        const d = new Date(t.deadline)
        line += ` [due ${d.toLocaleDateString()}]`
      }
      if (t.assignee) line += ` [assigned to ${t.assignee}]`
      if (t.from || t.gmailFrom) line += ` [from ${t.from || t.gmailFrom}]`
      return line
    }).join('\n')
    const rolePrompt = ROLE_PROMPTS[role]
    const query = rolePrompt
      ? `${rolePrompt}\n\nTasks:\n${taskSummary}`
      : taskSummary
    const agentType = role === 'pm' ? 'pm' : 'generic'
    const res = await window.wallE?.startAgent(agentType, { query })
    if (res?.error) {
      setAgentResults(prev => ({ ...prev, [role]: `Error: ${res.error}` }))
      setAgentPhases(prev => ({ ...prev, [role]: 'error' }))
      pushAttention({ type: 'error', runId: null, role, error: res.error })
      setTimeout(() => setAgentPhases(prev => ({ ...prev, [role]: 'idle' })), 4000)
      return
    }
    if (res?.runId) {
      setAgentRunning(prev => ({ ...prev, [role]: res.runId }))
      setAgentPhases(prev => ({ ...prev, [role]: 'gathering' }))
      setAgentSteps(prev => ({ ...prev, [role]: [] }))
    }
  }

  function handleDeskClick(role) {
    setSelectedDesk(prev => prev === role ? null : role)
  }

  // Count approvals needing attention
  const approvalCount = attentionQueue.filter(a => a.type === 'approval').length

  return (
    <motion.div
      className="office-panel"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      {/* Sub-header: stats + attention */}
      <div className="office-header">
        <span className="office-stats">
          {pendingInbox.length} inbox
          {totalDelegated > 0 && <> &middot; {totalDelegated} assigned</>}
          {completedCount > 0 && <> &middot; {completedCount} done</>}
        </span>
        {approvalCount > 0 && (
          <span className="attn-header-badge" title={`${approvalCount} item${approvalCount > 1 ? 's' : ''} need attention`}>
            {approvalCount}
          </span>
        )}
      </div>

      {/* Sync toast */}
      <AnimatePresence>
        {syncToast && (
          <motion.div
            className={`office-sync-toast${syncToast.isError ? ' error' : ''}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {syncToast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main layout: canvas + detail */}
      <div className="office-body">
        {/* 3D Office Scene */}
        <div className="office-canvas-wrap">
          <ErrorBoundary fallback={<div style={{ flex: 1 }} />}>
            <OfficeCanvas
              desks={deskData}
              selectedDesk={selectedDesk}
              onDeskClick={handleDeskClick}
              onBackgroundClick={() => setSelectedDesk(null)}
              characters={characters}
            />
          </ErrorBoundary>
          {/* Speech bubbles */}
          <div className="office-speech-bubbles">
            <AnimatePresence>
              {DESKS.map(d => {
                const phase = agentPhases[d.role]
                if (!phase || phase === 'idle') return null
                const hasApproval = attentionQueue.some(
                  a => a.type === 'approval' && a.role === d.role
                )
                const label = hasApproval ? 'Needs approval'
                  : phase === 'gathering' ? 'Researching...'
                  : phase === 'analyzing' ? 'Thinking...'
                  : phase === 'acting' ? 'Working...'
                  : phase === 'error' ? 'Error!'
                  : phase === 'completed' ? 'Done!'
                  : null
                if (!label) return null
                return (
                  <motion.div
                    key={d.role}
                    className={`office-speech-bubble office-speech-${hasApproval ? 'approval' : phase}`}
                    style={{ '--role-color': ROLE_COLORS[d.role] }}
                    data-role={d.role}
                    initial={{ opacity: 0, y: 8, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className="office-speech-dot" />
                    {label}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          {/* Desk labels with task counts */}
          <div className="office-desk-labels">
            {DESKS.map(d => {
              const count = deskData.find(dd => dd.role === d.role)?.taskCount || 0
              return (
                <div
                  key={d.role}
                  className={`office-desk-label${selectedDesk === d.role ? ' selected' : ''}${count > 0 ? ' has-tasks' : ''}`}
                  style={{ '--role-color': ROLE_COLORS[d.role] }}
                  onClick={() => handleDeskClick(d.role)}
                >
                  <span className="office-desk-label-dot" />
                  <span className="office-desk-label-text">{d.label}</span>
                  {count > 0 && <span className="office-desk-label-count">{count}</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Sidebar detail panel */}
        <div className="office-detail">
          {/* ── Attention Queue (always on top when items exist) ── */}
          <AnimatePresence>
            {attentionQueue.length > 0 && (
              <motion.div
                className="attn-queue"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="attn-queue-header">
                  <span className="attn-queue-title">Attention</span>
                  <span className="attn-queue-count">{attentionQueue.length}</span>
                  {attentionQueue.length > 1 && attentionQueue.every(a => a.type !== 'approval') && (
                    <button className="attn-queue-clear" onClick={() => setAttentionQueue([])}>Clear all</button>
                  )}
                </div>
                <div className="attn-queue-list">
                  {attentionQueue.map(item => (
                    <AttentionItem
                      key={item.id}
                      item={item}
                      lastThinking={lastThinking}
                      onApprove={() => approveAttention(item)}
                      onReject={() => rejectAttention(item)}
                      onDismiss={() => dismissAttention(item.id)}
                      onRetry={item.role ? () => startDeskAgent(item.role) : undefined}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Main content ── */}
          <div className="office-detail-scroll">
            <AnimatePresence mode="wait">
              {selectedTask ? (
                <motion.div
                  key={`task-${selectedTask.id}`}
                  className="office-detail-inner"
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <TaskDetailView
                    task={selectedTask}
                    phase={agentPhases[selectedTask.delegatedTo] || 'idle'}
                    steps={agentSteps[selectedTask.delegatedTo] || []}
                    isRunning={!!agentRunning[selectedTask.delegatedTo]}
                    onBack={() => setSelectedTask(null)}
                    onToggleDone={() => { toggleDone(selectedTask.id); setSelectedTask(null) }}
                    onRecall={() => { recallTask(selectedTask.id); setSelectedTask(null) }}
                  />
                </motion.div>
              ) : selectedDesk ? (
                <motion.div
                  key={selectedDesk}
                  className="office-detail-inner"
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <DeskDetail
                    role={selectedDesk}
                    tasks={selectedTasks}
                    phase={agentPhases[selectedDesk] || 'idle'}
                    isRunning={!!agentRunning[selectedDesk]}
                    agentResult={agentResults[selectedDesk] || null}
                    agentSteps={agentSteps[selectedDesk] || []}
                    onRoute={routeToRole}
                    onRecall={recallTask}
                    onToggleDone={toggleDone}
                    onDelete={deleteTask}
                    onStartAgent={() => startDeskAgent(selectedDesk)}
                    onOpenAgent={onOpenAgent}
                    onSelectTask={setSelectedTask}
                    onClearResult={() => setAgentResults(prev => { const n = { ...prev }; delete n[selectedDesk]; return n })}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="inbox"
                  className="office-detail-inner"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <InboxView
                    todoTasks={pendingInbox}
                    inProgressTasks={inProgressTasks}
                    completedTasks={completedTasks}
                    completedCount={completedCount}
                    setTodos={setTodos}
                    search={search}
                    onSearchChange={setSearch}
                    onDelegate={delegateTask}
                    onRecall={recallTask}
                    onToggleDone={toggleDone}
                    onDelete={deleteTask}
                    onOpenAgent={onOpenAgent}
                    agentPhases={agentPhases}
                    agentSteps={agentSteps}
                    agentRunning={agentRunning}
                    onSelectTask={setSelectedTask}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Attention Queue Item ────────────────────────────────────────────

function AttentionItem({ item, lastThinking, onApprove, onReject, onDismiss, onRetry }) {
  const [expanded, setExpanded] = useState(false)
  const roleColor = ROLE_COLORS[item.role] || '#888'
  const roleLabel = ROLE_LABELS[item.role] || item.role || 'Agent'

  if (item.type === 'approval') {
    const action = ACTION_LABELS[item.draft.tool] || { label: item.draft.tool, color: '#C8A44A' }
    return (
      <motion.div
        className="attn-item attn-approval"
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -20, opacity: 0, height: 0, marginBottom: 0 }}
        layout
      >
        <div className="attn-item-header">
          <span className="attn-role-dot" style={{ background: roleColor }} />
          <span className="attn-role-label">{roleLabel}</span>
          <span className="attn-type-badge attn-type-approval">Approval</span>
        </div>
        <div className="attn-action-badge" style={{ background: action.color + '18', color: action.color, borderColor: action.color + '33' }}>
          {action.label}
        </div>
        {item.draft.consequence && (
          <div className="attn-consequence">{item.draft.consequence}</div>
        )}
        {item.draft.preview && (
          <div
            className={`attn-preview${expanded ? ' expanded' : ''}`}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? item.draft.preview : item.draft.preview.slice(0, 140)}
            {item.draft.preview.length > 140 && (
              <span className="attn-preview-toggle">{expanded ? ' less' : '... more'}</span>
            )}
          </div>
        )}
        <div className="attn-actions">
          <button className="attn-reject-btn" onClick={onReject}>Reject</button>
          <button className="attn-approve-btn" onClick={onApprove}>Approve</button>
        </div>
      </motion.div>
    )
  }

  if (item.type === 'error') {
    return (
      <motion.div
        className="attn-item attn-error"
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -20, opacity: 0, height: 0, marginBottom: 0 }}
        layout
      >
        <div className="attn-item-header">
          <span className="attn-role-dot" style={{ background: roleColor }} />
          <span className="attn-role-label">{roleLabel}</span>
          <span className="attn-type-badge attn-type-error">Error</span>
          <button className="attn-dismiss" onClick={onDismiss}>&#10005;</button>
        </div>
        <div className="attn-error-msg">{item.error}</div>
        {onRetry && (
          <button className="attn-retry-btn" onClick={() => { onDismiss(); onRetry() }}>
            Retry
          </button>
        )}
      </motion.div>
    )
  }

  // type === 'result'
  const resultText = typeof item.result === 'string' ? item.result : JSON.stringify(item.result, null, 2)
  return (
    <motion.div
      className="attn-item attn-result"
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0, height: 0, marginBottom: 0 }}
      layout
    >
      <div className="attn-item-header">
        <span className="attn-role-dot" style={{ background: roleColor }} />
        <span className="attn-role-label">{roleLabel}</span>
        <span className="attn-type-badge attn-type-done">Done</span>
        <button className="attn-dismiss" onClick={onDismiss}>&#10005;</button>
      </div>
      <div
        className={`attn-preview${expanded ? ' expanded' : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? resultText : resultText.slice(0, 120)}
        {resultText.length > 120 && (
          <span className="attn-preview-toggle">{expanded ? ' less' : '... more'}</span>
        )}
      </div>
    </motion.div>
  )
}

// ── Shared task item ────────────────────────────────────────────────

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

function TaskItem({ task, actions, showMeta = true, onClick }) {
  const isOverdue = task.deadline && task.deadline < Date.now()
  const priorityLabel = { high: 'H', medium: 'M', low: 'L' }
  return (
    <div className={`desk-task${isOverdue ? ' overdue' : ''}${onClick ? ' clickable' : ''}`}>
      <div className="desk-task-row" onClick={onClick}>
        {task.priority ? (
          <span className="desk-task-priority" data-priority={task.priority}>
            {priorityLabel[task.priority] || ''}
          </span>
        ) : (
          <span className="desk-task-dot" />
        )}
        <span className="desk-task-text">{task.text}</span>
        <DeadlineTag deadline={task.deadline} />
      </div>
      {task.context && (
        <div className="desk-task-context">{task.context}</div>
      )}
      {showMeta && (task.from || task.gmailFrom || task.slackChannelName || task.source || task.assignee) && (
        <div className="desk-task-meta">
          {task.source && <span className="desk-task-source">{SOURCE_ICON[task.source] || ''}</span>}
          {(task.from || task.gmailFrom) && (
            <span className="desk-task-sender">{task.from || task.gmailFrom}</span>
          )}
          {task.slackChannelName && (
            <span className="desk-task-channel">#{task.slackChannelName}</span>
          )}
          {task.assignee && (
            <span className="desk-task-assignee">{task.assignee}</span>
          )}
        </div>
      )}
      {actions && <div className="desk-task-actions">{actions}</div>}
    </div>
  )
}

// ── Desk Detail ──────────────────────────────────────────────────────

const STEP_ICON = {
  thinking: '💭', tool_call: '🔧', tool_result: '✅', tool_error: '❌',
  draft_approved: '✓', draft_rejected: '✗', sub_agent_step: '🤝',
}

function stepLabel(step) {
  switch (step.type) {
    case 'thinking': return (step.content || '').slice(0, 120)
    case 'tool_call': return step.tool || 'tool call'
    case 'tool_result': return `${step.tool} → ${(step.result || '').slice(0, 80)}`
    case 'tool_error': return `${step.tool} failed: ${(step.result || '').slice(0, 80)}`
    case 'draft_approved': return `${step.auto ? 'Auto-approved' : 'Approved'}: ${step.tool}`
    case 'draft_rejected': return `Rejected: ${step.tool}`
    case 'sub_agent_step': return (step.content || '').slice(0, 120)
    default: return step.content || step.type
  }
}

function TaskAgentStatus({ phase, steps, isRunning }) {
  const [expanded, setExpanded] = useState(false)
  const logRef = useRef()

  useEffect(() => {
    if (expanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [expanded, steps.length])

  if (phase === 'idle' && steps.length === 0) return null

  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null
  const currentLabel = isRunning
    ? (lastStep ? stepLabel(lastStep) : 'Starting...')
    : phase === 'completed' ? 'Completed'
    : phase === 'error' ? 'Failed'
    : null

  if (!currentLabel && steps.length === 0) return null

  return (
    <div className={`task-agent-status${expanded ? ' expanded' : ''}`} data-phase={phase}>
      <button className="task-agent-bar" onClick={() => setExpanded(v => !v)}>
        <span className={`task-agent-dot${isRunning ? ' active' : ''}`} data-phase={phase} />
        <span className="task-agent-label">{currentLabel}</span>
        {steps.length > 0 && (
          <span className="task-agent-count">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
        )}
        <span className="task-agent-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
      </button>
      {expanded && steps.length > 0 && (
        <div className="task-agent-log" ref={logRef}>
          {steps.map((step, i) => (
            <div key={i} className={`desk-step desk-step-${step.type}`}>
              <span className="desk-step-icon">{STEP_ICON[step.type] || '\u00B7'}</span>
              <span className="desk-step-text">{stepLabel(step)}</span>
            </div>
          ))}
          {isRunning && (
            <div className="desk-step desk-step-loading">
              <span className="desk-step-icon">{'\u23F3'}</span>
              <span className="desk-step-text">Working...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step Block (Claude Code-style log entry) ──────────────────────

function StepBlock({ step }) {
  const [expanded, setExpanded] = useState(false)
  const toggle = () => setExpanded(v => !v)

  if (step.type === 'thinking') {
    const text = step.content || ''
    const isLong = text.length > 150
    return (
      <div className="step-block step-thinking">
        <div className="step-block-header" onClick={isLong ? toggle : undefined}>
          <span className="step-block-icon">{'\uD83D\uDCAD'}</span>
          <span className="step-block-title">Thinking</span>
          {isLong && <span className="step-block-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>}
        </div>
        <div className="step-block-body">{expanded || !isLong ? text : text.slice(0, 150) + '...'}</div>
      </div>
    )
  }

  if (step.type === 'tool_call') {
    return (
      <div className="step-block step-tool-call">
        <div className="step-block-header" onClick={step.input ? toggle : undefined}>
          <span className="step-block-icon">{'\uD83D\uDD27'}</span>
          <span className="step-block-title">{step.tool}</span>
          {step.input && <span className="step-block-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>}
        </div>
        {step.args && <div className="step-block-args">{step.args}</div>}
        {expanded && step.input && (
          <pre className="step-block-json">{JSON.stringify(step.input, null, 2)}</pre>
        )}
      </div>
    )
  }

  if (step.type === 'tool_result') {
    const preview = (step.result || '').slice(0, 150)
    const full = step.fullResult || step.result || ''
    const hasMore = full.length > 150
    return (
      <div className="step-block step-tool-result">
        <div className="step-block-header" onClick={hasMore ? toggle : undefined}>
          <span className="step-block-icon">{'\u2705'}</span>
          <span className="step-block-title">{step.tool}</span>
          {full.length > 0 && <span className="step-block-meta">{full.length.toLocaleString()} chars</span>}
          {hasMore && <span className="step-block-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>}
        </div>
        <div className="step-block-body">{expanded ? full : preview}{!expanded && hasMore ? '...' : ''}</div>
      </div>
    )
  }

  if (step.type === 'tool_error') {
    return (
      <div className="step-block step-tool-error">
        <div className="step-block-header">
          <span className="step-block-icon">{'\u274C'}</span>
          <span className="step-block-title">{step.tool} failed</span>
        </div>
        <div className="step-block-body step-error-text">{step.result}</div>
      </div>
    )
  }

  if (step.type === 'sub_agent_step') {
    return (
      <div className="step-block step-sub-agent">
        <div className="step-block-header">
          <span className="step-block-icon">{'\uD83E\uDD1D'}</span>
          <span className="step-block-title">{step.subAgent ? `Delegated to ${step.subAgent}` : 'Sub-agent'}</span>
        </div>
        {step.content && <div className="step-block-body">{step.content}</div>}
      </div>
    )
  }

  if (step.type === 'draft_approved') {
    return (
      <div className="step-block step-approved">
        <div className="step-block-header">
          <span className="step-block-icon">{'\u2713'}</span>
          <span className="step-block-title">{step.auto ? 'Auto-approved' : 'Approved'}: {step.tool}</span>
        </div>
      </div>
    )
  }

  if (step.type === 'draft_rejected') {
    return (
      <div className="step-block step-rejected">
        <div className="step-block-header">
          <span className="step-block-icon">{'\u2717'}</span>
          <span className="step-block-title">Rejected: {step.tool}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="step-block">
      <div className="step-block-header">
        <span className="step-block-icon">{'\u00B7'}</span>
        <span className="step-block-title">{step.content || step.type}</span>
      </div>
    </div>
  )
}

// ── Task Detail View (Claude Code-style log) ───────────────────────

function TaskDetailView({ task, phase, steps, isRunning, onBack, onToggleDone, onRecall }) {
  const logRef = useRef()
  const roleColor = ROLE_COLORS[task.delegatedTo] || '#888'
  const roleLabel = ROLE_LABELS[task.delegatedTo] || task.delegatedTo

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [steps.length])

  return (
    <div className="task-detail">
      <div className="task-detail-header">
        <button className="task-detail-back" onClick={onBack}>{'\u2190'} Back</button>
        <div className="task-detail-actions">
          <button className="desk-done-btn" onClick={onToggleDone} title="Mark done">{'\u2713'}</button>
          <button className="desk-recall-btn" onClick={onRecall} title="Return to inbox">{'\u2190'} Inbox</button>
        </div>
      </div>

      <div className="task-detail-info">
        <div className="task-detail-text">{task.text}</div>
        {task.context && <div className="task-detail-context">{task.context}</div>}
        <div className="task-detail-meta">
          <span className="task-detail-badge" style={{ '--role-color': roleColor }}>{roleLabel}</span>
          {phase !== 'idle' && <span className="task-detail-phase" data-phase={phase}>{phase}</span>}
          <DeadlineTag deadline={task.deadline} />
        </div>
      </div>

      <div className="task-detail-log-header">
        <span>Agent Log</span>
        <span className="task-detail-step-count">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="task-detail-log" ref={logRef}>
        {steps.length === 0 && !isRunning && (
          <div className="task-detail-empty">No activity yet</div>
        )}
        {steps.map((step, i) => <StepBlock key={i} step={step} />)}
        {isRunning && (
          <div className="step-block step-loading">
            <div className="step-block-header">
              <span className="step-block-icon">{'\u23F3'}</span>
              <span className="step-block-title">Working...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Desk Detail ──────────────────────────────────────────────────────

function DeskDetail({ role, tasks, phase, isRunning, agentResult, agentSteps, onRoute, onRecall, onToggleDone, onDelete, onStartAgent, onOpenAgent, onSelectTask, onClearResult }) {
  const color = ROLE_COLORS[role]
  const label = ROLE_LABELS[role]
  const isPM = role === 'pm'
  const specialists = DESKS.filter(d => d.role !== 'pm')
  const [showActivity, setShowActivity] = useState(true)
  const steps = agentSteps || []
  const activityRef = useRef()

  // Auto-scroll activity log
  useEffect(() => {
    if (activityRef.current) activityRef.current.scrollTop = activityRef.current.scrollHeight
  }, [steps.length])

  return (
    <div className="desk-detail">
      <div className="desk-detail-header" style={{ '--role-color': color }}>
        <span className="desk-detail-dot" />
        <span className="desk-detail-name">{label}</span>
        {phase !== 'idle' && (
          <span className="desk-detail-phase-badge" data-phase={phase}>{phase}</span>
        )}
      </div>

      {/* Agent result display */}
      {agentResult && (
        <div className="desk-result">
          <div className="desk-result-header">
            <span className="desk-result-label">Agent Output</span>
            <button className="desk-result-dismiss" onClick={onClearResult}>&#10005;</button>
          </div>
          <div className="desk-result-body">{agentResult}</div>
        </div>
      )}

      {/* Activity log — live agent steps */}
      {steps.length > 0 && (
        <div className="desk-activity">
          <button className="desk-activity-toggle" onClick={() => setShowActivity(v => !v)}>
            <span className="desk-activity-label">Activity</span>
            <span className="desk-activity-count">{steps.length}</span>
            <span className="desk-activity-chevron">{showActivity ? '\u25BE' : '\u25B8'}</span>
          </button>
          {showActivity && (
            <div className="desk-activity-log" ref={activityRef}>
              {steps.map((step, i) => (
                <div key={i} className={`desk-step desk-step-${step.type}`}>
                  <span className="desk-step-icon">{STEP_ICON[step.type] || '·'}</span>
                  <span className="desk-step-text">{stepLabel(step)}</span>
                </div>
              ))}
              {isRunning && (
                <div className="desk-step desk-step-loading">
                  <span className="desk-step-icon">⏳</span>
                  <span className="desk-step-text">Working...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tasks.length === 0 && !agentResult && steps.length === 0 ? (
        <div className="desk-empty">
          <span className="desk-empty-icon">{isPM ? '📥' : '📭'}</span>
          <span className="desk-empty-text">
            {isPM
              ? 'Assign tasks from the inbox to get started'
              : 'Assign tasks here from the inbox, or have PM route them'}
          </span>
        </div>
      ) : tasks.length > 0 ? (
        <div className="desk-task-list">
          {tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onClick={isRunning || steps.length > 0 ? () => onSelectTask?.(task) : undefined}
              actions={
                <div className="desk-task-action-row">
                  <button className="desk-done-btn" onClick={() => onToggleDone(task.id)} title="Mark done">&#10003;</button>
                  {isPM && (
                    <div className="desk-route-btns">
                      {specialists.map(s => (
                        <button
                          key={s.role}
                          className="desk-route-btn"
                          style={{ '--btn-color': ROLE_COLORS[s.role] }}
                          onClick={() => onRoute(task.id, s.role)}
                          title={`Route to ${s.label}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="desk-recall-btn" onClick={() => onRecall(task.id)} title="Return to inbox">&#8592; Inbox</button>
                  <span className="desk-task-action-hover">
                    <button className="desk-delete-btn" onClick={() => onDelete(task.id)} title="Delete">&#10005;</button>
                  </span>
                </div>
              }
            />
          ))}
        </div>
      ) : null}

      {/* Agent controls */}
      {tasks.length > 0 && !isRunning && (phase === 'completed' || phase === 'error') && (
        <button className="desk-start-btn" onClick={onStartAgent} style={{ '--role-color': color }}>
          Re-run {label}
        </button>
      )}
      {isRunning && steps.length === 0 && (
        <div className="desk-running-indicator">
          <span className="desk-running-dot" style={{ background: color }} />
          Working...
        </div>
      )}
    </div>
  )
}

// ── Inbox View ──────────────────────────────────────────────────────

function InboxView({ todoTasks, inProgressTasks, completedTasks, completedCount, setTodos, search, onSearchChange, onDelegate, onRecall, onToggleDone, onDelete, onOpenAgent, agentPhases, agentSteps, agentRunning, onSelectTask }) {
  const [input, setInput] = useState('')
  const [inputDeadline, setInputDeadline] = useState('')
  const [showDeadline, setShowDeadline] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const inputRef = useRef()
  const searchRef = useRef()

  function addTask() {
    const text = input.trim()
    if (!text) return
    const todo = { id: crypto.randomUUID(), text, done: false, createdAt: Date.now() }
    if (inputDeadline) todo.deadline = new Date(inputDeadline + 'T23:59:59').getTime()
    setTodos(prev => [todo, ...prev])
    setInput('')
    setInputDeadline('')
    setShowDeadline(false)
    inputRef.current?.focus()
  }

  function toggleSearch() {
    const next = !showSearch
    setShowSearch(next)
    if (!next) onSearchChange('')
    else setTimeout(() => searchRef.current?.focus(), 50)
  }

  const totalCount = todoTasks.length + inProgressTasks.length

  return (
    <div className="office-inbox">
      <div className="office-inbox-header">
        {!showSearch ? (
          <>
            <span className="office-inbox-title">Tasks</span>
            <span className="office-inbox-count">{totalCount}</span>
          </>
        ) : (
          <div className="inbox-search-inline">
            <input
              ref={searchRef}
              className="inbox-search-input"
              placeholder="Search..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') toggleSearch() }}
            />
            {search && (
              <button className="inbox-search-clear" onClick={() => onSearchChange('')}>&#10005;</button>
            )}
          </div>
        )}
        <button
          className={`inbox-search-toggle${showSearch ? ' active' : ''}`}
          onClick={toggleSearch}
          title={showSearch ? 'Close search' : 'Search tasks'}
        >
          {showSearch ? '\u2715' : '\uD83D\uDD0D'}
        </button>
      </div>

      {/* Task input */}
      <div className="office-input-row">
        <input
          ref={inputRef}
          className="office-task-input"
          placeholder="What do you need done?"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTask() }}
        />
        <button
          className={`inbox-deadline-toggle${showDeadline ? ' active' : ''}`}
          onClick={() => setShowDeadline(v => !v)}
          title="Add deadline"
        >
          &#128197;
        </button>
        <button className="office-add-btn" onClick={addTask}>Add</button>
      </div>
      <AnimatePresence>
        {showDeadline && (
          <motion.div
            className="inbox-deadline-row"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ overflow: 'hidden' }}
          >
            <label className="inbox-deadline-label">Due date</label>
            <input
              type="date"
              className="deadline-input"
              value={inputDeadline}
              onChange={e => setInputDeadline(e.target.value)}
            />
            {inputDeadline && (
              <button className="office-search-clear" onClick={() => setInputDeadline('')} title="Clear deadline">&#10005;</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Todo section ──────────────────────────────────────── */}
      <div className="inbox-section-header">
        <span className="inbox-section-label">Todo</span>
        <span className="inbox-section-count">{todoTasks.length}</span>
      </div>
      {todoTasks.length === 0 ? (
        <div className="desk-empty" style={{ padding: '12px 0' }}>
          <span className="desk-empty-text" style={{ fontSize: 11 }}>
            {search ? 'No tasks match your search' : 'All clear!'}
          </span>
        </div>
      ) : (
        <div className="desk-task-list">
          {todoTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              actions={
                <div className="desk-task-action-row">
                  <button className="desk-done-btn" onClick={() => onToggleDone(task.id)} title="Mark done">&#10003;</button>
                  <button className="desk-delegate-btn" onClick={() => onDelegate(task.id, 'pm')}>Delegate</button>
                  <span className="desk-task-action-hover">
                    <button className="desk-delete-btn" onClick={() => onDelete(task.id)} title="Delete">&#10005;</button>
                  </span>
                </div>
              }
            />
          ))}
        </div>
      )}

      {/* ── In Progress section ───────────────────────────────── */}
      <div className="inbox-section-header">
        <span className="inbox-section-label">In Progress</span>
        <span className="inbox-section-count">{inProgressTasks.length}</span>
      </div>
      {inProgressTasks.length === 0 ? (
        <div className="desk-empty" style={{ padding: '12px 0' }}>
          <span className="desk-empty-text" style={{ fontSize: 11 }}>
            Delegate tasks to get started
          </span>
        </div>
      ) : (
        <div className="desk-task-list">
          {inProgressTasks.map(task => (
            <div key={task.id} className="task-with-agent">
              <TaskItem
                task={task}
                onClick={() => onSelectTask?.(task)}
                actions={
                  <div className="desk-task-action-row">
                    <button className="desk-done-btn" onClick={(e) => { e.stopPropagation(); onToggleDone(task.id) }} title="Mark done">&#10003;</button>
                    <span className="inbox-desk-badge" style={{ '--role-color': ROLE_COLORS[task.delegatedTo] || '#888' }}>
                      {ROLE_LABELS[task.delegatedTo] || task.delegatedTo}
                    </span>
                    <button className="desk-recall-btn" onClick={(e) => { e.stopPropagation(); onRecall(task.id) }} title="Return to todo">&#8592;</button>
                    <span className="desk-task-action-hover">
                      <button className="desk-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(task.id) }} title="Delete">&#10005;</button>
                    </span>
                  </div>
                }
              />
              {task.delegatedTo && (
                <TaskAgentStatus
                  phase={agentPhases?.[task.delegatedTo] || 'idle'}
                  steps={agentSteps?.[task.delegatedTo] || []}
                  isRunning={!!agentRunning?.[task.delegatedTo]}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Completed section ─────────────────────────────────── */}
      {completedCount > 0 && (
        <>
          <button className="inbox-section-toggle" onClick={() => setShowDone(!showDone)}>
            <span className="office-done-chevron" style={{ transform: showDone ? 'rotate(90deg)' : 'none' }}>&#9656;</span>
            <span className="inbox-section-label">Completed</span>
            <span className="inbox-section-count">{completedCount}</span>
          </button>
          <AnimatePresence>
            {showDone && (
              <motion.div
                className="office-done-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {completedTasks.map(task => (
                  <div key={task.id} className="desk-task done">
                    <div className="desk-task-row">
                      <button className="desk-undone-btn" onClick={() => onToggleDone(task.id)} title="Undo">
                        &#10003;
                      </button>
                      <span className="desk-task-text done-text">{task.text}</span>
                      <button className="desk-delete-btn" onClick={() => onDelete(task.id)} title="Delete">
                        &#10005;
                      </button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
