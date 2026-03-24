import https from 'https'

// ── GitHub REST client (PAT auth) ──────────────────────────────────

function ghFetch(token, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Kaaku-Agent/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
    if (body) {
      const payload = JSON.stringify(body)
      opts.headers['Content-Type'] = 'application/json'
      opts.headers['Content-Length'] = Buffer.byteLength(payload)
    }

    const req = https.request(opts, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`GitHub ${res.statusCode}: ${raw.slice(0, 300)}`))
          return
        }
        try { resolve(JSON.parse(raw)) } catch { resolve(raw) }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

export async function githubListFiles(token, owner, repo, path = '', ref = '') {
  let apiPath = `/repos/${owner}/${repo}/contents/${path}`
  if (ref) apiPath += `?ref=${encodeURIComponent(ref)}`
  const data = await ghFetch(token, apiPath)
  if (!Array.isArray(data)) {
    // Single file response
    return [{ name: data.name, path: data.path, type: data.type, size: data.size }]
  }
  return data.map(f => ({ name: f.name, path: f.path, type: f.type, size: f.size }))
}

export async function githubReadFile(token, owner, repo, path, ref = '') {
  let apiPath = `/repos/${owner}/${repo}/contents/${path}`
  if (ref) apiPath += `?ref=${encodeURIComponent(ref)}`
  const data = await ghFetch(token, apiPath)
  if (data.encoding === 'base64' && data.content) {
    return {
      path: data.path,
      content: Buffer.from(data.content, 'base64').toString('utf8'),
      size: data.size,
      sha: data.sha,
    }
  }
  return { path: data.path, content: '', size: data.size, sha: data.sha }
}

export async function githubSearchCode(token, query, org = '') {
  const q = org ? `${query}+org:${org}` : query
  const data = await ghFetch(token, `/search/code?q=${encodeURIComponent(q)}&per_page=20`)
  return (data.items || []).map(i => ({
    path: i.path,
    repo: i.repository?.full_name,
    name: i.name,
    url: i.html_url,
    score: i.score,
  }))
}

export async function githubCreateBranch(token, owner, repo, branchName, baseBranch = 'main') {
  // Get SHA of base branch
  const ref = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`)
  const sha = ref.object?.sha
  if (!sha) throw new Error(`Could not find base branch "${baseBranch}"`)
  // Create new branch
  return ghFetch(token, `/repos/${owner}/${repo}/git/refs`, 'POST', {
    ref: `refs/heads/${branchName}`,
    sha,
  })
}

export async function githubCreateOrUpdateFile(token, owner, repo, path, { content, message, branch, sha = null }) {
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
  }
  if (sha) body.sha = sha
  return ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`, 'PUT', body)
}

export async function githubCreatePr(token, owner, repo, { title, body, head, base = 'main' }) {
  return ghFetch(token, `/repos/${owner}/${repo}/pulls`, 'POST', { title, body, head, base })
}

export async function testGithubConnection(token) {
  try {
    const data = await ghFetch(token, '/user')
    return { ok: true, user: data.login || 'Connected' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
