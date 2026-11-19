import { motion } from 'framer-motion'
import { EOW, UNK } from '../lib/bpe'
import { inkFor, stripEow } from '../lib/ui'

type Props = { text: string; id?: number; unknown?: boolean; dim?: boolean; fresh?: boolean; layoutId?: string; onHover?: (t: string | null) => void }

// A token rendered as a type slug: coloured body, end-of-word mark, id underneath.
export function Chip({ text, id, unknown, dim, fresh, layoutId, onHover }: Props) {
  const eow = text.endsWith(EOW)
  return (
    <motion.span
      layout layoutId={layoutId}
      className={`chip${unknown ? ' unk' : ''}${dim ? ' dim' : ''}${fresh ? ' fresh' : ''}`}
      style={{ '--ink': unknown ? 'transparent' : inkFor(text) } as React.CSSProperties}
      initial={{ opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
      title={unknown ? `"${stripEow(text)}" is not in the vocabulary, so it maps to ${UNK}` : eow ? 'Ends a word' : undefined}
      onMouseEnter={() => onHover?.(text)} onMouseLeave={() => onHover?.(null)}
    >
      <span className="chip-text">{stripEow(text)}{eow && <span className="eow" aria-label="end of word">▁</span>}</span>
      {id !== undefined && <span className="chip-id">{id}</span>}
    </motion.span>
  )
}
