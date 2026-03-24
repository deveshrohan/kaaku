import https from 'https'

// ── Jira Cloud REST client (Basic Auth: email + API token) ──────────

function jiraFetch(domain, email, apiToken, path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')
    const req = https.request({
      hostname: domain,
      path,
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Jira ${res.statusCode}: ${raw.slice(0, 200)}`))
          return
        }
        try { resolve(JSON.parse(raw)) } catch { resolve({}) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function jiraPost(domain, email, apiToken, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname: domain,
      path,
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Jira ${res.statusCode}: ${raw.slice(0, 200)}`))
          return
        }
        try { resolve(JSON.parse(raw)) } catch { resolve({}) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

export async function jiraGetIssue(domain, email, apiToken, issueKey) {
  const data = await jiraFetch(
    domain, email, apiToken,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?expand=renderedFields`
  )
  return {
    key: data.key,
    summary: data.fields?.summary,
    description: data.fields?.description,
    status: data.fields?.status?.name,
    priority: data.fields?.priority?.name,
    assignee: data.fields?.assignee?.displayName,
    reporter: data.fields?.reporter?.displayName,
    labels: data.fields?.labels || [],
    issueLinks: (data.fields?.issuelinks || []).map(l => ({
      type: l.type?.name,
      key: l.outwardIssue?.key || l.inwardIssue?.key,
      summary: l.outwardIssue?.fields?.summary || l.inwardIssue?.fields?.summary,
    })),
    acceptanceCriteria: data.fields?.customfield_10020 || null,
    storyPoints: data.fields?.customfield_10028 || data.fields?.story_points || null,
    comments: (data.fields?.comment?.comments || []).slice(-10).map(c => ({
      author: c.author?.displayName,
      body: c.body,
      created: c.created,
    })),
  }
}

export async function jiraSearch(domain, email, apiToken, jql, maxResults = 20) {
  const data = await jiraPost(
    domain, email, apiToken,
    '/rest/api/3/search/jql',
    { jql, maxResults, fields: ['key', 'summary', 'status', 'priority', 'assignee'] }
  )
  return (data.issues || []).map(i => ({
    key: i.key,
    summary: i.fields?.summary,
    status: i.fields?.status?.name,
    priority: i.fields?.priority?.name,
    assignee: i.fields?.assignee?.displayName,
  }))
}

export async function jiraListSprints(domain, email, apiToken, boardId, state = 'active,closed,future') {
  // Paginate to get all sprints
  const allSprints = []
  let startAt = 0
  while (true) {
    const data = await jiraFetch(
      domain, email, apiToken,
      `/rest/agile/1.0/board/${boardId}/sprint?state=${state}&maxResults=50&startAt=${startAt}`
    )
    const values = data.values || []
    allSprints.push(...values)
    if (data.isLast || values.length === 0) break
    startAt += values.length
  }
  return allSprints.map(s => ({
    id: s.id,
    name: s.name,
    state: s.state,
    goal: s.goal,
    startDate: s.startDate,
    endDate: s.endDate,
  }))
}

export async function jiraGetSprint(domain, email, apiToken, boardId, sprintId, sprintName) {
  let targetSprint
  if (sprintId) {
    targetSprint = await jiraFetch(domain, email, apiToken, `/rest/agile/1.0/sprint/${sprintId}`)
  } else if (sprintName && boardId) {
    // Search all sprints on the board (paginated) and match by name
    const allSprints = []
    let startAt = 0
    while (true) {
      const data = await jiraFetch(
        domain, email, apiToken,
        `/rest/agile/1.0/board/${boardId}/sprint?state=active,closed,future&maxResults=50&startAt=${startAt}`
      )
      const values = data.values || []
      allSprints.push(...values)
      if (data.isLast || values.length === 0) break
      startAt += values.length
    }
    const needle = sprintName.toLowerCase()
    targetSprint = allSprints.find(s => s.name.toLowerCase() === needle)
      || allSprints.find(s => s.name.toLowerCase().includes(needle))
    if (!targetSprint) {
      // Show last 20 sprints to keep response manageable
      const recent = allSprints.slice(-20)
      const names = recent.map(s => `${s.id}: ${s.name} (${s.state})`).join('\n')
      return { sprint: null, issues: [], error: `No sprint matching "${sprintName}" among ${allSprints.length} sprints. Recent sprints:\n${names}` }
    }
  } else {
    const sprints = await jiraFetch(
      domain, email, apiToken,
      `/rest/agile/1.0/board/${boardId}/sprint?state=active`
    )
    targetSprint = sprints.values?.[0]
  }
  if (!targetSprint) return { sprint: null, issues: [] }

  const issues = await jiraFetch(
    domain, email, apiToken,
    `/rest/agile/1.0/sprint/${targetSprint.id}/issue?maxResults=50&fields=key,summary,status,priority,assignee,story_points,labels,description`
  )
  return {
    sprint: { id: targetSprint.id, name: targetSprint.name, goal: targetSprint.goal, startDate: targetSprint.startDate, endDate: targetSprint.endDate },
    issues: (issues.issues || []).map(i => ({
      key: i.key,
      summary: i.fields?.summary,
      status: i.fields?.status?.name,
      priority: i.fields?.priority?.name,
      assignee: i.fields?.assignee?.displayName,
      storyPoints: i.fields?.story_points,
      labels: i.fields?.labels || [],
      description: i.fields?.description,
    })),
  }
}

export async function jiraCreateIssue(domain, email, apiToken, { projectKey, summary, description, issueType = 'Story' }) {
  const data = await jiraPost(domain, email, apiToken, '/rest/api/3/issue', {
    fields: {
      project: { key: projectKey },
      summary,
      description: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      },
      issuetype: { name: issueType },
    },
  })
  return { key: data.key, id: data.id }
}

export async function jiraAddComment(domain, email, apiToken, issueKey, commentBody) {
  return jiraPost(domain, email, apiToken, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    body: {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: commentBody }] }],
    },
  })
}

// ── PUT helper (for updates) ──────────────────────────────────────

function jiraPut(domain, email, apiToken, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname: domain,
      path,
      method: 'PUT',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Jira ${res.statusCode}: ${raw.slice(0, 200)}`))
          return
        }
        // 204 No Content is normal for PUT
        if (res.statusCode === 204 || !raw) { resolve({ ok: true }); return }
        try { resolve(JSON.parse(raw)) } catch { resolve({ ok: true }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

export async function jiraUpdateIssue(domain, email, apiToken, issueKey, fields) {
  await jiraPut(domain, email, apiToken,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    { fields }
  )
  return { ok: true, key: issueKey }
}

export async function jiraTransitionIssue(domain, email, apiToken, issueKey, transitionName) {
  // First, get available transitions
  const data = await jiraFetch(domain, email, apiToken,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`
  )
  const transitions = data.transitions || []
  const match = transitions.find(t =>
    t.name.toLowerCase() === transitionName.toLowerCase()
  ) || transitions.find(t =>
    t.name.toLowerCase().includes(transitionName.toLowerCase())
  )
  if (!match) {
    const available = transitions.map(t => t.name).join(', ')
    throw new Error(`No transition matching "${transitionName}". Available: ${available}`)
  }
  await jiraPost(domain, email, apiToken,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    { transition: { id: match.id } }
  )
  return { ok: true, key: issueKey, transitioned: match.name }
}

export async function testJiraConnection(domain, email, apiToken) {
  try {
    const data = await jiraFetch(domain, email, apiToken, '/rest/api/3/myself')
    return { ok: true, user: data.displayName || data.emailAddress }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
