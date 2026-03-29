import * as THREE from 'three'
import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import modelUrl from './zorov2.glb?url'
import handleTrapdoor from './useTrapdoorAnim'

export const meta = { id: 'zoro', name: 'Zoro', icon: '⚔️', color: '#3A7A3A' }

const TARGET_H = 1.8
const ANGRY     = 'NlaTrack'       // 17.08s — capped at 5s
const CHOP      = 'NlaTrack.001'   // 3.58s
const FOLD_ARMS = 'NlaTrack.002'   // 6.63s

export default function Zoro({ animState, onAnimComplete }) {
  const { scene, animations } = useGLTF(modelUrl)
  const groupRef = useRef()
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

  function playOnce(clipName, durationCap) {
    const action = actions[clipName]
    if (!action) { onAnimComplete?.(); return }
    stopAllGLB()
    glbActive.current = true
    action.reset().setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(0.2).play()

    const finish = () => {
      stopAllGLB()
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
    if (!actions[CHOP]) return
    A.current.state = animState
    A.current.idleT = 0

    switch (animState) {
      case 'idle':    stopAllGLB(); break
      case 'click':
      case 'celebrate':
      case 'special2': playOnce(CHOP);       break
      case 'special1': playOnce(ANGRY, 5);   break
      case 'special3': playOnce(FOLD_ARMS);  break
      default:         stopAllGLB();         break
    }
  }, [animState, actions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Procedural idle — only runs when no GLB clip is active
  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return
    if (handleTrapdoor(g, A.current, dt, onAnimComplete)) return

    if (glbActive.current) {
      g.position.set(0, 0, 0)
      g.rotation.set(0, 0, 0)
      g.scale.set(1, 1, 1)
      return
    }

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
      g.position.y = Math.sin(t * 0.45 * Math.PI * 2) * 0.04
      g.rotation.z = Math.sin(t * 0.45 * Math.PI * 2) * 0.015
    } else if (a.idleMode === 1) {
      g.position.y = Math.sin(t * 0.35 * Math.PI * 2) * 0.03
      g.rotation.y = Math.sin(t * 0.30 * Math.PI * 2) * 0.30
    } else if (a.idleMode === 2) {
      g.position.y = Math.sin(t * 0.5 * Math.PI * 2) * 0.04
      g.rotation.x = 0.08
      g.rotation.z = Math.sin(t * 0.4 * Math.PI * 2) * 0.03
    } else {
      g.position.y = Math.sin(t * 0.25 * Math.PI * 2) * 0.02
      g.rotation.x = 0.05
      g.rotation.z = Math.sin(t * 0.2 * Math.PI * 2) * 0.02
    }
  })

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={ms} position={[ox, oy, oz]} rotation={[0, -Math.PI / 2, 0]} />
    </group>
  )
}

useGLTF.preload(modelUrl)
