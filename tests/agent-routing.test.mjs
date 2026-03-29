// ── Golden test suite for agent routing ───────────────────────────
// Tests routeQuery against labeled inputs to measure routing accuracy.
// Run: node tests/agent-routing.test.mjs
//
// This file inlines the router to avoid ESM/CJS issues with the source.
// Keep the AGENT_ROUTES and routeQuery logic in sync with src/main/agent/router.js.

// ── Inlined router (copy from router.js) ──────────────────────────
const AGENT_ROUTES = [
  {
    type: 'review-prd',
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
    extract(q) { const m = q.match(/\b([A-Z][A-Z0-9]+-\d+)\b/); return m ? { jiraKey: m[1] } : {} },
  },
  {
    type: 'create-prd',
    triggers: [
      /(?:create|write|draft|make)\s+(?:a\s+)?(?:prd|product\s+req)/i,
      /new\s+prd/i,
      /(?:spec|scope)\s+(?:out|document)/i,
      /(?:write|create|draft)\s+(?:a\s+)?(?:design\s+doc|technical?\s+spec|rfp|rfc)/i,
    ],
    extract(q) { return { brief: q } },
  },
  {
    type: 'review-sprint',
    triggers: [
      /(?:review|check|audit|analyze)\s+(?:the\s+)?sprint/i,
      /sprint\s+(?:review|health|status|check)/i,
      /how.s\s+the\s+sprint/i,
      /(?:backlog|grooming|refinement)\s+(?:review|check|session)/i,
      /(?:standup|stand-up)\s+(?:prep|summary|notes)/i,
      /(?:velocity|burndown|burn-down)/i,
      /capacity\s+(?:planning|check)/i,
      /how.*(?:sprint|iteration)\s+(?:going|doing|looking)/i,
    ],
    extract(q) { return {} },
  },
  {
    type: 'implement-prd',
    triggers: [
      /implement\s+(?:the\s+)?(?:prd|product\s+req)/i,
      /code\s+(?:the\s+)?prd/i,
      /build\s+(?:the\s+)?prd/i,
      /implement\s+[A-Z][A-Z0-9]+-\d+/i,
    ],
    extract(q) { const m = q.match(/\b([A-Z][A-Z0-9]+-\d+)\b/); return m ? { jiraKey: m[1] } : {} },
  },
  {
    type: 'lookup-reply',
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
      /(?:prepare|prep)\s+(?:for\s+)?(?:meeting|sync|1:1|one-on-one|1 on 1)/i,
      /(?:1:1|one-on-one|1 on 1)\s+(?:with|prep|notes)/i,
      /(?:summarize|sum up|recap)\s+(?:the\s+)?(?:thread|conversation|discussion|emails?)/i,
      /what.*(?:data|numbers?|metrics?)\s+(?:for|on|about|do)/i,
      /(?:do we have|is there)\s+(?:data|numbers?|info)/i,
    ],
    extract(q) { return { query: q } },
  },
]

function routeQuery(query) {
  if (!query || typeof query !== 'string') return null
  const trimmed = query.trim()
  if (!trimmed) return null
  for (const route of AGENT_ROUTES) {
    if (route.triggers.some(re => re.test(trimmed))) {
      return { type: route.type, input: route.extract(trimmed), confidence: 0.85, source: 'heuristic' }
    }
  }
  const jiraMatch = trimmed.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)
  const hasActionVerb = /\b(update|move|transition|assign|close|reopen|change|set|mark)\b/i.test(trimmed)
  if (jiraMatch && !hasActionVerb) {
    return { type: 'review-prd', input: { jiraKey: jiraMatch[1] }, confidence: 0.5, source: 'jira-key-fallback' }
  }
  return { type: 'pm', input: { query: trimmed }, confidence: 1.0, source: 'pm-default' }
}

