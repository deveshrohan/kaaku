import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getFrames, SPRITE_W, SPRITE_H } from './sprites'

// ── SVG → CanvasTexture pipeline ────────────────────────────────────
// Pre-renders all SVG frames for a role into GPU-ready textures.
// Done once per role, cached in module scope.

const textureCache = {}

function svgToCanvas(svgString) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = SPRITE_W
    canvas.height = SPRITE_H
    const ctx = canvas.getContext('2d')

    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image(SPRITE_W, SPRITE_H)
    img.onload = () => {
      ctx.clearRect(0, 0, SPRITE_W, SPRITE_H)
      ctx.drawImage(img, 0, 0, SPRITE_W, SPRITE_H)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(canvas) // return blank
    }
    img.src = url
  })
}

async function buildTextures(role) {
  if (textureCache[role]) return textureCache[role]

  const frames = getFrames(role)
  const result = {}

  for (const [state, svgs] of Object.entries(frames)) {
    result[state] = []
    for (const svg of svgs) {
      const canvas = await svgToCanvas(svg)
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.minFilter = THREE.NearestFilter
      tex.magFilter = THREE.NearestFilter
      result[state].push(tex)
    }
  }

  textureCache[role] = result
  return result
}

// ── Easing ──────────────────────────────────────────────────────────
const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

// ── SpriteCharacter ─────────────────────────────────────────────────
// Renders a billboard sprite at a position with animation.
// Props:
//   role     — 'pm' | 'architect' | 'developer' | 'analyst' | 'qa'
//   position — [x, y, z] base position
//   state    — 'idle' | 'walk' | 'work'
//   walkTo   — [x, y, z] target position (when state='walk')
//   walkDuration — seconds for walk tween
//   onWalkDone   — callback when walk completes
//   scale    — sprite scale multiplier

export default function SpriteCharacter({
  role,
  position = [0, 0, 0],
  state = 'idle',
  walkTo = null,
  walkDuration = 1.5,
  onWalkDone,
  scale = 0.45,
}) {
  const matRef = useRef()
  const spriteRef = useRef()
  const frameData = useRef({ idx: 0, elapsed: 0 })
  const walkData = useRef({ t: 0, active: false, from: null, to: null })
  const [textures, setTextures] = useState(null)

  // Load textures on mount
  useEffect(() => {
    buildTextures(role).then(setTextures)
  }, [role])

  // Handle walk initiation
  useEffect(() => {
    if (state === 'walk' && walkTo) {
      walkData.current = {
        t: 0,
        active: true,
        from: new THREE.Vector3(...position),
        to: new THREE.Vector3(...walkTo),
      }
    } else {
      walkData.current.active = false
    }
  }, [state, walkTo?.[0], walkTo?.[1], walkTo?.[2]])

  // Animation loop
  useFrame((_, dt) => {
    if (!textures || !matRef.current) return

    const currentState = state
    const frames = textures[currentState] || textures.idle
    if (!frames || frames.length === 0) return

    // Frame animation
    const fps = currentState === 'walk' ? 6 : 3
    const fd = frameData.current
    fd.elapsed += dt
    if (fd.elapsed >= 1 / fps) {
      fd.elapsed = 0
      fd.idx = (fd.idx + 1) % frames.length
      matRef.current.map = frames[fd.idx]
      matRef.current.needsUpdate = true
    }

    // Walk position tween
    const w = walkData.current
    if (w.active && spriteRef.current && w.from && w.to) {
      w.t = Math.min(w.t + dt / walkDuration, 1)
      const eased = easeInOut(w.t)
      spriteRef.current.position.lerpVectors(w.from, w.to, eased)

      // Add a little bounce
      spriteRef.current.position.y += Math.sin(eased * Math.PI) * 0.05

      if (w.t >= 1) {
        w.active = false
        onWalkDone?.()
      }
    }
  })

  if (!textures) return null
  const initialFrames = textures[state] || textures.idle
  if (!initialFrames || initialFrames.length === 0) return null

  // Aspect ratio: character is taller than wide
  const aspect = SPRITE_W / SPRITE_H
  const sy = scale
  const sx = sy * aspect

  return (
    <sprite ref={spriteRef} position={position} scale={[sx, sy, 1]}>
      <spriteMaterial
        ref={matRef}
        map={initialFrames[0]}
        transparent
        alphaTest={0.01}
        depthWrite={false}
      />
    </sprite>
  )
}
