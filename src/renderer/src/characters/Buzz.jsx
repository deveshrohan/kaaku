import * as THREE from 'three'
import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import handleTrapdoor from './useTrapdoorAnim'

export const meta = { id: 'buzz', name: 'Buzz', icon: '🚀', color: '#6A4DB8' }

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

export default function Buzz({ animState, onAnimComplete }) {
  const groupRef = useRef()
  const headRef = useRef()
  const leftArmRef = useRef()
  const rightArmRef = useRef()
  const leftWingRef = useRef()
  const rightWingRef = useRef()
  const visorMatRef = useRef()

  const A = useRef({
    state: 'idle',
    idleMode: 0,
    idleT: 0,
    idleNext: 10,
    actionT: 0,
  })

  const [confetti, setConfetti] = useState([])

  useEffect(() => {
    A.current.state = animState
    A.current.actionT = 0
    if (animState === 'celebrate') {
      const particles = []
      for (let i = 0; i < 40; i++) {
        particles.push({
          id: i,
          position: [
            (Math.random() - 0.5) * 1.5,
            1.5 + Math.random() * 0.8,
            (Math.random() - 0.5) * 0.5,
          ],
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          velocity: [
            (Math.random() - 0.5) * 4,
            2 + Math.random() * 3,
            (Math.random() - 0.5) * 2,
          ],
        })
      }
      setConfetti(particles)
    } else {
      setConfetti([])
    }
  }, [animState])

  useFrame((_, dt) => {
    const a = A.current
    const g = groupRef.current
    if (!g) return
    if (handleTrapdoor(g, a, dt, onAnimComplete)) return
    const t = a.idleT

    if (a.state === 'idle') {
      a.idleT += dt
      if (a.idleT > a.idleNext) {
        a.idleT = 0
        a.idleMode = (a.idleMode + 1) % 4
        a.idleNext = 8 + Math.random() * 6
      }

      const mode = a.idleMode

      // Reset wing scales and body scale each idle frame
      if (leftWingRef.current) leftWingRef.current.scale.z = 1
      if (rightWingRef.current) rightWingRef.current.scale.z = 1
      if (groupRef.current) {
        groupRef.current.scale.x = 1
        groupRef.current.scale.z = 1
      }

      if (mode === 0) {
        // Heroic float — body y ±0.13 at 0.85Hz, wings slight flutter, head proud tilt back
        if (groupRef.current) groupRef.current.position.y = 0.62 + Math.sin(t * 0.85 * Math.PI * 2) * 0.13
        const wingFlutter = 1 + Math.abs(Math.sin(t * 1.5 * Math.PI * 2)) * 0.05
        if (leftWingRef.current) leftWingRef.current.scale.z = wingFlutter
        if (rightWingRef.current) rightWingRef.current.scale.z = wingFlutter
        if (headRef.current) {
          headRef.current.rotation.x = -0.08
          headRef.current.rotation.y = 0
          headRef.current.rotation.z = 0
        }
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = 0
          leftArmRef.current.rotation.z = 0
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = 0
          rightArmRef.current.rotation.z = 0
        }
      } else if (mode === 1) {
        // "To Infinity!" — right arm extends forward-up slowly, head tilts up, hold then return
        if (groupRef.current) groupRef.current.position.y = 0.62 + Math.sin(t * 0.5) * 0.05
        // Phase: 0-1s raise, 1-3s hold, 3-4s return (cycle at ~4s)
        const cycle = t % 4.0
        let armRaise
        if (cycle < 1.0) {
          armRaise = (cycle / 1.0) * -1.1
        } else if (cycle < 3.0) {
          armRaise = -1.1
        } else {
          armRaise = -1.1 * (1.0 - (cycle - 3.0) / 1.0)
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = armRaise
          rightArmRef.current.rotation.z = 0
        }
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = 0
          leftArmRef.current.rotation.z = 0
        }
        const headTilt = cycle < 1.0 ? (cycle / 1.0) * -0.2 : cycle < 3.0 ? -0.2 : -0.2 * (1.0 - (cycle - 3.0) / 1.0)
        if (headRef.current) {
          headRef.current.rotation.x = headTilt
          headRef.current.rotation.y = 0
        }
      } else if (mode === 2) {
        // Wings flick fully open — rotation.z to ±0.5 over 1s, body slight puff, then return
        if (groupRef.current) groupRef.current.position.y = 0.62 + Math.sin(t * 1.2) * 0.06
        const wingOpen = 1 + Math.abs(Math.sin(t * Math.PI * 0.5)) * 0.8
        if (leftWingRef.current) leftWingRef.current.scale.z = wingOpen
        if (rightWingRef.current) rightWingRef.current.scale.z = wingOpen
        const bodyPuff = 1 + Math.abs(Math.sin(t * Math.PI * 0.5)) * 0.05
        if (groupRef.current) {
          groupRef.current.scale.x = bodyPuff
          groupRef.current.scale.z = bodyPuff
        }
        if (headRef.current) {
          headRef.current.rotation.x = 0
          headRef.current.rotation.y = 0
        }
        if (leftArmRef.current) leftArmRef.current.rotation.z = 0
        if (rightArmRef.current) rightArmRef.current.rotation.z = 0
      } else if (mode === 3) {
        // Scan mode — head sweeps ±0.55, left arm raises, body crouches
        if (groupRef.current) groupRef.current.position.y = 0.62 - 0.06 + Math.sin(t * 0.7) * 0.03
        if (headRef.current) {
          headRef.current.rotation.y = Math.sin(t * 0.7) * 0.55
          headRef.current.rotation.x = 0.05
        }
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = -0.35
          leftArmRef.current.rotation.z = 0
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = 0
          rightArmRef.current.rotation.z = 0
        }
      }
    }

    // Click: jump, wings pop fully open, visor emissive flash, arms spread wide, triumphant pose
    if (a.state === 'click') {
      a.actionT = Math.min(a.actionT + dt * 1.8, 1)
      const p = a.actionT
      const jumpArc = Math.sin(p * Math.PI)
      if (groupRef.current) groupRef.current.position.y = 0.62 + jumpArc * 0.55
      if (headRef.current) {
        headRef.current.rotation.x = -jumpArc * 0.3
        headRef.current.rotation.y = 0
      }
      const wingPop = p < 0.5 ? p * 2 : (1 - p) * 2
      if (leftWingRef.current) leftWingRef.current.scale.z = 1 + wingPop * 1.3
      if (rightWingRef.current) rightWingRef.current.scale.z = 1 + wingPop * 1.3
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = wingPop * 0.6
        leftArmRef.current.rotation.x = -wingPop * 0.3
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = -wingPop * 0.6
        rightArmRef.current.rotation.x = -wingPop * 0.3
      }
      // Visor flash: peaks then fades
      if (visorMatRef.current) {
        visorMatRef.current.emissiveIntensity = wingPop * 1.0
      }

      if (a.actionT >= 1) {
        a.state = 'idle'
        a.actionT = 0
        if (visorMatRef.current) visorMatRef.current.emissiveIntensity = 0
        if (leftWingRef.current) leftWingRef.current.scale.z = 1
        if (rightWingRef.current) rightWingRef.current.scale.z = 1
        if (leftArmRef.current) { leftArmRef.current.rotation.z = 0; leftArmRef.current.rotation.x = 0 }
        if (rightArmRef.current) { rightArmRef.current.rotation.z = 0; rightArmRef.current.rotation.x = 0 }
      }
    }

    // Celebrate: full 360 spin, wings out, bounce, visor glow, laser arm raises, confetti
    if (a.state === 'celebrate') {
      a.actionT = Math.min(a.actionT + dt * 0.5, 1)
      const p = a.actionT

      if (groupRef.current) {
        groupRef.current.rotation.y = p * Math.PI * 4
        const bounceFreq = Math.sin(p * Math.PI * 8)
        groupRef.current.position.y = 0.62 + Math.abs(bounceFreq) * 0.3
      }
      // Arms fully spread — left arm (laser) raises up triumphantly
      if (leftArmRef.current) {
        leftArmRef.current.rotation.z = 0.8
        leftArmRef.current.rotation.x = -0.6
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = -0.8
        rightArmRef.current.rotation.x = -0.4
      }
      // Wings fully extended
      if (leftWingRef.current) leftWingRef.current.scale.z = 1.8
      if (rightWingRef.current) rightWingRef.current.scale.z = 1.8
      // Visor flash
      if (visorMatRef.current) visorMatRef.current.emissiveIntensity = Math.abs(Math.sin(p * Math.PI * 10)) * 0.8

      if (a.actionT >= 1) {
        a.state = 'idle'
        a.actionT = 0
        if (groupRef.current) groupRef.current.rotation.y = 0
        if (leftArmRef.current) { leftArmRef.current.rotation.z = 0; leftArmRef.current.rotation.x = 0 }
        if (rightArmRef.current) { rightArmRef.current.rotation.z = 0; rightArmRef.current.rotation.x = 0 }
        if (leftWingRef.current) leftWingRef.current.scale.z = 1
        if (rightWingRef.current) rightWingRef.current.scale.z = 1
        if (visorMatRef.current) visorMatRef.current.emissiveIntensity = 0
        setConfetti([])
        onAnimComplete && onAnimComplete()
      }
    }
  })

  return (
    <>
      {confetti.map(p => (
        <ConfettiParticle key={p.id} position={p.position} color={p.color} velocity={p.velocity} />
      ))}

      {/* Buzz Lightyear — ~2.6 units tall, upright heroic proportions */}
      <group ref={groupRef} position={[0, 0.62, 0]}>

        {/* ===== BOOTS ===== */}
        {/* Left boot — white rounded body */}
        <mesh position={[-0.21, -1.22, 0.07]}>
          <cylinderGeometry args={[0.14, 0.16, 0.28, 20]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Left boot sole — flat dark base */}
        <mesh position={[-0.21, -1.38, 0.07]}>
          <boxGeometry args={[0.32, 0.06, 0.46]} />
          <meshPhysicalMaterial color="#1A1A2E" roughness={0.5} metalness={0.1} clearcoat={0.4} />
        </mesh>
        {/* Left boot toe cap — purple */}
        <mesh position={[-0.21, -1.24, 0.28]}>
          <sphereGeometry args={[0.14, 20, 14]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>
        {/* Left boot ankle cuff — white ring */}
        <mesh position={[-0.21, -1.07, 0.05]}>
          <torusGeometry args={[0.14, 0.04, 12, 24]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>

        {/* Right boot — white rounded body */}
        <mesh position={[0.21, -1.22, 0.07]}>
          <cylinderGeometry args={[0.14, 0.16, 0.28, 20]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Right boot sole */}
        <mesh position={[0.21, -1.38, 0.07]}>
          <boxGeometry args={[0.32, 0.06, 0.46]} />
          <meshPhysicalMaterial color="#1A1A2E" roughness={0.5} metalness={0.1} clearcoat={0.4} />
        </mesh>
        {/* Right boot toe cap — purple */}
        <mesh position={[0.21, -1.24, 0.28]}>
          <sphereGeometry args={[0.14, 20, 14]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>
        {/* Right boot ankle cuff */}
        <mesh position={[0.21, -1.07, 0.05]}>
          <torusGeometry args={[0.14, 0.04, 12, 24]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>

        {/* ===== LEGS ===== */}
        {/* Left leg — white upper with purple knee cap */}
        <mesh position={[-0.21, -0.78, 0]}>
          <capsuleGeometry args={[0.12, 0.42, 8, 18]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Left knee — purple rounded cap */}
        <mesh position={[-0.21, -0.58, 0.05]}>
          <sphereGeometry args={[0.135, 18, 14]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>
        {/* Left shin — white lower */}
        <mesh position={[-0.21, -0.95, 0.02]}>
          <capsuleGeometry args={[0.11, 0.24, 8, 18]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>

        {/* Right leg */}
        <mesh position={[0.21, -0.78, 0]}>
          <capsuleGeometry args={[0.12, 0.42, 8, 18]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Right knee — purple */}
        <mesh position={[0.21, -0.58, 0.05]}>
          <sphereGeometry args={[0.135, 18, 14]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>
        {/* Right shin */}
        <mesh position={[0.21, -0.95, 0.02]}>
          <capsuleGeometry args={[0.11, 0.24, 8, 18]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>

        {/* ===== HIP / PELVIS ASSEMBLY ===== */}
        {/* Main hip block */}
        <mesh position={[0, -0.38, 0]}>
          <boxGeometry args={[0.7, 0.2, 0.38]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Purple belt — rounded cylinder */}
        <mesh position={[0, -0.37, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.18, 28]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>
        {/* Belt buckle — gold */}
        <mesh position={[0, -0.36, 0.22]}>
          <boxGeometry args={[0.14, 0.1, 0.06]} />
          <meshStandardMaterial color="#C8A030" metalness={0.85} roughness={0.25} />
        </mesh>

        {/* ===== TORSO ===== */}
        {/* Main torso — white suit body, slightly tapered */}
        <mesh position={[0, 0.14, 0]} scale={[1, 1, 0.88]}>
          <capsuleGeometry args={[0.36, 0.55, 10, 24]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Chest front ridge — slight convex shape */}
        <mesh position={[0, 0.22, 0.34]}>
          <sphereGeometry args={[0.24, 22, 16]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>

        {/* Purple chest panel — raised plate */}
        <mesh position={[0, 0.18, 0.31]}>
          <boxGeometry args={[0.46, 0.52, 0.06]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>
        {/* Purple panel top chamfer */}
        <mesh position={[0, 0.45, 0.3]} rotation={[0.35, 0, 0]}>
          <boxGeometry args={[0.42, 0.08, 0.06]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>

        {/* Star Command badge — gold pentagon */}
        <mesh position={[0, 0.35, 0.37]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.03, 5]} />
          <meshStandardMaterial color="#C8A030" metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Badge star inset */}
        <mesh position={[0, 0.35, 0.395]}>
          <cylinderGeometry args={[0.055, 0.055, 0.02, 5]} />
          <meshStandardMaterial color="#E8C040" metalness={0.9} roughness={0.15} />
        </mesh>

        {/* Green chest control panel strip */}
        <mesh position={[0, 0.08, 0.36]}>
          <boxGeometry args={[0.3, 0.16, 0.05]} />
          <meshPhysicalMaterial color="#207030" roughness={0.25} metalness={0.1} clearcoat={0.7} clearcoatRoughness={0.1} />
        </mesh>
        {/* Control panel buttons — 3 small dots */}
        <mesh position={[-0.07, 0.08, 0.395]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshStandardMaterial color="#FF4444" roughness={0.2} metalness={0.2} emissive="#FF1111" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, 0.08, 0.395]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshStandardMaterial color="#44FF44" roughness={0.2} metalness={0.2} emissive="#22FF22" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0.07, 0.08, 0.395]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshStandardMaterial color="#4444FF" roughness={0.2} metalness={0.2} emissive="#2222FF" emissiveIntensity={0.3} />
        </mesh>

        {/* Teal accent stripe around torso middle */}
        <mesh position={[0, -0.14, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.37, 0.028, 10, 32]} />
          <meshPhysicalMaterial color="#20B2AA" roughness={0.2} clearcoat={0.85} metalness={0.1} />
        </mesh>

        {/* ===== JETPACK (back) ===== */}
        <mesh position={[0, 0.2, -0.3]}>
          <boxGeometry args={[0.5, 0.6, 0.22]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Jetpack purple accent panel */}
        <mesh position={[0, 0.2, -0.42]}>
          <boxGeometry args={[0.42, 0.46, 0.04]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>
        {/* Left thruster — slightly flared */}
        <mesh position={[-0.13, -0.08, -0.42]}>
          <cylinderGeometry args={[0.075, 0.1, 0.26, 16]} />
          <meshStandardMaterial color="#282838" roughness={0.55} metalness={0.45} />
        </mesh>
        {/* Left thruster glow ring */}
        <mesh position={[-0.13, -0.22, -0.42]}>
          <torusGeometry args={[0.085, 0.016, 8, 20]} />
          <meshStandardMaterial color="#FF6020" emissive="#FF4010" emissiveIntensity={0.6} roughness={0.3} />
        </mesh>
        {/* Right thruster */}
        <mesh position={[0.13, -0.08, -0.42]}>
          <cylinderGeometry args={[0.075, 0.1, 0.26, 16]} />
          <meshStandardMaterial color="#282838" roughness={0.55} metalness={0.45} />
        </mesh>
        {/* Right thruster glow ring */}
        <mesh position={[0.13, -0.22, -0.42]}>
          <torusGeometry args={[0.085, 0.016, 8, 20]} />
          <meshStandardMaterial color="#FF6020" emissive="#FF4010" emissiveIntensity={0.6} roughness={0.3} />
        </mesh>

        {/* ===== WINGS ===== */}
        {/* Left wing group — pivots from back of body */}
        <group ref={leftWingRef} position={[-0.28, 0.22, -0.24]} rotation={[0.08, 0, 0.2]}>
          {/* Main wing panel — white, swept triangular profile */}
          <mesh position={[-0.22, 0, 0]}>
            <boxGeometry args={[0.44, 0.58, 0.06]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Wing strut rib — purple vertical center bar */}
          <mesh position={[-0.2, 0, 0.04]}>
            <boxGeometry args={[0.05, 0.52, 0.04]} />
            <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
          </mesh>
          {/* Teal accent stripe across wing */}
          <mesh position={[-0.22, 0.22, 0.04]}>
            <boxGeometry args={[0.38, 0.05, 0.04]} />
            <meshPhysicalMaterial color="#20B2AA" roughness={0.2} clearcoat={0.85} metalness={0.1} />
          </mesh>
          {/* Wing tip — tapered end */}
          <mesh position={[-0.42, 0.2, 0]} scale={[0.3, 0.45, 0.8]}>
            <sphereGeometry args={[0.22, 16, 12]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Second teal stripe lower */}
          <mesh position={[-0.22, -0.1, 0.04]}>
            <boxGeometry args={[0.38, 0.03, 0.04]} />
            <meshPhysicalMaterial color="#20B2AA" roughness={0.2} clearcoat={0.85} metalness={0.1} />
          </mesh>
        </group>

        {/* Right wing group */}
        <group ref={rightWingRef} position={[0.28, 0.22, -0.24]} rotation={[0.08, 0, -0.2]}>
          {/* Main wing panel */}
          <mesh position={[0.22, 0, 0]}>
            <boxGeometry args={[0.44, 0.58, 0.06]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Wing strut rib — purple */}
          <mesh position={[0.2, 0, 0.04]}>
            <boxGeometry args={[0.05, 0.52, 0.04]} />
            <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
          </mesh>
          {/* Teal accent stripe */}
          <mesh position={[0.22, 0.22, 0.04]}>
            <boxGeometry args={[0.38, 0.05, 0.04]} />
            <meshPhysicalMaterial color="#20B2AA" roughness={0.2} clearcoat={0.85} metalness={0.1} />
          </mesh>
          {/* Wing tip */}
          <mesh position={[0.42, 0.2, 0]} scale={[0.3, 0.45, 0.8]}>
            <sphereGeometry args={[0.22, 16, 12]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Second teal stripe lower */}
          <mesh position={[0.22, -0.1, 0.04]}>
            <boxGeometry args={[0.38, 0.03, 0.04]} />
            <meshPhysicalMaterial color="#20B2AA" roughness={0.2} clearcoat={0.85} metalness={0.1} />
          </mesh>
        </group>

        {/* ===== SHOULDERS ===== */}
        {/* Left shoulder ball — large rounded epaulet */}
        <mesh position={[-0.6, 0.44, 0]}>
          <sphereGeometry args={[0.22, 22, 16]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Left shoulder purple ring accent */}
        <mesh position={[-0.6, 0.36, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.18, 0.04, 10, 22]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>
        {/* Right shoulder ball */}
        <mesh position={[0.6, 0.44, 0]}>
          <sphereGeometry args={[0.22, 22, 16]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Right shoulder purple ring accent */}
        <mesh position={[0.6, 0.36, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.18, 0.04, 10, 22]} />
          <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
        </mesh>

        {/* ===== LEFT ARM (has laser wrist device) ===== */}
        <group ref={leftArmRef} position={[-0.62, 0.36, 0]}>
          {/* Upper arm — white capsule */}
          <mesh position={[0, -0.22, 0]}>
            <capsuleGeometry args={[0.1, 0.28, 8, 18]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Elbow joint — purple sphere */}
          <mesh position={[0, -0.4, 0]}>
            <sphereGeometry args={[0.105, 18, 14]} />
            <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.58, 0]}>
            <capsuleGeometry args={[0.095, 0.24, 8, 18]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Red stripe */}
          <mesh position={[0, -0.47, 0]}>
            <torusGeometry args={[0.098, 0.022, 10, 22]} />
            <meshStandardMaterial color="#CC2222" roughness={0.3} />
          </mesh>
          {/* Teal accent stripe */}
          <mesh position={[0, -0.56, 0]}>
            <torusGeometry args={[0.098, 0.016, 10, 22]} />
            <meshPhysicalMaterial color="#20B2AA" roughness={0.2} clearcoat={0.85} />
          </mesh>
          {/* Wrist band — white cuff */}
          <mesh position={[0, -0.72, 0]}>
            <torusGeometry args={[0.1, 0.03, 10, 22]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Green laser wrist device housing */}
          <mesh position={[0, -0.77, 0.11]}>
            <boxGeometry args={[0.13, 0.1, 0.2]} />
            <meshPhysicalMaterial color="#207030" roughness={0.25} metalness={0.1} clearcoat={0.7} clearcoatRoughness={0.1} />
          </mesh>
          {/* Laser barrel */}
          <mesh position={[0, -0.77, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.1, 10]} />
            <meshStandardMaterial color="#505050" roughness={0.3} metalness={0.7} />
          </mesh>
          {/* Laser emissive tip */}
          <mesh position={[0, -0.77, 0.275]}>
            <sphereGeometry args={[0.026, 10, 8]} />
            <meshStandardMaterial color="#88FF88" roughness={0.05} metalness={0.2} emissive="#44FF44" emissiveIntensity={0.9} />
          </mesh>
          {/* Glove — white fist */}
          <mesh position={[0, -0.9, 0.03]} scale={[1, 0.78, 1.1]}>
            <sphereGeometry args={[0.14, 18, 14]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
        </group>

        {/* ===== RIGHT ARM ===== */}
        <group ref={rightArmRef} position={[0.62, 0.36, 0]}>
          {/* Upper arm */}
          <mesh position={[0, -0.22, 0]}>
            <capsuleGeometry args={[0.1, 0.28, 8, 18]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Elbow joint — purple */}
          <mesh position={[0, -0.4, 0]}>
            <sphereGeometry args={[0.105, 18, 14]} />
            <meshPhysicalMaterial color="#6030A8" clearcoat={0.8} roughness={0.18} metalness={0} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.58, 0]}>
            <capsuleGeometry args={[0.095, 0.24, 8, 18]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Red stripe */}
          <mesh position={[0, -0.47, 0]}>
            <torusGeometry args={[0.098, 0.022, 10, 22]} />
            <meshStandardMaterial color="#CC2222" roughness={0.3} />
          </mesh>
          {/* Teal accent stripe */}
          <mesh position={[0, -0.56, 0]}>
            <torusGeometry args={[0.098, 0.016, 10, 22]} />
            <meshPhysicalMaterial color="#20B2AA" roughness={0.2} clearcoat={0.85} />
          </mesh>
          {/* Wrist cuff */}
          <mesh position={[0, -0.72, 0]}>
            <torusGeometry args={[0.1, 0.03, 10, 22]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Glove */}
          <mesh position={[0, -0.9, 0.03]} scale={[1, 0.78, 1.1]}>
            <sphereGeometry args={[0.14, 18, 14]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
        </group>

        {/* ===== NECK ===== */}
        <mesh position={[0, 0.58, 0]}>
          <cylinderGeometry args={[0.13, 0.16, 0.2, 18]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>
        {/* Neck collar ring — white */}
        <mesh position={[0, 0.69, 0]}>
          <torusGeometry args={[0.155, 0.03, 10, 28]} />
          <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
        </mesh>

        {/* ===== HEAD + HELMET GROUP ===== */}
        <group ref={headRef} position={[0, 0.72, 0]}>

          {/* === FACE (visible through clear dome) === */}
          {/* Head base — skin-toned, square-jawed heroic shape */}
          <mesh position={[0, 0.2, 0]} scale={[1, 1.05, 0.88]}>
            <sphereGeometry args={[0.32, 24, 18]} />
            <meshStandardMaterial color="#F0C080" roughness={0.65} metalness={0} />
          </mesh>
          {/* Square jaw augment — stronger chin */}
          <mesh position={[0, 0.06, 0.04]} scale={[0.88, 0.5, 0.78]}>
            <boxGeometry args={[0.44, 0.28, 0.44]} />
            <meshStandardMaterial color="#EBB870" roughness={0.65} metalness={0} />
          </mesh>
          {/* Chin cleft */}
          <mesh position={[0, 0.06, 0.28]}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial color="#D8A060" roughness={0.7} metalness={0} />
          </mesh>

          {/* Dark hair — flat cap visible through dome */}
          <mesh position={[0, 0.46, -0.02]} scale={[1.0, 0.3, 0.85]}>
            <sphereGeometry args={[0.31, 20, 14]} />
            <meshStandardMaterial color="#2A1A05" roughness={0.85} metalness={0} />
          </mesh>
          {/* Hair side sideburn patches */}
          <mesh position={[-0.24, 0.3, 0.12]} scale={[0.3, 0.5, 0.3]}>
            <sphereGeometry args={[0.16, 12, 10]} />
            <meshStandardMaterial color="#2A1A05" roughness={0.85} metalness={0} />
          </mesh>
          <mesh position={[0.24, 0.3, 0.12]} scale={[0.3, 0.5, 0.3]}>
            <sphereGeometry args={[0.16, 12, 10]} />
            <meshStandardMaterial color="#2A1A05" roughness={0.85} metalness={0} />
          </mesh>

          {/* Left eye — dark brown */}
          <mesh position={[-0.11, 0.24, 0.27]}>
            <sphereGeometry args={[0.058, 14, 10]} />
            <meshStandardMaterial color="#1E1005" roughness={0.3} metalness={0} />
          </mesh>
          {/* Left eye white sclera */}
          <mesh position={[-0.11, 0.24, 0.285]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshStandardMaterial color="#F5F0E8" roughness={0.4} metalness={0} />
          </mesh>
          {/* Left eye pupil */}
          <mesh position={[-0.11, 0.24, 0.31]}>
            <sphereGeometry args={[0.02, 10, 8]} />
            <meshStandardMaterial color="#0A0A0A" roughness={0.1} metalness={0} />
          </mesh>
          {/* Left eye catchlight */}
          <mesh position={[-0.096, 0.255, 0.325]}>
            <sphereGeometry args={[0.008, 6, 5]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0} emissive="#FFFFFF" emissiveIntensity={0.5} />
          </mesh>

          {/* Right eye — dark brown */}
          <mesh position={[0.11, 0.24, 0.27]}>
            <sphereGeometry args={[0.058, 14, 10]} />
            <meshStandardMaterial color="#1E1005" roughness={0.3} metalness={0} />
          </mesh>
          {/* Right eye white */}
          <mesh position={[0.11, 0.24, 0.285]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshStandardMaterial color="#F5F0E8" roughness={0.4} metalness={0} />
          </mesh>
          {/* Right eye pupil */}
          <mesh position={[0.11, 0.24, 0.31]}>
            <sphereGeometry args={[0.02, 10, 8]} />
            <meshStandardMaterial color="#0A0A0A" roughness={0.1} metalness={0} />
          </mesh>
          {/* Right eye catchlight */}
          <mesh position={[0.124, 0.255, 0.325]}>
            <sphereGeometry args={[0.008, 6, 5]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0} emissive="#FFFFFF" emissiveIntensity={0.5} />
          </mesh>

          {/* Left eyebrow — determined furrowed look */}
          <mesh position={[-0.115, 0.315, 0.28]} rotation={[0, 0, 0.2]}>
            <boxGeometry args={[0.1, 0.024, 0.025]} />
            <meshStandardMaterial color="#1A0E02" roughness={0.7} metalness={0} />
          </mesh>
          {/* Right eyebrow */}
          <mesh position={[0.115, 0.315, 0.28]} rotation={[0, 0, -0.2]}>
            <boxGeometry args={[0.1, 0.024, 0.025]} />
            <meshStandardMaterial color="#1A0E02" roughness={0.7} metalness={0} />
          </mesh>

          {/* Nose */}
          <mesh position={[0, 0.16, 0.31]} scale={[0.6, 0.9, 0.6]}>
            <sphereGeometry args={[0.038, 12, 10]} />
            <meshStandardMaterial color="#D8A060" roughness={0.65} metalness={0} />
          </mesh>

          {/* Determined mouth — firm straight line */}
          <mesh position={[0, 0.1, 0.3]}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color="#B07040" roughness={0.6} metalness={0} />
          </mesh>
          {/* Cheek shading — slight shadow under eyes */}
          <mesh position={[-0.14, 0.17, 0.26]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color="#E09060" roughness={0.7} metalness={0} transparent opacity={0.5} />
          </mesh>
          <mesh position={[0.14, 0.17, 0.26]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color="#E09060" roughness={0.7} metalness={0} transparent opacity={0.5} />
          </mesh>

          {/* ===== HELMET ASSEMBLY ===== */}
          {/* Helmet base collar — wide white ring around neck of helmet */}
          <mesh position={[0, -0.04, 0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.42, 0.06, 14, 36]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>
          {/* Helmet collar lower ring — connects to suit neck */}
          <mesh position={[0, -0.07, 0]}>
            <cylinderGeometry args={[0.44, 0.4, 0.1, 32]} />
            <meshPhysicalMaterial color="#F0F0F8" roughness={0.15} metalness={0} clearcoat={1.0} clearcoatRoughness={0.08} />
          </mesh>

          {/* Purple visor band — horizontal band inside dome over eyes */}
          <mesh position={[0, 0.24, 0.01]} scale={[1, 0.18, 0.95]}>
            <sphereGeometry args={[0.47, 28, 20]} />
            <meshPhysicalMaterial
              color="#2040A0"
              roughness={0.12}
              metalness={0.1}
              clearcoat={0.9}
              clearcoatRoughness={0.05}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Visor inner dark tint strip */}
          <mesh position={[0, 0.24, 0.04]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.9, 0.14, 0.7]} />
            <meshPhysicalMaterial
              ref={visorMatRef}
              color="#1030A0"
              roughness={0.08}
              metalness={0.05}
              transparent
              opacity={0.85}
              emissive="#2050C0"
              emissiveIntensity={0}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* === CLEAR BUBBLE DOME — MOST ICONIC FEATURE === */}
          {/* Dome outer shell — transmission glass */}
          <mesh position={[0, 0.22, 0.02]} scale={[1, 0.92, 0.9]}>
            <sphereGeometry args={[0.52, 36, 26]} />
            <meshPhysicalMaterial
              color="#C0D8F0"
              roughness={0.04}
              metalness={0}
              transmission={0.6}
              thickness={0.15}
              ior={1.45}
              transparent
              opacity={0.82}
              side={THREE.FrontSide}
            />
          </mesh>
          {/* Dome inner surface — slight blue tint for depth */}
          <mesh position={[0, 0.22, 0.02]} scale={[0.97, 0.9, 0.87]}>
            <sphereGeometry args={[0.52, 32, 22]} />
            <meshPhysicalMaterial
              color="#A8C8E8"
              roughness={0.06}
              metalness={0}
              transmission={0.4}
              thickness={0.08}
              ior={1.35}
              transparent
              opacity={0.4}
              side={THREE.BackSide}
            />
          </mesh>
          {/* Dome highlight glare spot — subtle white specular patch */}
          <mesh position={[0.12, 0.42, 0.38]}>
            <sphereGeometry args={[0.07, 12, 10]} />
            <meshStandardMaterial
              color="#FFFFFF"
              roughness={0}
              metalness={0}
              transparent
              opacity={0.18}
              emissive="#FFFFFF"
              emissiveIntensity={0.4}
            />
          </mesh>

          {/* Dome front lower chin piece — green */}
          <mesh position={[0, 0.0, 0.22]}>
            <boxGeometry args={[0.46, 0.22, 0.28]} />
            <meshPhysicalMaterial color="#207030" roughness={0.25} metalness={0.1} clearcoat={0.7} clearcoatRoughness={0.1} />
          </mesh>
          {/* Chin piece lower curved edge */}
          <mesh position={[0, -0.07, 0.28]} scale={[1, 0.4, 0.6]}>
            <sphereGeometry args={[0.22, 18, 12]} />
            <meshPhysicalMaterial color="#207030" roughness={0.25} metalness={0.1} clearcoat={0.7} clearcoatRoughness={0.1} />
          </mesh>

        </group>
        {/* END HEAD GROUP */}

      </group>
    </>
  )
}