// ── Test cases ────────────────────────────────────────────────────
const CASES = [
  // review-prd
  { input: 'Review the PRD for onboarding flow',     expected: 'review-prd' },
  { input: 'Analyze the product requirements doc',    expected: 'review-prd' },
  { input: 'Check PRD PROJ-123',                      expected: 'review-prd' },
  { input: 'Do a gap analysis on the spec',           expected: 'review-prd' },
  { input: 'Review the design doc for notifications', expected: 'review-prd' },
  { input: 'Look at the PRD and find issues',         expected: 'review-prd' },

  // create-prd
  { input: 'Create a PRD for the new payment flow',   expected: 'create-prd' },
  { input: 'Write a product requirements document',    expected: 'create-prd' },
  { input: 'Draft a technical spec for auth',          expected: 'create-prd' },
  { input: 'Spec out the new dashboard feature',       expected: 'create-prd' },

  // review-sprint
  { input: 'Review the sprint',                        expected: 'review-sprint' },
  { input: "How's the sprint going?",                  expected: 'review-sprint' },
  { input: 'Sprint health check',                      expected: 'review-sprint' },
  { input: 'Standup prep for tomorrow',                expected: 'review-sprint' },
  { input: 'Check velocity and burndown',              expected: 'review-sprint' },
  { input: 'Capacity planning for next sprint',        expected: 'review-sprint' },

  // implement-prd
  { input: 'Implement the PRD for PROJ-456',           expected: 'implement-prd' },
  { input: 'Code the PRD',                             expected: 'implement-prd' },
  { input: 'Build the PRD for login flow',             expected: 'implement-prd' },

  // lookup-reply
  { input: 'Look up the data and reply to Alice',     expected: 'lookup-reply' },
  { input: 'Draft a reply to the investor email',     expected: 'lookup-reply' },
  { input: "What's the data on churn this month?",    expected: 'lookup-reply' },
  { input: 'Get me the numbers for Q4 revenue',       expected: 'lookup-reply' },
  { input: 'Prepare for the 1:1 with Harsh',          expected: 'lookup-reply' },
  { input: 'Summarize the thread about API changes',  expected: 'lookup-reply' },
  { input: 'Write a status update for leadership',    expected: 'lookup-reply' },
  { input: 'Release notes for v2.3',                  expected: 'lookup-reply' },

  // pm (default/catch-all)
  { input: 'Send hello to deveshrohan@gmail.com',     expected: 'pm' },
  { input: 'Update PROJ-789 status to done',          expected: 'pm' },
  { input: 'What should we prioritize this week?',    expected: 'pm' },
  { input: 'Help me plan the roadmap',                expected: 'pm' },

  // Jira key fallback → review-prd
  { input: 'PROJ-123',                                expected: 'review-prd', note: 'bare Jira key' },
  { input: 'Check AICA-456',                          expected: 'review-prd', note: 'Jira key with check' },

  // Non-delegatable (routes to PM)
  { input: 'Join the 3pm meeting',                    expected: 'pm', note: 'non-delegatable' },
  { input: 'Huddle with Akshita',                     expected: 'pm', note: 'non-delegatable' },
  { input: 'Approve prod access for Mohit',           expected: 'pm', note: 'non-delegatable' },

  // Edge cases
  { input: '',                                         expected: null, note: 'empty' },
  { input: '  ',                                       expected: null, note: 'whitespace' },

  // Ambiguous / tricky
  { input: 'Review AICA-100 and create tasks',        expected: 'review-prd', note: 'review + create in same query' },
  { input: 'What data do we have on user retention?', expected: 'lookup-reply', note: 'data question' },
  { input: 'Fix the GST fetch error',                 expected: 'pm', note: 'implementation without PRD keyword' },
  { input: 'Reply to Mohit about the API issue',      expected: 'lookup-reply' },
]

// ── Run ───────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures = []

for (const tc of CASES) {
  const result = routeQuery(tc.input)
  const actual = result?.type ?? null

  if (actual === tc.expected) {
    passed++
  } else {
    failed++
    failures.push({
      input: tc.input, expected: tc.expected, actual,
      confidence: result?.confidence, source: result?.source, note: tc.note,
    })
  }
}

const total = passed + failed
const accuracy = total > 0 ? Math.round((passed / total) * 100) : 0

console.log(`\n=== Agent Routing Eval ===`)
console.log(`Total: ${total}  Passed: ${passed}  Failed: ${failed}  Accuracy: ${accuracy}%\n`)

if (failures.length > 0) {
  console.log('Failures:')
  for (const f of failures) {
    console.log(`  ✗ "${f.input}"`)
    console.log(`    expected: ${f.expected} → got: ${f.actual} (confidence=${f.confidence}, source=${f.source})`)
    if (f.note) console.log(`    note: ${f.note}`)
  }
}

process.exit(failed > 0 ? 1 : 0)
