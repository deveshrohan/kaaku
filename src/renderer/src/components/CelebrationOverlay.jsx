import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const MESSAGES_BY_CHAR = {
  walle:   ["Directive: Complete! ✅", "Waaall·Eeeee! 🎉", "EVA would be proud! 💚", "Wall·E approves! 🌱"],
  pikachu: ["Pika pika! ⚡", "Super effective! ⚡", "Pikachu used Complete! 🎉", "Thunderous effort! ⚡"],
  chopper: ["Chopper approves! 🦌", "Medical check: done! 💊", "Cotton Candy Power! 🎉", "Heavy Point cleared! 🏆"],
  zoro:    ["Nothing happened… 🗡️", "Santoryu success! ⚔️", "Even Zoro found it! 🎉", "Cut it down! ⚔️"],
  luffy:   ["Gomu Gomu done! 🏴‍☠️", "King of the todo list! 👑", "Shishishi! 🎉", "I'll be the task king! 🏴‍☠️"],
  po:      ["Skadoosh! 🐼", "Dragon Warrior wins! 🐉", "There's no charge for awesomeness! 🎉", "Po approves! 🐼"],
}

const MESSAGES_DEFAULT = [
  "Task complete! 🎉", "Outstanding work! ⭐", "Nailed it! 🏆", "You rock! 🎊",
]

export default function CelebrationOverlay({ task, visible, onDone, charMeta }) {
  const pool = (charMeta && MESSAGES_BY_CHAR[charMeta.id]) || MESSAGES_DEFAULT
  const message = pool[Math.floor(Math.random() * pool.length)]

  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, 3200)
      return () => clearTimeout(t)
    }
  }, [visible, onDone])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="celebration-overlay"
          initial={{ opacity: 0, y: -20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.75 }}
          transition={{ type: 'spring', stiffness: 350, damping: 22 }}
        >
          <motion.div
            className="celebration-emoji"
            animate={{ rotate: [0, -15, 15, -10, 10, 0], scale: [1, 1.3, 1.3, 1.1, 1] }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            🎉
          </motion.div>
          <div className="celebration-message">{message}</div>
          {task && (
            <div className="celebration-task">"{task}"</div>
          )}
          <div className="celebration-sub">marked as done!</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
