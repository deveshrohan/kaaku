import { useMemo } from 'react'
import * as THREE from 'three'

// Canvas-textured sprite label above each desk.
// Renders a small pill-shaped badge with the role name.

export default function DeskNameplate({ label, color, position }) {
  const texture = useMemo(() => {
    const s = 2 // retina scale
    const canvas = document.createElement('canvas')
    canvas.width = 128 * s
    canvas.height = 28 * s
    const ctx = canvas.getContext('2d')

    // Background pill
    const pad = 4 * s
    const w = canvas.width - pad * 2
    const h = canvas.height - pad * 2
    const r = 8 * s
    ctx.fillStyle = 'rgba(13, 17, 23, 0.65)'
    ctx.beginPath()
    ctx.roundRect(pad, pad, w, h, r)
    ctx.fill()

    // Subtle border
    ctx.strokeStyle = color + '44'
    ctx.lineWidth = 1.5 * s
    ctx.beginPath()
    ctx.roundRect(pad, pad, w, h, r)
    ctx.stroke()

    // Label text
    ctx.fillStyle = color
    ctx.font = `bold ${12 * s}px -apple-system, BlinkMacSystemFont, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 1 * s)

    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [label, color])

  return (
    <sprite position={position} scale={[0.32, 0.07, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  )
}
