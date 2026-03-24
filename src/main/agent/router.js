// ── Intent router — classifies natural language into agent types ──────
// Tries fast regex heuristics first, falls back to a sensible default.

const AGENT_ROUTES = [
  {
    type: 'review-prd',
    label: 'Reviewing PRD',
    icon: '🔍',
    triggers: [
      /review\s+(?:the\s+)?(?:prd|product\s+req)/i,
      /analyze\s+(?:the\s+)?(?:prd|product\s+req)/i,
      /check\s+(?:the\s+)?(?:prd|product\s+req)/i,
      /prd\s+review/i,
      /look\s+at\s+(?:the\s+)?prd/i,
      /review\s+[A-Z][A-Z0-9]+-\d+/i,
      /(?:review|check|audit)\s+(?:the\s+)?(?:design\s+doc|spec|requirements?)/i,
      /gap\s+analysis/i,
    ],
    extract(query) {
      const m = query.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)
      return m ? { jiraKey: m[1] } : {}
    },
  },
  {
    type: 'create-prd',
    label: 'Creating PRD',
    icon: '📝',
    triggers: [
      /(?:create|write|draft|make)\s+(?:a\s+)?(?:prd|product\s+req)/i,
      /new\s+prd/i,
      /(?:spec|scope)\s+(?:out|document)/i,
      /(?:write|create|draft)\s+(?:a\s+)?(?:design\s+doc|technical?\s+spec|rfp|rfc)/i,
    ],
    extract(query) {
      const projMatch = query.match(/\b(?:in|project|proj)[:\s]+([A-Z][A-Z0-9]+)\b/i)
      return {
        brief: query,
        ...(projMatch ? { projectKey: projMatch[1] } : {}),
      }
    },
  },
  {
    type: 'review-sprint',
    label: 'Reviewing Sprint',
    icon: '📋',
    triggers: [
      /(?:review|check|audit|analyze)\s+(?:the\s+)?sprint/i,
      /sprint\s+(?:review|health|status|check)/i,
      /how.s\s+the\s+sprint/i,
      /(?:backlog|grooming|refinement)\s+(?:review|check|session)/i,
      /(?:standup|stand-up)\s+(?:prep|summary|notes)/i,
      /(?:velocity|burndown|burn-down)\s+(?:check|report|chart)/i,
      /capacity\s+(?:planning|check)/i,
      /how.*(?:sprint|iteration)\s+(?:going|doing|looking)/i,
    ],
    extract(query) {
      const m = query.match(/(?:board|board\s+id)[:\s]+(\d+)/i)
      return m ? { boardId: m[1] } : {}
    },
  },
  {
    type: 'implement-prd',
    label: 'Implementing PRD',
    icon: '⚙',
    triggers: [
      /implement\s+(?:the\s+)?(?:prd|product\s+req)/i,
      /code\s+(?:the\s+)?prd/i,
      /build\s+(?:the\s+)?prd/i,
      /implement\s+[A-Z][A-Z0-9]+-\d+/i,
    ],
    extract(query) {
      const jira = query.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)
      const repo = query.match(/(?:in|repo)[:\s]+([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/)
      return {
        ...(jira ? { jiraKey: jira[1] } : {}),
        ...(repo ? { owner: repo[1], repo: repo[2] } : {}),
      }
    },
  },
  {
    type: 'lookup-reply',
    label: 'Looking up & replying',
    icon: '💬',
    triggers: [
      /(?:look\s*up|find|search)\s+.*(?:reply|respond|answer|draft)/i,
      /(?:reply|respond|answer)\s+.*(?:to|about|for)/i,
      /draft\s+(?:a\s+)?(?:reply|response|message|email)/i,
      /what.s\s+the\s+(?:data|numbers?|stats?|status)/i,
      /get\s+(?:me\s+)?(?:the\s+)?(?:data|numbers?|info)/i,
      /find\s+(?:the\s+)?(?:data|numbers?|info|details?)/i,
      /(?:stakeholder|exec|leadership)\s+(?:update|report|summary|brief)/i,
      /(?:write|draft|prepare)\s+(?:a\s+)?(?:status|weekly|monthly)\s+(?:update|report)/i,
      /release\s+(?:notes|summary|plan)/i,
      /(?:prepare|prep)\s+(?:for\s+)?(?:meeting|sync|1:1|one-on-one)/i,
      /(?:summarize|sum up|recap)\s+(?:the\s+)?(?:thread|conversation|discussion|emails?)/i,
      /what.*(?:data|numbers?|metrics?)\s+(?:for|on|about)/i,
    ],
    extract(query) {
      const target = query.match(/(?:reply\s+to|send\s+to|post\s+(?:in|to)|email)\s+([#@]?[\w.-]+(?:@[\w.-]+)?)/i)
      return {
        query,
        ...(target ? { target: target[1] } : {}),
      }
    },
  },
]

// Type metadata for the frontend (labels, icons)
const TYPE_META = Object.fromEntries(
  AGENT_ROUTES.map(r => [r.type, { label: r.label, icon: r.icon }])
)

/**
 * Route a natural language query to an agent type.
 * Returns { type, label, icon, input, confidence, source }
 */
export function routeQuery(query) {
  if (!query || typeof query !== 'string') return null
  const trimmed = query.trim()
  if (!trimmed) return null

  // Try each route's regex triggers
  for (const route of AGENT_ROUTES) {
    const matched = route.triggers.some(re => re.test(trimmed))
    if (!matched) continue

    const input = route.extract(trimmed)
    return {
      type: route.type,
      label: route.label,
      icon: route.icon,
      input,
      confidence: 0.85,
      source: 'heuristic',
    }
  }

  // No heuristic match — check for bare Jira key → default to review-prd
  const jiraMatch = trimmed.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)
  if (jiraMatch) {
    return {
      type: 'review-prd',
      label: 'Reviewing PRD',
      icon: '🔍',
      input: { jiraKey: jiraMatch[1] },
      confidence: 0.5,
      source: 'jira-key-fallback',
    }
  }

  // Default: PM handles everything — classifies and delegates internally
  return {
    type: 'pm',
    label: 'Product Manager',
    icon: '📋',
    input: { query: trimmed },
    confidence: 1.0,
    source: 'pm-default',
  }
}

export function getTypeMeta(type) {
  return TYPE_META[type] || { label: type, icon: '🤖' }
}

export { AGENT_ROUTES, TYPE_META }
