import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import AgentCharacter from './AgentCharacter'
import SceneEnvironment from './SceneEnvironment'
import { SceneLighting, FloatingParticles } from './SceneEffects'
import CameraController from './CameraController'
import DeskNameplate from './DeskNameplate'
import { ACCENT } from './sprites'

// ── WebGL config — frozen constant (macOS transparency) ─────────────
const CANVAS_GL = Object.freeze({
  alpha: true,
  antialias: true,
  premultipliedAlpha: false,
})

// ── Desk layout ─────────────────────────────────────────────────────
const DESKS = [
  { role: 'pm',        label: 'PM',        pos: [0, 0, 0] },
  { role: 'architect', label: 'Architect',  pos: [-1.6, 0, -1.0] },
  { role: 'developer', label: 'Developer',  pos: [1.6, 0, -1.0] },
  { role: 'analyst',   label: 'Analyst',    pos: [-1.6, 0, 1.0] },
  { role: 'qa',        label: 'QA',         pos: [1.6, 0, 1.0] },
]

export { DESKS }

// Character standing position relative to desk origin
// y=0 (floor level) for 3D characters, z offset puts them behind desk
const CHAR_OFFSET = [0, 0, 0.35]

function deskWorldPos(deskPos) {
  return [
    deskPos[0] + CHAR_OFFSET[0],
    CHAR_OFFSET[1],
    deskPos[2] + CHAR_OFFSET[2],
  ]
}

export { deskWorldPos }

// ── Desk mesh group ─────────────────────────────────────────────────

function Desk({ position, taskCount = 0, agentPhase = 'idle', selected, onClick }) {
  const ringRef = useRef()

  const screenColor = useMemo(() => {
    switch (agentPhase) {
      case 'gathering':  return '#4488FF'
      case 'analyzing':  return '#8844FF'
      case 'acting':     return '#44CC66'
      case 'error':      return '#FF4444'
      case 'completed':  return '#34C759'
      default:           return '#223366'
    }
  }, [agentPhase])

  const screenIntensity = agentPhase === 'idle' ? 0.3 : 0.9
  const paperH = Math.min(taskCount, 8) * 0.012 + 0.005
  const paperY = 0.32 + paperH / 2

  // Animated selection glow
  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.material.opacity = 0.3 + Math.sin(clock.getElapsedTime() * 3) * 0.15
    }
  })

  return (
    <group position={position} onClick={onClick}>
      {/* Table surface */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.6, 0.03, 0.38]} />
        <meshStandardMaterial color="#6B5438" roughness={0.75} />
      </mesh>

      {/* Table legs */}
      {[[-0.22, 0.15, -0.14], [0.22, 0.15, -0.14], [-0.22, 0.15, 0.14], [0.22, 0.15, 0.14]].map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.025, 0.3, 0.025]} />
          <meshStandardMaterial color="#4A3828" roughness={0.9} />
        </mesh>
      ))}

      {/* Monitor housing */}
      <mesh position={[0, 0.46, -0.1]} castShadow>
        <boxGeometry args={[0.22, 0.15, 0.015]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.3} />
      </mesh>
      {/* Monitor screen (emissive) */}
      <mesh position={[0, 0.46, -0.09]}>
        <boxGeometry args={[0.19, 0.12, 0.002]} />
        <meshStandardMaterial
          color={screenColor}
          emissive={screenColor}
          emissiveIntensity={screenIntensity}
          toneMapped={false}
        />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0, 0.36, -0.1]}>
        <boxGeometry args={[0.03, 0.06, 0.03]} />
        <meshStandardMaterial color="#2a2a3e" roughness={0.5} />
      </mesh>

      {/* Paper stack */}
      {taskCount > 0 && (
        <mesh position={[0.18, paperY, 0.05]}>
          <boxGeometry args={[0.08, paperH, 0.1]} />
          <meshStandardMaterial color="#F5F0E0" roughness={0.9} />
        </mesh>
      )}

      {/* Chair seat */}
      <mesh position={[0, 0.18, 0.3]}>
        <cylinderGeometry args={[0.08, 0.08, 0.02, 16]} />
        <meshStandardMaterial color="#333" roughness={0.7} />
      </mesh>
      {/* Chair stem */}
      <mesh position={[0, 0.1, 0.3]}>
        <cylinderGeometry args={[0.015, 0.015, 0.18, 8]} />
        <meshStandardMaterial color="#444" roughness={0.6} />
      </mesh>
      {/* Chair back */}
      <mesh position={[0, 0.3, 0.365]}>
        <boxGeometry args={[0.14, 0.16, 0.015]} />
        <meshStandardMaterial color="#333" roughness={0.7} />
      </mesh>

      {/* Selection ring — animated glow */}
      {selected && (
        <mesh ref={ringRef} position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.38, 0.44, 32]} />
          <meshBasicMaterial color="#C8A44A" transparent opacity={0.4} />
        </mesh>
      )}
    </group>
  )
}

