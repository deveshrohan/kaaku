import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// ── Procedural office characters — capsule body + sphere head ────────
// Simple, lightweight, no GLB files. One per desk role.

const ROLE_COLORS = {
  pm:        '#C8A44A',  // gold
  architect: '#64B4FF',  // blue
  developer: '#34C759',  // green
  analyst:   '#A78BFA',  // purple
  qa:        '#FF9F0A',  // orange
}

export default function OfficeCharacter({ role, position = [0, 0, 0], state = 'idle' }) {
  const group = useRef()
  const color = ROLE_COLORS[role] || '#888'

  useFrame((_, dt) => {
    if (!group.current) return
    const t = performance.now() / 1000

    if (state === 'working') {
      // Faster bob + forward lean
      group.current.position.y = position[1] + Math.sin(t * 3) * 0.015
      group.current.rotation.x = Math.sin(t * 2) * 0.06
    } else {
      // Gentle idle bob
      group.current.position.y = position[1] + Math.sin(t * 0.8) * 0.008
      group.current.rotation.x = 0
    }
  })

  return (
    <group ref={group} position={position}>
      {/* Body — capsule */}
      <mesh position={[0, 0.18, 0]}>
        <capsuleGeometry args={[0.07, 0.16, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Head — sphere */}
      <mesh position={[0, 0.38, 0]}>
        <sphereGeometry args={[0.065, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.022, 0.39, 0.055]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[0.022, 0.39, 0.055]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
    </group>
  )
}

export { ROLE_COLORS }
