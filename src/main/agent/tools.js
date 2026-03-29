import { jiraGetIssue, jiraSearch, jiraListSprints, jiraGetSprint, jiraCreateIssue, jiraAddComment, jiraUpdateIssue, jiraTransitionIssue } from '../atlassian.js'
import { redashSearch, redashGetResults, redashRunQuery } from '../redash.js'
import { githubListFiles, githubReadFile, githubSearchCode, githubCreateBranch, githubCreateOrUpdateFile, githubCreatePr } from '../github.js'
import { postSlackMessage } from '../slack.js'
import { sendGmail } from '../gmail.js'
import https from 'https'
import http from 'http'

// ── Tool definitions (Claude tool_use format) ───────────────────────

const TOOL_DEFS = {
  jira_get_issue: {
    name: 'jira_get_issue',
    description: 'Read a Jira issue — returns description, comments, status, links, acceptance criteria',
    write: false,
    integration: 'jira',
    input_schema: {
      type: 'object',
      properties: {
        issue_key: { type: 'string', description: 'Jira issue key, e.g. PROJ-123' },
      },
      required: ['issue_key'],
    },
  },
  jira_search: {
    name: 'jira_search',
    description: 'Search Jira issues using JQL',
    write: false,
    integration: 'jira',
    input_schema: {
      type: 'object',
      properties: {
        jql: { type: 'string', description: 'JQL query string' },
        max_results: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['jql'],
    },
  },
  jira_list_sprints: {
    name: 'jira_list_sprints',
    description: 'List all sprints on a Jira board (active, closed, future). Use this to find a specific sprint by name before fetching its issues.',
    write: false,
    integration: 'jira',
    input_schema: {
      type: 'object',
      properties: {
        board_id: { type: 'string', description: 'Jira board ID' },
        state: { type: 'string', description: 'Filter by state: active, closed, future, or comma-separated combo (default: active,closed,future)' },
      },
      required: ['board_id'],
    },
  },
  jira_get_sprint: {
    name: 'jira_get_sprint',
    description: 'Get a sprint and its issues. Use sprint_name to find a specific sprint by name (e.g. "Sprint 42"). If neither sprint_name nor sprint_id is given, fetches the active sprint.',
    write: false,
    integration: 'jira',
    input_schema: {
      type: 'object',
      properties: {
        board_id: { type: 'string', description: 'Jira board ID' },
        sprint_id: { type: 'string', description: 'Specific sprint ID' },
        sprint_name: { type: 'string', description: 'Sprint name to search for (e.g. "Sprint 42", "March Sprint"). Matches by name on the board.' },
      },
      required: ['board_id'],
    },
  },
  jira_update_issue: {
    name: 'jira_update_issue',
    description: 'Update fields on a Jira issue (summary, priority, labels, assignee, story points, etc.)',
    write: true,
    autoApprove: true,
    integration: 'jira',
    input_schema: {
      type: 'object',
      properties: {
        issue_key: { type: 'string', description: 'Jira issue key, e.g. PROJ-123' },
        fields: { type: 'object', description: 'Fields to update, e.g. { "summary": "New title", "priority": { "name": "High" }, "labels": ["backend"] }' },
      },
      required: ['issue_key', 'fields'],
    },
  },
  jira_transition_issue: {
    name: 'jira_transition_issue',
    description: 'Move a Jira issue to a different status (e.g. "In Progress", "Done", "To Do")',
    write: true,
    autoApprove: true,
    integration: 'jira',
    input_schema: {
      type: 'object',
      properties: {
        issue_key: { type: 'string', description: 'Jira issue key' },
        transition: { type: 'string', description: 'Target status name, e.g. "In Progress", "Done"' },
      },
      required: ['issue_key', 'transition'],
    },
  },
  jira_create_issue: {
    name: 'jira_create_issue',
    description: 'Create a new Jira issue',
    write: true,
    autoApprove: false,
    integration: 'jira',
    input_schema: {
      type: 'object',
      properties: {
        project_key: { type: 'string', description: 'Jira project key, e.g. PROJ' },
        summary: { type: 'string', description: 'Issue title' },
        description: { type: 'string', description: 'Issue description text' },
        issue_type: { type: 'string', description: 'Issue type (default: Story)' },
      },
      required: ['project_key', 'summary', 'description'],
    },
  },
  jira_add_comment: {
    name: 'jira_add_comment',
    description: 'Add a comment to a Jira issue',
    write: true,
    autoApprove: true,
    integration: 'jira',
    input_schema: {
      type: 'object',
      properties: {
        issue_key: { type: 'string', description: 'Jira issue key' },
        comment: { type: 'string', description: 'Comment text' },
      },
      required: ['issue_key', 'comment'],
    },
  },
  github_list_files: {
    name: 'github_list_files',
    description: 'List files/directories in a GitHub repo path',
    write: false,
    integration: 'github',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'Directory path (default: root)' },
        ref: { type: 'string', description: 'Branch/tag/SHA (default: default branch)' },
      },
      required: ['owner', 'repo'],
    },
  },
  github_read_file: {
    name: 'github_read_file',
    description: 'Read a file from a GitHub repository',
    write: false,
    integration: 'github',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path' },
        ref: { type: 'string', description: 'Branch/tag/SHA (default: default branch)' },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
  github_search_code: {
    name: 'github_search_code',
    description: 'Search code across GitHub repositories',
    write: false,
    integration: 'github',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        org: { type: 'string', description: 'Limit to organization (optional)' },
      },
      required: ['query'],
    },
  },
  github_create_branch: {
    name: 'github_create_branch',
    description: 'Create a new branch from a base branch',
    write: true,
    autoApprove: true,
    integration: 'github',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        branch_name: { type: 'string', description: 'New branch name' },
        base_branch: { type: 'string', description: 'Base branch (default: main)' },
      },
      required: ['owner', 'repo', 'branch_name'],
    },
  },
  github_create_or_update_file: {
    name: 'github_create_or_update_file',
    description: 'Create or update a file on a branch in a GitHub repo',
    write: true,
    autoApprove: true,
    integration: 'github',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'File path in the repo' },
        content: { type: 'string', description: 'File content' },
        message: { type: 'string', description: 'Commit message' },
        branch: { type: 'string', description: 'Target branch' },
        sha: { type: 'string', description: 'Current SHA if updating existing file' },
      },
      required: ['owner', 'repo', 'path', 'content', 'message', 'branch'],
    },
  },
  github_create_pr: {
    name: 'github_create_pr',
    description: 'Open a pull request on GitHub',
    write: true,
    autoApprove: false,
    integration: 'github',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        head: { type: 'string', description: 'Source branch' },
        base: { type: 'string', description: 'Target branch (default: main)' },
      },
      required: ['owner', 'repo', 'title', 'body', 'head'],
    },
  },
  redash_search: {
    name: 'redash_search',
    description: 'Search Redash queries by keyword',
    write: false,
    integration: 'redash',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword' },
      },
      required: ['query'],
    },
  },
  redash_get_results: {
    name: 'redash_get_results',
    description: 'Fetch cached results of a Redash query',
    write: false,
    integration: 'redash',
    input_schema: {
      type: 'object',
      properties: {
        query_id: { type: 'number', description: 'Redash query ID' },
      },
      required: ['query_id'],
    },
  },
  redash_run_query: {
    name: 'redash_run_query',
    description: 'Execute a Redash query with optional parameters',
    write: false,
    integration: 'redash',
    input_schema: {
      type: 'object',
      properties: {
        query_id: { type: 'number', description: 'Redash query ID' },
        parameters: { type: 'object', description: 'Query parameters (optional)' },
      },
      required: ['query_id'],
    },
  },
  slack_post_message: {
    name: 'slack_post_message',
    description: 'Send a message to a Slack channel or thread',
    write: true,
    autoApprove: false,
    integration: 'slack',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID' },
        text: { type: 'string', description: 'Message text' },
        thread_ts: { type: 'string', description: 'Thread timestamp (optional, for replies)' },
      },
      required: ['channel', 'text'],
    },
  },
  gmail_send: {
    name: 'gmail_send',
    description: 'Send an email via Gmail',
    write: true,
    autoApprove: false,
    integration: 'gmail',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  fetch_url: {
    name: 'fetch_url',
    description: 'Fetch the text content of a web page or document. Use this to read PRDs, docs, articles, or any web content linked in a task. Returns plain text (HTML tags stripped). ALWAYS use this when a task contains a URL.',
    write: false,
    integration: null,
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
      },
      required: ['url'],
    },
  },
  delegate_to_specialist: {
    name: 'delegate_to_specialist',
    description: 'Delegate a sub-task to a specialist. Use this to route work to the right team member.',
    write: false,
    integration: null,
    input_schema: {
      type: 'object',
      properties: {
        specialist: { type: 'string', enum: ['architect', 'developer', 'analyst', 'qa'], description: 'Which specialist to delegate to' },
        task_summary: { type: 'string', description: 'What the specialist should do' },
        context: { type: 'string', description: 'Relevant context (Jira keys, repos, data needs)' },
      },
      required: ['specialist', 'task_summary'],
    },
  },
}

