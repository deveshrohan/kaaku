import * as THREE from 'three'
import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'

export const meta = { id: 'frozone', name: 'Frozone', icon: '❄️', color: '#3A6FBF' }

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

// Reusable material props to avoid repetition
const SUIT_MAT = { color: '#1A2A5A', roughness: 0.15, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.05 }
const SUIT_PANEL_MAT = { color: '#243870', roughness: 0.18, clearcoat: 0.85, clearcoatRoughness: 0.06 }
const SKIN_MAT = { color: '#2A1A0A', roughness: 0.72 }
const WHITE_ACCENT_MAT = { color: '#FFFFFF', roughness: 0.25 }
const GLOVE_MAT = { color: '#F0F0F0', roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.1 }
const GOGGLE_FRAME_MAT = { color: '#108080', roughness: 0.1, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 }
const GOGGLE_STRAP_MAT = { color: '#0A5858', roughness: 0.2, metalness: 0.4 }
const ICE_MAT_PROPS = {
  color: '#C8F0FF',
  roughness: 0.08,
  metalness: 0,
  transmission: 0.4,
  ior: 1.31,
  emissive: '#80D0FF',
  emissiveIntensity: 0.3,
  transparent: true,
}
const ICE_GLOW_MAT_PROPS = {
  color: '#C8F0FF',
  roughness: 0.08,
  metalness: 0,
  transmission: 0.4,
  ior: 1.31,
  emissive: '#80D0FF',
  emissiveIntensity: 0.65,
  transparent: true,
}
const ICE_CRYSTAL_MAT = {
  color: '#A0E8FF',
  roughness: 0.05,
  metalness: 0,
  transmission: 0.55,
  ior: 1.31,
  emissive: '#4ABAEE',
  emissiveIntensity: 0.9,
  transparent: true,
}
const BOOT_MAT = { color: '#F0F0F0', roughness: 0.2, clearcoat: 0.6 }
const BOOT_ACCENT_MAT = { color: '#1A2A5A', roughness: 0.18, clearcoat: 0.85 }

