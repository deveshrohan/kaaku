import * as THREE from 'three'
import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'

export const meta = { id: 'raccoon', name: 'Raccoon', icon: '🦝', color: '#8A8A8A' }

const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98FB98', '#DDA0DD']

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

// Pre-compute tail ring data — 9 rings curving up and over the back
const TAIL_RINGS = Array.from({ length: 9 }, (_, i) => {
  const t   = i / 8
  // arc: starts pointing back/down, sweeps upward and slightly forward
  const ang = -0.3 + t * 2.2          // angle along arc (radians)
  const r   = 0.55                     // arc radius
  return {
    px: Math.sin(ang * 0.18) * 0.05,  // slight lateral drift
    py: r * Math.sin(ang) * 0.9,
    pz: -r * Math.cos(ang),
    rx: ang * 0.9,                     // segment tilt follows arc
    dark: i % 2 === 0,
    scale: 1.0 - t * 0.12,            // taper toward tip
  }
})

export default function Raccoon({ animState, onAnimComplete }) {
  const groupRef    = useRef()
  const headRef     = useRef()
  const tailRef     = useRef()
  const leftArmRef  = useRef()
  const rightArmRef = useRef()
  const leftEarRef  = useRef()
  const rightEarRef = useRef()

  // material refs for dynamic emissive changes
  const leftMaskMatRef  = useRef()
  const rightMaskMatRef = useRef()
  const leftEyeMatRef   = useRef()
  const rightEyeMatRef  = useRef()
  const leftEyeRef      = useRef()
  const rightEyeRef     = useRef()
  const noseRef         = useRef()

  const [confetti, setConfetti] = useState([])

  const A = useRef({
    state: 'idle',
    idleMode: 0,
    idleT: 0,
    idleNext: 10,
    actionT: 0,
  })

  useEffect(() => {
    A.current.state   = animState
    A.current.actionT = 0
    if (animState === 'celebrate') {
      const particles = []
      for (let i = 0; i < 40; i++) {
        particles.push({
          id: i,
          position: [
            (Math.random() - 0.5) * 1.2,
            0.8 + Math.random() * 0.8,
            (Math.random() - 0.5) * 0.6,
          ],
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          velocity: [
            (Math.random() - 0.5) * 4.0,
            2.0 + Math.random() * 3.5,
            (Math.random() - 0.5) * 2.0,
          ],
        })
      }
      setConfetti(particles)
    } else {
      setConfetti([])
    }
  }, [animState])

  useFrame((_, dt) => {
    const a  = A.current
    const g  = groupRef.current
    const h  = headRef.current
    const tl = tailRef.current
    const la = leftArmRef.current
    const ra = rightArmRef.current
    const le = leftEarRef.current
    const re = rightEarRef.current

    if (!g || !h || !tl || !la || !ra) return

    // ─── IDLE ────────────────────────────────────────────────────────────────
    if (a.state === 'idle') {
      a.idleT += dt
      if (a.idleT > a.idleNext) {
        a.idleT    = 0
        a.idleMode = (a.idleMode + 1) % 4
        a.idleNext = 8 + Math.random() * 6
      }

      const t    = a.idleT
      const freq = t * Math.PI * 2

      // ── Mode 0: sneaky sway ───────────────────────────────────────────────
      if (a.idleMode === 0) {
        const sway = Math.sin(freq * 0.55) * 0.1
        g.rotation.z = sway
        g.rotation.x = 0.06               // slight permanent hunch
        g.position.y = 0.18 + Math.abs(Math.sin(freq * 0.55)) * 0.04

        // tail curls up and back gently
        tl.rotation.x = (Math.sin(freq * 0.3) * 0.5 + 0.5) * 0.6
        tl.rotation.z = Math.sin(freq * 0.2) * 0.3

        // eyes dart left/right — head swings ±0.42
        h.rotation.y = Math.sin(freq * 0.8) * 0.42
        h.rotation.z = -sway * 0.5
        h.rotation.x = 0

        la.rotation.x = Math.sin(freq * 0.4) * 0.14
        ra.rotation.x = -Math.sin(freq * 0.4) * 0.14
        la.rotation.z = 0.12
        ra.rotation.z = -0.12

        if (le) le.scale.setScalar(1)
        if (re) re.scale.setScalar(1)

      // ── Mode 1: foraging ─────────────────────────────────────────────────
      } else if (a.idleMode === 1) {
        const bob = Math.sin(freq * 1.2 * Math.PI * 2) * 0.12
        g.position.y = 0.18 + bob
        g.rotation.z = 0
        g.rotation.x = 0.14              // bent forward while foraging

        h.rotation.x = Math.sin(freq * 1.2 * Math.PI * 2) * 0.1 + 0.1
        h.rotation.y = 0
        h.rotation.z = 0

        // nose twitches
        if (noseRef.current) {
          noseRef.current.scale.z = 1 + Math.sin(freq * 3 * Math.PI * 2) * 0.06
          noseRef.current.scale.x = 1 + Math.sin(freq * 3 * Math.PI * 2) * 0.04
        }

        // arms reach forward alternately — "grabbing" motion
        la.rotation.x = -0.35 + Math.sin(freq * 1.2 * Math.PI * 2) * 0.4
        ra.rotation.x = -0.35 - Math.sin(freq * 1.2 * Math.PI * 2) * 0.4
        la.rotation.z = 0.18
        ra.rotation.z = -0.18

        tl.rotation.x = 0.35 + Math.sin(freq * 0.8 * Math.PI) * 0.2
        tl.rotation.z = Math.sin(freq * 1.0 * Math.PI) * 0.14

        if (le) le.scale.setScalar(1)
        if (re) re.scale.setScalar(1)

      // ── Mode 2: smug pose ────────────────────────────────────────────────
      } else if (a.idleMode === 2) {
        g.rotation.z = 0
        g.rotation.x = 0
        g.position.y = 0.18 + Math.sin(freq * 0.5 * Math.PI) * 0.05

        // head tilts up — smug look
        h.rotation.x = -0.12
        h.rotation.y = Math.sin(freq * 0.3 * Math.PI) * 0.15
        h.rotation.z = Math.sin(freq * 0.25 * Math.PI) * 0.06

        // arms cross over chest
        const armCross = 0.38 + Math.sin(freq * 0.5 * Math.PI) * 0.05
        la.rotation.x = armCross
        ra.rotation.x = armCross
        la.rotation.z = 0.48
        ra.rotation.z = -0.48

        // tail swishes confidently
        tl.rotation.x = 0.4
        tl.rotation.z = Math.sin(freq * 0.9 * Math.PI) * 0.3

        if (le) le.scale.setScalar(1)
        if (re) re.scale.setScalar(1)

      // ── Mode 3: alert / freeze ───────────────────────────────────────────
      } else if (a.idleMode === 3) {
        const alertPhase = (t % 4) / 4
        const isAlert    = alertPhase < 0.4
        const alertLerp  = isAlert
          ? Math.min(1, (alertPhase / 0.4) * 3)
          : Math.max(0, 1 - ((alertPhase - 0.4) / 0.6) * 1.5)

        g.rotation.z = 0
        g.rotation.x = 0
        g.position.y = 0.18 + alertLerp * 0.04

        // head snaps up fast
        h.rotation.x = -0.25 * alertLerp
        h.rotation.y = 0
        h.rotation.z = 0

        // ears perk up
        const earScale = 1 + alertLerp * 0.18
        if (le) le.scale.setScalar(earScale)
        if (re) re.scale.setScalar(earScale)

        // tail goes stiff during alert
        tl.rotation.x = alertLerp * 0.08
        tl.rotation.z = 0

        // arms freeze, then relax
        la.rotation.x = alertLerp * -0.05
        ra.rotation.x = alertLerp * -0.05
        la.rotation.z = 0.1 * (1 - alertLerp)
        ra.rotation.z = -0.1 * (1 - alertLerp)
      }

    // ─── CLICK / STARTLED ────────────────────────────────────────────────────
    } else if (a.state === 'click') {
      a.actionT = Math.min(1, a.actionT + dt * 1.8)
      const t          = a.actionT
      const jumpCurve  = Math.sin(t * Math.PI)

      g.position.y = 0.18 + jumpCurve * 0.48
      g.rotation.z = Math.sin(t * Math.PI * 2) * 0.08
      g.rotation.x = 0

      h.rotation.x = -0.25 * jumpCurve
      h.rotation.y = 0
      h.rotation.z = 0

      // arms fling wide
      la.rotation.x = -0.5 - jumpCurve * 0.6
      ra.rotation.x = -0.5 - jumpCurve * 0.6
      la.rotation.z = 0.65 + jumpCurve * 0.55
      ra.rotation.z = -(0.65 + jumpCurve * 0.55)

      // tail puffs up
      tl.rotation.x = jumpCurve * 1.0
      tl.scale.setScalar(1 + jumpCurve * 0.4)

      // eye scale wide
      if (leftEyeRef.current)  leftEyeRef.current.scale.setScalar(1 + jumpCurve * 0.3)
      if (rightEyeRef.current) rightEyeRef.current.scale.setScalar(1 + jumpCurve * 0.3)

      // mask flash
      if (leftMaskMatRef.current)  leftMaskMatRef.current.emissiveIntensity = jumpCurve * 0.8
      if (rightMaskMatRef.current) rightMaskMatRef.current.emissiveIntensity = jumpCurve * 0.8

      if (le) le.scale.setScalar(1 + jumpCurve * 0.15)
      if (re) re.scale.setScalar(1 + jumpCurve * 0.15)

      if (t >= 1) {
        A.current.state   = 'idle'
        A.current.actionT = 0
        tl.scale.setScalar(1)
        if (leftEyeRef.current)  leftEyeRef.current.scale.setScalar(1)
        if (rightEyeRef.current) rightEyeRef.current.scale.setScalar(1)
        if (leftMaskMatRef.current)  leftMaskMatRef.current.emissiveIntensity  = 0
        if (rightMaskMatRef.current) rightMaskMatRef.current.emissiveIntensity = 0
      }

    // ─── CELEBRATE ───────────────────────────────────────────────────────────
    } else if (a.state === 'celebrate') {
      a.actionT = Math.min(1, a.actionT + dt * 0.5)
      const t     = a.actionT
      const freq2 = t * Math.PI * 8

      // victory spin with hopping
      g.rotation.y = t * Math.PI * 4
      const hop = Math.abs(Math.sin(freq2)) * 0.32
      g.position.y = 0.18 + hop
      g.rotation.z = Math.sin(freq2 * 0.5) * 0.1
      g.rotation.x = 0

      // head partially counter-rotates, tilts up triumphantly
      h.rotation.y = -t * Math.PI * 4 * 0.3
      h.rotation.x = -0.2
      h.rotation.z = Math.sin(freq2) * 0.12

      // arms raised in victory, wave
      la.rotation.x = -0.8 - Math.sin(freq2) * 0.3
      ra.rotation.x = -0.8 + Math.sin(freq2) * 0.3
      la.rotation.z = 0.52
      ra.rotation.z = -0.52

      // tail waves triumphantly
      tl.rotation.x = 0.3 + Math.sin(freq2 * 0.6) * 0.5
      tl.rotation.z = Math.sin(freq2 * 0.8) * 0.6

      // eyes gleam bright green
      if (leftEyeMatRef.current)
        leftEyeMatRef.current.emissiveIntensity  = 0.5 + Math.sin(freq2) * 0.3
      if (rightEyeMatRef.current)
        rightEyeMatRef.current.emissiveIntensity = 0.5 + Math.sin(freq2) * 0.3

      if (le) le.scale.setScalar(1.15)
      if (re) re.scale.setScalar(1.15)

      if (t >= 1) {
        A.current.state   = 'idle'
        A.current.actionT = 0
        setConfetti([])
        if (leftEyeMatRef.current)  leftEyeMatRef.current.emissiveIntensity  = 0
        if (rightEyeMatRef.current) rightEyeMatRef.current.emissiveIntensity = 0
        if (onAnimComplete) onAnimComplete()
      }
    }
  })

  return (
    <group ref={groupRef} position={[0, 0.18, 0]}>
      {/* ── Confetti ─────────────────────────────────────────────────────── */}
      {confetti.map((c) => (
        <ConfettiParticle key={c.id} position={c.position} color={c.color} velocity={c.velocity} />
      ))}

      {/* ── BODY — medium gray, hunched forward like a thief ─────────────── */}
      {/* Main torso — slightly flattened and leaning forward */}
      <mesh position={[0, 0.04, 0.04]} scale={[1.0, 0.92, 0.88]} rotation={[0.12, 0, 0]}>
        <sphereGeometry args={[0.60, 26, 20]} />
        <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
      </mesh>

      {/* Shoulder hump — adds the hunched silhouette */}
      <mesh position={[0, 0.32, -0.12]} scale={[1.1, 0.6, 0.7]}>
        <sphereGeometry args={[0.38, 18, 14]} />
        <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
      </mesh>

      {/* ── CHEST / BELLY — cream/white ──────────────────────────────────── */}
      <mesh position={[0, -0.04, 0.44]} scale={[0.88, 1.0, 0.65]}>
        <sphereGeometry args={[0.44, 22, 16]} />
        <meshStandardMaterial color="#E0E0D0" roughness={0.82} metalness={0} />
      </mesh>

      {/* ── LEFT ARM GROUP ───────────────────────────────────────────────── */}
      <group ref={leftArmRef} position={[0.58, 0.14, 0.06]}>
        {/* upper arm */}
        <mesh position={[0.07, -0.20, 0.05]} rotation={[0.14, 0, 0.20]}>
          <cylinderGeometry args={[0.105, 0.125, 0.40, 14]} />
          <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
        </mesh>
        {/* forearm */}
        <mesh position={[0.10, -0.50, 0.12]} rotation={[0.24, 0, 0.10]}>
          <cylinderGeometry args={[0.085, 0.105, 0.34, 14]} />
          <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
        </mesh>
        {/* paw pad */}
        <mesh position={[0.13, -0.74, 0.20]} scale={[1.15, 0.75, 1.1]}>
          <sphereGeometry args={[0.105, 14, 10]} />
          <meshStandardMaterial color="#3A3A3A" roughness={0.90} metalness={0} />
        </mesh>
        {/* finger nubs — 4 */}
        {[-0.038, -0.012, 0.014, 0.040].map((ox, i) => (
          <mesh key={i} position={[0.13 + ox, -0.80, 0.28]}>
            <sphereGeometry args={[0.026, 7, 7]} />
            <meshStandardMaterial color="#2A2A2A" roughness={0.90} metalness={0} />
          </mesh>
        ))}
      </group>

      {/* ── RIGHT ARM GROUP ──────────────────────────────────────────────── */}
      <group ref={rightArmRef} position={[-0.58, 0.14, 0.06]}>
        {/* upper arm */}
        <mesh position={[-0.07, -0.20, 0.05]} rotation={[0.14, 0, -0.20]}>
          <cylinderGeometry args={[0.105, 0.125, 0.40, 14]} />
          <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
        </mesh>
        {/* forearm */}
        <mesh position={[-0.10, -0.50, 0.12]} rotation={[0.24, 0, -0.10]}>
          <cylinderGeometry args={[0.085, 0.105, 0.34, 14]} />
          <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
        </mesh>
        {/* paw pad */}
        <mesh position={[-0.13, -0.74, 0.20]} scale={[1.15, 0.75, 1.1]}>
          <sphereGeometry args={[0.105, 14, 10]} />
          <meshStandardMaterial color="#3A3A3A" roughness={0.90} metalness={0} />
        </mesh>
        {/* finger nubs — 4 */}
        {[-0.040, -0.014, 0.012, 0.038].map((ox, i) => (
          <mesh key={i} position={[-0.13 + ox, -0.80, 0.28]}>
            <sphereGeometry args={[0.026, 7, 7]} />
            <meshStandardMaterial color="#2A2A2A" roughness={0.90} metalness={0} />
          </mesh>
        ))}
      </group>

      {/* ── LEFT LEG ─────────────────────────────────────────────────────── */}
      <mesh position={[0.22, -0.60, 0.02]}>
        <cylinderGeometry args={[0.12, 0.145, 0.42, 14]} />
        <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
      </mesh>
      {/* left foot */}
      <mesh position={[0.25, -0.86, 0.09]} scale={[1.45, 0.50, 1.25]}>
        <sphereGeometry args={[0.145, 14, 10]} />
        <meshStandardMaterial color="#3A3A3A" roughness={0.90} metalness={0} />
      </mesh>

      {/* ── RIGHT LEG ────────────────────────────────────────────────────── */}
      <mesh position={[-0.22, -0.60, 0.02]}>
        <cylinderGeometry args={[0.12, 0.145, 0.42, 14]} />
        <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
      </mesh>
      {/* right foot */}
      <mesh position={[-0.25, -0.86, 0.09]} scale={[1.45, 0.50, 1.25]}>
        <sphereGeometry args={[0.145, 14, 10]} />
        <meshStandardMaterial color="#3A3A3A" roughness={0.90} metalness={0} />
      </mesh>

      {/* ── TAIL GROUP — 9 alternating ringed segments curving up over back ─ */}
      <group ref={tailRef} position={[0.06, -0.08, -0.60]} rotation={[-0.5, 0.12, 0.08]}>
        {TAIL_RINGS.map((ring, i) => (
          <mesh
            key={i}
            position={[ring.px, ring.py, ring.pz]}
            rotation={[ring.rx, 0, 0]}
            scale={[ring.scale, ring.scale, ring.scale]}
          >
            {/* slightly wider than tall for a fluffy ringed look */}
            <cylinderGeometry args={[0.19, 0.19, 0.20, 18]} />
            <meshStandardMaterial
              color={ring.dark ? '#1A1A1A' : '#AAAAAA'}
              roughness={ring.dark ? 0.88 : 0.84}
              metalness={0}
            />
          </mesh>
        ))}
        {/* fluffy tail tip sphere */}
        {(() => {
          const last = TAIL_RINGS[TAIL_RINGS.length - 1]
          return (
            <mesh
              position={[last.px, last.py + 0.20 * last.scale, last.pz]}
              scale={[last.scale * 1.1, last.scale * 1.1, last.scale * 1.1]}
            >
              <sphereGeometry args={[0.21, 18, 14]} />
              <meshStandardMaterial color="#CCCCCC" roughness={0.80} metalness={0} />
            </mesh>
          )
        })()}
      </group>

      {/* ── NECK ─────────────────────────────────────────────────────────── */}
      <mesh position={[0, 0.62, 0.06]} rotation={[0.10, 0, 0]}>
        <cylinderGeometry args={[0.175, 0.205, 0.22, 16]} />
        <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
      </mesh>

      {/* ── HEAD GROUP ───────────────────────────────────────────────────── */}
      <group ref={headRef} position={[0, 1.04, 0.04]}>

        {/* Head sphere — slightly wider than tall, raccoon-ish */}
        <mesh scale={[1.08, 0.98, 0.97]}>
          <sphereGeometry args={[0.48, 26, 20]} />
          <meshStandardMaterial color="#888888" roughness={0.85} metalness={0} />
        </mesh>

        {/* White forehead stripe */}
        <mesh position={[0, 0.30, 0.40]} scale={[0.28, 0.55, 0.22]}>
          <sphereGeometry args={[0.28, 14, 10]} />
          <meshStandardMaterial color="#E8E8DC" roughness={0.82} metalness={0} />
        </mesh>

        {/* ── LEFT EAR ─────────────────────────────────────────────────── */}
        <group ref={leftEarRef} position={[0.32, 0.46, -0.06]} rotation={[0, 0, -0.16]}>
          {/* outer ear — very dark gray, rounded */}
          <mesh>
            <cylinderGeometry args={[0.13, 0.16, 0.28, 12]} />
            <meshStandardMaterial color="#3A3A3A" roughness={0.90} metalness={0} />
          </mesh>
          {/* top cap — round */}
          <mesh position={[0, 0.16, 0]}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshStandardMaterial color="#3A3A3A" roughness={0.90} metalness={0} />
          </mesh>
          {/* inner ear — lighter */}
          <mesh position={[0, 0.04, 0.05]}>
            <cylinderGeometry args={[0.085, 0.10, 0.20, 10]} />
            <meshStandardMaterial color="#606060" roughness={0.86} metalness={0} />
          </mesh>
        </group>

        {/* ── RIGHT EAR ────────────────────────────────────────────────── */}
        <group ref={rightEarRef} position={[-0.32, 0.46, -0.06]} rotation={[0, 0, 0.16]}>
          {/* outer ear */}
          <mesh>
            <cylinderGeometry args={[0.13, 0.16, 0.28, 12]} />
            <meshStandardMaterial color="#3A3A3A" roughness={0.90} metalness={0} />
          </mesh>
          {/* top cap */}
          <mesh position={[0, 0.16, 0]}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshStandardMaterial color="#3A3A3A" roughness={0.90} metalness={0} />
          </mesh>
          {/* inner ear */}
          <mesh position={[0, 0.04, 0.05]}>
            <cylinderGeometry args={[0.085, 0.10, 0.20, 10]} />
            <meshStandardMaterial color="#606060" roughness={0.86} metalness={0} />
          </mesh>
        </group>

        {/* ── MUZZLE / SNOUT — pointy, lighter gray ────────────────────── */}
        {/* muzzle base */}
        <mesh position={[0, -0.10, 0.42]} scale={[1.0, 0.90, 1.0]}>
          <boxGeometry args={[0.32, 0.24, 0.30]} />
          <meshStandardMaterial color="#9A9A9A" roughness={0.84} metalness={0} />
        </mesh>
        {/* snout round tip */}
        <mesh position={[0, -0.11, 0.56]}>
          <sphereGeometry args={[0.145, 16, 12]} />
          <meshStandardMaterial color="#9A9A9A" roughness={0.84} metalness={0} />
        </mesh>

        {/* ── BANDIT MASK — flat planes hugging the eye area ───────────── */}
        {/* Left mask patch — very flat, sits right on the head surface */}
        <mesh position={[0.175, 0.02, 0.435]} scale={[1.15, 0.88, 0.12]}>
          <sphereGeometry args={[0.185, 18, 14]} />
          <meshStandardMaterial
            ref={leftMaskMatRef}
            color="#1A1A1A"
            roughness={0.80}
            metalness={0}
            emissive="#FF4400"
            emissiveIntensity={0}
          />
        </mesh>
        {/* Right mask patch */}
        <mesh position={[-0.175, 0.02, 0.435]} scale={[1.15, 0.88, 0.12]}>
          <sphereGeometry args={[0.185, 18, 14]} />
          <meshStandardMaterial
            ref={rightMaskMatRef}
            color="#1A1A1A"
            roughness={0.80}
            metalness={0}
            emissive="#FF4400"
            emissiveIntensity={0}
          />
        </mesh>
        {/* Mask bridge — thin box connecting across nose bridge */}
        <mesh position={[0, 0.03, 0.430]}>
          <boxGeometry args={[0.20, 0.10, 0.04]} />
          <meshStandardMaterial color="#1A1A1A" roughness={0.80} metalness={0} />
        </mesh>
        {/* Outer mask brow arches — add raccoon brow detail */}
        <mesh position={[0.175, 0.10, 0.430]} scale={[1.1, 0.30, 0.10]}>
          <sphereGeometry args={[0.175, 14, 8]} />
          <meshStandardMaterial color="#1A1A1A" roughness={0.80} metalness={0} />
        </mesh>
        <mesh position={[-0.175, 0.10, 0.430]} scale={[1.1, 0.30, 0.10]}>
          <sphereGeometry args={[0.175, 14, 8]} />
          <meshStandardMaterial color="#1A1A1A" roughness={0.80} metalness={0} />
        </mesh>

        {/* ── LEFT EYE — vivid green, clearcoat gleam ──────────────────── */}
        <group ref={leftEyeRef} position={[0.175, 0.03, 0.450]}>
          {/* iris */}
          <mesh>
            <sphereGeometry args={[0.092, 20, 16]} />
            <meshPhysicalMaterial
              ref={leftEyeMatRef}
              color="#30AA30"
              roughness={0.05}
              metalness={0}
              clearcoat={1.0}
              clearcoatRoughness={0.04}
              emissive="#30AA30"
              emissiveIntensity={0}
            />
          </mesh>
          {/* pupil */}
          <mesh position={[0, 0, 0.068]}>
            <sphereGeometry args={[0.048, 12, 10]} />
            <meshStandardMaterial color="#080808" roughness={0.10} metalness={0} />
          </mesh>
          {/* eye shine */}
          <mesh position={[0.038, 0.038, 0.096]}>
            <sphereGeometry args={[0.033, 8, 8]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={1.4} />
          </mesh>
        </group>

        {/* ── RIGHT EYE — vivid green, clearcoat gleam ─────────────────── */}
        <group ref={rightEyeRef} position={[-0.175, 0.03, 0.450]}>
          {/* iris */}
          <mesh>
            <sphereGeometry args={[0.092, 20, 16]} />
            <meshPhysicalMaterial
              ref={rightEyeMatRef}
              color="#30AA30"
              roughness={0.05}
              metalness={0}
              clearcoat={1.0}
              clearcoatRoughness={0.04}
              emissive="#30AA30"
              emissiveIntensity={0}
            />
          </mesh>
          {/* pupil */}
          <mesh position={[0, 0, 0.068]}>
            <sphereGeometry args={[0.048, 12, 10]} />
            <meshStandardMaterial color="#080808" roughness={0.10} metalness={0} />
          </mesh>
          {/* eye shine */}
          <mesh position={[-0.038, 0.038, 0.096]}>
            <sphereGeometry args={[0.033, 8, 8]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={1.4} />
          </mesh>
        </group>

        {/* ── NOSE — wet black, clearcoat ──────────────────────────────── */}
        <mesh ref={noseRef} position={[0, -0.07, 0.620]} scale={[1.45, 0.85, 1.0]}>
          <sphereGeometry args={[0.062, 16, 12]} />
          <meshPhysicalMaterial
            color="#0A0A0A"
            roughness={0.04}
            metalness={0}
            clearcoat={1.0}
            clearcoatRoughness={0.02}
          />
        </mesh>

        {/* ── WHISKERS — 3 per side ─────────────────────────────────────── */}
        {/* left whiskers */}
        <mesh position={[0.17, -0.13, 0.530]}>
          <boxGeometry args={[0.24, 0.010, 0.010]} />
          <meshStandardMaterial color="#D4CCAA" roughness={0.65} metalness={0} />
        </mesh>
        <mesh position={[0.19, -0.17, 0.515]} rotation={[0, 0, 0.10]}>
          <boxGeometry args={[0.24, 0.010, 0.010]} />
          <meshStandardMaterial color="#D4CCAA" roughness={0.65} metalness={0} />
        </mesh>
        <mesh position={[0.15, -0.09, 0.520]} rotation={[0, 0, -0.08]}>
          <boxGeometry args={[0.24, 0.010, 0.010]} />
          <meshStandardMaterial color="#D4CCAA" roughness={0.65} metalness={0} />
        </mesh>
        {/* right whiskers */}
        <mesh position={[-0.17, -0.13, 0.530]}>
          <boxGeometry args={[0.24, 0.010, 0.010]} />
          <meshStandardMaterial color="#D4CCAA" roughness={0.65} metalness={0} />
        </mesh>
        <mesh position={[-0.19, -0.17, 0.515]} rotation={[0, 0, -0.10]}>
          <boxGeometry args={[0.24, 0.010, 0.010]} />
          <meshStandardMaterial color="#D4CCAA" roughness={0.65} metalness={0} />
        </mesh>
        <mesh position={[-0.15, -0.09, 0.520]} rotation={[0, 0, 0.08]}>
          <boxGeometry args={[0.24, 0.010, 0.010]} />
          <meshStandardMaterial color="#D4CCAA" roughness={0.65} metalness={0} />
        </mesh>

      </group>{/* end headRef group */}

    </group>
  )
}