// ── Tool scoping per agent type ─────────────────────────────────────

const INTERNAL_TOOLS = ['delegate_to_specialist']
const INTEGRATION_TOOLS = Object.keys(TOOL_DEFS).filter(n => !INTERNAL_TOOLS.includes(n))

const AGENT_TOOLS = {
  'generic':       INTEGRATION_TOOLS,
  'pm':            [...INTEGRATION_TOOLS, 'delegate_to_specialist'],
  'review-prd':    ['jira_get_issue', 'github_list_files', 'github_read_file', 'redash_search', 'redash_get_results', 'fetch_url'],
  'create-prd':    ['jira_get_issue', 'jira_search', 'jira_create_issue', 'github_list_files', 'github_read_file', 'github_search_code', 'redash_search', 'redash_get_results', 'redash_run_query', 'fetch_url'],
  'review-sprint': ['jira_list_sprints', 'jira_get_sprint', 'jira_search', 'jira_get_issue', 'jira_add_comment', 'jira_update_issue', 'jira_transition_issue', 'github_read_file'],
  'implement-prd': ['jira_get_issue', 'jira_update_issue', 'jira_transition_issue', 'jira_add_comment', 'github_list_files', 'github_read_file', 'github_search_code', 'github_create_branch', 'github_create_or_update_file', 'github_create_pr', 'redash_search', 'redash_get_results', 'fetch_url'],
  'lookup-reply':  ['redash_search', 'redash_get_results', 'redash_run_query', 'jira_search', 'jira_get_issue', 'github_read_file', 'slack_post_message', 'gmail_send', 'fetch_url'],
}

