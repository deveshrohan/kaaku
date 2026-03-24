import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── Role-specific visual config ─────────────────────────────────────
const ROLE_STYLES = {
  pm: {
    body: '#3B6FA0', pants: '#C4A672', skin: '#F5D0A9',
    hair: '#5C3A1E', hairStyle: 'curly', shoe: '#1E2030',
  },
  architect: {
    body: '#2A2A3E', pants: '#1A1A2E', skin: '#F5D0A9',
    hair: '#1A1A2E', hairStyle: 'long', shoe: '#111111',
  },
  developer: {
    body: '#2D8F4E', pants: '#4A6FA5', skin: '#C49A6C',
    hair: '#1A1A2E', hairStyle: 'short', shoe: '#1E2030',
    accessory: 'headphones',
  },
  analyst: {
    body: '#E8E4DE', pants: '#34495E', skin: '#F5D0A9',
    hair: '#C4A356', hairStyle: 'side', shoe: '#2C3E50',
    accessory: 'tie',
  },
  qa: {
    body: '#E8820C', pants: '#4A6FA5', skin: '#F5D0A9',
    hair: '#5C3A1E', hairStyle: 'cap', shoe: '#555555',
  },
}

// ── Dimensions ──────────────────────────────────────────────────────
const HEAD  = 0.14
const BODY_W = 0.13, BODY_H = 0.17, BODY_D = 0.07
const ARM_W = 0.04, ARM_H = 0.14
const LEG_W = 0.05, LEG_H = 0.14
const SHOE_H = 0.02

// Bottom of legs at y=SHOE_H, top of head at ~0.47
const LEG_Y  = SHOE_H + LEG_H / 2      // center of leg
const BODY_Y = SHOE_H + LEG_H + BODY_H / 2
const HEAD_Y = SHOE_H + LEG_H + BODY_H + HEAD / 2

// Default facing: ~45° toward camera in isometric view
const DEFAULT_FACING = Math.PI * 0.25

// ── Animation params ────────────────────────────────────────────────
const WALK_LEG_SPEED = 8, WALK_LEG_SWING = 0.6, WALK_ARM_SWING = 0.5
const WORK_ARM_ANGLE = -0.8, TYPE_SPEED = 4, TYPE_AMT = 0.05
const ERROR_SHAKE_SPEED = 12, ERROR_SHAKE_AMT = 0.02

// ── Hair sub-components ─────────────────────────────────────────────

function CurlyHair({ color }) {
  return (
    <group position={[0, HEAD * 0.35, 0]}>
      <mesh position={[-0.04, 0.02, 0]}><sphereGeometry args={[0.04, 6, 6]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.02, 0.04, 0]}><sphereGeometry args={[0.045, 6, 6]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.06, 0.01, 0]}><sphereGeometry args={[0.035, 6, 6]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
}

function LongHair({ color }) {
  return (
    <group>
      <mesh position={[0, HEAD * 0.3, 0]}>
        <boxGeometry args={[HEAD * 1.1, 0.04, HEAD * 0.9]} /><meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-HEAD * 0.52, -0.02, 0]}>
        <boxGeometry args={[0.03, HEAD * 1.1, 0.06]} /><meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[HEAD * 0.52, -0.02, 0]}>
        <boxGeometry args={[0.03, HEAD * 1.1, 0.06]} /><meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

function ShortHair({ color }) {
  return (
    <mesh position={[0, HEAD * 0.35, 0]}>
      <boxGeometry args={[HEAD * 0.95, 0.05, HEAD * 0.85]} /><meshStandardMaterial color={color} />
    </mesh>
  )
}

function SidePartHair({ color }) {
  return (
    <mesh position={[0.02, HEAD * 0.33, 0]} rotation={[0, 0, -0.15]}>
      <boxGeometry args={[HEAD, 0.05, HEAD * 0.85]} /><meshStandardMaterial color={color} />
    </mesh>
  )
}

