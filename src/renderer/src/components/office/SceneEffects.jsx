import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── Animated Scene Lighting ─────────────────────────────────────────
// Subtle warm/cool breathing cycle for atmosphere.

export function SceneLighting() {
  const ambientRef = useRef()
  const mainRef    = useRef()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const warmth = Math.sin(t * 0.08) * 0.04
    if (ambientRef.current) ambientRef.current.intensity = 0.5 + warmth
    if (mainRef.current) mainRef.current.intensity = 1.1 + warmth * 2
  })

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.5} />
      <hemisphereLight args={['#C0D4E8', '#3A2F1A', 0.55]} />
      <directionalLight
        ref={mainRef}
        position={[5, 8, 5]}
        intensity={1.1}
        castShadow
        color="#FFF5E8"
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <directionalLight position={[-3, 4, -2]} intensity={0.35} color="#FFB070" />
    </>
  )
}

// ── Floating Dust Particles ─────────────────────────────────────────
// Small glowing motes drifting through the office.

export function FloatingParticles({ count = 50, bounds = 3.5 }) {
  const pointsRef = useRef()

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      pos[i3]     = (Math.random() - 0.5) * bounds * 2
      pos[i3 + 1] = Math.random() * 2.2 + 0.2
      pos[i3 + 2] = (Math.random() - 0.5) * bounds * 1.5
      vel[i3]     = (Math.random() - 0.5) * 0.015
      vel[i3 + 1] = (Math.random() - 0.5) * 0.008 + 0.004
      vel[i3 + 2] = (Math.random() - 0.5) * 0.015
    }
    return { positions: pos, velocities: vel }
  }, [count, bounds])

  useFrame((_, dt) => {
    if (!pointsRef.current) return
    const attr = pointsRef.current.geometry.attributes.position
    const arr = attr.array
    const dt20 = dt * 20

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      arr[i3]     += velocities[i3] * dt20
      arr[i3 + 1] += velocities[i3 + 1] * dt20
      arr[i3 + 2] += velocities[i3 + 2] * dt20

      // Wrap vertically
      if (arr[i3 + 1] > 2.6) arr[i3 + 1] = 0.1
      if (arr[i3 + 1] < 0) arr[i3 + 1] = 2.5
      // Bounce horizontally
      if (Math.abs(arr[i3]) > bounds) velocities[i3] *= -1
      if (Math.abs(arr[i3 + 2]) > bounds * 0.75) velocities[i3 + 2] *= -1
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.012}
        color="#FFF5E8"
        transparent
        opacity={0.25}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
