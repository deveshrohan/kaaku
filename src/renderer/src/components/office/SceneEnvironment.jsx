import { useMemo } from 'react'
import * as THREE from 'three'

// ── Floor ───────────────────────────────────────────────────────────

function FloorGrid() {
  const lines = useMemo(() => {
    const pts = []
    for (let i = -4; i <= 4; i++) {
      pts.push(new THREE.Vector3(i, 0.002, -3), new THREE.Vector3(i, 0.002, 3))
    }
    for (let j = -4; j <= 4; j++) {
      pts.push(new THREE.Vector3(-4, 0.002, j * 0.75), new THREE.Vector3(4, 0.002, j * 0.75))
    }
    return new Float32Array(pts.flatMap(v => [v.x, v.y, v.z]))
  }, [])

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={lines} count={lines.length / 3} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial color="#3A4558" transparent opacity={0.18} />
    </lineSegments>
  )
}

function EnhancedFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 6]} />
        <meshStandardMaterial color="#252A36" roughness={0.88} />
      </mesh>
      <FloorGrid />
      {/* Area rug under PM desk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0.1]}>
        <planeGeometry args={[1.1, 0.9]} />
        <meshStandardMaterial color="#3D3428" roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0.1]}>
        <planeGeometry args={[0.9, 0.7]} />
        <meshStandardMaterial color="#4A3D2E" roughness={0.92} />
      </mesh>
    </group>
  )
}

// ── Walls ───────────────────────────────────────────────────────────

function Walls() {
  return (
    <group>
      {/* Back wall */}
      <mesh position={[0, 1.2, -2.8]} receiveShadow>
        <boxGeometry args={[8, 2.8, 0.06]} />
        <meshStandardMaterial color="#2E3340" roughness={0.92} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-3.8, 1.2, -0.1]} receiveShadow>
        <boxGeometry args={[0.06, 2.8, 5.8]} />
        <meshStandardMaterial color="#2B2F3B" roughness={0.92} />
      </mesh>
      {/* Baseboards */}
      <mesh position={[0, 0.035, -2.74]}>
        <boxGeometry args={[8, 0.07, 0.03]} />
        <meshStandardMaterial color="#1E2030" roughness={0.85} />
      </mesh>
      <mesh position={[-3.74, 0.035, -0.1]}>
        <boxGeometry args={[0.03, 0.07, 5.8]} />
        <meshStandardMaterial color="#1E2030" roughness={0.85} />
      </mesh>
    </group>
  )
}

// ── Window on back wall ─────────────────────────────────────────────

function Window() {
  return (
    <group position={[0, 1.4, -2.74]}>
      <mesh><boxGeometry args={[1.8, 1.2, 0.04]} /><meshStandardMaterial color="#1A1E28" roughness={0.5} /></mesh>
      {/* Glass */}
      <mesh position={[0, 0, 0.022]}>
        <boxGeometry args={[1.6, 1.0, 0.008]} />
        <meshStandardMaterial color="#4A6FA0" transparent opacity={0.25} emissive="#4A6FA0" emissiveIntensity={0.12} />
      </mesh>
      {/* Dividers */}
      <mesh position={[0, 0, 0.028]}><boxGeometry args={[0.025, 1.0, 0.012]} /><meshStandardMaterial color="#1A1E28" /></mesh>
      <mesh position={[0, 0, 0.028]}><boxGeometry args={[1.6, 0.025, 0.012]} /><meshStandardMaterial color="#1A1E28" /></mesh>
    </group>
  )
}

// ── Ceiling lights ──────────────────────────────────────────────────

function CeilingLights() {
  const lamps = [[-1.5, 2.5, -0.5], [1.5, 2.5, -0.5], [0, 2.5, 0.8]]
  return (
    <group>
      {lamps.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh><boxGeometry args={[0.45, 0.035, 0.18]} /><meshStandardMaterial color="#2A2E3A" roughness={0.5} /></mesh>
          <mesh position={[0, -0.022, 0]}>
            <boxGeometry args={[0.4, 0.008, 0.15]} />
            <meshStandardMaterial color="#FFF5E8" emissive="#FFF5E8" emissiveIntensity={0.25} toneMapped={false} />
          </mesh>
          <pointLight position={[0, -0.15, 0]} intensity={0.12} distance={2.5} color="#FFF5E8" />
        </group>
      ))}
    </group>
  )
}

// ── Bookcase ────────────────────────────────────────────────────────

function Bookcase() {
  const books = [
    { x: -0.15, y: 0.32, h: 0.2, c: '#C75050' },
    { x: -0.05, y: 0.30, h: 0.18, c: '#5080C7' },
    { x: 0.05, y: 0.33, h: 0.22, c: '#50C770' },
    { x: 0.15, y: 0.31, h: 0.19, c: '#C7A050' },
    { x: -0.12, y: 0.72, h: 0.18, c: '#8050C7' },
    { x: 0.0, y: 0.70, h: 0.16, c: '#C77050' },
    { x: 0.12, y: 0.73, h: 0.20, c: '#50C7B0' },
    { x: -0.1, y: 1.10, h: 0.15, c: '#C75080' },
    { x: 0.05, y: 1.12, h: 0.18, c: '#5070C7' },
  ]

  return (
    <group position={[-3.5, 0, -2.0]}>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.55, 1.4, 0.24]} /><meshStandardMaterial color="#5C4430" roughness={0.85} />
      </mesh>
      {[0.15, 0.55, 0.95, 1.3].map((y, i) => (
        <mesh key={i} position={[0, y, 0.015]}>
          <boxGeometry args={[0.5, 0.025, 0.21]} /><meshStandardMaterial color="#6B5438" roughness={0.8} />
        </mesh>
      ))}
      {books.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, 0.03]}>
          <boxGeometry args={[0.055, b.h, 0.15]} /><meshStandardMaterial color={b.c} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

