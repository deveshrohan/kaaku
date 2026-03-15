import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── Colour palette ──────────────────────────────────────────────
const C = {
  body:       '#C8A44A',
  bodyDark:   '#A0823A',
  head:       '#BF9D47',
  metal:      '#7A6B55',
  darkMetal:  '#3A3530',
  tread:      '#1E1E1E',
  treadRim:   '#2D2B28',
  eyeShell:   '#2C2C2C',
  eyeLens:    '#87CEEB',
  eyeInner:   '#1A4F6E',
  eyeShine:   '#FFFFFF',
  chestPanel: '#8A6C30',
  accent:     '#5C4A2A',
  arm:        '#9B8040',
  rust:       '#8B5E3C',
}

// ── Tread ───────────────────────────────────────────────────────
function Tread({ x }) {
  return (
    <group position={[x, -0.62, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.38, 0.52, 1.55]} />
        <meshStandardMaterial color={C.tread} roughness={0.95} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, 0.7]}>
        <cylinderGeometry args={[0.26, 0.26, 0.38, 20]} />
        <meshStandardMaterial color={C.treadRim} roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, -0.7]}>
        <cylinderGeometry args={[0.26, 0.26, 0.38, 20]} />
        <meshStandardMaterial color={C.treadRim} roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <boxGeometry args={[0.3, 0.06, 1.3]} />
        <meshStandardMaterial color={C.metal} roughness={0.7} metalness={0.5} />
      </mesh>
      {[-0.55, -0.28, 0, 0.28, 0.55].map((z) => (
        <mesh key={z} position={[0, -0.04, z]}>
          <boxGeometry args={[0.42, 0.12, 0.06]} />
          <meshStandardMaterial color={C.treadRim} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

// ── Arm ─────────────────────────────────────────────────────────
function Arm({ x, armRef }) {
  const sign = x > 0 ? 1 : -1
  return (
    <group ref={armRef} position={[x, 0.05, 0]} rotation={[0, 0, sign * 0.3]}>
      <mesh position={[sign * 0.12, -0.22, 0]} castShadow>
        <boxGeometry args={[0.18, 0.46, 0.18]} />
        <meshStandardMaterial color={C.arm} roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[sign * 0.12, -0.48, 0]}>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshStandardMaterial color={C.metal} roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[sign * 0.12, -0.68, 0]} castShadow>
        <boxGeometry args={[0.15, 0.38, 0.15]} />
        <meshStandardMaterial color={C.arm} roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[sign * 0.05, -0.9, 0.08]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.1, 0.22, 0.08]} />
        <meshStandardMaterial color={C.darkMetal} roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={[sign * 0.2, -0.9, 0.08]} rotation={[-0.4, 0, 0]}>
        <boxGeometry args={[0.1, 0.22, 0.08]} />
        <meshStandardMaterial color={C.darkMetal} roughness={0.7} metalness={0.5} />
      </mesh>
    </group>
  )
}