function CapHair({ color }) {
  // Cap uses role accent, hair peeks out underneath
  return (
    <group>
      <mesh position={[0, HEAD * 0.38, 0]}>
        <boxGeometry args={[HEAD * 1.12, 0.045, HEAD * 1.12]} /><meshStandardMaterial color="#E8820C" />
      </mesh>
      <mesh position={[0, HEAD * 0.36, -HEAD * 0.58]}>
        <boxGeometry args={[HEAD * 0.8, 0.025, 0.06]} /><meshStandardMaterial color="#CC7008" />
      </mesh>
      {/* Hair peeking out */}
      <mesh position={[0, HEAD * 0.22, HEAD * 0.5]}>
        <boxGeometry args={[HEAD * 0.5, 0.04, 0.02]} /><meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

const HAIR = { curly: CurlyHair, long: LongHair, short: ShortHair, side: SidePartHair, cap: CapHair }

// ── Accessories ─────────────────────────────────────────────────────

function Headphones() {
  return (
    <group position={[0, HEAD * 0.1, 0]}>
      <mesh position={[-HEAD * 0.52, 0, 0]}>
        <boxGeometry args={[0.04, 0.06, 0.04]} /><meshStandardMaterial color="#444" />
      </mesh>
      <mesh position={[HEAD * 0.52, 0, 0]}>
        <boxGeometry args={[0.04, 0.06, 0.04]} /><meshStandardMaterial color="#444" />
      </mesh>
      <mesh position={[0, HEAD * 0.32, 0]} rotation={[Math.PI * 0.5, 0, 0]}>
        <torusGeometry args={[HEAD * 0.5, 0.013, 6, 12, Math.PI]} /><meshStandardMaterial color="#555" />
      </mesh>
    </group>
  )
}

function Tie() {
  return (
    <group position={[0, 0, BODY_D * 0.52]}>
      <mesh><boxGeometry args={[0.022, BODY_H * 0.55, 0.004]} /><meshStandardMaterial color="#A78BFA" /></mesh>
      <mesh position={[0, -BODY_H * 0.28, 0]}>
        <boxGeometry args={[0.035, 0.025, 0.004]} /><meshStandardMaterial color="#A78BFA" />
      </mesh>
    </group>
  )
}

// ── Easing ──────────────────────────────────────────────────────────
const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

// ── Main character component ────────────────────────────────────────

export default function AgentCharacter({
  role,
  position = [0, 0, 0],
  state = 'idle',
  walkTo = null,
  walkDuration = 1.5,
  onWalkDone,
  scale = 1,
}) {
  const groupRef  = useRef()
  const headRef   = useRef()
  const lArmRef   = useRef()
  const rArmRef   = useRef()
  const lLegRef   = useRef()
  const rLegRef   = useRef()
  const walkRef   = useRef({ t: 0, active: false, from: null, to: null })
  const timeRef   = useRef(Math.random() * 100)
  const basePosRef = useRef(new THREE.Vector3(...position))

  const style = ROLE_STYLES[role] || ROLE_STYLES.pm
  const HairComp = HAIR[style.hairStyle]

  // Sync base position
  useEffect(() => {
    basePosRef.current.set(...position)
  }, [position[0], position[1], position[2]])

  // Walk initiation
  useEffect(() => {
    if (state === 'walk' && walkTo) {
      walkRef.current = {
        t: 0, active: true,
        from: new THREE.Vector3(...position),
        to: new THREE.Vector3(...walkTo),
      }
    } else {
      walkRef.current.active = false
    }
  }, [state, walkTo?.[0], walkTo?.[1], walkTo?.[2]])

  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return
    timeRef.current += dt
    const t = timeRef.current
    const w = walkRef.current

    // ── Walk tween ──────────────────────────────────────────────
    if (w.active && w.from && w.to) {
      w.t = Math.min(w.t + dt / walkDuration, 1)
      const e = easeInOut(w.t)
      g.position.lerpVectors(w.from, w.to, e)
      g.position.y += Math.sin(e * Math.PI) * 0.025

      // Face walk direction
      const dir = new THREE.Vector3().subVectors(w.to, w.from)
      if (dir.lengthSq() > 0.0001) {
        g.rotation.y = Math.atan2(dir.x, dir.z)
      }
      if (w.t >= 1) { w.active = false; onWalkDone?.() }
    } else {
      // Smoothly return to default facing
      const diff = DEFAULT_FACING - g.rotation.y
      g.rotation.y += diff * Math.min(3 * dt, 1)
    }

    // ── State animations ────────────────────────────────────────
    const head = headRef.current
    const lA = lArmRef.current, rA = rArmRef.current
    const lL = lLegRef.current, rL = rLegRef.current

    if (state === 'walk' || w.active) {
      if (lL) lL.rotation.x = Math.sin(t * WALK_LEG_SPEED) * WALK_LEG_SWING
      if (rL) rL.rotation.x = Math.sin(t * WALK_LEG_SPEED + Math.PI) * WALK_LEG_SWING
      if (lA) lA.rotation.x = Math.sin(t * WALK_LEG_SPEED + Math.PI) * WALK_ARM_SWING
      if (rA) rA.rotation.x = Math.sin(t * WALK_LEG_SPEED) * WALK_ARM_SWING
      if (head) head.position.y = HEAD_Y + Math.abs(Math.sin(t * WALK_LEG_SPEED)) * 0.015
    } else if (state === 'work') {
      if (lA) lA.rotation.x = WORK_ARM_ANGLE + Math.sin(t * TYPE_SPEED) * TYPE_AMT
      if (rA) rA.rotation.x = WORK_ARM_ANGLE + Math.sin(t * TYPE_SPEED + 1) * TYPE_AMT
      if (head) { head.rotation.x = -0.08 + Math.sin(t * 1.5) * 0.025; head.position.y = HEAD_Y }
      if (lL) lL.rotation.x = 0
      if (rL) rL.rotation.x = 0
    } else if (state === 'error') {
      // Shake
      if (!w.active) g.position.x = basePosRef.current.x + Math.sin(t * ERROR_SHAKE_SPEED) * ERROR_SHAKE_AMT
      if (lA) lA.rotation.x = -0.5
      if (rA) rA.rotation.x = -0.5
      if (head) { head.rotation.z = Math.sin(t * 6) * 0.1; head.position.y = HEAD_Y }
      if (lL) lL.rotation.x = 0
      if (rL) rL.rotation.x = 0
    } else {
      // Idle
      const bob = Math.sin(t * 1.5) * 0.006
      if (head) { head.position.y = HEAD_Y + bob; head.rotation.z = Math.sin(t * 0.8) * 0.02; head.rotation.x = 0 }
      if (lA) lA.rotation.x = Math.sin(t * 0.7) * 0.03
      if (rA) rA.rotation.x = Math.sin(t * 0.7 + 0.5) * 0.03
      if (lL) lL.rotation.x = 0
      if (rL) rL.rotation.x = 0
    }
  })

  const mouthColor = state === 'error' ? '#FF453A' : '#1E2030'

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* ── Body ─────────────────────────────────────── */}
      <mesh position={[0, BODY_Y, 0]} castShadow>
        <boxGeometry args={[BODY_W, BODY_H, BODY_D]} />
        <meshStandardMaterial color={style.body} roughness={0.7} />
      </mesh>
      {style.accessory === 'tie' && <group position={[0, BODY_Y, 0]}><Tie /></group>}

      {/* ── Head ─────────────────────────────────────── */}
      <group ref={headRef} position={[0, HEAD_Y, 0]}>
        <mesh castShadow>
          <boxGeometry args={[HEAD, HEAD, HEAD]} />
          <meshStandardMaterial color={style.skin} roughness={0.6} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.028, 0.012, HEAD / 2 + 0.001]}>
          <boxGeometry args={[0.022, 0.022, 0.003]} /><meshBasicMaterial color="#1E2030" />
        </mesh>
        <mesh position={[0.028, 0.012, HEAD / 2 + 0.001]}>
          <boxGeometry args={[0.022, 0.022, 0.003]} /><meshBasicMaterial color="#1E2030" />
        </mesh>
        {/* Eye highlights */}
        <mesh position={[-0.023, 0.019, HEAD / 2 + 0.003]}>
          <boxGeometry args={[0.008, 0.008, 0.001]} /><meshBasicMaterial color="white" />
        </mesh>
        <mesh position={[0.033, 0.019, HEAD / 2 + 0.003]}>
          <boxGeometry args={[0.008, 0.008, 0.001]} /><meshBasicMaterial color="white" />
        </mesh>
        {/* Mouth */}
        <mesh position={[0, -0.025, HEAD / 2 + 0.001]}>
          <boxGeometry args={[0.035, 0.01, 0.002]} /><meshBasicMaterial color={mouthColor} />
        </mesh>
        {/* Hair */}
        {HairComp && <HairComp color={style.hair} />}
        {/* Headphones (on head) */}
        {style.accessory === 'headphones' && <Headphones />}
      </group>

      {/* ── Left Arm (pivot at shoulder) ─────────────── */}
      <group ref={lArmRef} position={[-(BODY_W / 2 + ARM_W / 2), SHOE_H + LEG_H + BODY_H - 0.01, 0]}>
        <mesh position={[0, -ARM_H / 2, 0]} castShadow>
          <boxGeometry args={[ARM_W, ARM_H, ARM_W]} /><meshStandardMaterial color={style.body} roughness={0.7} />
        </mesh>
        <mesh position={[0, -ARM_H + 0.005, 0]}>
          <boxGeometry args={[ARM_W * 0.85, ARM_W * 0.85, ARM_W * 0.85]} /><meshStandardMaterial color={style.skin} roughness={0.6} />
        </mesh>
      </group>

      {/* ── Right Arm ────────────────────────────────── */}
      <group ref={rArmRef} position={[(BODY_W / 2 + ARM_W / 2), SHOE_H + LEG_H + BODY_H - 0.01, 0]}>
        <mesh position={[0, -ARM_H / 2, 0]} castShadow>
          <boxGeometry args={[ARM_W, ARM_H, ARM_W]} /><meshStandardMaterial color={style.body} roughness={0.7} />
        </mesh>
        <mesh position={[0, -ARM_H + 0.005, 0]}>
          <boxGeometry args={[ARM_W * 0.85, ARM_W * 0.85, ARM_W * 0.85]} /><meshStandardMaterial color={style.skin} roughness={0.6} />
        </mesh>
      </group>

      {/* ── Left Leg (pivot at hip) ──────────────────── */}
      <group ref={lLegRef} position={[-(BODY_W / 2 - LEG_W / 2 - 0.005), SHOE_H + LEG_H, 0]}>
        <mesh position={[0, -LEG_H / 2, 0]} castShadow>
          <boxGeometry args={[LEG_W, LEG_H, LEG_W]} /><meshStandardMaterial color={style.pants} roughness={0.8} />
        </mesh>
        <mesh position={[0, -LEG_H + 0.01, 0.008]}>
          <boxGeometry args={[LEG_W * 1.1, SHOE_H + 0.01, LEG_W * 1.3]} /><meshStandardMaterial color={style.shoe} roughness={0.9} />
        </mesh>
      </group>

      {/* ── Right Leg ────────────────────────────────── */}
      <group ref={rLegRef} position={[(BODY_W / 2 - LEG_W / 2 - 0.005), SHOE_H + LEG_H, 0]}>
        <mesh position={[0, -LEG_H / 2, 0]} castShadow>
          <boxGeometry args={[LEG_W, LEG_H, LEG_W]} /><meshStandardMaterial color={style.pants} roughness={0.8} />
        </mesh>
        <mesh position={[0, -LEG_H + 0.01, 0.008]}>
          <boxGeometry args={[LEG_W * 1.1, SHOE_H + 0.01, LEG_W * 1.3]} /><meshStandardMaterial color={style.shoe} roughness={0.9} />
        </mesh>
      </group>

      {/* ── Ground shadow ────────────────────────────── */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.09, 16]} />
        <meshBasicMaterial color="black" transparent opacity={0.18} />
      </mesh>
    </group>
  )
}
