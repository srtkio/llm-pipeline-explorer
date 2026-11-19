import { motion } from 'framer-motion'
import type { Model } from '../lib/bpe'
import { encode, words } from '../lib/bpe'
import { Chip } from './Chip'

const SAMPLE = 'the kittens were playing happily'

export function Hero({ model }: { model: Model }) {
  const toks = encode(SAMPLE, model)
  const ids = toks.map(t => t.id)
  return (
    <header className="hero wrap">
      <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}>
        Watch a language model read.
      </motion.h1>
      <motion.p className="lede" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.8 }}>
        Text becomes tokens, tokens become numbers, numbers become points in space. Try it on your own words.
      </motion.p>

      <div className="hero-demo" aria-label={`"${SAMPLE}" becomes token ids ${ids.join(', ')}`}>
        <div className="hero-stage">
          <span className="hero-tag">text</span>
          <motion.span className="hero-words" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            {words(SAMPLE).join(' ')}
          </motion.span>
        </div>
        <div className="hero-stage">
          <span className="hero-tag">tokens</span>
          <motion.span className="chips" initial="hidden" animate="show" variants={{ show: { transition: { delayChildren: 1.1, staggerChildren: 0.07 } } }}>
            {toks.map((t, i) => (
              <motion.span key={i} variants={{ hidden: { opacity: 0, y: -10, rotateX: 70 }, show: { opacity: 1, y: 0, rotateX: 0 } }}>
                <Chip text={t.text} id={t.id} />
              </motion.span>
            ))}
          </motion.span>
        </div>
        <div className="hero-stage">
          <span className="hero-tag">ids</span>
          <motion.code className="hero-ids" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 + toks.length * 0.07 + 0.2 }}>
            [{ids.join(', ')}]
          </motion.code>
        </div>
      </div>

      <a className="btn" href="#train">Train your own tokenizer</a>
    </header>
  )
}
