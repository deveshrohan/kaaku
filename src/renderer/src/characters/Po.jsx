import * as THREE from 'three'
import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import modelUrl from './po.glb?url'

export const meta = { id: 'po', name: 'Po', icon: '🐼', color: '#222222' }

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

export default function Po({ animState, onAnimComplete }) {
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
      setConfetti(Array.from({ length: 44 }, (_, i) => ({
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
        g.position.y = Math.abs(Math.sin(t * 0.8 * Math.PI * 2)) * 0.10
        g.rotation.z = Math.sin(t * 0.8 * Math.PI * 2) * 0.12
      } else if (a.idleMode === 1) {
        g.position.y = Math.sin(t * 0.6 * Math.PI * 2) * 0.05
        g.rotation.x = -0.10
        g.rotation.z = Math.sin(t * 0.5 * Math.PI * 2) * 0.06
        g.rotation.y = Math.sin(t * 0.4 * Math.PI * 2) * 0.12
      } else if (a.idleMode === 2) {
        g.position.y = Math.abs(Math.sin(t * 2.0)) * 0.16
        g.rotation.z = Math.sin(t * 2.0 * Math.PI) * 0.08
        g.rotation.y = Math.sin(t * 1.0 * Math.PI * 2) * 0.14
      } else {
        g.position.y = Math.sin(t * 0.4 * Math.PI * 2) * 0.04
        g.rotation.z = Math.sin(t * 0.35 * Math.PI * 2) * 0.16
        g.rotation.x = 0.06
      }

    } else if (a.state === 'click') {
      a.actionT = Math.min(a.actionT + dt * 1.8, 1)
      const p = a.actionT
      if (p < 0.35) {
        g.position.set(0, p * 0.1, 0)
        g.rotation.x = -(p / 0.35) * 0.35
        g.rotation.z = 0
      } else {
        g.position.set(0, Math.sin(p * Math.PI) * 0.45, 0)
        g.rotation.y = ((p - 0.35) / 0.65) * Math.PI * 2
        g.rotation.x = -0.35 + ((p - 0.35) / 0.65) * 0.35
      }
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
      }

    } else if (a.state === 'celebrate') {
      a.actionT = Math.min(a.actionT + dt * 0.5, 1)
      const p = a.actionT
      g.position.set(0, Math.abs(Math.sin(p * Math.PI * 7)) * 0.30, 0)
      g.rotation.y = p * Math.PI * 5
      g.rotation.z = Math.sin(p * Math.PI * 7) * 0.14
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
        setConfetti([])
      }

    } else if (a.state === 'special1') {
      // 🤚 SKADOOSH — dramatic FREEZE (held still), then EXPLOSION of Z-rotation (barrel roll)
      a.actionT = Math.min(a.actionT + dt * 0.70, 1)
      const p = a.actionT
      if (p < 0.25) {
        // slow dramatic build: sink and lean back
        const w = p / 0.25
        g.position.set(0, -w * 0.12, 0)
        g.rotation.set(w * 0.28, 0, 0)
        g.scale.set(1 + w * 0.10, 1 - w * 0.12, 1 + w * 0.10)
      } else if (p < 0.48) {
        // FREEZE — absolute stillness (dramatic pause)
        g.position.set(0, -0.12, 0)
        g.rotation.set(0.28, 0, 0)
        g.scale.set(1.10, 0.88, 1.10)
      } else {
        // SKADOOSH — Z-axis barrel roll + jump (totally different axis from Y spins!)
        const w = (p - 0.48) / 0.52
        g.position.set(0, Math.sin(w * Math.PI) * 0.55, 0)
        g.rotation.set(0, 0, w * Math.PI * 4)   // Z barrel roll, NOT Y spin
        g.scale.set(1, 1, 1)
      }
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special2') {
      // 🐉 DRAGON WARRIOR — puff up with pride: scale grows, chest puffs out (X lean back)
      a.actionT = Math.min(a.actionT + dt * 0.55, 1)
      const p = a.actionT
      const env = Math.sin(p * Math.PI)
      g.position.set(0, env * 0.22, 0)
      // Proud backward lean (chest out), NO spinning
      g.rotation.set(-env * 0.35, 0, 0)
      // Grow wide with pride (X scale big, Y also big)
      g.scale.set(1 + env * 0.30, 1 + env * 0.22, 1 + env * 0.20)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special3') {
      // 🍜 FOOD EXCITEMENT — rapid up-down bouncing, growing bigger each bounce (pure Y movement)
      a.actionT = Math.min(a.actionT + dt * 0.95, 1)
      const p = a.actionT
      const env = Math.sin(p * Math.PI)
      // 8 rapid bounces, getting higher and more excited
      const bounce = Math.abs(Math.sin(p * Math.PI * 8)) * env
      g.position.set(0, bounce * 0.45, 0)
      // Slight Z tilt each bounce (waddle)
      g.rotation.set(0, 0, Math.sin(p * Math.PI * 8) * env * 0.18)
      // Squash on land, stretch on rise
      const squat = Math.sin(p * Math.PI * 8) > 0 ? 1 + bounce * 0.20 : 1 - bounce * 0.15
      g.scale.set(1 + bounce * 0.12, squat, 1 + bounce * 0.12)
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
