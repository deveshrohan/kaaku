import * as THREE from 'three'
import { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import modelUrl from './riri.glb?url'

export const meta = { id: 'riri', name: 'Riri', icon: '👩‍💼', color: '#C8A44A' }

const CONFETTI_COLORS = ['#C8A44A','#FF6B9D','#A78BFA','#60A5FA','#34D399','#F9A8D4','#FCD34D']
const TARGET_H = 1.85

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
      <boxGeometry args={[0.10, 0.10, 0.02]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

export default function Riri({ animState, onAnimComplete }) {
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
        position: [(Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6],
        color: CONFETTI_COLORS[i % 7],
        velocity: [(Math.random() - 0.5) * 3.5, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 2],
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
        a.idleNext = 9 + Math.random() * 6
      }
      const t = a.idleT
      g.scale.set(1, 1, 1)
      g.rotation.set(0, 0, 0)
      g.position.set(0, 0, 0)

      if (a.idleMode === 0) {
        // Confident weight-shift: gentle side-lean
        g.position.y = Math.sin(t * 0.5 * Math.PI * 2) * 0.03
        g.rotation.z = Math.sin(t * 0.5 * Math.PI * 2) * 0.05
      } else if (a.idleMode === 1) {
        // Subtle head nod — forward lean, slow tempo
        g.rotation.x = Math.sin(t * 0.4 * Math.PI * 2) * 0.07
        g.position.y = Math.abs(Math.sin(t * 0.4 * Math.PI * 2)) * 0.04
      } else if (a.idleMode === 2) {
        // Tapping foot — very subtle bounce with toe-tap rhythm
        g.position.y = Math.abs(Math.sin(t * 1.8)) * 0.06
        g.rotation.z = Math.sin(t * 1.8) * 0.04
      } else {
        // Thinking — slight head tilt + micro-sway
        g.rotation.z = 0.04 + Math.sin(t * 0.3 * Math.PI * 2) * 0.06
        g.rotation.y = Math.sin(t * 0.25 * Math.PI * 2) * 0.10
        g.position.y = Math.sin(t * 0.35 * Math.PI * 2) * 0.025
      }

    } else if (a.state === 'click') {
      // Sharp confident forward step + snap back
      a.actionT = Math.min(a.actionT + dt * 2.0, 1)
      const p = a.actionT
      if (p < 0.3) {
        const w = p / 0.3
        g.position.set(0, w * 0.12, 0)
        g.rotation.x = -w * 0.20
        g.rotation.z = -w * 0.08
      } else if (p < 0.6) {
        const w = (p - 0.3) / 0.3
        g.position.set(0, 0.12 - w * 0.12, 0)
        g.rotation.x = -0.20 + w * 0.20
        g.rotation.z = -0.08 + w * 0.08
      } else {
        const w = (p - 0.6) / 0.4
        g.position.set(0, Math.sin(w * Math.PI) * 0.06, 0)
        g.rotation.set(0, 0, 0)
      }
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
      }

    } else if (a.state === 'celebrate') {
      // Victory jump — high arc with spin and confetti
      a.actionT = Math.min(a.actionT + dt * 0.5, 1)
      const p = a.actionT
      g.position.set(0, Math.abs(Math.sin(p * Math.PI * 6)) * 0.38, 0)
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
      // 💪 POWER POSE — slow grow tall + chest out, hold, then release
      a.actionT = Math.min(a.actionT + dt * 0.65, 1)
      const p = a.actionT
      const env = Math.sin(p * Math.PI)
      if (p < 0.35) {
        // Rise and open up
        const w = p / 0.35
        g.position.set(0, w * 0.18, 0)
        g.rotation.set(-w * 0.22, 0, 0)
        g.scale.set(1 + w * 0.12, 1 + w * 0.10, 1 + w * 0.12)
      } else if (p < 0.72) {
        // HOLD the pose — commanding stillness
        g.position.set(0, 0.18, 0)
        g.rotation.set(-0.22, 0, 0)
        g.scale.set(1.12, 1.10, 1.12)
      } else {
        // Graceful settle back down
        const w = (p - 0.72) / 0.28
        g.position.set(0, 0.18 * (1 - w), 0)
        g.rotation.set(-0.22 * (1 - w), 0, 0)
        g.scale.set(1 + 0.12 * (1 - w), 1 + 0.10 * (1 - w), 1 + 0.12 * (1 - w))
      }
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special2') {
      // 📱 PHONE CALL — tilt head, bob, then snap back confident
      a.actionT = Math.min(a.actionT + dt * 0.55, 1)
      const p = a.actionT
      if (p < 0.2) {
        const w = p / 0.2
        g.rotation.set(0, 0, w * 0.28)
        g.position.set(w * 0.08, 0, 0)
      } else if (p < 0.75) {
        // Bobbing while "talking"
        const t2 = (p - 0.2) / 0.55
        g.rotation.set(Math.sin(t2 * Math.PI * 5) * 0.06, 0, 0.28)
        g.position.set(0.08, Math.abs(Math.sin(t2 * Math.PI * 5)) * 0.06, 0)
      } else {
        const w = (p - 0.75) / 0.25
        g.rotation.set(0, 0, 0.28 * (1 - w))
        g.position.set(0.08 * (1 - w), 0, 0)
      }
      g.scale.set(1, 1, 1)
      if (a.actionT >= 1) {
        a.state = 'idle'; a.idleT = 0
        g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1)
        onAnimComplete && onAnimComplete()
      }

    } else if (a.state === 'special3') {
      // 🚀 HUSTLE MODE — rapid forward lean pulses, building urgency
      a.actionT = Math.min(a.actionT + dt * 0.90, 1)
      const p = a.actionT
      const env = Math.sin(p * Math.PI)
      const pulse = Math.abs(Math.sin(p * Math.PI * 9)) * env
      g.position.set(0, pulse * 0.22, 0)
      g.rotation.set(-pulse * 0.30, 0, Math.sin(p * Math.PI * 9) * env * 0.10)
      g.scale.set(1 + pulse * 0.07, 1 + pulse * 0.05, 1 + pulse * 0.07)
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
        <primitive object={scene} scale={ms} position={[ox, oy, oz]} rotation={[0, Math.PI, 0]} />
      </group>
    </>
  )
}

useGLTF.preload(modelUrl)
