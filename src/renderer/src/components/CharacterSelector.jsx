import { useRef } from 'react'
import { motion } from 'framer-motion'

export default function CharacterSelector({ characters, selected, onSelect }) {
  const scrollRef = useRef()

  // "all" option + each character
  const items = [
    { id: 'all', name: 'All', icon: '✨', color: '#888888' },
    ...characters
  ]

  return (
    <div className="char-selector-wrap">
      <div className="char-selector-label">Character</div>
      <div className="char-selector-scroll" ref={scrollRef}>
        {items.map((item) => {
          const active = selected === item.id
          return (
            <motion.button
              key={item.id}
              className={`char-btn ${active ? 'active' : ''}`}
              style={{ '--char-color': item.color }}
              onClick={() => onSelect(item.id)}
              whileTap={{ scale: 0.88 }}
              animate={active ? { scale: 1.08 } : { scale: 1.0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            >
              <span className="char-icon">{item.icon}</span>
              <span className="char-name">{item.name}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
