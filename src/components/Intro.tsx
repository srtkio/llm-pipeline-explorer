import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { inkFor } from '../lib/ui'

// The loader is BPE itself: the name's letters merge pair by pair into one token.
const STAGES = [
  ['t', 'o', 'k', 'e', 'n', 's', 'c', 'o', 'p', 'e'],
  ['to', 'k', 'e', 'n', 's', 'co', 'p', 'e'],
  ['to', 'ken', 's', 'co', 'pe'],
  ['token', 'scope'],
  ['tokenscope'],
]
// Keys are each piece's start offset, so a merged piece keeps its left neighbour's identity.
const keyed = (parts: string[]) => {
  let at = 0
  return parts.map(p => { const k = at; at += p.length; return { p, k } })
}

export function Intro({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (stage < STAGES.length - 1) { const t = setTimeout(() => setStage(stage + 1), stage === 0 ? 520 : 340); return () => clearTimeout(t) }
    const t = setTimeout(onDone, 650)
    return () => clearTimeout(t)
  }, [stage, onDone])

  return (
    <motion.div className="intro" exit={{ opacity: 0, transition: { duration: 0.5 } }} aria-hidden>
      <div className="intro-row">
        <AnimatePresence mode="popLayout">
          {keyed(STAGES[stage]).map(({ p, k }) => (
            <motion.span
              key={k} layout
              className="intro-chip"
              style={{ background: stage === STAGES.length - 1 ? 'var(--paper)' : inkFor(p) }}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30, delay: stage === 0 ? k * 0.035 : 0 }}
            >{p}</motion.span>
          ))}
        </AnimatePresence>
      </div>
      <p className="intro-caption">merge {stage} of {STAGES.length - 1}</p>
    </motion.div>
  )
}
