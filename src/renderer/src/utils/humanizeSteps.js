// ── Human-readable step descriptions for the agent step log ─────────

const WRITE_TOOLS = new Set([
  'jira_create_issue', 'jira_add_comment',
  'github_create_branch', 'github_create_or_update_file', 'github_create_pr',
  'slack_post_message', 'gmail_send',
])

// ── Humanize a tool_call step into a friendly description ───────────

export function humanizeStep(step) {
  const input = step.input || {}
  switch (step.tool) {
    case 'jira_get_issue':      return `Reading Jira ticket ${input.issue_key || ''}...`
    case 'jira_search':         return `Searching Jira: ${(input.jql || '').slice(0, 60)}${(input.jql || '').length > 60 ? '...' : ''}`
    case 'jira_list_sprints':   return `Listing sprints on board ${input.board_id || ''}...`
    case 'jira_get_sprint':     return `Fetching sprint${input.sprint_name ? ': ' + input.sprint_name : ''} from board ${input.board_id || ''}...`
    case 'jira_create_issue':   return `Creating Jira issue in ${input.project_key || ''}: ${(input.summary || '').slice(0, 50)}`
    case 'jira_add_comment':    return `Commenting on ${input.issue_key || ''}...`
    case 'github_list_files':   return `Browsing ${input.owner || ''}/${input.repo || ''}/${input.path || ''}`
    case 'github_read_file':    return `Reading ${input.owner || ''}/${input.repo || ''}/${input.path || ''}`
    case 'github_search_code':  return `Searching code: ${(input.query || '').slice(0, 50)}`
    case 'github_create_branch':return `Creating branch ${input.branch_name || ''} in ${input.owner || ''}/${input.repo || ''}`
    case 'github_create_or_update_file': return `Writing ${input.path || ''} on ${input.branch || ''}`
    case 'github_create_pr':    return `Opening PR: ${(input.title || '').slice(0, 50)}`
    case 'redash_search':       return `Searching Redash for '${(input.query || '').slice(0, 40)}'...`
    case 'redash_get_results':  return `Fetching Redash query #${input.query_id || ''} results...`
    case 'redash_run_query':    return `Running Redash query #${input.query_id || ''}...`
    case 'slack_post_message':  return `Sending Slack message to ${input.channel || ''}...`
    case 'gmail_send':          return `Sending email to ${input.to || ''}...`
    default:                    return null  // fall back to raw display
  }
}

// ── Humanize a tool_result into a friendly summary ──────────────────

export function humanizeResult(toolName, resultStr) {
  if (!resultStr) return null
  try {
    const data = JSON.parse(resultStr)
    switch (toolName) {
      case 'jira_get_issue':
        if (data.summary) return `Found: ${data.summary}${data.priority ? ` (${data.priority})` : ''}${data.status ? ` — ${data.status}` : ''}`
        break
      case 'jira_search':
        if (Array.isArray(data)) return `Found ${data.length} issue${data.length !== 1 ? 's' : ''}`
        if (data.total != null) return `Found ${data.total} issue${data.total !== 1 ? 's' : ''}`
        break
      case 'jira_get_sprint':
        if (data.sprint) return `${data.sprint.name || 'Sprint'} — ${(data.issues || []).length} issues`
        break
      case 'jira_list_sprints':
        if (Array.isArray(data)) return `${data.length} sprint${data.length !== 1 ? 's' : ''} found`
        break
      case 'jira_create_issue':
        if (data.key) return `Created ${data.key}`
        break
      case 'jira_add_comment':
        return 'Comment added'
      case 'github_list_files':
        if (Array.isArray(data)) return `${data.length} file${data.length !== 1 ? 's' : ''}/directories`
        break
      case 'github_read_file': {
        const lines = (typeof data === 'string' ? data : '').split('\n').length
        return `Read file (${lines} line${lines !== 1 ? 's' : ''})`
      }
      case 'github_search_code':
        if (data.total_count != null) return `Found ${data.total_count} code match${data.total_count !== 1 ? 'es' : ''}`
        if (Array.isArray(data.items)) return `Found ${data.items.length} code match${data.items.length !== 1 ? 'es' : ''}`
        break
      case 'redash_search':
        if (Array.isArray(data)) return `Found ${data.length} matching quer${data.length !== 1 ? 'ies' : 'y'}`
        break
      case 'redash_get_results':
      case 'redash_run_query':
        if (data.query_result?.data?.rows) return `Query returned ${data.query_result.data.rows.length} rows`
        if (Array.isArray(data.rows)) return `Query returned ${data.rows.length} rows`
        break
    }
  } catch {
    // Not JSON — fall through
  }
  return null  // fall back to truncated display
}

// ── Summarize thinking content ──────────────────────────────────────

export function humanizeThinking(content) {
  if (!content) return ''
  // First sentence or first line, whichever is shorter
  const firstLine = content.split('\n')[0]
  const firstSentence = content.match(/^[^.!?]*[.!?]/)?.[0] || firstLine
  const summary = firstSentence.length < firstLine.length ? firstSentence : firstLine
  return summary.length > 120 ? summary.slice(0, 120) + '...' : summary
}

// ── Derive current phase from step history ──────────────────────────

export function derivePhase(steps, status) {
  if (status === 'awaiting-approval') return 'Waiting for your approval'
  if (status === 'awaiting-reply') return 'Waiting for your reply'
  if (!steps || steps.length === 0) return 'Starting up...'

  // Look at the last few non-llm_call steps
  const recent = steps.filter(s => s.type !== 'llm_call').slice(-3)
  if (recent.length === 0) return 'Starting up...'

  const lastStep = recent[recent.length - 1]

  if (lastStep.type === 'draft_approved' || lastStep.type === 'draft_rejected') return 'Processing approval'
  if (lastStep.type === 'tool_error') return 'Handling error'

  const hasWriteCall = recent.some(s => s.type === 'tool_call' && WRITE_TOOLS.has(s.tool))
  if (hasWriteCall) return 'Taking action'

  const hasReadCall = recent.some(s => s.type === 'tool_call' || s.type === 'tool_result')
  const hasThinking = recent.some(s => s.type === 'thinking')

  if (hasThinking && !hasReadCall) return 'Analyzing'
  if (hasReadCall) return 'Gathering information'
  if (hasThinking) return 'Thinking'

  return 'Working'
}
