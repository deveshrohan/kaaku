// Shared trapdoor fall/rise animation for all characters.
// Call from useFrame: if it returns true, it handled the frame (skip other anim logic).
//
// Usage in character useFrame:
//   if (handleTrapdoor(gRef.current, A, dt, onAnimComplete)) return

const FALL_SPEED = 2.0    // ~0.5s to complete
const RISE_SPEED = 1.5    // ~0.67s to complete
const FALL_DIST  = 3.0    // units below origin

export default function handleTrapdoor(group, A, dt, onAnimComplete) {
  if (A.state === 'trapdoor-hide') {
    A.actionT = Math.min((A.actionT || 0) + dt * FALL_SPEED, 1)
    // Ease-in quad — accelerating fall
    const p = A.actionT * A.actionT
    group.position.set(0, -FALL_DIST * p, 0)
    group.rotation.set(0, 0, 0)
    group.scale.set(1, 1, 1)
    if (A.actionT >= 1) onAnimComplete?.()
    return true
  }

  if (A.state === 'trapdoor-show') {
    A.actionT = Math.min((A.actionT || 0) + dt * RISE_SPEED, 1)
    const p = A.actionT
    // Rise from below with ease-out
    const riseY = -FALL_DIST + FALL_DIST * p
    // Overshoot bounce near the end
    const bounce = p >= 0.7
      ? Math.sin((p - 0.7) / 0.3 * Math.PI) * 0.15 * (1 - p)
      : 0
    group.position.set(0, riseY + bounce, 0)
    group.rotation.set(0, 0, 0)
    group.scale.set(1, 1, 1)
    if (A.actionT >= 1) {
      group.position.set(0, 0, 0)
      onAnimComplete?.()
    }
    return true
  }

  // Hold position at bottom — used during flap open/close when character must stay hidden
  if (A.state === 'trapdoor-held') {
    group.position.set(0, -FALL_DIST, 0)
    group.rotation.set(0, 0, 0)
    group.scale.set(1, 1, 1)
    return true
  }

  return false
}
