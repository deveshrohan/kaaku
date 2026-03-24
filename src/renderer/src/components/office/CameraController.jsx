import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// Desk world positions (duplicated here to avoid circular import)
const DESK_POS = {
  pm:        [0, 0, 0],
  architect: [-1.6, 0, -1.0],
  developer: [1.6, 0, -1.0],
  analyst:   [-1.6, 0, 1.0],
  qa:        [1.6, 0, 1.0],
}

const OVERVIEW_ZOOM = 140
const FOCUS_ZOOM = 195

export default function CameraController({ selectedDesk }) {
  const controlsRef = useRef()
  const { camera } = useThree()
  const targetPos = useRef(new THREE.Vector3(0, 0, 0))
  const targetZoom = useRef(OVERVIEW_ZOOM)

  useEffect(() => {
    const desk = selectedDesk ? DESK_POS[selectedDesk] : null
    if (desk) {
      targetPos.current.set(desk[0], 0, desk[2])
      targetZoom.current = FOCUS_ZOOM
    } else {
      targetPos.current.set(0, 0, 0)
      targetZoom.current = OVERVIEW_ZOOM
    }
  }, [selectedDesk])

  useFrame((_, dt) => {
    if (!controlsRef.current) return
    const controls = controlsRef.current
    const speed = Math.min(3 * dt, 1)

    // Smoothly animate OrbitControls target toward selected desk
    controls.target.lerp(targetPos.current, speed)

    // Smoothly animate zoom
    camera.zoom += (targetZoom.current - camera.zoom) * speed
    camera.updateProjectionMatrix()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minZoom={60}
      maxZoom={300}
      maxPolarAngle={Math.PI / 2.2}
      minPolarAngle={0.2}
      panSpeed={0.8}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      enableDamping={true}
      dampingFactor={0.08}
    />
  )
}
