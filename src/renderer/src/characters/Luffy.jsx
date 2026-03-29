import * as THREE from 'three'
import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import modelUrl from './luffyv2.glb?url'
import handleTrapdoor from './useTrapdoorAnim'

export const meta = { id: 'luffy', name: 'Luffy', icon: '🏴‍☠️', color: '#CC2020' }

const TARGET_H = 1.8
const DIVE = 'NlaTrack'       // 3.67s
const FLEE = 'NlaTrack.001'   // 2.75s
const GEAR = 'NlaTrack.002'   // 19.5s — capped at 5s

// Gear root bone was baked with a -90° Y offset vs Dive/Flee
const GEAR_Y_CORRECTION = -Math.PI / 2

export default function Luffy({ animState, onAnimComplete }) {
  const { scene, animations } = useGLTF(modelUrl)
  const groupRef  = useRef()   // procedural idle movements + useAnimations root
  const orientRef = useRef()   // orientation correction layer (sits between group and primitive)
  const { actions, mixer } = useAnimations(animations, groupRef)

  const [ms, ox, oy, oz] = useMemo(() => {
    scene.scale.set(1, 1, 1)
    scene.position.set(0, 0, 0)
    scene.rotation.set(0, 0, 0)
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const sz  = new THREE.Vector3()
    box.getSize(sz)
    const s  = sz.y > 0 ? TARGET_H / sz.y : 1
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    return [s, cz * s, -box.min.y * s, -cx * s]
  }, [scene])

  const glbActive = useRef(false)
  const A = useRef({ state: 'idle', idleMode: 0, idleT: 0, idleNext: 10 })

  function stopAllGLB() {
    Object.values(actions).forEach(a => a?.fadeOut(0.25))
    glbActive.current = false
  }

  function playOnce(clipName, durationCap, yCorrection = 0) {
    const action = actions[clipName]
    if (!action) { onAnimComplete?.(); return }

    stopAllGLB()
    glbActive.current = true

    // Apply orientation correction for this clip
    if (orientRef.current) orientRef.current.rotation.y = yCorrection

    action.reset().setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(0.2).play()

    const finish = () => {
      stopAllGLB()
      if (orientRef.current) orientRef.current.rotation.y = 0
      A.current.state = 'idle'; A.current.idleT = 0
      onAnimComplete?.()
    }

    if (durationCap) {
      const timer = setTimeout(finish, durationCap * 1000)
      const onFinish = (e) => {
        if (e.action !== action) return
        clearTimeout(timer)
        mixer.removeEventListener('finished', onFinish)
        finish()
      }
      mixer.addEventListener('finished', onFinish)
    } else {
      const onFinish = (e) => {
        if (e.action !== action) return
        mixer.removeEventListener('finished', onFinish)
        finish()
      }
      mixer.addEventListener('finished', onFinish)
    }
  }

  useEffect(() => {
    if (!actions[DIVE]) return
    A.current.state = animState
    A.current.idleT = 0

    switch (animState) {
      case 'idle':
        stopAllGLB()
        if (orientRef.current) orientRef.current.rotation.y = 0
        break
      case 'click':
      case 'celebrate':
      case 'special1':
        playOnce(DIVE)
        break
      case 'special2':
        playOnce(FLEE)
        break
      case 'special3':
        playOnce(GEAR, 5, GEAR_Y_CORRECTION)
        break
      default:
        stopAllGLB()
        if (orientRef.current) orientRef.current.rotation.y = 0
        break
    }
  }, [animState, actions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Procedural idle — only runs when no GLB clip is active
  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return
    if (handleTrapdoor(g, A.current, dt, onAnimComplete)) return

    if (glbActive.current) {
      // Keep group neutral — orientation correction is on orientRef, bones do the work
      g.position.set(0, 0, 0)
      g.rotation.set(0, 0, 0)
      g.scale.set(1, 1, 1)
      return
    }

    // Ensure orientation reset when returning to idle
    if (orientRef.current) orientRef.current.rotation.y = 0

    const a = A.current
    a.idleT += dt
    if (a.idleT > a.idleNext) {
      a.idleMode = (a.idleMode + 1) % 4
      a.idleT = 0
      a.idleNext = 8 + Math.random() * 6
    }
    const t = a.idleT
    g.scale.set(1, 1, 1)
    g.rotation.set(0, 0, 0)
    g.position.set(0, 0, 0)

    if (a.idleMode === 0) {
      g.position.y = Math.abs(Math.sin(t * 1.8)) * 0.18
      g.rotation.z = Math.sin(t * 1.8 * Math.PI) * 0.06
    } else if (a.idleMode === 1) {
      g.position.y = Math.abs(Math.sin(t * 1.2 * Math.PI * 2)) * 0.08
      g.rotation.z = Math.sin(t * 1.2 * Math.PI * 2) * 0.18
      g.rotation.y = Math.sin(t * 0.6 * Math.PI * 2) * 0.15
    } else if (a.idleMode === 2) {
      g.position.y = Math.sin(t * 0.8 * Math.PI * 2) * 0.06
      g.rotation.x = -0.12 + Math.sin(t * 0.8 * Math.PI * 2) * 0.06
      g.rotation.y = Math.sin(t * 0.4 * Math.PI * 2) * 0.10
    } else {
      g.position.y = Math.sin(t * 0.5 * Math.PI * 2) * 0.04
      g.rotation.x = -0.08
      g.rotation.z = Math.sin(t * 0.4 * Math.PI * 2) * 0.04
    }
  })

  return (
    <group ref={groupRef}>
      <group ref={orientRef}>
        <primitive object={scene} scale={ms} position={[ox, oy, oz]} rotation={[0, -Math.PI / 2, 0]} />
      </group>
    </group>
  )
}

useGLTF.preload(modelUrl)
