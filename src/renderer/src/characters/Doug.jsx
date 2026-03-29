import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import handleTrapdoor from './useTrapdoorAnim'

export const meta = { id: 'doug', name: 'Doug', icon: '🐕', color: '#C8A55A' }

const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98FB98', '#DDA0DD']

const TWO_PI_1HZ = Math.PI * 2 * 1

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

// Reusable fur material props
const FUR_GOLD    = { color: '#C8A040', roughness: 0.88, metalness: 0 }
const FUR_LIGHT   = { color: '#E8D080', roughness: 0.86, metalness: 0 }
const FUR_EAR     = { color: '#B87830', roughness: 0.88, metalness: 0 }
const FUR_CHEST   = { color: '#DBBE68', roughness: 0.87, metalness: 0 }
const FUR_PAW     = { color: '#B89030', roughness: 0.90, metalness: 0 }
const FUR_TIP     = { color: '#E0C878', roughness: 0.85, metalness: 0 }

export default function Doug({ animState, onAnimComplete }) {
  const groupRef     = useRef()
  const headRef      = useRef()
  const tailRef      = useRef()
  const leftEarRef   = useRef()
  const rightEarRef  = useRef()
  const eyebrowLRef  = useRef()
  const eyebrowRRef  = useRef()
  const tongueRef    = useRef()

  const A = useRef({
    state: 'idle',
    idleMode: 0,
    idleT: 0,
    idleNext: 10,
    actionT: 0,
  })

  const squirrelTimer = useRef(0)
  const [confetti, setConfetti] = useState([])

  useEffect(() => {
    A.current.state = animState
    A.current.actionT = 0
    squirrelTimer.current = 0
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

    const lerp = (va, vb, f) => va + (vb - va) * Math.min(Math.max(f, 0), 1)

    if (a.state === 'idle') {
      a.idleT += dt
      if (a.idleT > a.idleNext) {
        a.idleT = 0
        a.idleMode = (a.idleMode + 1) % 4
        a.idleNext = 8 + Math.random() * 6
        squirrelTimer.current = 0
      }

      const mode = a.idleMode

      // Reset tongue default position each idle frame before overrides
      if (tongueRef.current) {
        tongueRef.current.position.z = 0.62
        tongueRef.current.position.y = -0.05
        tongueRef.current.scale.y = 1.0
      }

      if (mode === 0) {
        // Gentle body bob — tail wag, ears gentle pendulum sway
        if (groupRef.current) groupRef.current.position.y = 0.38 + Math.sin(t * TWO_PI_1HZ) * 0.1
        if (tailRef.current) tailRef.current.rotation.z = Math.sin(t * 3.2) * 0.65
        if (headRef.current) {
          headRef.current.rotation.y = 0
          headRef.current.rotation.z = 0
          headRef.current.rotation.x = Math.sin(t * 1.1) * 0.05
        }
        if (leftEarRef.current)  leftEarRef.current.rotation.z  =  0.08 + Math.sin(t * 2.2) * 0.08
        if (rightEarRef.current) rightEarRef.current.rotation.z = -0.08 - Math.sin(t * 2.2) * 0.08
        if (eyebrowLRef.current) eyebrowLRef.current.rotation.z =  0.2
        if (eyebrowRRef.current) eyebrowRRef.current.rotation.z = -0.2

      } else if (mode === 1) {
        // SQUIRREL! — head snaps sharply left, pause, snap right, settle
        squirrelTimer.current += dt
        const st = squirrelTimer.current
        if (groupRef.current) groupRef.current.position.y = 0.38 + Math.sin(t * 1.5) * 0.04

        let targetHeadY = 0
        if      (st < 0.35) targetHeadY = 0
        else if (st < 0.65) targetHeadY = lerp(0, -0.9, (st - 0.35) / 0.2)
        else if (st < 1.65) targetHeadY = -0.9
        else if (st < 2.1)  targetHeadY = lerp(-0.9, 0.9, (st - 1.65) / 0.35)
        else if (st < 3.1)  targetHeadY = 0.9
        else                targetHeadY = lerp(0.9, 0, (st - 3.1) / 0.55)

        if (headRef.current) {
          headRef.current.rotation.y = targetHeadY
          headRef.current.rotation.z = 0
          headRef.current.rotation.x = 0.08
        }
        const snapIntensity = Math.abs(targetHeadY) / 0.9
        if (leftEarRef.current)  leftEarRef.current.rotation.z  =  0.08 + snapIntensity * 0.4
        if (rightEarRef.current) rightEarRef.current.rotation.z = -0.08 - snapIntensity * 0.4
        if (tailRef.current)     tailRef.current.rotation.z = Math.sin(t * 5) * 0.3
        if (eyebrowLRef.current) eyebrowLRef.current.rotation.z =  0.5
        if (eyebrowRRef.current) eyebrowRRef.current.rotation.z = -0.5

      } else if (mode === 2) {
        // Panting happy — tongue extends, head bobs at 3 Hz, tail wags fast, eyebrows raise
        if (groupRef.current) groupRef.current.position.y = 0.38 + Math.sin(t * 6.28) * 0.06
        if (headRef.current) {
          headRef.current.rotation.x = Math.sin(t * 3.0) * 0.06
          headRef.current.rotation.y = 0
          headRef.current.rotation.z = 0
        }
        if (tongueRef.current) {
          tongueRef.current.position.z = 0.62 + Math.abs(Math.sin(t * 3.0)) * 0.12
          tongueRef.current.scale.y = 1.0 + Math.abs(Math.sin(t * 3.0)) * 0.35
          tongueRef.current.position.y = -0.05 - Math.abs(Math.sin(t * 3.0)) * 0.06
        }
        if (tailRef.current)     tailRef.current.rotation.z = Math.sin(t * 4.0) * 0.7
        if (leftEarRef.current)  leftEarRef.current.rotation.z  =  0.08
        if (rightEarRef.current) rightEarRef.current.rotation.z = -0.08
        if (eyebrowLRef.current) eyebrowLRef.current.rotation.z =  0.38
        if (eyebrowRRef.current) eyebrowRRef.current.rotation.z = -0.38

      } else if (mode === 3) {
        // Curious tilt — head tilts 0.35, worried eyebrow, slow tail wag, tongue slightly visible
        if (groupRef.current) groupRef.current.position.y = 0.38 + Math.sin(t * 0.8) * 0.04
        if (headRef.current) {
          headRef.current.rotation.z = lerp(headRef.current.rotation.z, 0.35, dt * 3.5)
          headRef.current.rotation.y = lerp(headRef.current.rotation.y, 0, dt * 3)
          headRef.current.rotation.x = 0
        }
        if (tongueRef.current) {
          tongueRef.current.position.z = 0.64
          tongueRef.current.scale.y = 1.1
          tongueRef.current.position.y = -0.07
        }
        if (tailRef.current)     tailRef.current.rotation.z = Math.sin(t * 1.5) * 0.3
        if (eyebrowLRef.current) eyebrowLRef.current.rotation.z =  0.3
        if (eyebrowRRef.current) eyebrowRRef.current.rotation.z = -0.55
        if (leftEarRef.current)  leftEarRef.current.rotation.z  =  0.08
        if (rightEarRef.current) rightEarRef.current.rotation.z = -0.08
      }
    }

    // Click: jump + bark reaction
    if (a.state === 'click') {
      a.actionT = Math.min(a.actionT + dt * 1.8, 1)
      const p = a.actionT

      const jumpArc = Math.sin(p * Math.PI)
      if (groupRef.current) groupRef.current.position.y = 0.38 + jumpArc * 0.52

      const headLunge =
        p < 0.35 ? lerp(0, -0.3, p / 0.35)
        : p < 0.65 ? lerp(-0.3, 0.28, (p - 0.35) / 0.3)
        : lerp(0.28, 0, (p - 0.65) / 0.35)

      if (headRef.current) {
        headRef.current.rotation.x = headLunge
        headRef.current.rotation.y = 0
        headRef.current.rotation.z = 0
      }

      if (leftEarRef.current)  leftEarRef.current.rotation.z  =  0.08 + jumpArc * 0.65
      if (rightEarRef.current) rightEarRef.current.rotation.z = -0.08 - jumpArc * 0.65
      if (tailRef.current)     tailRef.current.rotation.z = Math.sin(p * Math.PI * 10) * 0.8
      if (tongueRef.current) {
        tongueRef.current.position.z = 0.62 + jumpArc * 0.18
        tongueRef.current.scale.y = 1.0 + jumpArc * 0.4
        tongueRef.current.position.y = -0.05 - jumpArc * 0.06
      }
      if (eyebrowLRef.current) eyebrowLRef.current.rotation.z =  0.5 + jumpArc * 0.2
      if (eyebrowRRef.current) eyebrowRRef.current.rotation.z = -0.5 - jumpArc * 0.2

      if (a.actionT >= 1) {
        a.state = 'idle'
        a.actionT = 0
        if (headRef.current) {
          headRef.current.rotation.x = 0
          headRef.current.rotation.y = 0
          headRef.current.rotation.z = 0
        }
      }
    }

    // Celebrate: spin, jump, tail max wag, ears flopping, tongue out, confetti
    if (a.state === 'celebrate') {
      a.actionT = Math.min(a.actionT + dt * 0.5, 1)
      const p = a.actionT

      if (groupRef.current) {
        groupRef.current.rotation.y = p * Math.PI * 4
        groupRef.current.position.y = 0.38 + Math.abs(Math.sin(p * Math.PI * 8)) * 0.38
      }
      if (tailRef.current)     tailRef.current.rotation.z = Math.sin(p * Math.PI * 20) * 0.9
      if (leftEarRef.current)  leftEarRef.current.rotation.z  =  0.08 + Math.sin(p * Math.PI * 12) * 0.55
      if (rightEarRef.current) rightEarRef.current.rotation.z = -0.08 - Math.sin(p * Math.PI * 12) * 0.55
      if (tongueRef.current) {
        tongueRef.current.position.z = 0.62 + Math.abs(Math.sin(p * Math.PI * 8)) * 0.2
        tongueRef.current.scale.y = 1.0 + Math.abs(Math.sin(p * Math.PI * 8)) * 0.5
        tongueRef.current.position.y = -0.05 - Math.abs(Math.sin(p * Math.PI * 8)) * 0.08
      }
      if (eyebrowLRef.current) eyebrowLRef.current.rotation.z =  0.55
      if (eyebrowRRef.current) eyebrowRRef.current.rotation.z = -0.55
      if (headRef.current) {
        headRef.current.rotation.z = Math.sin(p * Math.PI * 6) * 0.15
      }

      if (a.actionT >= 1) {
        a.state = 'idle'
        a.actionT = 0
        if (groupRef.current) groupRef.current.rotation.y = 0
        if (headRef.current) {
          headRef.current.rotation.x = 0
          headRef.current.rotation.y = 0
          headRef.current.rotation.z = 0
        }
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

      <group ref={groupRef} position={[0, 0.38, 0]}>

        {/* ===== BODY ===== */}
        {/* Core body — plump rounded golden retriever torso */}
        <mesh position={[0, 0.0, 0]} scale={[1.0, 0.82, 1.35]}>
          <sphereGeometry args={[0.54, 32, 22]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Extra width in the middle — ribs */}
        <mesh position={[0, 0.05, 0.05]} scale={[1.08, 0.65, 0.95]}>
          <sphereGeometry args={[0.52, 28, 18]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Chest puff — lighter cream */}
        <mesh position={[0, 0.04, 0.44]} scale={[0.82, 0.72, 0.52]}>
          <sphereGeometry args={[0.52, 26, 18]} />
          <meshStandardMaterial {...FUR_CHEST} />
        </mesh>
        {/* Belly underside — cream */}
        <mesh position={[0, -0.34, 0.08]} scale={[0.78, 0.38, 1.05]}>
          <sphereGeometry args={[0.48, 22, 14]} />
          <meshStandardMaterial {...FUR_LIGHT} />
        </mesh>
        {/* Rump — slightly darker golden at rear */}
        <mesh position={[0, 0.04, -0.52]} scale={[0.9, 0.72, 0.65]}>
          <sphereGeometry args={[0.5, 24, 16]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>

        {/* ===== FRONT LEGS ===== */}
        {/* Upper front-left leg */}
        <mesh position={[-0.34, -0.26, 0.38]} rotation={[0.18, 0, 0.06]}>
          <capsuleGeometry args={[0.135, 0.28, 10, 16]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Lower front-left leg */}
        <mesh position={[-0.34, -0.55, 0.42]} rotation={[0.05, 0, 0]}>
          <capsuleGeometry args={[0.115, 0.22, 8, 14]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Front-left paw */}
        <mesh position={[-0.34, -0.75, 0.46]} scale={[1.25, 0.52, 1.5]}>
          <sphereGeometry args={[0.155, 18, 12]} />
          <meshStandardMaterial {...FUR_PAW} />
        </mesh>

        {/* Upper front-right leg */}
        <mesh position={[0.34, -0.26, 0.38]} rotation={[0.18, 0, -0.06]}>
          <capsuleGeometry args={[0.135, 0.28, 10, 16]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Lower front-right leg */}
        <mesh position={[0.34, -0.55, 0.42]} rotation={[0.05, 0, 0]}>
          <capsuleGeometry args={[0.115, 0.22, 8, 14]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Front-right paw */}
        <mesh position={[0.34, -0.75, 0.46]} scale={[1.25, 0.52, 1.5]}>
          <sphereGeometry args={[0.155, 18, 12]} />
          <meshStandardMaterial {...FUR_PAW} />
        </mesh>

        {/* ===== HIND LEGS ===== */}
        {/* Upper hind-left leg (haunches, angled back) */}
        <mesh position={[-0.34, -0.18, -0.42]} rotation={[-0.25, 0, 0.04]}>
          <capsuleGeometry args={[0.155, 0.32, 10, 16]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Lower hind-left leg */}
        <mesh position={[-0.33, -0.52, -0.48]} rotation={[0.12, 0, 0]}>
          <capsuleGeometry args={[0.12, 0.24, 8, 14]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Hind-left paw */}
        <mesh position={[-0.33, -0.74, -0.44]} scale={[1.3, 0.5, 1.55]}>
          <sphereGeometry args={[0.155, 18, 12]} />
          <meshStandardMaterial {...FUR_PAW} />
        </mesh>

        {/* Upper hind-right leg */}
        <mesh position={[0.34, -0.18, -0.42]} rotation={[-0.25, 0, -0.04]}>
          <capsuleGeometry args={[0.155, 0.32, 10, 16]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Lower hind-right leg */}
        <mesh position={[0.33, -0.52, -0.48]} rotation={[0.12, 0, 0]}>
          <capsuleGeometry args={[0.12, 0.24, 8, 14]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Hind-right paw */}
        <mesh position={[0.33, -0.74, -0.44]} scale={[1.3, 0.5, 1.55]}>
          <sphereGeometry args={[0.155, 18, 12]} />
          <meshStandardMaterial {...FUR_PAW} />
        </mesh>

        {/* ===== TAIL ===== */}
        {/* Pivot at rump, rotation.z drives wag */}
        <group ref={tailRef} position={[0, 0.28, -0.72]} rotation={[-0.85, 0, 0.1]}>
          {/* Base segment */}
          <mesh position={[0, 0.14, 0]}>
            <capsuleGeometry args={[0.105, 0.22, 8, 12]} />
            <meshStandardMaterial {...FUR_GOLD} />
          </mesh>
          {/* Middle segment, curls back */}
          <mesh position={[0, 0.44, -0.06]} rotation={[0.45, 0, 0]}>
            <capsuleGeometry args={[0.085, 0.28, 8, 12]} />
            <meshStandardMaterial {...FUR_GOLD} />
          </mesh>
          {/* Upper curl segment */}
          <mesh position={[0, 0.72, -0.22]} rotation={[0.75, 0, 0]}>
            <capsuleGeometry args={[0.068, 0.18, 8, 10]} />
            <meshStandardMaterial {...FUR_GOLD} />
          </mesh>
          {/* Fluffy tip */}
          <mesh position={[0, 0.90, -0.36]}>
            <sphereGeometry args={[0.17, 16, 12]} />
            <meshStandardMaterial {...FUR_TIP} />
          </mesh>
          {/* Extra fluff on tip */}
          <mesh position={[0, 0.96, -0.4]} scale={[0.85, 0.7, 0.85]}>
            <sphereGeometry args={[0.145, 14, 10]} />
            <meshStandardMaterial {...FUR_LIGHT} />
          </mesh>
        </group>

        {/* ===== NECK ===== */}
        <mesh position={[0, 0.5, 0.14]} rotation={[-0.22, 0, 0]}>
          <capsuleGeometry args={[0.225, 0.25, 12, 18]} />
          <meshStandardMaterial {...FUR_GOLD} />
        </mesh>
        {/* Neck throat — lighter */}
        <mesh position={[0, 0.46, 0.26]} scale={[0.7, 0.75, 0.55]}>
          <sphereGeometry args={[0.22, 18, 14]} />
          <meshStandardMaterial {...FUR_CHEST} />
        </mesh>

        {/* ===== COLLAR ===== */}
        <mesh position={[0, 0.62, 0.08]}>
          <torusGeometry args={[0.285, 0.055, 14, 36]} />
          <meshStandardMaterial color="#CC2020" roughness={0.65} metalness={0} />
        </mesh>
        {/* GPS Tag — gold metallic */}
        <mesh position={[0, 0.52, 0.36]}>
          <boxGeometry args={[0.175, 0.2, 0.065]} />
          <meshStandardMaterial color="#C8A030" roughness={0.25} metalness={0.8} />
        </mesh>
        {/* GPS Tag rounded top corners (fillet hint) */}
        <mesh position={[0, 0.62, 0.362]}>
          <cylinderGeometry args={[0.04, 0.04, 0.065, 12]} />
          <meshStandardMaterial color="#C8A030" roughness={0.25} metalness={0.8} />
        </mesh>
        {/* GPS Tag screen */}
        <mesh position={[0, 0.52, 0.396]}>
          <boxGeometry args={[0.11, 0.11, 0.02]} />
          <meshStandardMaterial color="#0A1A22" roughness={0.35} metalness={0} emissive="#002244" emissiveIntensity={0.5} />
        </mesh>

        {/* ===== HEAD GROUP ===== */}
        <group ref={headRef} position={[0, 1.04, 0.08]}>

          {/* Main head — large round golden retriever skull */}
          <mesh scale={[1.06, 0.97, 1.02]}>
            <sphereGeometry args={[0.58, 32, 24]} />
            <meshStandardMaterial {...FUR_GOLD} />
          </mesh>
          {/* Forehead dome — slightly lighter, fluffy top */}
          <mesh position={[0, 0.22, -0.05]} scale={[0.95, 0.52, 0.92]}>
            <sphereGeometry args={[0.42, 26, 18]} />
            <meshStandardMaterial {...FUR_TIP} />
          </mesh>
          {/* Cheek puffs L/R — golden retrievers have chubby cheeks */}
          <mesh position={[-0.42, -0.04, 0.12]} scale={[0.55, 0.65, 0.68]}>
            <sphereGeometry args={[0.32, 20, 14]} />
            <meshStandardMaterial {...FUR_GOLD} />
          </mesh>
          <mesh position={[0.42, -0.04, 0.12]} scale={[0.55, 0.65, 0.68]}>
            <sphereGeometry args={[0.32, 20, 14]} />
            <meshStandardMaterial {...FUR_GOLD} />
          </mesh>

          {/* ===== SNOUT / MUZZLE ===== */}
          {/* Main snout box */}
          <mesh position={[0, -0.2, 0.48]} scale={[1.0, 0.85, 0.95]}>
            <boxGeometry args={[0.36, 0.26, 0.32]} />
            <meshStandardMaterial color="#D4AC48" roughness={0.86} metalness={0} />
          </mesh>
          {/* Snout side rounding L */}
          <mesh position={[-0.16, -0.2, 0.52]} scale={[0.45, 0.65, 0.9]}>
            <sphereGeometry args={[0.22, 16, 12]} />
            <meshStandardMaterial color="#D4AC48" roughness={0.86} metalness={0} />
          </mesh>
          {/* Snout side rounding R */}
          <mesh position={[0.16, -0.2, 0.52]} scale={[0.45, 0.65, 0.9]}>
            <sphereGeometry args={[0.22, 16, 12]} />
            <meshStandardMaterial color="#D4AC48" roughness={0.86} metalness={0} />
          </mesh>
          {/* Snout top transition */}
          <mesh position={[0, -0.1, 0.5]} scale={[0.9, 0.42, 0.8]}>
            <sphereGeometry args={[0.28, 18, 12]} />
            <meshStandardMaterial color="#CDA840" roughness={0.87} metalness={0} />
          </mesh>
          {/* Lower jaw / chin */}
          <mesh position={[0, -0.34, 0.44]} scale={[0.85, 0.42, 0.82]}>
            <sphereGeometry args={[0.24, 16, 12]} />
            <meshStandardMaterial color="#D4AC48" roughness={0.86} metalness={0} />
          </mesh>

          {/* ===== NOSE — wide flat wet black nose with clearcoat ===== */}
          {/* Main nose body */}
          <mesh position={[0, -0.12, 0.66]} scale={[1.4, 0.82, 0.72]}>
            <sphereGeometry args={[0.105, 22, 16]} />
            <meshPhysicalMaterial
              color="#0A0A0A"
              roughness={0.04}
              metalness={0.05}
              clearcoat={1.0}
              clearcoatRoughness={0.03}
            />
          </mesh>
          {/* Nose bridge ridge */}
          <mesh position={[0, -0.09, 0.64]} scale={[0.5, 0.45, 0.6]}>
            <sphereGeometry args={[0.09, 14, 10]} />
            <meshPhysicalMaterial
              color="#0D0D0D"
              roughness={0.05}
              metalness={0.05}
              clearcoat={1.0}
              clearcoatRoughness={0.04}
            />
          </mesh>
          {/* Left nostril */}
          <mesh position={[-0.042, -0.135, 0.675]}>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshStandardMaterial color="#050505" roughness={0.1} metalness={0} />
          </mesh>
          {/* Right nostril */}
          <mesh position={[0.042, -0.135, 0.675]}>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshStandardMaterial color="#050505" roughness={0.1} metalness={0} />
          </mesh>
          {/* Nose shine — small wet highlight */}
          <mesh position={[-0.032, -0.098, 0.676]}>
            <sphereGeometry args={[0.016, 6, 6]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={1.0} roughness={0} metalness={0} />
          </mesh>

          {/* ===== EYES — layered: sclera + iris + pupil + shine ===== */}

          {/* LEFT EYE */}
          {/* Sclera */}
          <mesh position={[-0.225, 0.055, 0.46]}>
            <sphereGeometry args={[0.168, 24, 18]} />
            <meshPhysicalMaterial
              color="#F5F0E8"
              roughness={0.18}
              metalness={0}
              clearcoat={0.7}
              clearcoatRoughness={0.08}
            />
          </mesh>
          {/* Iris — warm golden-brown */}
          <mesh position={[-0.225, 0.055, 0.498]}>
            <sphereGeometry args={[0.125, 22, 16]} />
            <meshStandardMaterial color="#8B5020" roughness={0.3} metalness={0} />
          </mesh>
          {/* Iris inner darker ring */}
          <mesh position={[-0.225, 0.055, 0.506]}>
            <sphereGeometry args={[0.098, 20, 14]} />
            <meshStandardMaterial color="#5A2E0A" roughness={0.25} metalness={0} />
          </mesh>
          {/* Pupil */}
          <mesh position={[-0.225, 0.055, 0.514]}>
            <sphereGeometry args={[0.072, 16, 12]} />
            <meshPhysicalMaterial
              color="#1A0A00"
              roughness={0.02}
              metalness={0}
              clearcoat={1.0}
              clearcoatRoughness={0.0}
            />
          </mesh>
          {/* Eye shine large */}
          <mesh position={[-0.172, 0.108, 0.522]}>
            <sphereGeometry args={[0.044, 8, 8]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={1.2} roughness={0} metalness={0} />
          </mesh>
          {/* Eye shine small */}
          <mesh position={[-0.196, 0.022, 0.528]}>
            <sphereGeometry args={[0.018, 6, 6]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.9} roughness={0} metalness={0} />
          </mesh>

          {/* RIGHT EYE */}
          {/* Sclera */}
          <mesh position={[0.225, 0.055, 0.46]}>
            <sphereGeometry args={[0.168, 24, 18]} />
            <meshPhysicalMaterial
              color="#F5F0E8"
              roughness={0.18}
              metalness={0}
              clearcoat={0.7}
              clearcoatRoughness={0.08}
            />
          </mesh>
          {/* Iris */}
          <mesh position={[0.225, 0.055, 0.498]}>
            <sphereGeometry args={[0.125, 22, 16]} />
            <meshStandardMaterial color="#8B5020" roughness={0.3} metalness={0} />
          </mesh>
          {/* Iris inner darker ring */}
          <mesh position={[0.225, 0.055, 0.506]}>
            <sphereGeometry args={[0.098, 20, 14]} />
            <meshStandardMaterial color="#5A2E0A" roughness={0.25} metalness={0} />
          </mesh>
          {/* Pupil */}
          <mesh position={[0.225, 0.055, 0.514]}>
            <sphereGeometry args={[0.072, 16, 12]} />
            <meshPhysicalMaterial
              color="#1A0A00"
              roughness={0.02}
              metalness={0}
              clearcoat={1.0}
              clearcoatRoughness={0.0}
            />
          </mesh>
          {/* Eye shine large */}
          <mesh position={[0.278, 0.108, 0.522]}>
            <sphereGeometry args={[0.044, 8, 8]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={1.2} roughness={0} metalness={0} />
          </mesh>
          {/* Eye shine small */}
          <mesh position={[0.254, 0.022, 0.528]}>
            <sphereGeometry args={[0.018, 6, 6]} />
            <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.9} roughness={0} metalness={0} />
          </mesh>

          {/* Droopy lower eyelid bags — golden retriever sad-happy expression */}
          <mesh position={[-0.225, -0.038, 0.468]} scale={[1.2, 0.38, 0.5]}>
            <sphereGeometry args={[0.125, 16, 10]} />
            <meshStandardMaterial color="#C8A040" roughness={0.88} metalness={0} />
          </mesh>
          <mesh position={[0.225, -0.038, 0.468]} scale={[1.2, 0.38, 0.5]}>
            <sphereGeometry args={[0.125, 16, 10]} />
            <meshStandardMaterial color="#C8A040" roughness={0.88} metalness={0} />
          </mesh>

          {/* ===== EYEBROWS — expressive dark arched bumps ===== */}
          <mesh ref={eyebrowLRef} position={[-0.225, 0.225, 0.455]} rotation={[0, 0, 0.2]}>
            <capsuleGeometry args={[0.028, 0.155, 6, 10]} />
            <meshStandardMaterial color="#3A2010" roughness={0.8} metalness={0} />
          </mesh>
          <mesh ref={eyebrowRRef} position={[0.225, 0.225, 0.455]} rotation={[0, 0, -0.2]}>
            <capsuleGeometry args={[0.028, 0.155, 6, 10]} />
            <meshStandardMaterial color="#3A2010" roughness={0.8} metalness={0} />
          </mesh>

          {/* ===== TONGUE — pink, pokes out when panting ===== */}
          {/* Tongue base stays anchored in mouth, tip extends */}
          <group ref={tongueRef} position={[0, -0.05, 0.62]}>
            {/* Main tongue body */}
            <mesh position={[0, 0, 0]}>
              <capsuleGeometry args={[0.075, 0.16, 8, 14]} />
              <meshStandardMaterial color="#FF7080" roughness={0.75} metalness={0} />
            </mesh>
            {/* Tongue tip — slightly rounded and pinched */}
            <mesh position={[0, -0.14, 0.01]} scale={[0.88, 0.65, 0.82]}>
              <sphereGeometry args={[0.075, 12, 10]} />
              <meshStandardMaterial color="#FF6070" roughness={0.75} metalness={0} />
            </mesh>
            {/* Tongue center groove */}
            <mesh position={[0, -0.04, 0.025]} scale={[0.28, 1.0, 0.3]}>
              <sphereGeometry args={[0.072, 10, 8]} />
              <meshStandardMaterial color="#E85068" roughness={0.78} metalness={0} />
            </mesh>
          </group>

          {/* ===== EARS — long floppy golden retriever ears ===== */}

          {/* LEFT EAR GROUP — pivot at top of ear, hangs down */}
          <group ref={leftEarRef} position={[-0.50, 0.08, 0.06]} rotation={[0, 0, 0.08]}>
            {/* Ear base attachment */}
            <mesh position={[0, -0.05, 0]} scale={[0.82, 0.45, 0.72]}>
              <sphereGeometry args={[0.22, 16, 12]} />
              <meshStandardMaterial {...FUR_EAR} />
            </mesh>
            {/* Main ear flap — long and floppy */}
            <mesh position={[-0.04, -0.36, 0.0]} rotation={[0.06, 0.08, 0]}>
              <capsuleGeometry args={[0.145, 0.44, 10, 18]} />
              <meshStandardMaterial {...FUR_EAR} />
            </mesh>
            {/* Inner ear face — slightly lighter warm tan */}
            <mesh position={[-0.035, -0.36, 0.04]} rotation={[0.06, 0.08, 0]} scale={[0.72, 1.0, 0.38]}>
              <capsuleGeometry args={[0.145, 0.44, 10, 14]} />
              <meshStandardMaterial color="#D09040" roughness={0.84} metalness={0} />
            </mesh>
            {/* Ear lower flap continuation */}
            <mesh position={[-0.05, -0.68, -0.02]} rotation={[0.1, 0.06, 0.04]}>
              <capsuleGeometry args={[0.115, 0.22, 8, 14]} />
              <meshStandardMaterial {...FUR_EAR} />
            </mesh>
            {/* Ear rounded tip */}
            <mesh position={[-0.06, -0.86, -0.04]}>
              <sphereGeometry args={[0.115, 14, 10]} />
              <meshStandardMaterial {...FUR_EAR} />
            </mesh>
          </group>

          {/* RIGHT EAR GROUP */}
          <group ref={rightEarRef} position={[0.50, 0.08, 0.06]} rotation={[0, 0, -0.08]}>
            {/* Ear base attachment */}
            <mesh position={[0, -0.05, 0]} scale={[0.82, 0.45, 0.72]}>
              <sphereGeometry args={[0.22, 16, 12]} />
              <meshStandardMaterial {...FUR_EAR} />
            </mesh>
            {/* Main ear flap */}
            <mesh position={[0.04, -0.36, 0.0]} rotation={[0.06, -0.08, 0]}>
              <capsuleGeometry args={[0.145, 0.44, 10, 18]} />
              <meshStandardMaterial {...FUR_EAR} />
            </mesh>
            {/* Inner ear face */}
            <mesh position={[0.035, -0.36, 0.04]} rotation={[0.06, -0.08, 0]} scale={[0.72, 1.0, 0.38]}>
              <capsuleGeometry args={[0.145, 0.44, 10, 14]} />
              <meshStandardMaterial color="#D09040" roughness={0.84} metalness={0} />
            </mesh>
            {/* Ear lower flap continuation */}
            <mesh position={[0.05, -0.68, -0.02]} rotation={[0.1, -0.06, -0.04]}>
              <capsuleGeometry args={[0.115, 0.22, 8, 14]} />
              <meshStandardMaterial {...FUR_EAR} />
            </mesh>
            {/* Ear rounded tip */}
            <mesh position={[0.06, -0.86, -0.04]}>
              <sphereGeometry args={[0.115, 14, 10]} />
              <meshStandardMaterial {...FUR_EAR} />
            </mesh>
          </group>

        </group>
        {/* END HEAD GROUP */}

      </group>
    </>
  )
}
