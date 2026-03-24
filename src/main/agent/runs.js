import fs from 'fs'
import { join } from 'path'
import { app } from 'electron'

// ── Agent run persistence (in-memory cache + debounced flush) ──────

const RUNS_FILE = join(app.getPath('userData'), 'agent-runs.json')
const MAX_RUNS = 50
const FLUSH_DELAY = 2000 // ms — batch writes instead of per-step I/O

let runsCache = null
let flushTimer = null

function loadRuns() {
  if (runsCache) return runsCache
  try {
    if (fs.existsSync(RUNS_FILE)) {
      runsCache = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'))
      return runsCache
    }
  } catch {}
  runsCache = []
  return runsCache
}

function scheduleSave(runs) {
  runsCache = runs.slice(-MAX_RUNS)
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flushToDisk, FLUSH_DELAY)
}

function flushToDisk() {
  if (!runsCache) return
  try {
    const data = JSON.stringify(runsCache, null, 2)
    const tmpPath = RUNS_FILE + '.tmp'
    fs.writeFileSync(tmpPath, data, 'utf8')
    fs.renameSync(tmpPath, RUNS_FILE)
  } catch (err) {
    console.error('[runs] flush error:', err.message)
  }
}

// Flush on app quit so final state is never lost
process.on('exit', flushToDisk)
app.on('before-quit', flushToDisk)

export function createRun(type, input) {
  const run = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    status: 'running',
    input,
    steps: [],
    drafts: [],
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const runs = loadRuns()
  runs.push(run)
  scheduleSave(runs)
  return run
}

export function updateRun(runId, updates) {
  const runs = loadRuns()
  const idx = runs.findIndex(r => r.id === runId)
  if (idx === -1) return null
  runs[idx] = { ...runs[idx], ...updates, updatedAt: Date.now() }
  if (runs[idx].steps?.length > 200) {
    runs[idx].steps = runs[idx].steps.slice(-200)
  }
  // Force immediate flush for terminal states (completed/failed/cancelled)
  if (['completed', 'failed', 'cancelled'].includes(updates.status)) {
    runsCache = runs.slice(-MAX_RUNS)
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    flushToDisk()
  } else {
    scheduleSave(runs)
  }
  return runs[idx]
}

export function addStep(runId, step) {
  const runs = loadRuns()
  const run = runs.find(r => r.id === runId)
  if (!run) return
  // Strip fullResult before persisting (it can be 8KB per step; keep only 200-char summary)
  const { fullResult: _full, input: _input, ...persistStep } = step
  run.steps.push(persistStep)
  run.updatedAt = Date.now()
  scheduleSave(runs) // debounced — no disk thrash
}

export function addDraft(runId, draft) {
  const runs = loadRuns()
  const run = runs.find(r => r.id === runId)
  if (!run) return
  run.drafts.push({ ...draft, approved: null })
  run.status = 'awaiting-approval'
  run.updatedAt = Date.now()
  scheduleSave(runs)
}

export function resolveDraft(runId, draftId, approved) {
  const runs = loadRuns()
  const run = runs.find(r => r.id === runId)
  if (!run) return null
  const draft = run.drafts.find(d => d.id === draftId)
  if (!draft) return null
  draft.approved = approved
  run.status = 'running'
  run.updatedAt = Date.now()
  scheduleSave(runs)
  return draft
}

export function getRun(runId) {
  const runs = loadRuns()
  return runs.find(r => r.id === runId) || null
}

export function listRuns() {
  return loadRuns().reverse()
}
