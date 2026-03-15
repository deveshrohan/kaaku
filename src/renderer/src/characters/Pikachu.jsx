import * as THREE from 'three'
import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import modelUrl from './pikachu.glb?url'

export const meta = { id: 'pikachu', name: 'Pikachu', icon: '⚡', color: '#F7E142' }

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

export default function Pikachu({ animState, onAnimComplete }) {
  const { scene } = useGLTF(modelUrl)

  const [ms, ox, oy, oz] = useMemo(() => {
    // Reset root transform: R3F sets scene.scale on prior renders, which would
    // corrupt setFromObject measurements if not cleared first
    scene.scale.set(1, 1, 1)
    scene.position.set(0, 0, 0)
    scene.rotation.set(0, 0, 0)
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const sz = new THREE.Vector3()
    box.getSize(sz)
    const s = sz.y > 0 ? TARGET_H / sz.y : 1
    // rotation={[0,-π/2,0]}: local X→world Z, local Z→-world X
    // so ox cancels Z-center, oz cancels X-center
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
        g.position.y = Math.sin(t * 1.3 * Math.PI * 2) > 0 ? Math.sin(t * 1.3 * Math.PI * 2) * 0.12 : 0
        g.rotation.z = Math.sin(t * 1.3 * Math.PI * 2) * 0.04
      } else if (a.idleMode === 1) {
        g.position.y = Math.sin(t * 0.5 * Math.PI * 2) * 0.04
        g.rotation.y = Math.sin(t * 0.35 * Math.PI * 2) * 0.45
      } else if (a.idleMode === 2) {
        g.position.y = Math.abs(Math.sin(t * 2.8)) * 0.20
        g.rotation.y = Math.sin(t * 2.8) * 0.12
        g.rotation.z = Math.sin(t * 2.8 * Math.PI) * 0.06
      } else {
        g.position.y = Math.sin(t * 0.6 * Math.PI * 2) * 0.05
        g.rotation.z = 0.22
        g.rotation.y = Math.sin(t * 0.3 * Math.PI * 2) * 0.20
      }

    } else if (a.state === 'click') {
      a.actionT = Math.min(a.actionT + dt * 1.8, 1)
      const p = a.actionT
      g.position.set(0, Math.sin(p * Math.PI) * 0.55, 0)
      g.rotation.y = p * Math.PI * 2
      const sq = p > 0.82 ? (p - 0.82) / 0.18 : 0
      g.scale.set(1 + sq * 0.22, 1 - sq * 0.28, 1 + sq * 0.22)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
      }

    } else if (a.state === 'celebrate') {
      a.actionT = Math.min(a.actionT + dt * 0.5, 1)
      const p = a.actionT
      g.position.set(0, Math.abs(Math.sin(p * Math.PI * 8)) * 0.30, 0)
      g.rotation.y = p * Math.PI * 6
      g.rotation.z = Math.sin(p * Math.PI * 8) * 0.14
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
        setConfetti([])
      }

    } else if (a.state === 'special1') {
      // ⚡ THUNDERBOLT — pure side-to-side electric convulsion, NO spinning
      a.actionT = Math.min(a.actionT + dt * 1.1, 1)
      const p = a.actionT
      const env = Math.sin(p * Math.PI)              // envelope: 0→1→0
      const hz = Math.sin(p * Math.PI * 30) * env   // rapid oscillation
      g.position.set(hz * 0.35, Math.abs(hz) * 0.15, 0)
      g.rotation.set(0, hz * 0.25, hz * 1.0)        // no Y-spin, side tilt only
      const pulse = 1 + Math.sin(p * Math.PI * 24) * env * 0.22
      g.scale.set(pulse, pulse, pulse)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special2') {
      // 💨 QUICK ATTACK — lightning-fast straight lunge (Z axis only, NO rotation)
      a.actionT = Math.min(a.actionT + dt * 3.0, 1)
      const p = a.actionT
      if (p < 0.08) {
        // wind-up: squash back
        const w = p / 0.08
        g.position.set(0, 0, w * 0.4)
        g.scale.set(1 + w * 0.4, 1 - w * 0.35, 1 - w * 0.35)
        g.rotation.set(0, 0, 0)
      } else if (p < 0.35) {
        // LUNGE forward
        const w = (p - 0.08) / 0.27
        g.position.set(0, w * 0.1, 0.4 - w * 1.6)
        g.scale.set(1 + 0.4 - w * 0.4, 1 - 0.35 * (1 - w), 1 + w * 0.5)
        g.rotation.set(0, 0, 0)
      } else {
        // return: bounce up
        const w = (p - 0.35) / 0.65
        g.position.set(0, Math.sin(w * Math.PI) * 0.38, -1.2 + w * 1.2)
        g.scale.set(1, 1, 1)
        g.rotation.set(0, 0, 0)
      }
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special3') {
      // 🩷 CHARM — dreamy slow tilt-and-float with a gentle Z-lean (feminine/cute pose)
      a.actionT = Math.min(a.actionT + dt * 0.5, 1)
      const p = a.actionT
      const sway = Math.sin(p * Math.PI * 4) * (1 - p * 0.5)
      g.position.set(sway * 0.12, Math.sin(p * Math.PI) * 0.28, 0)
      g.rotation.set(0, sway * 0.25, 0.32 * Math.sin(p * Math.PI * 2))  // Z-tilt, no full spin
      const s = 1 + Math.sin(p * Math.PI) * 0.22
      g.scale.set(s, s, s)
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
