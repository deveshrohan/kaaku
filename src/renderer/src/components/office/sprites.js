// ── Chibi Office Characters ──────────────────────────────────────────
// Clean vector SVG illustrations — big heads, small bodies, cute style.
// Inspired by Notion avatars / Habbo Hotel / modern flat illustration.
//
// Canvas: 128×192 — characters fill ~70% vertically, centered.

const W = 128, H = 192

// ── Colors ──────────────────────────────────────────────────────────
const ACCENT = {
  pm:        '#C8A44A',
  architect: '#5B8DEF',
  developer: '#34C759',
  analyst:   '#A78BFA',
  qa:        '#FF9F0A',
}

// Shared palette
const SKIN  = '#F5D0A9'
const SKINSH = '#E4B88A'
const SKIN2 = '#C49A6C'
const SKINSH2 = '#A07850'
const EYE   = '#1E2030'
const BLK   = '#1E2030'
const WHT   = '#F0EDE6'
const GRY   = '#3A3F52'

function wrap(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`
}

// ── Shared parts ────────────────────────────────────────────────────

function faceBase(cx, cy, skin = SKIN) {
  return `<circle cx="${cx}" cy="${cy}" r="26" fill="${skin}"/>`
}

function eyes(cx, cy, dx = 8, blink = false) {
  if (blink) {
    return `<line x1="${cx - dx - 3}" y1="${cy}" x2="${cx - dx + 3}" y2="${cy}" stroke="${EYE}" stroke-width="2" stroke-linecap="round"/>
            <line x1="${cx + dx - 3}" y1="${cy}" x2="${cx + dx + 3}" y2="${cy}" stroke="${EYE}" stroke-width="2" stroke-linecap="round"/>`
  }
  return `<circle cx="${cx - dx}" cy="${cy}" r="3" fill="${EYE}"/>
          <circle cx="${cx + dx}" cy="${cy}" r="3" fill="${EYE}"/>
          <circle cx="${cx - dx + 1}" cy="${cy - 1}" r="1" fill="white"/>
          <circle cx="${cx + dx + 1}" cy="${cy - 1}" r="1" fill="white"/>`
}

function mouthSmile(cx, cy) {
  return `<path d="M${cx - 4},${cy} Q${cx},${cy + 5} ${cx + 4},${cy}" stroke="${EYE}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
}

function mouthFlat(cx, cy) {
  return `<line x1="${cx - 3}" y1="${cy}" x2="${cx + 3}" y2="${cy}" stroke="${EYE}" stroke-width="1.5" stroke-linecap="round"/>`
}

function blush(cx, cy, dx = 14) {
  return `<ellipse cx="${cx - dx}" cy="${cy}" rx="4" ry="2.5" fill="rgba(255,150,150,0.25)"/>
          <ellipse cx="${cx + dx}" cy="${cy}" rx="4" ry="2.5" fill="rgba(255,150,150,0.25)"/>`
}

