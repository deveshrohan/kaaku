import https from 'https'
import http from 'http'

// ── Redash API client (API key auth) ────────────────────────────────

function redashFetch(baseUrl, apiKey, path) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, baseUrl)
    const isHttps = u.protocol === 'https:'
    const mod = isHttps ? https : http
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        Authorization: `Key ${apiKey}`,
        Accept: 'application/json',
      },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Redash ${res.statusCode}: ${raw.slice(0, 200)}`))
          return
        }
        try { resolve(JSON.parse(raw)) } catch { resolve({}) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function redashPost(baseUrl, apiKey, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, baseUrl)
    const isHttps = u.protocol === 'https:'
    const mod = isHttps ? https : http
    const payload = JSON.stringify(body)
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let raw = ''
      res.on('data', d => (raw += d))
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Redash ${res.statusCode}: ${raw.slice(0, 200)}`))
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

export async function redashSearch(baseUrl, apiKey, query) {
  const data = await redashFetch(baseUrl, apiKey, `/api/queries?q=${encodeURIComponent(query)}`)
  return (data.results || []).slice(0, 15).map(q => ({
    id: q.id,
    name: q.name,
    description: q.description,
    query: q.query,
    dataSourceId: q.data_source_id,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
  }))
}

export async function redashGetResults(baseUrl, apiKey, queryId) {
  const data = await redashFetch(baseUrl, apiKey, `/api/queries/${queryId}/results`)
  const result = data.query_result
  if (!result) return { columns: [], rows: [], retrievedAt: null }
  return {
    columns: (result.data?.columns || []).map(c => c.name),
    rows: (result.data?.rows || []).slice(0, 100),
    retrievedAt: result.retrieved_at,
  }
}

export async function redashRunQuery(baseUrl, apiKey, queryId, parameters = {}) {
  const data = await redashPost(baseUrl, apiKey, `/api/queries/${queryId}/results`, {
    parameters,
    max_age: 0,
  })
  const jobId = data.job?.id
  if (!jobId) {
    // Results returned immediately
    const result = data.query_result
    if (!result) return { columns: [], rows: [], retrievedAt: null }
    return {
      columns: (result.data?.columns || []).map(c => c.name),
      rows: (result.data?.rows || []).slice(0, 100),
      retrievedAt: result.retrieved_at,
    }
  }
  // Poll for job completion (max 30s)
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const job = await redashFetch(baseUrl, apiKey, `/api/jobs/${jobId}`)
    if (job.job?.status === 3) {
      return redashGetResults(baseUrl, apiKey, queryId)
    }
    if (job.job?.status === 4) {
      throw new Error(`Redash query failed: ${job.job.error}`)
    }
  }
  throw new Error('Redash query timed out')
}

export async function testRedashConnection(baseUrl, apiKey) {
  try {
    const data = await redashFetch(baseUrl, apiKey, '/api/session')
    return { ok: true, user: data.name || data.email || 'Connected' }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
