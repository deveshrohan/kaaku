import fs from 'fs'
import { join } from 'path'
import { app } from 'electron'

// ── Agent memory — persistent storage of past decisions & analyses ──

const MEMORY_FILE = join(app.getPath('userData'), 'agent-memory.json')
const MAX_ENTRIES = 200

let cache = null

// ── Internal helpers ────────────────────────────────────────────────

function loadFromDisk() {
  if (cache) return cache
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'))
      cache = Array.isArray(raw) ? raw : []
      return cache
    }
  } catch {}
  cache = []
  return cache
}

function flushToDisk() {
  if (!cache) return
  try {
    const data = JSON.stringify(cache, null, 2)
    const tmpPath = MEMORY_FILE + '.tmp'
    fs.writeFileSync(tmpPath, data, 'utf8')
    fs.renameSync(tmpPath, MEMORY_FILE)
  } catch (err) {
    console.error('[memory] flush error:', err.message)
  }
}

function pruneIfNeeded(entries) {
  if (entries.length <= MAX_ENTRIES) return entries
  // Sort oldest-first by createdAt, drop the oldest
  entries.sort((a, b) => a.createdAt - b.createdAt)
  return entries.slice(entries.length - MAX_ENTRIES)
}

// Flush on app quit so nothing is lost
process.on('exit', flushToDisk)
app.on('before-quit', flushToDisk)

// ── Public API ──────────────────────────────────────────────────────

/**
 * Store a fact or decision for an agent type.
 * If the same (agentType, key) pair already exists, it is updated in place.
 *
 *   saveMemory('review-sprint', 'last sprint velocity', '42 points')
 */
export function saveMemory(agentType, key, value) {
  const entries = loadFromDisk()
  const now = Date.now()

  const existing = entries.find(e => e.agentType === agentType && e.key === key)
  if (existing) {
    existing.value = value
    existing.updatedAt = now
  } else {
    entries.push({ key, value, agentType, createdAt: now, updatedAt: now })
  }

  cache = pruneIfNeeded(entries)
  flushToDisk()
}

/**
 * Return all memories for a given agent type.
 */
export function loadMemory(agentType) {
  return loadFromDisk().filter(e => e.agentType === agentType)
}

/**
 * Return every memory entry across all agent types.
 */
export function loadAllMemory() {
  return loadFromDisk().slice()
}

/**
 * Wipe all memories for a given agent type.
 */
export function clearMemory(agentType) {
  const entries = loadFromDisk()
  cache = agentType ? entries.filter(e => e.agentType !== agentType) : []
  flushToDisk()
}

/**
 * Return memories most relevant to a query (simple keyword matching).
 * Scores each entry by how many query words appear in its key + value,
 * then returns the top matches (up to `limit`).
 */
export function getRelevantContext(agentType, query, limit = 10) {
  const entries = loadFromDisk()
  const pool = agentType
    ? entries.filter(e => e.agentType === agentType)
    : entries

  if (pool.length === 0 || !query) return []

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2) // skip tiny words like "a", "is"

  if (words.length === 0) return pool.slice(-limit)

  const scored = pool.map(entry => {
    const haystack = `${entry.key} ${entry.value}`.toLowerCase()
    const score = words.reduce((sum, w) => sum + (haystack.includes(w) ? 1 : 0), 0)
    return { entry, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt)
    .slice(0, limit)
    .map(s => s.entry)
}

// ── Prompt helper (used by executor.js) ─────────────────────────────

/**
 * Build a compact string of all memories suitable for injection into
 * the system prompt. When called with no arguments, returns all memories.
 * When called with an agentType, returns only that type's memories.
 */
export function getMemoryForPrompt(agentType) {
  const entries = agentType ? loadMemory(agentType) : loadFromDisk()
  if (entries.length === 0) return ''

  const lines = entries.map(e =>
    `- [${e.agentType}] ${e.key}: ${e.value}`
  )
  return `\n\n## Agent Memory\nPast decisions and facts you recorded:\n${lines.join('\n')}\n`
}