// ── Server rack ─────────────────────────────────────────────────────

function ServerRack() {
  return (
    <group position={[3.5, 0, -2.0]}>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.38, 1.2, 0.28]} /><meshStandardMaterial color="#1A1E28" roughness={0.5} />
      </mesh>
      {[0.15, 0.35, 0.55, 0.75, 0.95].map((y, i) => (
        <group key={i}>
          <mesh position={[0, y, 0.12]}>
            <boxGeometry args={[0.33, 0.1, 0.018]} /><meshStandardMaterial color="#2A2E3A" roughness={0.4} />
          </mesh>
          <mesh position={[0.11, y, 0.14]}>
            <boxGeometry args={[0.018, 0.018, 0.004]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? '#34C759' : '#5B8DEF'}
              emissive={i % 2 === 0 ? '#34C759' : '#5B8DEF'}
              emissiveIntensity={0.5}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ── Coffee station ──────────────────────────────────────────────────

function CoffeeStation() {
  return (
    <group position={[-3.5, 0, 0.5]}>
      {/* Small table */}
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[0.45, 0.025, 0.28]} /><meshStandardMaterial color="#6B5438" roughness={0.8} />
      </mesh>
      {[[-0.16, 0.16, -0.1], [0.16, 0.16, -0.1], [-0.16, 0.16, 0.1], [0.16, 0.16, 0.1]].map((p, i) => (
        <mesh key={i} position={p}>
          <cylinderGeometry args={[0.012, 0.012, 0.32, 6]} /><meshStandardMaterial color="#4A3828" roughness={0.8} />
        </mesh>
      ))}
      {/* Coffee machine */}
      <mesh position={[0, 0.46, 0]}>
        <boxGeometry args={[0.13, 0.2, 0.1]} /><meshStandardMaterial color="#333" roughness={0.3} />
      </mesh>
      <mesh position={[0.04, 0.5, 0.055]}>
        <boxGeometry args={[0.016, 0.016, 0.004]} />
        <meshStandardMaterial color="#FF453A" emissive="#FF453A" emissiveIntensity={0.4} toneMapped={false} />
      </mesh>
      {/* Mug */}
      <mesh position={[-0.1, 0.375, 0.05]}>
        <cylinderGeometry args={[0.02, 0.022, 0.045, 8]} /><meshStandardMaterial color="#F5F0E0" roughness={0.7} />
      </mesh>
    </group>
  )
}

// ── Whiteboard ──────────────────────────────────────────────────────

function Whiteboard() {
  return (
    <group position={[1.8, 0.8, -2.72]}>
      <mesh><boxGeometry args={[1.2, 0.8, 0.035]} /><meshStandardMaterial color="#E8E4DE" roughness={0.5} /></mesh>
      <mesh position={[0, 0, 0.02]}><boxGeometry args={[1.1, 0.7, 0.008]} /><meshStandardMaterial color="#F8F6F2" roughness={0.3} /></mesh>
      {/* Marker lines */}
      <mesh position={[-0.25, 0.15, 0.026]}><boxGeometry args={[0.35, 0.012, 0.002]} /><meshStandardMaterial color="#3366CC" /></mesh>
      <mesh position={[0.1, 0.0, 0.026]}><boxGeometry args={[0.3, 0.012, 0.002]} /><meshStandardMaterial color="#CC3333" /></mesh>
      <mesh position={[-0.1, -0.15, 0.026]}><boxGeometry args={[0.25, 0.012, 0.002]} /><meshStandardMaterial color="#34C759" /></mesh>
      {/* Sticky notes */}
      <mesh position={[0.38, 0.2, 0.026]}><boxGeometry args={[0.08, 0.08, 0.002]} /><meshStandardMaterial color="#FFE066" /></mesh>
      <mesh position={[0.38, 0.08, 0.026]}><boxGeometry args={[0.08, 0.08, 0.002]} /><meshStandardMaterial color="#FF9999" /></mesh>
    </group>
  )
}

// ── Potted plants ───────────────────────────────────────────────────

function Plant({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.11, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.18, 8]} /><meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.13, 8, 8]} /><meshStandardMaterial color="#2D6B2D" roughness={0.8} />
      </mesh>
      <mesh position={[-0.05, 0.36, 0.03]}>
        <sphereGeometry args={[0.07, 6, 6]} /><meshStandardMaterial color="#3D8B3D" roughness={0.8} />
      </mesh>
      <mesh position={[0.04, 0.34, -0.03]}>
        <sphereGeometry args={[0.06, 6, 6]} /><meshStandardMaterial color="#357B35" roughness={0.8} />
      </mesh>
    </group>
  )
}

// ── Combined environment ────────────────────────────────────────────

export default function SceneEnvironment() {
  return (
    <group>
      <EnhancedFloor />
      <Walls />
      <Window />
      <CeilingLights />
      <Bookcase />
      <ServerRack />
      <CoffeeStation />
      <Whiteboard />
      <Plant position={[-2.5, 0, -1.6]} />
      <Plant position={[2.8, 0, 1.8]} />
    </group>
  )
}