// ── Eye binocular — cylinder points TOWARD camera (Z-axis) ──────
// CylinderGeometry default axis = Y. Rotating [π/2, 0, 0] maps Y→+Z,
// so the "top" cap ends up at z=+half_height (facing camera).
function Eye({ x, eyeRef }) {
  return (
    <group ref={eyeRef} position={[x, 0.14, 0.28]}>
      {/* tube shell — rotated so flat faces point toward/away camera */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.165, 0.165, 0.52, 24]} />
        <meshStandardMaterial color={C.eyeShell} roughness={0.35} metalness={0.75} />
      </mesh>

      {/* front rim ring */}
      <mesh position={[0, 0, 0.27]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 24]} />
        <meshStandardMaterial color={C.darkMetal} roughness={0.25} metalness={0.95} />
      </mesh>

      {/* glass lens — circleGeometry faces +Z by default */}
      <mesh position={[0, 0, 0.29]}>
        <circleGeometry args={[0.135, 32]} />
        <meshStandardMaterial
          color={C.eyeLens}
          roughness={0.02}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* iris / pupil */}
      <mesh position={[0, 0, 0.295]}>
        <circleGeometry args={[0.068, 24]} />
        <meshStandardMaterial color={C.eyeInner} roughness={0.1} side={THREE.DoubleSide} />
      </mesh>

      {/* specular shine dot */}
      <mesh position={[0.045, 0.045, 0.302]}>
        <circleGeometry args={[0.022, 8]} />
        <meshStandardMaterial
          color={C.eyeShine}
          emissive="#FFFFFF"
          emissiveIntensity={2.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

// ── Head ─────────────────────────────────────────────────────────
function Head({ headRef, leftEyeRef, rightEyeRef }) {
  return (
    <group ref={headRef} position={[0, 1.18, 0]}>
      {/* head box */}
      <mesh castShadow>
        <boxGeometry args={[1.05, 0.65, 0.9]} />
        <meshStandardMaterial color={C.head} roughness={0.75} metalness={0.2} />
      </mesh>
      {/* brow ridge above eyes */}
      <mesh position={[0, 0.3, 0.42]}>
        <boxGeometry args={[0.85, 0.07, 0.12]} />
        <meshStandardMaterial color={C.bodyDark || C.accent} roughness={0.8} />
      </mesh>
      {/* back panel */}
      <mesh position={[0, 0, -0.47]}>
        <boxGeometry args={[0.85, 0.5, 0.06]} />
        <meshStandardMaterial color={C.metal} roughness={0.6} metalness={0.4} />
      </mesh>
      {/* eyes mounted on head, protruding from front face */}
      <Eye x={-0.26} eyeRef={leftEyeRef} />
      <Eye x={ 0.26} eyeRef={rightEyeRef} />
    </group>
  )
}

// ── Body ─────────────────────────────────────────────────────────
function Body() {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[1.3, 1.35, 1.1]} />
        <meshStandardMaterial color={C.body} roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.08, 0.56]}>
        <boxGeometry args={[0.82, 0.72, 0.06]} />
        <meshStandardMaterial color={C.chestPanel} roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.08, 0.59]}>
        <boxGeometry args={[0.7, 0.6, 0.02]} />
        <meshStandardMaterial color={C.accent} roughness={1} />
      </mesh>
      <mesh position={[0.66, 0.1, 0]}>
        <boxGeometry args={[0.02, 1.1, 0.9]} />
        <meshStandardMaterial color={C.metal} roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[-0.66, 0.1, 0]}>
        <boxGeometry args={[0.02, 1.1, 0.9]} />
        <meshStandardMaterial color={C.metal} roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.69, 0]}>
        <boxGeometry args={[1.35, 0.08, 1.02]} />
        <meshStandardMaterial color={C.bodyDark || C.accent} roughness={0.75} metalness={0.3} />
      </mesh>
      <mesh position={[0.3, -0.1, 0.56]}>
        <boxGeometry args={[0.18, 0.06, 0.02]} />
        <meshStandardMaterial color={C.rust} roughness={1} />
      </mesh>
      <mesh position={[0, -0.69, 0]}>
        <boxGeometry args={[1.1, 0.08, 0.9]} />
        <meshStandardMaterial color={C.bodyDark || C.accent} roughness={0.8} metalness={0.3} />
      </mesh>
    </group>
  )
}

// ── Neck ─────────────────────────────────────────────────────────
function Neck() {
  return (
    <group position={[0, 0.77, 0]}>
      <mesh>
        <cylinderGeometry args={[0.13, 0.16, 0.28, 14]} />
        <meshStandardMaterial color={C.darkMetal} roughness={0.4} metalness={0.8} />
      </mesh>
      {[0.08, -0.08].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.05, 14]} />
          <meshStandardMaterial color={C.metal} roughness={0.3} metalness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

// ── Confetti ─────────────────────────────────────────────────────
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
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  )
}

const CONFETTI_COLORS = ['#FFD700','#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98FB98','#DDA0DD']