// ── Desk-specific accessories ───────────────────────────────────────

function DeskAccessories() {
  return (
    <group>
      {/* Pizza box on PM desk */}
      <mesh position={[0.35, 0.32, 0.12]}>
        <boxGeometry args={[0.14, 0.018, 0.14]} />
        <meshStandardMaterial color="#D4A44A" roughness={0.9} />
      </mesh>
      {/* Coffee mug near architect */}
      <mesh position={[-1.35, 0.335, -0.85]}>
        <cylinderGeometry args={[0.022, 0.022, 0.045, 8]} />
        <meshStandardMaterial color="#F5F0E0" roughness={0.7} />
      </mesh>
      {/* Energy drink near developer */}
      <mesh position={[1.85, 0.34, -0.82]}>
        <cylinderGeometry args={[0.018, 0.018, 0.055, 8]} />
        <meshStandardMaterial color="#34C759" roughness={0.4} emissive="#34C759" emissiveIntensity={0.1} />
      </mesh>
      {/* Notebook near analyst */}
      <mesh position={[-1.35, 0.32, -1.05]}>
        <boxGeometry args={[0.1, 0.008, 0.13]} />
        <meshStandardMaterial color="#A78BFA" roughness={0.8} />
      </mesh>
      {/* Bug figurine near QA */}
      <mesh position={[1.85, 0.33, -1.1]}>
        <sphereGeometry args={[0.025, 6, 6]} />
        <meshStandardMaterial color="#E8820C" roughness={0.7} />
      </mesh>
    </group>
  )
}

// ── Main scene content ──────────────────────────────────────────────

export function OfficeSceneContent({ desks, selectedDesk, onDeskClick, characters }) {
  return (
    <>
      {/* Lighting — animated warm/cool cycle */}
      <SceneLighting />

      {/* Floating dust particles */}
      <FloatingParticles count={40} />

      {/* Camera — smooth transitions when desk selected */}
      <CameraController selectedDesk={selectedDesk} />

      {/* Environment — floor, walls, window, ceiling lights, furniture */}
      <SceneEnvironment />

      {/* Desk-specific small props */}
      <DeskAccessories />

      {/* Desks */}
      {desks.map((d) => (
        <Desk
          key={d.role}
          position={d.pos}
          taskCount={d.taskCount || 0}
          agentPhase={d.agentPhase || 'idle'}
          selected={selectedDesk === d.role}
          onClick={(e) => { e.stopPropagation(); onDeskClick(d.role) }}
        />
      ))}

      {/* Desk nameplates — floating labels above desks */}
      {desks.map((d) => (
        <DeskNameplate
          key={`np-${d.role}`}
          label={d.label}
          color={ACCENT[d.role]}
          position={[d.pos[0], 0.68, d.pos[2]]}
        />
      ))}

      {/* 3D Agent characters */}
      {(characters || []).map((c) => (
        <AgentCharacter
          key={c.role}
          role={c.role}
          position={c.position}
          state={c.state}
          walkTo={c.walkTo}
          walkDuration={c.walkDuration}
          onWalkDone={c.onWalkDone}
        />
      ))}
    </>
  )
}

// ── Canvas wrapper ──────────────────────────────────────────────────

export default function OfficeCanvas({ desks, selectedDesk, onDeskClick, onBackgroundClick, characters }) {
  return (
    <Canvas
      orthographic
      camera={{
        position: [4, 5, 4],
        zoom: 140,
        near: 0.1,
        far: 100,
      }}
      onCreated={(state) => {
        state.camera.lookAt(0, 0, 0)
        state.camera.updateProjectionMatrix()
        state.gl.setClearColor(0x000000, 0)
        state.gl.setClearAlpha(0)
        state.gl.toneMapping = THREE.NoToneMapping
      }}
      gl={CANVAS_GL}
      style={{ background: 'transparent' }}
      onClick={onBackgroundClick}
    >
      <OfficeSceneContent
        desks={desks}
        selectedDesk={selectedDesk}
        onDeskClick={onDeskClick}
        characters={characters}
      />
    </Canvas>
  )
}
