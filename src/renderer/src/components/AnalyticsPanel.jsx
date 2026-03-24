import { useState, useEffect, useMemo } from 'react'

// ── Helpers ──────────────────────────────────────────────────────────

const DAY_MS  = 86400000
const HOUR_MS = 3600000
const WEEK_MS = 7 * DAY_MS

function fmtDuration(ms) {
  if (ms <= 0) return '0m'
  const days  = Math.floor(ms / DAY_MS)
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS)
  const mins  = Math.floor((ms % HOUR_MS) / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function pct(n, total) {
  if (total === 0) return 0
  return Math.round((n / total) * 100)
}

function getWeekLabel(weeksAgo) {
  if (weeksAgo === 0) return 'This week'
  if (weeksAgo === 1) return 'Last week'
  return `${weeksAgo}w ago`
}

// ── Summary Cards ────────────────────────────────────────────────────

function SummaryCards({ total, completed, pending, overdue, completionRate }) {
  const cards = [
    { label: 'Total',      value: total,          color: 'var(--text-primary)' },
    { label: 'Completed',  value: completed,      color: 'var(--color-success)' },
    { label: 'Pending',    value: pending,         color: 'var(--color-info)' },
    { label: 'Overdue',    value: overdue,         color: 'var(--color-error)' },
    { label: 'Done %',     value: `${completionRate}%`, color: 'var(--accent)' },
  ]
  return (
    <div className="ap-cards-row">
      {cards.map(c => (
        <div key={c.label} className="ap-card">
          <span className="ap-card-value" style={{ color: c.color }}>{c.value}</span>
          <span className="ap-card-label">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Source Breakdown ─────────────────────────────────────────────────

function SourceBreakdown({ slack, gmail, manual, total }) {
  const slackPct  = pct(slack, total)
  const gmailPct  = pct(gmail, total)
  const manualPct = 100 - slackPct - gmailPct
  return (
    <div className="ap-section">
      <div className="ap-section-title">Source Breakdown</div>
      <div className="ap-stacked-bar">
        {slack > 0 && (
          <div
            className="ap-bar-seg"
            style={{ width: `${slackPct}%`, background: '#E01E5A' }}
            title={`Slack: ${slack}`}
          />
        )}
        {gmail > 0 && (
          <div
            className="ap-bar-seg"
            style={{ width: `${gmailPct}%`, background: '#EA4335' }}
            title={`Gmail: ${gmail}`}
          />
        )}
        {manual > 0 && (
          <div
            className="ap-bar-seg"
            style={{ width: `${Math.max(manualPct, 0)}%`, background: 'var(--text-tertiary)' }}
            title={`Manual: ${manual}`}
          />
        )}
      </div>
      <div className="ap-legend">
        <span className="ap-legend-item"><span className="ap-legend-dot" style={{ background: '#E01E5A' }} />Slack {slack}</span>
        <span className="ap-legend-item"><span className="ap-legend-dot" style={{ background: '#EA4335' }} />Gmail {gmail}</span>
        <span className="ap-legend-item"><span className="ap-legend-dot" style={{ background: 'var(--text-tertiary)' }} />Manual {manual}</span>
      </div>
    </div>
  )
}

// ── Priority Distribution ───────────────────────────────────────────

function PriorityDistribution({ high, medium, low }) {
  const max = Math.max(high, medium, low, 1)
  const bars = [
    { label: 'High',   count: high,   color: 'var(--priority-high)' },
    { label: 'Medium', count: medium, color: 'var(--priority-medium)' },
    { label: 'Low',    count: low,    color: 'var(--priority-low)' },
  ]
  return (
    <div className="ap-section">
      <div className="ap-section-title">Priority Distribution</div>
      <div className="ap-priority-bars">
        {bars.map(b => (
          <div key={b.label} className="ap-priority-row">
            <span className="ap-priority-label">{b.label}</span>
            <div className="ap-priority-track">
              <div
                className="ap-priority-fill"
                style={{ width: `${pct(b.count, max)}%`, background: b.color }}
              />
            </div>
            <span className="ap-priority-count" style={{ color: b.color }}>{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Weekly Throughput ────────────────────────────────────────────────

function WeeklyThroughput({ weeks }) {
  const maxCount = Math.max(...weeks.map(w => w.count), 1)
  return (
    <div className="ap-section">
      <div className="ap-section-title">Weekly Throughput</div>
      <div className="ap-week-chart">
        {weeks.map((w, i) => (
          <div key={i} className="ap-week-col">
            <span className="ap-week-count">{w.count}</span>
            <div className="ap-week-bar-track">
              <div
                className="ap-week-bar"
                style={{ height: `${pct(w.count, maxCount)}%` }}
              />
            </div>
            <span className="ap-week-label">{w.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Response Time ───────────────────────────────────────────────────

function ResponseTime({ avgMs, count }) {
  return (
    <div className="ap-section">
      <div className="ap-section-title">Response Time</div>
      <div className="ap-response-row">
        <div className="ap-response-stat">
          <span className="ap-response-value">{count > 0 ? fmtDuration(avgMs) : '--'}</span>
          <span className="ap-response-label">avg. creation to completion</span>
        </div>
        <span className="ap-response-meta">{count} task{count !== 1 ? 's' : ''} measured</span>
      </div>
    </div>
  )
}

// ── Agent Performance ───────────────────────────────────────────────

function AgentPerformance({ runs }) {
  const total     = runs.length
  const completed = runs.filter(r => r.status === 'completed').length
  const failed    = runs.filter(r => r.status === 'failed').length
  const other     = total - completed - failed
  const successRate = total > 0 ? pct(completed, total) : 0

  return (
    <div className="ap-section">
      <div className="ap-section-title">Agent Performance</div>
      {total === 0 ? (
        <div className="ap-empty-hint">No agent runs yet</div>
      ) : (
        <>
          <div className="ap-agent-row">
            <div className="ap-agent-stat">
              <span className="ap-agent-value" style={{ color: 'var(--color-success)' }}>{completed}</span>
              <span className="ap-agent-label">completed</span>
            </div>
            <div className="ap-agent-stat">
              <span className="ap-agent-value" style={{ color: 'var(--color-error)' }}>{failed}</span>
              <span className="ap-agent-label">failed</span>
            </div>
            <div className="ap-agent-stat">
              <span className="ap-agent-value" style={{ color: 'var(--text-secondary)' }}>{other}</span>
              <span className="ap-agent-label">other</span>
            </div>
            <div className="ap-agent-stat">
              <span className="ap-agent-value" style={{ color: 'var(--accent)' }}>{successRate}%</span>
              <span className="ap-agent-label">success</span>
            </div>
          </div>
          <div className="ap-agent-bar-track">
            {completed > 0 && <div className="ap-bar-seg" style={{ width: `${pct(completed, total)}%`, background: 'var(--color-success)' }} />}
            {failed > 0    && <div className="ap-bar-seg" style={{ width: `${pct(failed, total)}%`, background: 'var(--color-error)' }} />}
            {other > 0     && <div className="ap-bar-seg" style={{ width: `${pct(other, total)}%`, background: 'var(--text-muted)' }} />}
          </div>
        </>
      )}
    </div>
  )
}

// ── Top Sources ─────────────────────────────────────────────────────

function TopSources({ senders }) {
  if (senders.length === 0) return null
  const maxCount = senders[0].count
  return (
    <div className="ap-section">
      <div className="ap-section-title">Top Sources</div>
      <div className="ap-top-senders">
        {senders.map((s, i) => (
          <div key={s.name} className="ap-sender-row">
            <span className="ap-sender-rank">{i + 1}</span>
            <span className="ap-sender-name">{s.name}</span>
            <div className="ap-sender-bar-track">
              <div
                className="ap-sender-bar"
                style={{ width: `${pct(s.count, maxCount)}%` }}
              />
            </div>
            <span className="ap-sender-count">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────

export default function AnalyticsPanel({ todos }) {
  const [agentRuns, setAgentRuns] = useState([])

  useEffect(() => {
    window.wallE?.listAgentRuns().then(r => {
      if (Array.isArray(r)) setAgentRuns(r)
    })
  }, [])

  // ── Summary metrics ─────────────────────────────────────────────
  const summary = useMemo(() => {
    const total     = todos.length
    const completed = todos.filter(t => t.done).length
    const pending   = total - completed
    const now       = Date.now()
    const overdue   = todos.filter(t => !t.done && t.deadline && t.deadline < now).length
    const completionRate = pct(completed, total)
    return { total, completed, pending, overdue, completionRate }
  }, [todos])

  // ── Source breakdown ────────────────────────────────────────────
  const sources = useMemo(() => {
    let slack = 0, gmail = 0, manual = 0
    for (const t of todos) {
      if (t.source === 'slack')      slack++
      else if (t.source === 'gmail') gmail++
      else                           manual++
    }
    return { slack, gmail, manual, total: todos.length }
  }, [todos])

  // ── Priority distribution ──────────────────────────────────────
  const priorities = useMemo(() => {
    let high = 0, medium = 0, low = 0
    for (const t of todos) {
      if (t.priority === 'high')        high++
      else if (t.priority === 'medium') medium++
      else                              low++
    }
    return { high, medium, low }
  }, [todos])

  // ── Weekly throughput (last 4 weeks) ───────────────────────────
  const weeklyData = useMemo(() => {
    const now = Date.now()
    const weeks = [0, 1, 2, 3].map(weeksAgo => {
      const weekEnd   = now - weeksAgo * WEEK_MS
      const weekStart = weekEnd - WEEK_MS
      const count = todos.filter(t => {
        if (!t.done) return false
        const ts = t.completedAt || t.createdAt || 0
        return ts >= weekStart && ts < weekEnd
      }).length
      return { label: getWeekLabel(weeksAgo), count }
    })
    return weeks.reverse()
  }, [todos])

  // ── Response time ──────────────────────────────────────────────
  const responseTime = useMemo(() => {
    const measured = todos.filter(t => t.done && t.completedAt && t.createdAt)
    if (measured.length === 0) return { avgMs: 0, count: 0 }
    const totalMs = measured.reduce((sum, t) => sum + (t.completedAt - t.createdAt), 0)
    return { avgMs: Math.round(totalMs / measured.length), count: measured.length }
  }, [todos])

  // ── Top senders ────────────────────────────────────────────────
  const topSenders = useMemo(() => {
    const map = {}
    for (const t of todos) {
      const sender = t.from || t.gmailFrom
      if (!sender) continue
      map[sender] = (map[sender] || 0) + 1
    }
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [todos])

  return (
    <div
      className="todo-panel"
    >
      {/* Header */}
      <div className="todo-header">
        <div className="todo-title-group">
          <span className="todo-title">Insights</span>
          <span className="ap-header-summary">{summary.total} tasks · {summary.completionRate}% done</span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="ap-body">
        <SummaryCards {...summary} />
        <SourceBreakdown {...sources} />
        <PriorityDistribution {...priorities} />
        <WeeklyThroughput weeks={weeklyData} />
        <ResponseTime {...responseTime} />
        <AgentPerformance runs={agentRuns} />
        <TopSources senders={topSenders} />
      </div>

    </div>
  )
}
