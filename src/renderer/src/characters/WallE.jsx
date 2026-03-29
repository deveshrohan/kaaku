import * as THREE from 'three'
import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import modelUrl from './walle.glb?url'
import handleTrapdoor from './useTrapdoorAnim'

export const meta = { id: 'walle', name: 'Wall·E', icon: '🤖', color: '#C09035' }

const CONFETTI_COLORS = ['#FFD700','#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98FB98','#DDA0DD']
const TARGET_H = 1.8

function ConfettiParticle({ position, color, velocity }) {
  const ref = useRef()
  const vel = useRef([...velocity])
  useFrame((_, dt) => {
    if (!ref.current) return
    vel.current[1] -= 4 * dt
    ref.current.position.x += vel.current[0] * dt
    ref.current.position.y += vel.current[1] * dt
    ref.current.position.z += vel.current[2] * dt
    ref.current.rotation.x += 3 * dt
    ref.current.rotation.z += 2 * dt
  })
  return (
    <mesh ref={ref} position={position}>
      <boxGeometry args={[0.12, 0.12, 0.03]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

export default function WallE({ animState, onAnimComplete }) {
  const { scene } = useGLTF(modelUrl)

  const [ms, ox, oy, oz] = useMemo(() => {
    scene.scale.set(1, 1, 1)
    scene.position.set(0, 0, 0)
    scene.rotation.set(0, 0, 0)
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const sz = new THREE.Vector3()
    box.getSize(sz)
    const s = sz.y > 0 ? TARGET_H / sz.y : 1
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    return [s, cz * s, -box.min.y * s, -cx * s]
  }, [scene])

  const gRef = useRef()
  const A = useRef({ state: 'idle', idleMode: 0, idleT: 0, idleNext: 10, actionT: 0 })
  const [confetti, setConfetti] = useState([])

  useEffect(() => {
    const prev = A.current.state
    A.current.state = animState
    A.current.actionT = 0
    if (animState === 'celebrate' && prev !== 'celebrate') {
      setConfetti(Array.from({ length: 40 }, (_, i) => ({
        id: Date.now() + i,
        position: [(Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.0, (Math.random() - 0.5) * 0.6],
        color: CONFETTI_COLORS[i % 7],
        velocity: [(Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 2],
      })))
    }
  }, [animState])

  useFrame((_, dt) => {
    const a = A.current
    const g = gRef.current
    if (!g) return
    if (handleTrapdoor(g, a, dt, onAnimComplete)) return

    if (a.state === 'idle') {
      a.idleT += dt
      if (a.idleT > a.idleNext) {
        a.idleMode = (a.idleMode + 1) % 4
        a.idleT = 0
        a.idleNext = 8 + Math.random() * 6
      }
      const t = a.idleT
      g.scale.set(1, 1, 1)
      g.rotation.set(0, 0, 0)
      g.position.set(0, 0, 0)

      if (a.idleMode === 0) {
        g.position.y = Math.sin(t * 0.45 * Math.PI * 2) * 0.06
        g.rotation.z = Math.sin(t * 0.45 * Math.PI * 2) * 0.025
      } else if (a.idleMode === 1) {
        g.position.y = Math.sin(t * 0.3 * Math.PI * 2) * 0.04
        g.rotation.y = Math.sin(t * 0.22 * Math.PI * 2) * 0.28
      } else if (a.idleMode === 2) {
        g.position.y = Math.abs(Math.sin(t * 0.6 * Math.PI * 2)) * 0.05
        g.rotation.z = Math.sin(t * 0.6 * Math.PI * 2) * 0.10
        g.rotation.x = Math.sin(t * 0.4 * Math.PI * 2) * 0.06
      } else {
        g.position.y = 0.03
        g.rotation.y = Math.sin(t * 0.2 * Math.PI * 2) * Math.PI * 0.5
      }

    } else if (a.state === 'click') {
      a.actionT = Math.min(a.actionT + dt * 1.8, 1)
      const p = a.actionT
      g.position.set(0, Math.sin(p * Math.PI) * 0.45, 0)
      g.rotation.y = p * Math.PI * 2
      g.rotation.z = Math.sin(p * Math.PI * 2) * 0.18
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
      }

    } else if (a.state === 'celebrate') {
      a.actionT = Math.min(a.actionT + dt * 0.5, 1)
      const p = a.actionT
      g.position.set(0, Math.abs(Math.sin(p * Math.PI * 6)) * 0.28, 0)
      g.rotation.y = p * Math.PI * 4
      g.rotation.z = Math.sin(p * Math.PI * 6) * 0.12
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
        setConfetti([])
      }

    } else if (a.state === 'special1') {
      // 🗜️ TRASH COMPACTION — dramatic full squash (flat as a pancake) then spring TALL
      a.actionT = Math.min(a.actionT + dt * 1.0, 1)
      const p = a.actionT
      if (p < 0.30) {
        // compress down
        const w = p / 0.30
        g.scale.set(1 + w * 0.9, 1 - w * 0.82, 1 + w * 0.9)
        g.position.set(0, -w * 0.22, 0)
        g.rotation.set(0, 0, 0)
      } else if (p < 0.55) {
        // held flat (mechanical dwell)
        g.scale.set(1.9, 0.18, 1.9)
        g.position.set(0, -0.22, 0)
        g.rotation.set(0, 0, 0)
      } else if (p < 0.72) {
        // SPRING upward — overshoot tall
        const w = (p - 0.55) / 0.17
        g.scale.set(1.9 - w * 1.4, 0.18 + w * 1.82, 1.9 - w * 1.4)
        g.position.set(0, -0.22 + w * 0.55, 0)
        g.rotation.set(0, 0, 0)
      } else {
        // settle with small bounces
        const w = (p - 0.72) / 0.28
        const bounce = Math.sin(w * Math.PI * 3) * (1 - w) * 0.18
        g.position.set(0, 0.33 - w * 0.33 + bounce, 0)
        g.scale.set(1, 1, 1)
        g.rotation.set(0, 0, 0)
      }
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special2') {
      // 🌟 EVE LONGING — slow backward lean gazing upward, NO Y-spin (pure X-tilt)
      a.actionT = Math.min(a.actionT + dt * 0.45, 1)
      const p = a.actionT
      const arc = Math.sin(p * Math.PI)
      g.position.set(0, arc * 0.20, 0)
      g.rotation.set(-arc * 0.55, 0, 0)     // lean back to look up at EVE, no Y spin
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special3') {
      // 🕺 HAPPY DANCE — mechanical stutter-step: rapid left-right jumps
      a.actionT = Math.min(a.actionT + dt * 0.85, 1)
      const p = a.actionT
      const env = Math.sin(p * Math.PI)
      const step = Math.sign(Math.sin(p * Math.PI * 9))  // discrete left/right steps
      g.position.set(step * env * 0.28, Math.abs(Math.sin(p * Math.PI * 9)) * env * 0.25, 0)
      g.rotation.set(0, 0, step * env * 0.30)   // lean into each step
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }
    }
  })

  return (
    <>
      {confetti.map(c => <ConfettiParticle key={c.id} {...c} />)}
      <group ref={gRef}>
        <primitive object={scene} scale={ms} position={[ox, oy, oz]} rotation={[0, -Math.PI / 2, 0]} />
      </group>
    </>
  )
}

useGLTF.preload(modelUrl)
