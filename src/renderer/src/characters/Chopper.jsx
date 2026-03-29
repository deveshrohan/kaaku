import * as THREE from 'three'
import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import modelUrl from './chopper.glb?url'
import handleTrapdoor from './useTrapdoorAnim'

export const meta = { id: 'chopper', name: 'Chopper', icon: '🦌', color: '#7B4F2E' }

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

export default function Chopper({ animState, onAnimComplete }) {
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
        g.position.y = Math.abs(Math.sin(t * 1.5 * Math.PI * 2)) * 0.16
        g.rotation.z = Math.sin(t * 1.5 * Math.PI * 2) * 0.07
      } else if (a.idleMode === 1) {
        g.position.y = Math.abs(Math.sin(t * 2 * Math.PI * 2)) * 0.08
        g.rotation.z = Math.sin(t * 2.5 * Math.PI * 2) * 0.22
        g.rotation.y = Math.sin(t * 2.0 * Math.PI * 2) * 0.18
      } else if (a.idleMode === 2) {
        g.position.y = Math.abs(Math.sin(t * 3.2)) * 0.10
        g.rotation.z = Math.sin(t * 3.2 * Math.PI) * 0.05
      } else {
        g.position.y = Math.sin(t * 0.6 * Math.PI * 2) * 0.06
        g.rotation.z = 0.24
        g.rotation.x = 0.08
        g.rotation.y = Math.sin(t * 0.4 * Math.PI * 2) * 0.18
      }

    } else if (a.state === 'click') {
      a.actionT = Math.min(a.actionT + dt * 1.8, 1)
      const p = a.actionT
      g.position.set(0, Math.sin(p * Math.PI) * 0.50, 0)
      g.rotation.y = p * Math.PI * 2.5
      g.rotation.z = Math.sin(p * Math.PI * 3) * 0.22
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
      }

    } else if (a.state === 'celebrate') {
      a.actionT = Math.min(a.actionT + dt * 0.5, 1)
      const p = a.actionT
      g.position.set(0, Math.abs(Math.sin(p * Math.PI * 10)) * 0.32, 0)
      g.rotation.y = p * Math.PI * 6
      g.rotation.z = Math.sin(p * Math.PI * 10) * 0.18
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
        setConfetti([])
      }

    } else if (a.state === 'special1') {
      // 💊 RUMBLE BALL — intense shake → SCALE UP to 2x (Heavy Point!) → shrink back
      a.actionT = Math.min(a.actionT + dt * 0.90, 1)
      const p = a.actionT
      if (p < 0.35) {
        // intense pre-transformation shaking
        const w = p / 0.35
        const shake = Math.sin(p * Math.PI * 28) * w * 0.22
        g.position.set(shake, Math.abs(shake) * 0.15, 0)
        g.rotation.set(0, 0, shake * 0.9)
        g.scale.set(1, 1, 1)
      } else if (p < 0.55) {
        // POWER UP — grow to 2x
        const w = (p - 0.35) / 0.20
        g.position.set(0, w * 0.40, 0)
        g.rotation.set(0, 0, 0)
        g.scale.set(1 + w * 1.05, 1 + w * 1.05, 1 + w * 1.05)
      } else if (p < 0.72) {
        // hold at 2x — stomp in place
        const w = (p - 0.55) / 0.17
        g.position.set(0, 0.40 - Math.abs(Math.sin(w * Math.PI * 3)) * 0.10, 0)
        g.rotation.set(0, 0, 0)
        g.scale.set(2.05, 2.05, 2.05)
      } else {
        // shrink back
        const w = (p - 0.72) / 0.28
        g.position.set(0, 0.40 - w * 0.40, 0)
        g.rotation.set(0, 0, 0)
        g.scale.set(2.05 - w * 1.05, 2.05 - w * 1.05, 2.05 - w * 1.05)
      }
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special2') {
      // 🩺 MEDICAL CHECK — deep forward lean (X-axis), curious head-bob inspection
      a.actionT = Math.min(a.actionT + dt * 0.75, 1)
      const p = a.actionT
      if (p < 0.30) {
        const w = p / 0.30
        g.position.set(0, 0, -w * 0.45)
        g.rotation.set(w * 0.55, 0, 0)
        g.scale.set(1, 1, 1)
      } else if (p < 0.65) {
        // inspect: bob and tilt
        const w = (p - 0.30) / 0.35
        g.position.set(Math.sin(w * Math.PI * 5) * 0.12, 0, -0.45)
        g.rotation.set(0.55, 0, Math.sin(w * Math.PI * 5) * 0.20)
        g.scale.set(1, 1, 1)
      } else {
        const w = (p - 0.65) / 0.35
        g.position.set(0, Math.sin(w * Math.PI) * 0.18, -0.45 + w * 0.45)
        g.rotation.set(0.55 - w * 0.55, 0, 0)
        g.scale.set(1, 1, 1)
      }
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special3') {
      // 😳 EMBARRASSED — rapid Z-axis side-tilt head-shake denial + shrink
      a.actionT = Math.min(a.actionT + dt * 0.80, 1)
      const p = a.actionT
      const env = Math.sin(p * Math.PI)
      const shake = Math.sin(p * Math.PI * 16) * env
      g.position.set(shake * 0.18, Math.abs(shake) * 0.10, 0)
      // ONLY Z-tilt (NOT Y spin) — distinctive side-to-side head shake
      g.rotation.set(0.08, 0, shake * 0.55 + 0.22)
      const shy = 1 - env * 0.28
      g.scale.set(shy, shy, shy)
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