export function getToolsForAgent(agentType) {
  const toolNames = AGENT_TOOLS[agentType] || []
  return toolNames.map(name => TOOL_DEFS[name]).filter(Boolean)
}

// Check which integrations have valid credentials
function getAvailableIntegrations(settings) {
  const available = new Set([null])  // null = no integration needed (fetch_url, delegate)
  if (settings?.atlassianDomain && settings?.atlassianEmail && settings?.atlassianApiToken) available.add('jira')
  if (settings?.githubToken) available.add('github')
  if (settings?.redashUrl && settings?.redashApiKey) available.add('redash')
  if (settings?.slackUserToken || settings?.slackToken) available.add('slack')
  if (settings?.gmailTokens?.refresh_token) available.add('gmail')
  return available
}

export function getToolDefsForClaude(agentType, settings) {
  const tools = getToolsForAgent(agentType)
  // If settings provided, filter out tools for unconfigured integrations
  if (settings) {
    const available = getAvailableIntegrations(settings)
    const filtered = tools.filter(t => available.has(t.integration))
    if (filtered.length < tools.length) {
      const dropped = tools.filter(t => !available.has(t.integration)).map(t => t.name)
      console.log(`[agent] dropped tools (missing creds): ${dropped.join(', ')}`)
    }
    return filtered.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  }
  return tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
}

export function isWriteTool(toolName) {
  return TOOL_DEFS[toolName]?.write === true
}

export function isAutoApprovable(toolName) {
  return TOOL_DEFS[toolName]?.autoApprove === true
}

// ── Tool execution ──────────────────────────────────────────────────