export default function Frozone({ animState, onAnimComplete }) {
  const groupRef = useRef()
  const headRef = useRef()
  const leftArmRef = useRef()
  const rightArmRef = useRef()
  const icePlatformRef = useRef()
  const iceHandRef = useRef()
  const rightIceHandRef = useRef()
  const goggleLensMatRef = useRef()
  const goggleRightLensMatRef = useRef()
  const pillar0Ref = useRef()
  const pillar1Ref = useRef()
  const pillar2Ref = useRef()

  const [confetti, setConfetti] = useState([])

  const A = useRef({
    state: 'idle',
    idleMode: 0,
    idleT: 0,
    idleNext: 10,
    actionT: 0,
  })

  useEffect(() => {
    A.current.state = animState
    A.current.actionT = 0
    if (animState === 'celebrate') {
      const particles = []
      for (let i = 0; i < 40; i++) {
        particles.push({
          id: i,
          position: [
            (Math.random() - 0.5) * 1.4,
            0.5 + Math.random() * 1.0,
            (Math.random() - 0.5) * 0.6,
          ],
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          velocity: [
            (Math.random() - 0.5) * 4.5,
            2.5 + Math.random() * 3.5,
            (Math.random() - 0.5) * 2.0,
          ],
        })
      }
      setConfetti(particles)
    } else {
      setConfetti([])
      if (iceHandRef.current) {
        iceHandRef.current.scale.setScalar(0)
        iceHandRef.current.visible = false
      }
      if (rightIceHandRef.current) {
        rightIceHandRef.current.scale.setScalar(0)
        rightIceHandRef.current.visible = false
      }
      ;[pillar0Ref, pillar1Ref, pillar2Ref].forEach((r) => {
        if (r.current) {
          r.current.position.y = -2.5
          r.current.scale.y = 0.01
        }
      })
    }
  }, [animState])

  useFrame((_, dt) => {
    const a = A.current
    const g = groupRef.current
    const h = headRef.current
    const la = leftArmRef.current
    const ra = rightArmRef.current
    const ip = icePlatformRef.current

    if (!g || !h || !la || !ra || !ip) return

    if (a.state === 'idle') {
      a.idleT += dt
      if (a.idleT > a.idleNext) {
        a.idleT = 0
        a.idleMode = (a.idleMode + 1) % 4
        a.idleNext = 8 + Math.random() * 6
        if (iceHandRef.current) {
          iceHandRef.current.scale.setScalar(0)
          iceHandRef.current.visible = false
        }
      }

      const t = a.idleT
      const freq = t * Math.PI * 2

      if (a.idleMode === 0) {
        // Heroic float — body bobs at ~0.8 Hz, platform subtle tilt
        const floatY = Math.sin(freq * 0.8) * 0.13
        g.position.y = 0.72 + floatY
        g.rotation.y = Math.sin(freq * 0.25) * 0.05
        g.rotation.z = 0
        g.rotation.x = 0

        ip.rotation.z = Math.sin(freq * 0.8) * 0.02
        ip.rotation.x = 0
        ip.position.y = -1.08

        h.rotation.x = -0.08
        h.rotation.y = Math.sin(freq * 0.35) * 0.07
        h.rotation.z = 0

        la.rotation.x = 0
        ra.rotation.x = 0
        la.rotation.z = 0.18
        ra.rotation.z = -0.18

        if (iceHandRef.current) {
          iceHandRef.current.visible = false
          iceHandRef.current.scale.setScalar(0)
        }
        if (goggleLensMatRef.current) goggleLensMatRef.current.emissiveIntensity = 0.25
        if (goggleRightLensMatRef.current) goggleRightLensMatRef.current.emissiveIntensity = 0.25
      } else if (a.idleMode === 1) {
        // Ice surfing — platform tilts like a surfboard
        const tilt = Math.sin(t * 0.6 * Math.PI * 2) * 0.25
        ip.rotation.z = tilt
        ip.rotation.x = Math.sin(t * 0.4 * Math.PI * 2) * 0.06
        ip.position.y = -1.08

        g.rotation.z = -tilt * 0.5
        g.position.y = 0.72 + Math.abs(tilt) * 0.04
        g.rotation.y = 0
        g.rotation.x = 0

        h.rotation.z = tilt * 0.25
        h.rotation.x = 0.04
        h.rotation.y = Math.sin(t * 0.4 * Math.PI * 2) * 0.1

        la.rotation.x = Math.sin(t * 0.5 * Math.PI * 2) * 0.22 - 0.08
        ra.rotation.x = -Math.sin(t * 0.5 * Math.PI * 2) * 0.22 - 0.08
        la.rotation.z = 0.5 + tilt * 0.3
        ra.rotation.z = -(0.5 + tilt * 0.3)

        if (iceHandRef.current) {
          iceHandRef.current.visible = false
          iceHandRef.current.scale.setScalar(0)
        }
        if (goggleLensMatRef.current) goggleLensMatRef.current.emissiveIntensity = 0.25
        if (goggleRightLensMatRef.current) goggleRightLensMatRef.current.emissiveIntensity = 0.25
      } else if (a.idleMode === 2) {
        // Ice blast charge — left arm raises, ice crystal grows, goggles pulse
        g.position.y = 0.72 + Math.sin(t * 0.6 * Math.PI) * 0.05
        g.rotation.z = -0.04
        g.rotation.y = -0.1
        g.rotation.x = 0.1

        ip.rotation.z = -0.04
        ip.rotation.x = 0
        ip.position.y = -1.08

        h.rotation.x = -0.1
        h.rotation.y = -0.18
        h.rotation.z = 0

        const armTarget = -0.9
        la.rotation.x = THREE.MathUtils.lerp(la.rotation.x, armTarget, Math.min(1, dt * 3))
        la.rotation.z = 0.12

        ra.rotation.x = 0
        ra.rotation.z = -0.15

        if (iceHandRef.current) {
          iceHandRef.current.visible = true
          const targetScale = 1.2
          const currentScale = iceHandRef.current.scale.x
          const newScale = THREE.MathUtils.lerp(currentScale, targetScale, Math.min(1, dt * 2.5))
          iceHandRef.current.scale.setScalar(newScale)
        }

        const gogglePulse = 0.5 + Math.sin(t * 3 * Math.PI * 2) * 0.3
        if (goggleLensMatRef.current) goggleLensMatRef.current.emissiveIntensity = gogglePulse
        if (goggleRightLensMatRef.current) goggleRightLensMatRef.current.emissiveIntensity = gogglePulse * 0.6
      } else if (a.idleMode === 3) {
        // Cool pose — arms crossed, head up, confident
        g.position.y = 0.72 + Math.sin(t * 0.4 * Math.PI) * 0.03
        g.rotation.z = 0
        g.rotation.y = Math.sin(t * 0.15 * Math.PI) * 0.06
        g.rotation.x = 0

        ip.rotation.z = 0
        ip.rotation.x = 0
        ip.position.y = -1.08

        h.rotation.x = -0.12
        h.rotation.y = Math.sin(t * 0.2 * Math.PI) * 0.08
        h.rotation.z = 0

        la.rotation.x = THREE.MathUtils.lerp(la.rotation.x, 0.52, dt * 3)
        ra.rotation.x = THREE.MathUtils.lerp(ra.rotation.x, 0.52, dt * 3)
        la.rotation.z = THREE.MathUtils.lerp(la.rotation.z, 0.58, dt * 3)
        ra.rotation.z = THREE.MathUtils.lerp(ra.rotation.z, -0.58, dt * 3)

        if (iceHandRef.current) {
          iceHandRef.current.visible = false
          iceHandRef.current.scale.setScalar(0)
        }
        if (goggleLensMatRef.current) goggleLensMatRef.current.emissiveIntensity = 0.25
        if (goggleRightLensMatRef.current) goggleRightLensMatRef.current.emissiveIntensity = 0.25
      }
    } else if (a.state === 'click') {
      a.actionT = Math.min(1, a.actionT + dt * 1.8)
      const t = a.actionT
      const blastCurve = Math.sin(t * Math.PI)

      g.position.y = 0.72 - blastCurve * 0.1
      g.rotation.z = blastCurve * 0.08
      g.rotation.y = -blastCurve * 0.18
      g.rotation.x = blastCurve * 0.06

      la.rotation.x = -1.3 * Math.min(1, t * 3)
      la.rotation.z = 0.08
      ra.rotation.x = 0
      ra.rotation.z = -0.18

      h.rotation.x = -0.1
      h.rotation.y = -0.22
      h.rotation.z = 0

      ip.rotation.y = t * Math.PI * 1.5
      ip.rotation.z = Math.sin(t * Math.PI) * 0.14
      ip.position.y = -1.08

      if (iceHandRef.current) {
        iceHandRef.current.visible = blastCurve > 0.15
        const s = blastCurve * 1.4
        iceHandRef.current.scale.setScalar(Math.max(0, s))
      }

      const goggleFlash = blastCurve * 1.0
      if (goggleLensMatRef.current) goggleLensMatRef.current.emissiveIntensity = 0.25 + goggleFlash * 0.75
      if (goggleRightLensMatRef.current) goggleRightLensMatRef.current.emissiveIntensity = 0.25 + goggleFlash * 0.5

      if (t >= 1) {
        A.current.state = 'idle'
        A.current.actionT = 0
        ip.rotation.y = 0
        ip.rotation.z = 0
        if (iceHandRef.current) {
          iceHandRef.current.visible = false
          iceHandRef.current.scale.setScalar(0)
        }
        if (goggleLensMatRef.current) goggleLensMatRef.current.emissiveIntensity = 0.25
        if (goggleRightLensMatRef.current) goggleRightLensMatRef.current.emissiveIntensity = 0.25
      }
    } else if (a.state === 'celebrate') {
      a.actionT = Math.min(1, a.actionT + dt * 0.5)
      const t = a.actionT
      const freq2 = t * Math.PI * 7

      g.rotation.y = t * Math.PI * 3.5
      const rise = Math.sin(t * Math.PI) * 0.35
      g.position.y = 0.72 + rise + Math.abs(Math.sin(freq2 * 0.5)) * 0.16
      g.rotation.z = Math.sin(freq2 * 0.4) * 0.08
      g.rotation.x = 0

      h.rotation.y = -t * Math.PI * 3.5 * 0.3
      h.rotation.x = -0.25
      h.rotation.z = Math.sin(freq2 * 0.5) * 0.08

      la.rotation.x = -1.1 - Math.sin(freq2) * 0.22
      ra.rotation.x = -1.1 + Math.sin(freq2) * 0.22
      la.rotation.z = 0.38
      ra.rotation.z = -0.38

      ip.position.y = -1.08 + rise * 0.4
      ip.rotation.z = Math.sin(freq2 * 0.5) * 0.28
      ip.rotation.x = Math.cos(freq2 * 0.4) * 0.14
      ip.rotation.y = t * Math.PI * 2

      if (iceHandRef.current) {
        iceHandRef.current.visible = true
        iceHandRef.current.scale.setScalar(Math.max(0.1, 0.8 + Math.sin(freq2) * 0.45))
      }
      if (rightIceHandRef.current) {
        rightIceHandRef.current.visible = true
        rightIceHandRef.current.scale.setScalar(Math.max(0.1, 0.8 - Math.sin(freq2) * 0.45))
      }

      if (goggleLensMatRef.current) {
        goggleLensMatRef.current.emissiveIntensity = 0.6 + Math.sin(freq2 * 1.5) * 0.4
      }
      if (goggleRightLensMatRef.current) {
        goggleRightLensMatRef.current.emissiveIntensity = 0.6 - Math.sin(freq2 * 1.5) * 0.4
      }

      const pillars = [pillar0Ref, pillar1Ref, pillar2Ref]
      const pillarDelays = [0.1, 0.3, 0.5]
      pillars.forEach((r, i) => {
        if (!r.current) return
        const localT = Math.max(0, (t - pillarDelays[i]) / (1 - pillarDelays[i]))
        const sy = Math.sin(localT * Math.PI) * 1.0
        r.current.scale.y = Math.max(0.01, sy)
        r.current.position.y = -1.2 + sy * 0.4
      })

      if (t >= 1) {
        A.current.state = 'idle'
        A.current.actionT = 0
        setConfetti([])
        ip.position.y = -1.08
        ip.rotation.z = 0
        ip.rotation.x = 0
        ip.rotation.y = 0
        if (iceHandRef.current) {
          iceHandRef.current.visible = false
          iceHandRef.current.scale.setScalar(0)
        }
        if (rightIceHandRef.current) {
          rightIceHandRef.current.visible = false
          rightIceHandRef.current.scale.setScalar(0)
        }
        pillars.forEach((r) => {
          if (r.current) {
            r.current.position.y = -2.5
            r.current.scale.y = 0.01
          }
        })
        if (goggleLensMatRef.current) goggleLensMatRef.current.emissiveIntensity = 0.25
        if (goggleRightLensMatRef.current) goggleRightLensMatRef.current.emissiveIntensity = 0.25
        if (onAnimComplete) onAnimComplete()
      }
    }
  })

  return (
    <group ref={groupRef} position={[0, 0.72, 0]}>
      {/* Confetti */}
      {confetti.map((c) => (
        <ConfettiParticle key={c.id} position={c.position} color={c.color} velocity={c.velocity} />
      ))}

      {/* ─── ICE PLATFORM ─── */}
      <group ref={icePlatformRef} position={[0, -1.08, 0]}>
        {/* Main platform slab */}
        <mesh>
          <boxGeometry args={[1.3, 0.12, 0.65]} />
          <meshPhysicalMaterial {...ICE_MAT_PROPS} />
        </mesh>
        {/* Underside glow layer */}
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[1.18, 0.05, 0.55]} />
          <meshPhysicalMaterial {...ICE_GLOW_MAT_PROPS} />
        </mesh>
        {/* Front left corner crystal */}
        <mesh position={[-0.52, 0.13, 0.22]} rotation={[0, 0, -0.22]}>
          <coneGeometry args={[0.055, 0.26, 6]} />
          <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
        </mesh>
        {/* Front right corner crystal */}
        <mesh position={[0.52, 0.13, 0.22]} rotation={[0, 0, 0.22]}>
          <coneGeometry args={[0.055, 0.26, 6]} />
          <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
        </mesh>
        {/* Back left crystal */}
        <mesh position={[-0.42, 0.14, -0.24]} rotation={[0.18, 0, -0.18]}>
          <coneGeometry args={[0.05, 0.22, 6]} />
          <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
        </mesh>
        {/* Back right crystal */}
        <mesh position={[0.42, 0.14, -0.24]} rotation={[0.18, 0, 0.18]}>
          <coneGeometry args={[0.05, 0.22, 6]} />
          <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
        </mesh>
        {/* Center front small crystal */}
        <mesh position={[0.0, 0.14, 0.28]} rotation={[-0.12, 0, 0]}>
          <coneGeometry args={[0.04, 0.18, 6]} />
          <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
        </mesh>
        {/* Center back small crystal */}
        <mesh position={[0.0, 0.14, -0.28]} rotation={[0.12, 0, 0]}>
          <coneGeometry args={[0.04, 0.18, 6]} />
          <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
        </mesh>
      </group>

      {/* ─── CELEBRATE: ICE PILLARS ─── */}
      <mesh ref={pillar0Ref} position={[-0.7, -2.5, -0.3]} scale={[1, 0.01, 1]}>
        <cylinderGeometry args={[0.08, 0.13, 1.4, 6]} />
        <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
      </mesh>
      <mesh ref={pillar1Ref} position={[0.0, -2.5, -0.5]} scale={[1, 0.01, 1]}>
        <cylinderGeometry args={[0.07, 0.11, 1.2, 6]} />
        <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
      </mesh>
      <mesh ref={pillar2Ref} position={[0.65, -2.5, -0.2]} scale={[1, 0.01, 1]}>
        <cylinderGeometry args={[0.09, 0.14, 1.6, 6]} />
        <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
      </mesh>

      {/* ─── BOOTS — white with navy accents ─── */}
      {/* Left boot main (white) */}
      <mesh position={[0.18, -0.88, 0.06]}>
        <boxGeometry args={[0.28, 0.24, 0.42]} />
        <meshPhysicalMaterial {...BOOT_MAT} />
      </mesh>
      {/* Left boot navy accent stripe at top */}
      <mesh position={[0.18, -0.76, 0.06]}>
        <boxGeometry args={[0.29, 0.055, 0.43]} />
        <meshPhysicalMaterial {...BOOT_ACCENT_MAT} />
      </mesh>
      {/* Left boot navy toe cap */}
      <mesh position={[0.18, -0.9, 0.24]}>
        <boxGeometry args={[0.26, 0.2, 0.06]} />
        <meshPhysicalMaterial {...BOOT_ACCENT_MAT} />
      </mesh>
      {/* Right boot main (white) */}
      <mesh position={[-0.18, -0.88, 0.06]}>
        <boxGeometry args={[0.28, 0.24, 0.42]} />
        <meshPhysicalMaterial {...BOOT_MAT} />
      </mesh>
      {/* Right boot navy accent stripe at top */}
      <mesh position={[-0.18, -0.76, 0.06]}>
        <boxGeometry args={[0.29, 0.055, 0.43]} />
        <meshPhysicalMaterial {...BOOT_ACCENT_MAT} />
      </mesh>
      {/* Right boot navy toe cap */}
      <mesh position={[-0.18, -0.9, 0.24]}>
        <boxGeometry args={[0.26, 0.2, 0.06]} />
        <meshPhysicalMaterial {...BOOT_ACCENT_MAT} />
      </mesh>

      {/* ─── LEGS ─── */}
      {/* Left leg */}
      <mesh position={[0.18, -0.44, 0]}>
        <boxGeometry args={[0.24, 0.68, 0.24]} />
        <meshPhysicalMaterial {...SUIT_MAT} />
      </mesh>
      {/* Left leg outer white seam stripe */}
      <mesh position={[0.31, -0.44, 0]}>
        <boxGeometry args={[0.036, 0.62, 0.07]} />
        <meshStandardMaterial {...WHITE_ACCENT_MAT} />
      </mesh>
      {/* Right leg */}
      <mesh position={[-0.18, -0.44, 0]}>
        <boxGeometry args={[0.24, 0.68, 0.24]} />
        <meshPhysicalMaterial {...SUIT_MAT} />
      </mesh>
      {/* Right leg outer white seam stripe */}
      <mesh position={[-0.31, -0.44, 0]}>
        <boxGeometry args={[0.036, 0.62, 0.07]} />
        <meshStandardMaterial {...WHITE_ACCENT_MAT} />
      </mesh>

      {/* ─── HIPS / BELT AREA ─── */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.6, 0.22, 0.36]} />
        <meshPhysicalMaterial {...SUIT_PANEL_MAT} />
      </mesh>
      {/* Hip white horizontal band */}
      <mesh position={[0, -0.04, 0.19]}>
        <boxGeometry args={[0.54, 0.038, 0.04]} />
        <meshStandardMaterial {...WHITE_ACCENT_MAT} />
      </mesh>

      {/* ─── CAPE (behind torso) ─── */}
      <mesh position={[0, 0.42, -0.24]}>
        <boxGeometry args={[0.56, 0.52, 0.05]} />
        <meshPhysicalMaterial {...SUIT_PANEL_MAT} />
      </mesh>

      {/* ─── TORSO ─── */}
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[0.68, 0.9, 0.4]} />
        <meshPhysicalMaterial {...SUIT_MAT} />
      </mesh>
      {/* Center chest white vertical stripe */}
      <mesh position={[0, 0.5, 0.21]}>
        <boxGeometry args={[0.055, 0.82, 0.06]} />
        <meshStandardMaterial {...WHITE_ACCENT_MAT} />
      </mesh>
      {/* Shoulder horizontal white accent */}
      <mesh position={[0, 0.84, 0.19]}>
        <boxGeometry args={[0.62, 0.042, 0.07]} />
        <meshStandardMaterial {...WHITE_ACCENT_MAT} />
      </mesh>
      {/* Waist horizontal white accent */}
      <mesh position={[0, 0.14, 0.21]}>
        <boxGeometry args={[0.62, 0.038, 0.06]} />
        <meshStandardMaterial {...WHITE_ACCENT_MAT} />
      </mesh>
      {/* Left chest panel (slight lighter navy) */}
      <mesh position={[0.22, 0.5, 0.21]}>
        <boxGeometry args={[0.24, 0.84, 0.05]} />
        <meshPhysicalMaterial {...SUIT_PANEL_MAT} />
      </mesh>
      {/* Right chest panel */}
      <mesh position={[-0.22, 0.5, 0.21]}>
        <boxGeometry args={[0.24, 0.84, 0.05]} />
        <meshPhysicalMaterial {...SUIT_PANEL_MAT} />
      </mesh>
      {/* Chest center emblem — small teal hexagon stand-in */}
      <mesh position={[0, 0.6, 0.22]}>
        <cylinderGeometry args={[0.06, 0.06, 0.03, 6]} />
        <meshPhysicalMaterial color="#20C0C0" roughness={0.1} metalness={0.5} clearcoat={1.0} />
      </mesh>

      {/* ─── SHOULDERS ─── */}
      {/* Left shoulder */}
      <mesh position={[0.54, 0.82, 0]}>
        <sphereGeometry args={[0.21, 18, 14]} />
        <meshPhysicalMaterial {...SUIT_MAT} />
      </mesh>
      <mesh position={[0.54, 0.97, 0]}>
        <boxGeometry args={[0.23, 0.07, 0.24]} />
        <meshPhysicalMaterial {...SUIT_PANEL_MAT} />
      </mesh>
      {/* Right shoulder */}
      <mesh position={[-0.54, 0.82, 0]}>
        <sphereGeometry args={[0.21, 18, 14]} />
        <meshPhysicalMaterial {...SUIT_MAT} />
      </mesh>
      <mesh position={[-0.54, 0.97, 0]}>
        <boxGeometry args={[0.23, 0.07, 0.24]} />
        <meshPhysicalMaterial {...SUIT_PANEL_MAT} />
      </mesh>

      {/* ─── LEFT ARM ─── */}
      <group ref={leftArmRef} position={[0.6, 0.52, 0]}>
        {/* Upper arm */}
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[0.19, 0.36, 0.19]} />
          <meshPhysicalMaterial {...SUIT_MAT} />
        </mesh>
        {/* Elbow / forearm */}
        <mesh position={[0, -0.42, 0]}>
          <boxGeometry args={[0.17, 0.3, 0.17]} />
          <meshPhysicalMaterial {...SUIT_MAT} />
        </mesh>
        {/* Arm white accent band */}
        <mesh position={[0, -0.28, 0]}>
          <boxGeometry args={[0.21, 0.045, 0.13]} />
          <meshStandardMaterial {...WHITE_ACCENT_MAT} />
        </mesh>
        {/* Left glove — white, slightly larger than wrist */}
        <mesh position={[0, -0.64, 0]}>
          <sphereGeometry args={[0.135, 16, 12]} />
          <meshPhysicalMaterial {...GLOVE_MAT} />
        </mesh>
        {/* Glove cuff ring */}
        <mesh position={[0, -0.56, 0]}>
          <cylinderGeometry args={[0.14, 0.13, 0.05, 14]} />
          <meshPhysicalMaterial {...GLOVE_MAT} />
        </mesh>
        {/* Ice crystal cluster at left hand — blast & celebrate */}
        <group ref={iceHandRef} position={[0, -0.82, 0]} visible={false} scale={[0, 0, 0]}>
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i / 5) * Math.PI * 2
            const tilt = i % 2 === 0 ? 0.55 : 0.3
            return (
              <mesh
                key={i}
                position={[Math.cos(angle) * 0.09, -0.04 + (i % 2) * 0.04, Math.sin(angle) * 0.09]}
                rotation={[Math.cos(angle) * tilt, 0, Math.sin(angle) * tilt]}
              >
                <coneGeometry args={[0.038, 0.16, 6]} />
                <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
              </mesh>
            )
          })}
          {/* Central larger spike */}
          <mesh position={[0, -0.1, 0]}>
            <coneGeometry args={[0.05, 0.22, 6]} />
            <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
          </mesh>
        </group>
      </group>

      {/* ─── RIGHT ARM ─── */}
      <group ref={rightArmRef} position={[-0.6, 0.52, 0]}>
        {/* Upper arm */}
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[0.19, 0.36, 0.19]} />
          <meshPhysicalMaterial {...SUIT_MAT} />
        </mesh>
        {/* Elbow / forearm */}
        <mesh position={[0, -0.42, 0]}>
          <boxGeometry args={[0.17, 0.3, 0.17]} />
          <meshPhysicalMaterial {...SUIT_MAT} />
        </mesh>
        {/* Arm white accent band */}
        <mesh position={[0, -0.28, 0]}>
          <boxGeometry args={[0.21, 0.045, 0.13]} />
          <meshStandardMaterial {...WHITE_ACCENT_MAT} />
        </mesh>
        {/* Right glove */}
        <mesh position={[0, -0.64, 0]}>
          <sphereGeometry args={[0.135, 16, 12]} />
          <meshPhysicalMaterial {...GLOVE_MAT} />
        </mesh>
        {/* Glove cuff ring */}
        <mesh position={[0, -0.56, 0]}>
          <cylinderGeometry args={[0.14, 0.13, 0.05, 14]} />
          <meshPhysicalMaterial {...GLOVE_MAT} />
        </mesh>
        {/* Right hand ice cluster — celebrate only */}
        <group ref={rightIceHandRef} position={[0, -0.82, 0]} visible={false} scale={[0, 0, 0]}>
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i / 5) * Math.PI * 2
            const tilt = i % 2 === 0 ? 0.55 : 0.3
            return (
              <mesh
                key={i}
                position={[Math.cos(angle) * 0.09, -0.04 + (i % 2) * 0.04, Math.sin(angle) * 0.09]}
                rotation={[Math.cos(angle) * tilt, 0, Math.sin(angle) * tilt]}
              >
                <coneGeometry args={[0.038, 0.16, 6]} />
                <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
              </mesh>
            )
          })}
          <mesh position={[0, -0.1, 0]}>
            <coneGeometry args={[0.05, 0.22, 6]} />
            <meshPhysicalMaterial {...ICE_CRYSTAL_MAT} />
          </mesh>
        </group>
      </group>

      {/* ─── NECK ─── */}
      <mesh position={[0, 0.94, 0]}>
        <cylinderGeometry args={[0.115, 0.135, 0.15, 14]} />
        <meshStandardMaterial {...SKIN_MAT} />
      </mesh>

      {/* ─── HEAD GROUP ─── */}
      <group ref={headRef} position={[0, 1.18, 0]}>
        {/* Bald head — dark skin, smooth dome */}
        <mesh scale={[1, 1.1, 0.97]}>
          <sphereGeometry args={[0.35, 28, 20]} />
          <meshStandardMaterial {...SKIN_MAT} />
        </mesh>
        {/* Jaw definition box */}
        <mesh position={[0, -0.17, 0.02]}>
          <boxGeometry args={[0.38, 0.15, 0.33]} />
          <meshStandardMaterial {...SKIN_MAT} />
        </mesh>
        {/* Cheekbone masses */}
        <mesh position={[0.24, -0.05, 0.22]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial {...SKIN_MAT} />
        </mesh>
        <mesh position={[-0.24, -0.05, 0.22]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial {...SKIN_MAT} />
        </mesh>
        {/* Ears */}
        <mesh position={[0.37, 0.02, 0]}>
          <sphereGeometry args={[0.058, 8, 6]} />
          <meshStandardMaterial {...SKIN_MAT} />
        </mesh>
        <mesh position={[-0.37, 0.02, 0]}>
          <sphereGeometry args={[0.058, 8, 6]} />
          <meshStandardMaterial {...SKIN_MAT} />
        </mesh>
        {/* Nose */}
        <mesh position={[0, -0.03, 0.31]}>
          <boxGeometry args={[0.07, 0.1, 0.06]} />
          <meshStandardMaterial color="#1A0E05" roughness={0.75} />
        </mesh>
        {/* Determined straight mouth */}
        <mesh position={[0, -0.12, 0.31]}>
          <boxGeometry args={[0.13, 0.03, 0.04]} />
          <meshStandardMaterial color="#3D2010" roughness={0.65} />
        </mesh>

        {/* ─── GOGGLES — signature feature ─── */}
        {/* Goggle strap — wraps around head */}
        <mesh position={[0, 0.04, -0.05]}>
          <boxGeometry args={[0.74, 0.07, 0.04]} />
          <meshPhysicalMaterial {...GOGGLE_STRAP_MAT} />
        </mesh>
        {/* Outer goggle frame — wide rectangular bar */}
        <mesh position={[0, 0.04, 0.3]}>
          <boxGeometry args={[0.66, 0.22, 0.1]} />
          <meshPhysicalMaterial {...GOGGLE_FRAME_MAT} />
        </mesh>
        {/* Inner frame recess — slightly smaller, same depth, creates frame illusion */}
        <mesh position={[0, 0.04, 0.345]}>
          <boxGeometry args={[0.56, 0.14, 0.06]} />
          <meshPhysicalMaterial color="#0A6060" roughness={0.15} metalness={0.3} />
        </mesh>
        {/* Nose bridge center divider */}
        <mesh position={[0, 0.04, 0.355]}>
          <boxGeometry args={[0.055, 0.12, 0.07]} />
          <meshPhysicalMaterial {...GOGGLE_FRAME_MAT} />
        </mesh>
        {/* Side frame tabs connecting to strap — left */}
        <mesh position={[0.34, 0.04, 0.22]}>
          <boxGeometry args={[0.04, 0.1, 0.16]} />
          <meshPhysicalMaterial {...GOGGLE_FRAME_MAT} />
        </mesh>
        {/* Side frame tabs — right */}
        <mesh position={[-0.34, 0.04, 0.22]}>
          <boxGeometry args={[0.04, 0.1, 0.16]} />
          <meshPhysicalMaterial {...GOGGLE_FRAME_MAT} />
        </mesh>
        {/* Left goggle lens — transmission teal with emissive glow */}
        <mesh position={[-0.165, 0.04, 0.35]}>
          <boxGeometry args={[0.22, 0.13, 0.06]} />
          <meshPhysicalMaterial
            ref={goggleLensMatRef}
            color="#20C0C0"
            roughness={0.05}
            metalness={0}
            transmission={0.5}
            ior={1.4}
            emissive="#20C0C0"
            emissiveIntensity={0.25}
            transparent
          />
        </mesh>
        {/* Right goggle lens */}
        <mesh position={[0.165, 0.04, 0.35]}>
          <boxGeometry args={[0.22, 0.13, 0.06]} />
          <meshPhysicalMaterial
            ref={goggleRightLensMatRef}
            color="#20C0C0"
            roughness={0.05}
            metalness={0}
            transmission={0.5}
            ior={1.4}
            emissive="#20C0C0"
            emissiveIntensity={0.25}
            transparent
          />
        </mesh>
        {/* Top brow ridge of goggle frame */}
        <mesh position={[0, 0.14, 0.28]}>
          <boxGeometry args={[0.64, 0.04, 0.08]} />
          <meshPhysicalMaterial {...GOGGLE_FRAME_MAT} />
        </mesh>
        {/* Bottom chin ridge of goggle frame */}
        <mesh position={[0, -0.06, 0.28]}>
          <boxGeometry args={[0.64, 0.04, 0.08]} />
          <meshPhysicalMaterial {...GOGGLE_FRAME_MAT} />
        </mesh>
      </group>
    </group>
  )
}
