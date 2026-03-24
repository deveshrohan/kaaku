// ── A* Grid Pathfinding ─────────────────────────────────────────────
// Grid-based pathfinding for agent characters walking between desks.
// Desks are treated as 2-cell obstacles on a 20×20 grid.

const GRID_SIZE = 20
const CELL_SIZE = 0.5
const GRID_OX = -5 // grid origin x
const GRID_OZ = -3 // grid origin z

function toGrid(wx, wz) {
  return [
    Math.round((wx - GRID_OX) / CELL_SIZE),
    Math.round((wz - GRID_OZ) / CELL_SIZE),
  ]
}

function toWorld(gx, gz) {
  return [gx * CELL_SIZE + GRID_OX, 0, gz * CELL_SIZE + GRID_OZ]
}

function buildGrid(desks) {
  const grid = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => 0)
  )
  for (const desk of desks) {
    const [cx, cz] = toGrid(desk.pos[0], desk.pos[2])
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 0; dz++) {
        const gx = cx + dx
        const gz = cz + dz
        if (gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE) {
          grid[gz][gx] = 1
        }
      }
    }
  }
  return grid
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

function heuristic([ax, az], [bx, bz]) {
  return Math.abs(ax - bx) + Math.abs(az - bz)
}

function neighbors([x, z], grid) {
  return DIRS
    .map(([dx, dz]) => [x + dx, z + dz])
    .filter(([nx, nz]) =>
      nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && grid[nz][nx] === 0
    )
}

/**
 * Find a walkable path between two world positions, avoiding desks.
 * @param {number[]} from - [x, y, z] start position
 * @param {number[]} to   - [x, y, z] target position
 * @param {Array} desks   - desk objects with .pos [x, y, z]
 * @returns {number[][]} array of [x, 0, z] waypoints
 */
export function findPath(from, to, desks) {
  const grid = buildGrid(desks)
  const start = toGrid(from[0], from[2])
  const end = toGrid(to[0], to[2])

  // Ensure start/end are walkable
  if (start[0] >= 0 && start[0] < GRID_SIZE && start[1] >= 0 && start[1] < GRID_SIZE)
    grid[start[1]][start[0]] = 0
  if (end[0] >= 0 && end[0] < GRID_SIZE && end[1] >= 0 && end[1] < GRID_SIZE)
    grid[end[1]][end[0]] = 0

  const key = (n) => `${n[0]},${n[1]}`
  const open = [{ node: start, f: 0, g: 0 }]
  const closed = new Set()
  const cameFrom = {}
  const gScore = { [key(start)]: 0 }

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f)
    const current = open.shift()
    const ck = key(current.node)

    if (current.node[0] === end[0] && current.node[1] === end[1]) {
      // Reconstruct
      const path = []
      let node = end
      while (node) {
        path.unshift(toWorld(node[0], node[1]))
        node = cameFrom[key(node)]
      }
      return path
    }

    closed.add(ck)

    for (const nb of neighbors(current.node, grid)) {
      const nk = key(nb)
      if (closed.has(nk)) continue
      const isDiag = nb[0] !== current.node[0] && nb[1] !== current.node[1]
      const tentG = current.g + (isDiag ? 1.414 : 1)

      if (tentG < (gScore[nk] ?? Infinity)) {
        cameFrom[nk] = current.node
        gScore[nk] = tentG
        const f = tentG + heuristic(nb, end)
        const idx = open.findIndex(o => key(o.node) === nk)
        if (idx >= 0) open[idx] = { node: nb, f, g: tentG }
        else open.push({ node: nb, f, g: tentG })
      }
    }
  }

  // Fallback: direct line
  return [from, to]
}

/**
 * Smooth a path with linear interpolation between waypoints.
 * @param {number[][]} path - waypoints from findPath
 * @param {number} subdivisions - points inserted between each pair
 * @returns {number[][]} smoothed path
 */
export function smoothPath(path, subdivisions = 1) {
  if (path.length <= 2) return path
  const result = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]
    const curr = path[i]
    for (let s = 1; s <= subdivisions; s++) {
      const t = s / (subdivisions + 1)
      result.push([
        prev[0] + (curr[0] - prev[0]) * t,
        0,
        prev[2] + (curr[2] - prev[2]) * t,
      ])
    }
    result.push(curr)
  }
  return result
}