export async function executeTool(toolName, input, settings) {
  const jira = () => ({
    domain: settings.atlassianDomain,
    email: settings.atlassianEmail,
    token: settings.atlassianApiToken,
  })
  const gh = () => settings.githubToken
  const rd = () => ({ url: settings.redashUrl, key: settings.redashApiKey })

  switch (toolName) {
    // Jira
    case 'jira_get_issue': {
      const { domain, email, token } = jira()
      return jiraGetIssue(domain, email, token, input.issue_key)
    }
    case 'jira_search': {
      const { domain, email, token } = jira()
      return jiraSearch(domain, email, token, input.jql, input.max_results)
    }
    case 'jira_list_sprints': {
      const { domain, email, token } = jira()
      return jiraListSprints(domain, email, token, input.board_id, input.state)
    }
    case 'jira_get_sprint': {
      const { domain, email, token } = jira()
      return jiraGetSprint(domain, email, token, input.board_id, input.sprint_id, input.sprint_name)
    }
    case 'jira_create_issue': {
      const { domain, email, token } = jira()
      return jiraCreateIssue(domain, email, token, {
        projectKey: input.project_key,
        summary: input.summary,
        description: input.description,
        issueType: input.issue_type,
      })
    }
    case 'jira_add_comment': {
      const { domain, email, token } = jira()
      return jiraAddComment(domain, email, token, input.issue_key, input.comment)
    }
    case 'jira_update_issue': {
      const { domain, email, token } = jira()
      return jiraUpdateIssue(domain, email, token, input.issue_key, input.fields)
    }
    case 'jira_transition_issue': {
      const { domain, email, token } = jira()
      return jiraTransitionIssue(domain, email, token, input.issue_key, input.transition)
    }

    // GitHub
    case 'github_list_files':
      return githubListFiles(gh(), input.owner, input.repo, input.path || '', input.ref || '')
    case 'github_read_file':
      return githubReadFile(gh(), input.owner, input.repo, input.path, input.ref || '')
    case 'github_search_code':
      return githubSearchCode(gh(), input.query, input.org || settings.githubOrg || '')
    case 'github_create_branch':
      return githubCreateBranch(gh(), input.owner, input.repo, input.branch_name, input.base_branch || 'main')
    case 'github_create_or_update_file':
      return githubCreateOrUpdateFile(gh(), input.owner, input.repo, input.path, {
        content: input.content,
        message: input.message,
        branch: input.branch,
        sha: input.sha || null,
      })
    case 'github_create_pr':
      return githubCreatePr(gh(), input.owner, input.repo, {
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base || 'main',
      })

    // Redash
    case 'redash_search': {
      const { url, key } = rd()
      return redashSearch(url, key, input.query)
    }
    case 'redash_get_results': {
      const { url, key } = rd()
      return redashGetResults(url, key, input.query_id)
    }
    case 'redash_run_query': {
      const { url, key } = rd()
      return redashRunQuery(url, key, input.query_id, input.parameters || {})
    }

    // Slack
    case 'slack_post_message': {
      const token = settings.slackUserToken || settings.slackToken
      if (!token) throw new Error('No Slack token configured')
      return postSlackMessage(token, input.channel, input.text, input.thread_ts)
    }

    // Gmail
    case 'gmail_send': {
      if (!settings.gmailTokens?.refresh_token) throw new Error('Gmail not connected')
      return sendGmail(settings.gmailTokens, input.to, input.subject, input.body)
    }

    // URL fetch
    case 'fetch_url':
      return fetchUrlContent(input.url)

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

// ── URL fetcher ────────────────────────────────────────────────────

function httpGet(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out (15s)')), 15000)
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'WallE-Agent/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
        clearTimeout(timer)
        const next = new URL(res.headers.location, url).href
        return httpGet(next, maxRedirects - 1).then(resolve, reject)
      }
      if (res.statusCode >= 400) { clearTimeout(timer); reject(new Error(`HTTP ${res.statusCode}`)); return }
      let body = ''
      res.on('data', d => (body += d))
      res.on('end', () => { clearTimeout(timer); resolve(body) })
      res.on('error', e => { clearTimeout(timer); reject(e) })
    }).on('error', e => { clearTimeout(timer); reject(e) })
  })
}

async function fetchUrlContent(url) {
  let html
  if (typeof globalThis.fetch === 'function') {
    try {
      const res = await globalThis.fetch(url, {
        headers: { 'User-Agent': 'WallE-Agent/1.0', 'Accept': 'text/html,application/json,text/plain,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      html = await res.text()
    } catch {
      html = await httpGet(url)
    }
  } else {
    html = await httpGet(url)
  }
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  const MAX_CHARS = 15000
  if (text.length > MAX_CHARS) {
    return text.slice(0, MAX_CHARS) + '\n\n[... truncated — content exceeds 15,000 characters]'
  }
  return text || '[Page returned no readable text content]'
}