// ── Main WallE component ─────────────────────────────────────────
export default function WallE({ animState, onAnimComplete }) {
  const groupRef    = useRef()
  const headRef     = useRef()
  const leftEyeRef  = useRef()
  const rightEyeRef = useRef()
  const leftArmRef  = useRef()
  const rightArmRef = useRef()

  const anim = useRef({ state: 'idle', clickT: 0, celebT: 0 })
  const [confetti, setConfetti] = useState([])

  useEffect(() => {
    if (animState === 'celebrate' && anim.current.state !== 'celebrate') {
      anim.current.state = 'celebrate'
      anim.current.celebT = 0
      const pieces = Array.from({ length: 40 }, (_, i) => ({
        id: i,
        position: [(Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.5],
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        velocity: [(Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 2]
      }))
      setConfetti(pieces)
      setTimeout(() => setConfetti([]), 4000)
    } else if (animState === 'click' && anim.current.state === 'idle') {
      anim.current.state = 'click'
      anim.current.clickT = 0
    }
  }, [animState])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const a = anim.current
    if (!groupRef.current) return

    // ── IDLE ──────────────────────────────────────────────────
    if (a.state === 'idle') {
      groupRef.current.position.y = Math.sin(t * 1.1) * 0.035
      groupRef.current.rotation.z = Math.sin(t * 0.55) * 0.015

      if (headRef.current) {
        headRef.current.rotation.y = Math.sin(t * 0.4) * 0.28
        headRef.current.rotation.z = Math.sin(t * 0.3) * 0.04
      }
      if (leftEyeRef.current && rightEyeRef.current) {
        const blink = Math.sin(t * 0.22) > 0.96 ? 0.5 : 1.0
        leftEyeRef.current.scale.y  = blink
        rightEyeRef.current.scale.y = blink
        leftEyeRef.current.rotation.z  = Math.sin(t * 0.35) * 0.06
        rightEyeRef.current.rotation.z = Math.sin(t * 0.35) * 0.06
      }
      if (leftArmRef.current)  leftArmRef.current.rotation.z  = -0.3 + Math.sin(t * 0.9) * 0.04
      if (rightArmRef.current) rightArmRef.current.rotation.z =  0.3 + Math.sin(t * 0.9 + 1) * 0.04
    }

    // ── CLICK ─────────────────────────────────────────────────
    if (a.state === 'click') {
      a.clickT += 0.06
      const p = a.clickT
      if (p < 1) {
        groupRef.current.position.y = Math.sin(p * Math.PI) * 0.35
        groupRef.current.scale.y = 1 + Math.sin(p * Math.PI) * 0.18
        groupRef.current.scale.x = 1 - Math.sin(p * Math.PI) * 0.08
        if (leftEyeRef.current && rightEyeRef.current) {
          const ext = 1 + Math.sin(p * Math.PI) * 0.4
          leftEyeRef.current.scale.set(ext, ext, ext)
          rightEyeRef.current.scale.set(ext, ext, ext)
        }
        if (headRef.current) headRef.current.rotation.z = Math.sin(p * Math.PI * 2) * 0.25
        if (leftArmRef.current)  leftArmRef.current.rotation.z  = -0.3 - Math.sin(p * Math.PI) * 0.8
        if (rightArmRef.current) rightArmRef.current.rotation.z =  0.3 + Math.sin(p * Math.PI) * 0.8
      } else {
        a.state = 'idle'
        groupRef.current.position.y = 0
        groupRef.current.scale.set(1, 1, 1)
        if (leftEyeRef.current)  leftEyeRef.current.scale.set(1, 1, 1)
        if (rightEyeRef.current) rightEyeRef.current.scale.set(1, 1, 1)
        if (headRef.current) headRef.current.rotation.z = 0
      }
    }

    // ── CELEBRATE ─────────────────────────────────────────────
    if (a.state === 'celebrate') {
      a.celebT += 0.025
      const p = a.celebT
      if (p < 1) {
        groupRef.current.rotation.y = p * Math.PI * 4
        groupRef.current.position.y = Math.abs(Math.sin(p * Math.PI * 8)) * 0.4
        if (leftEyeRef.current && rightEyeRef.current) {
          const pulse = 1.3 + Math.sin(p * Math.PI * 10) * 0.2
          leftEyeRef.current.scale.set(pulse, pulse, pulse)
          rightEyeRef.current.scale.set(pulse, pulse, pulse)
        }
        if (leftArmRef.current)  leftArmRef.current.rotation.z  = -0.3 - Math.sin(p * Math.PI * 12) * 1.2
        if (rightArmRef.current) rightArmRef.current.rotation.z =  0.3 + Math.sin(p * Math.PI * 12 + Math.PI) * 1.2
        if (headRef.current) headRef.current.rotation.x = Math.sin(p * Math.PI * 8) * 0.25
      } else {
        a.state = 'idle'
        groupRef.current.rotation.y = 0
        groupRef.current.position.y = 0
        groupRef.current.scale.set(1, 1, 1)
        if (leftEyeRef.current)  leftEyeRef.current.scale.set(1, 1, 1)
        if (rightEyeRef.current) rightEyeRef.current.scale.set(1, 1, 1)
        if (headRef.current) { headRef.current.rotation.x = 0; headRef.current.rotation.z = 0 }
        if (onAnimComplete) onAnimComplete()
      }
    }
  })

  return (
    <>
      {confetti.map((p) => (
        <ConfettiParticle key={p.id} position={p.position} color={p.color} velocity={p.velocity} />
      ))}
      <group ref={groupRef} position={[0, 0.35, 0]}>
        <Tread x={-0.72} />
        <Tread x={ 0.72} />
        <Body />
        <Arm x={-0.82} armRef={leftArmRef} />
        <Arm x={ 0.82} armRef={rightArmRef} />
        <Neck />
        <Head headRef={headRef} leftEyeRef={leftEyeRef} rightEyeRef={rightEyeRef} />
      </group>
    </>
  )
}