function shadowEllipse(cx, cy) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="22" ry="6" fill="rgba(0,0,0,0.15)"/>`
}

function bodyRect(cx, y, w, h, color, outline = BLK) {
  const r = 6
  return `<rect x="${cx - w/2}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${color}" stroke="${outline}" stroke-width="1.5"/>`
}

function legs(cx, y, color, legL = 0, legR = 0) {
  return `<rect x="${cx - 10}" y="${y + legL}" width="9" height="24" rx="4" fill="${color}" stroke="${BLK}" stroke-width="1.2"/>
          <rect x="${cx + 1}" y="${y + legR}" width="9" height="24" rx="4" fill="${color}" stroke="${BLK}" stroke-width="1.2"/>`
}

function shoes(cx, y, color = BLK, legL = 0, legR = 0) {
  return `<ellipse cx="${cx - 5}" cy="${y + 24 + legL}" rx="6" ry="3.5" fill="${color}"/>
          <ellipse cx="${cx + 6}" cy="${y + 24 + legR}" rx="6" ry="3.5" fill="${color}"/>`
}

function armL(cx, y, color, angle = 0, skin = SKIN) {
  const ax = cx - 22
  const len = 22
  const rad = angle * Math.PI / 180
  const ex = ax + Math.sin(rad) * len
  const ey = y + Math.cos(rad) * len
  return `<line x1="${ax}" y1="${y}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
          <circle cx="${ex}" cy="${ey}" r="4.5" fill="${skin}"/>`
}

function armR(cx, y, color, angle = 0, skin = SKIN) {
  const ax = cx + 22
  const len = 22
  const rad = angle * Math.PI / 180
  const ex = ax - Math.sin(rad) * -len * 0 + Math.sin(rad) * len
  const ey = y + Math.cos(rad) * len
  return `<line x1="${ax}" y1="${y}" x2="${ax + Math.sin(rad) * len}" y2="${ey}" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
          <circle cx="${ax + Math.sin(rad) * len}" cy="${ey}" r="4.5" fill="${skin}"/>`
}

// ── PM — Curly hair, blue shirt, warm gold accent ───────────────────
function pmChar(p) {
  const cx = 64, fy = 58, by = 86
  const { legL = 0, legR = 0, aL = 0, aR = 0, blink = false, bob = 0 } = p
  const y = bob

  return wrap(`
    ${shadowEllipse(cx, 170)}
    ${shoes(cx, by + 34 + y, BLK, legL * 4, legR * 4)}
    ${legs(cx, by + 10 + y, '#C4A672', legL * 4, legR * 4)}
    ${bodyRect(cx, by + y, 42, 38, '#3B6FA0')}
    <line x1="${cx - 6}" y1="${by + 4 + y}" x2="${cx - 2}" y2="${by + 12 + y}" stroke="#2C5580" stroke-width="1.5"/>
    <line x1="${cx + 6}" y1="${by + 4 + y}" x2="${cx + 2}" y2="${by + 12 + y}" stroke="#2C5580" stroke-width="1.5"/>
    ${armL(cx, by + 8 + y, '#3B6FA0', aL * 15)}
    ${armR(cx, by + 8 + y, '#3B6FA0', aR * 15)}
    ${faceBase(cx, fy + y)}
    <circle cx="${cx}" cy="${fy + y}" r="26" fill="none" stroke="${BLK}" stroke-width="1.5"/>
    ${blink ? eyes(cx, fy - 2 + y, 8, true) : eyes(cx, fy - 2 + y)}
    ${mouthSmile(cx, fy + 8 + y)}
    ${blush(cx, fy + 4 + y)}
    <!-- Curly hair -->
    <path d="M${cx - 24},${fy - 8 + y} Q${cx - 28},${fy - 30 + y} ${cx - 10},${fy - 30 + y}
             Q${cx},${fy - 36 + y} ${cx + 10},${fy - 30 + y}
             Q${cx + 28},${fy - 30 + y} ${cx + 24},${fy - 8 + y}" fill="#5C3A1E" stroke="${BLK}" stroke-width="1.2"/>
    <circle cx="${cx - 14}" cy="${fy - 26 + y}" r="5" fill="#6B4A2E"/>
    <circle cx="${cx + 4}" cy="${fy - 28 + y}" r="6" fill="#6B4A2E"/>
    <circle cx="${cx + 16}" cy="${fy - 24 + y}" r="5" fill="#6B4A2E"/>
  `)
}

// ── Architect — Long dark hair, black hoodie ────────────────────────
function archChar(p) {
  const cx = 64, fy = 58, by = 86
  const { legL = 0, legR = 0, aL = 0, aR = 0, blink = false, bob = 0 } = p

  return wrap(`
    ${shadowEllipse(cx, 170)}
    ${shoes(cx, by + 34 + bob, '#111', legL * 4, legR * 4)}
    ${legs(cx, by + 10 + bob, BLK, legL * 4, legR * 4)}
    ${bodyRect(cx, by + bob, 44, 38, '#2A2A3E')}
    <rect x="${cx - 10}" y="${by + 22 + bob}" width="20" height="8" rx="3" fill="#333" opacity="0.5"/>
    ${armL(cx, by + 8 + bob, '#2A2A3E', aL * 15)}
    ${armR(cx, by + 8 + bob, '#2A2A3E', aR * 15)}
    ${faceBase(cx, fy + bob)}
    <circle cx="${cx}" cy="${fy + bob}" r="26" fill="none" stroke="${BLK}" stroke-width="1.5"/>
    ${blink ? eyes(cx, fy - 2 + bob, 8, true) : eyes(cx, fy - 2 + bob)}
    ${mouthFlat(cx, fy + 8 + bob)}
    <!-- Beard -->
    <path d="M${cx - 8},${fy + 10 + bob} Q${cx},${fy + 20 + bob} ${cx + 8},${fy + 10 + bob}" fill="#1A1A2E" opacity="0.6"/>
    <!-- Long straight hair -->
    <path d="M${cx - 26},${fy - 6 + bob} L${cx - 24},${fy - 28 + bob} Q${cx},${fy - 34 + bob} ${cx + 24},${fy - 28 + bob} L${cx + 26},${fy - 6 + bob}" fill="#1A1A2E" stroke="${BLK}" stroke-width="1.2"/>
    <rect x="${cx - 28}" y="${fy - 8 + bob}" width="8" height="28" rx="4" fill="#1A1A2E"/>
    <rect x="${cx + 20}" y="${fy - 8 + bob}" width="8" height="28" rx="4" fill="#1A1A2E"/>
  `)
}

// ── Developer — Short hair, green tee, headphones ───────────────────
function devChar(p) {
  const cx = 64, fy = 58, by = 86
  const { legL = 0, legR = 0, aL = 0, aR = 0, blink = false, bob = 0 } = p

  return wrap(`
    ${shadowEllipse(cx, 170)}
    ${shoes(cx, by + 34 + bob, BLK, legL * 4, legR * 4)}
    ${legs(cx, by + 10 + bob, '#4A6FA5', legL * 4, legR * 4)}
    ${bodyRect(cx, by + bob, 42, 38, '#2D8F4E')}
    <path d="M${cx - 10},${by + 2 + bob} Q${cx},${by + 8 + bob} ${cx + 10},${by + 2 + bob}" stroke="#238040" stroke-width="1.5" fill="none"/>
    ${armL(cx, by + 8 + bob, '#2D8F4E', aL * 15, SKIN2)}
    ${armR(cx, by + 8 + bob, '#2D8F4E', aR * 15, SKIN2)}
    ${faceBase(cx, fy + bob, SKIN2)}
    <circle cx="${cx}" cy="${fy + bob}" r="26" fill="none" stroke="${BLK}" stroke-width="1.5"/>
    ${blink ? eyes(cx, fy - 2 + bob, 8, true) : eyes(cx, fy - 2 + bob)}
    ${mouthSmile(cx, fy + 8 + bob)}
    <!-- Short hair -->
    <path d="M${cx - 24},${fy - 6 + bob} Q${cx - 26},${fy - 28 + bob} ${cx},${fy - 32 + bob}
             Q${cx + 26},${fy - 28 + bob} ${cx + 24},${fy - 6 + bob}" fill="#1A1A2E" stroke="${BLK}" stroke-width="1.2"/>
    <!-- Headphones -->
    <path d="M${cx - 26},${fy - 4 + bob} Q${cx - 28},${fy - 30 + bob} ${cx},${fy - 34 + bob}
             Q${cx + 28},${fy - 30 + bob} ${cx + 26},${fy - 4 + bob}" stroke="#555" stroke-width="3.5" fill="none"/>
    <rect x="${cx - 31}" y="${fy - 10 + bob}" width="10" height="14" rx="4" fill="#444" stroke="#333" stroke-width="1"/>
    <rect x="${cx + 21}" y="${fy - 10 + bob}" width="10" height="14" rx="4" fill="#444" stroke="#333" stroke-width="1"/>
  `)
}

// ── Analyst — Blond, vest, tie ──────────────────────────────────────
function analystChar(p) {
  const cx = 64, fy = 56, by = 84  // slightly taller
  const { legL = 0, legR = 0, aL = 0, aR = 0, blink = false, bob = 0 } = p

  return wrap(`
    ${shadowEllipse(cx, 170)}
    ${shoes(cx, by + 36 + bob, '#2C3E50', legL * 4, legR * 4)}
    ${legs(cx, by + 12 + bob, '#34495E', legL * 4, legR * 4)}
    ${bodyRect(cx, by + bob, 38, 40, '#E8E4DE')}
    <!-- Vest sides -->
    <rect x="${cx - 17}" y="${by + 2 + bob}" width="11" height="32" rx="3" fill="#6B7B8D"/>
    <rect x="${cx + 6}" y="${by + 2 + bob}" width="11" height="32" rx="3" fill="#6B7B8D"/>
    <!-- Tie -->
    <line x1="${cx}" y1="${by + 4 + bob}" x2="${cx}" y2="${by + 28 + bob}" stroke="#A78BFA" stroke-width="4"/>
    <polygon points="${cx},${by + 28 + bob} ${cx - 4},${by + 24 + bob} ${cx + 4},${by + 24 + bob}" fill="#A78BFA"/>
    ${armL(cx, by + 8 + bob, '#E8E4DE', aL * 15)}
    ${armR(cx, by + 8 + bob, '#E8E4DE', aR * 15)}
    ${faceBase(cx, fy + bob)}
    <circle cx="${cx}" cy="${fy + bob}" r="26" fill="none" stroke="${BLK}" stroke-width="1.5"/>
    ${blink ? eyes(cx, fy - 2 + bob, 8, true) : eyes(cx, fy - 2 + bob)}
    ${mouthSmile(cx, fy + 8 + bob)}
    ${blush(cx, fy + 4 + bob)}
    <!-- Blond side-part hair -->
    <path d="M${cx - 24},${fy - 6 + bob} Q${cx - 26},${fy - 28 + bob} ${cx - 6},${fy - 30 + bob}
             Q${cx + 8},${fy - 32 + bob} ${cx + 24},${fy - 28 + bob} L${cx + 24},${fy - 6 + bob}" fill="#C4A356" stroke="${BLK}" stroke-width="1.2"/>
  `)
}

// ── QA — Baseball cap, orange tee ───────────────────────────────────
function qaChar(p) {
  const cx = 64, fy = 58, by = 86
  const { legL = 0, legR = 0, aL = 0, aR = 0, blink = false, bob = 0 } = p

  return wrap(`
    ${shadowEllipse(cx, 170)}
    ${shoes(cx, by + 34 + bob, '#555', legL * 4, legR * 4)}
    ${legs(cx, by + 10 + bob, '#4A6FA5', legL * 4, legR * 4)}
    ${bodyRect(cx, by + bob, 44, 38, '#E8820C')}
    <!-- Bug icon on shirt -->
    <circle cx="${cx}" cy="${by + 16 + bob}" r="5" fill="none" stroke="#C06A00" stroke-width="1.2"/>
    <line x1="${cx - 3}" y1="${by + 12 + bob}" x2="${cx - 5}" y2="${by + 9 + bob}" stroke="#C06A00" stroke-width="1"/>
    <line x1="${cx + 3}" y1="${by + 12 + bob}" x2="${cx + 5}" y2="${by + 9 + bob}" stroke="#C06A00" stroke-width="1"/>
    ${armL(cx, by + 8 + bob, '#E8820C', aL * 15)}
    ${armR(cx, by + 8 + bob, '#E8820C', aR * 15)}
    ${faceBase(cx, fy + bob)}
    <circle cx="${cx}" cy="${fy + bob}" r="26" fill="none" stroke="${BLK}" stroke-width="1.5"/>
    ${blink ? eyes(cx, fy - 2 + bob, 8, true) : eyes(cx, fy - 2 + bob)}
    ${mouthSmile(cx, fy + 8 + bob)}
    <!-- Hair under cap -->
    <path d="M${cx - 22},${fy - 6 + bob} Q${cx - 22},${fy - 18 + bob} ${cx},${fy - 22 + bob}
             Q${cx + 22},${fy - 18 + bob} ${cx + 22},${fy - 6 + bob}" fill="#5C3A1E"/>
    <!-- Baseball cap -->
    <ellipse cx="${cx}" cy="${fy - 18 + bob}" rx="28" ry="12" fill="#E8820C" stroke="${BLK}" stroke-width="1.2"/>
    <rect x="${cx - 28}" y="${fy - 18 + bob}" width="56" height="12" fill="#E8820C"/>
    <path d="M${cx - 28},${fy - 14 + bob} L${cx - 36},${fy - 10 + bob} Q${cx - 32},${fy - 18 + bob} ${cx - 28},${fy - 18 + bob}" fill="#CC7008"/>
  `)
}

// ── Frame generators ────────────────────────────────────────────────
const BUILDERS = { pm: pmChar, architect: archChar, developer: devChar, analyst: analystChar, qa: qaChar }

const POSES = {
  idle: [
    { aL: 0, aR: 0, legL: 0, legR: 0, bob: 0, blink: false },
    { aL: 0, aR: 0, legL: 0, legR: 0, bob: -1, blink: false },
    { aL: 0, aR: 0, legL: 0, legR: 0, bob: 0, blink: true },   // blink
    { aL: 0, aR: 0, legL: 0, legR: 0, bob: -1, blink: false },
  ],
  walk: [
    { aL: 1, aR: -1, legL: -1, legR: 1, bob: -1, blink: false },
    { aL: 0, aR: 0, legL: 0, legR: 0, bob: 0, blink: false },
    { aL: -1, aR: 1, legL: 1, legR: -1, bob: -1, blink: false },
    { aL: 0, aR: 0, legL: 0, legR: 0, bob: 0, blink: false },
  ],
  work: [
    { aL: -2, aR: -2, legL: 0, legR: 0, bob: 0, blink: false },
    { aL: -2, aR: -2, legL: 0, legR: 0, bob: -1, blink: false },
    { aL: -2, aR: -2, legL: 0, legR: 0, bob: 0, blink: true },
    { aL: -2, aR: -2, legL: 0, legR: 0, bob: -1, blink: false },
  ],
  error: [
    { aL: 2, aR: 2, legL: 0, legR: 0, bob: 0, blink: false },
    { aL: 2, aR: 2, legL: 0, legR: 0, bob: -2, blink: true },
  ],
}

export function getFrames(role) {
  const build = BUILDERS[role]
  if (!build) return {}
  const result = {}
  for (const [state, poses] of Object.entries(POSES)) {
    result[state] = poses.map(p => build(p))
  }
  return result
}

export { W as SPRITE_W, H as SPRITE_H, ACCENT }
