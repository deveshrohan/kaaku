// ── Agent run evaluation ──────────────────────────────────────────
// Auto-scores each completed/failed run. Called after run terminates.
// Scores are stored on the run object as `eval` for dashboard display.

const STUCK_TIMEOUT_MS = 60 * 60 * 1000  // 1 hour

// Score a completed run — returns an eval object
export function scoreRun(run) {
  const steps   = run.steps || []
  const drafts  = run.drafts || []
  const status  = run.status

  // ── Duration ────────────────────────────────────────────────
  const durationMs = (run.updatedAt || run.createdAt) - run.createdAt
  const durationS  = durationMs / 1000

  // ── Tool metrics ────────────────────────────────────────────
  const toolCalls  = steps.filter(s => s.type === 'tool_call')
  const toolErrors = steps.filter(s => s.type === 'tool_error')
  const toolSuccesses = steps.filter(s => s.type === 'tool_result')
  const toolErrorRate = toolCalls.length > 0
    ? toolErrors.length / toolCalls.length
    : 0

  // Which tools failed?
  const failedTools = {}
  for (const s of toolErrors) {
    const tool = s.tool || 'unknown'
    failedTools[tool] = (failedTools[tool] || 0) + 1
  }

  // ── Draft metrics ───────────────────────────────────────────
  const approved = drafts.filter(d => d.approved === true)
  const rejected = drafts.filter(d => d.approved === false)
  const pending  = drafts.filter(d => d.approved === null)
  const draftApprovalRate = drafts.length > 0
    ? approved.length / drafts.length
    : null  // no drafts = not applicable

  // ── Iteration count ─────────────────────────────────────────
  const llmCalls = steps.filter(s => s.type === 'llm_call').length

  // ── Outcome ─────────────────────────────────────────────────
  const hasResult = !!(run.result && run.result.length > 0)
  const hasError  = !!(run.error && run.error.length > 0)

  // ── Composite score (0-100) ─────────────────────────────────
  // Weighted: completion(40) + tool success(25) + draft approval(20) + efficiency(15)
  let score = 0

  // Completion: did it finish successfully?
  if (status === 'completed' && hasResult) score += 40
  else if (status === 'completed') score += 20
  else if (status === 'failed') score += 0

  // Tool success rate
  score += 25 * (1 - toolErrorRate)

  // Draft approval rate (if applicable)
  if (draftApprovalRate !== null) {
    score += 20 * draftApprovalRate
  } else {
    score += 20  // no drafts needed = full marks
  }

  // Efficiency: fewer LLM iterations = better (1 call = perfect, 10+ = 0)
  const efficiencyScore = Math.max(0, 1 - (llmCalls - 1) / 9)
  score += 15 * efficiencyScore

  return {
    score:              Math.round(score),
    status,
    durationS:          Math.round(durationS * 10) / 10,
    llmCalls,
    toolCalls:          toolCalls.length,
    toolErrors:         toolErrors.length,
    toolErrorRate:      Math.round(toolErrorRate * 100),
    failedTools,
    draftsTotal:        drafts.length,
    draftsApproved:     approved.length,
    draftsRejected:     rejected.length,
    draftsPending:      pending.length,
    draftApprovalRate:  draftApprovalRate !== null ? Math.round(draftApprovalRate * 100) : null,
    hasResult,
    scoredAt:           Date.now(),
  }
}

// Detect and mark stuck runs
export function detectStuckRuns(runs) {
  const now = Date.now()
  const stuckIds = []
  for (const run of runs) {
    if (run.status !== 'running' && run.status !== 'awaiting-approval') continue
    const age = now - (run.updatedAt || run.createdAt)
    if (age > STUCK_TIMEOUT_MS) {
      stuckIds.push(run.id)
    }
  }
  return stuckIds
}

// Aggregate eval stats across all scored runs
export function aggregateEvals(runs) {
  const scored = runs.filter(r => r.eval)
  if (scored.length === 0) return null

  const byType = {}
  let totalScore = 0
  let totalDuration = 0
  let totalToolErrors = 0
  let totalToolCalls = 0
  let totalDraftsApproved = 0
  let totalDraftsRejected = 0
  let totalDrafts = 0
  const failedToolsAgg = {}

  for (const r of scored) {
    const e = r.eval
    totalScore += e.score
    totalDuration += e.durationS
    totalToolErrors += e.toolErrors
    totalToolCalls += e.toolCalls
    totalDraftsApproved += e.draftsApproved
    totalDraftsRejected += e.draftsRejected
    totalDrafts += e.draftsTotal

    for (const [tool, count] of Object.entries(e.failedTools || {})) {
      failedToolsAgg[tool] = (failedToolsAgg[tool] || 0) + count
    }

    const type = r.type || 'unknown'
    if (!byType[type]) byType[type] = { runs: 0, totalScore: 0, completed: 0, failed: 0 }
    byType[type].runs++
    byType[type].totalScore += e.score
    if (r.status === 'completed') byType[type].completed++
    if (r.status === 'failed') byType[type].failed++
  }

  // Sort failed tools by count
  const topFailedTools = Object.entries(failedToolsAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Per-type averages
  const byTypeAvg = {}
  for (const [type, data] of Object.entries(byType)) {
    byTypeAvg[type] = {
      runs:       data.runs,
      avgScore:   Math.round(data.totalScore / data.runs),
      successRate: Math.round((data.completed / data.runs) * 100),
    }
  }

  return {
    totalRuns:        scored.length,
    avgScore:         Math.round(totalScore / scored.length),
    avgDurationS:     Math.round(totalDuration / scored.length * 10) / 10,
    toolErrorRate:    totalToolCalls > 0 ? Math.round((totalToolErrors / totalToolCalls) * 100) : 0,
    draftApprovalRate: totalDrafts > 0 ? Math.round((totalDraftsApproved / totalDrafts) * 100) : 0,
    draftRejectionRate: totalDrafts > 0 ? Math.round((totalDraftsRejected / totalDrafts) * 100) : 0,
    topFailedTools,
    byType:           byTypeAvg,
  }
}
