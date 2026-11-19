import { AnimatePresence, LayoutGroup } from 'framer-motion'
import { useState } from 'react'
import type { Model } from '../lib/bpe'
import { encode, words } from '../lib/bpe'
import { Chip } from './Chip'

type Props = { model: Model; step: number; sentence: string; setSentence: (s: string) => void }

export function Encode({ model, step, sentence, setSentence }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const toks = encode(sentence, model, step)
  const unk = toks.filter(t => t.id === 0).length
  const wordCount = words(sentence).length

  return (
    <section id="encode" className="wrap section">
      <div className="section-head">
        <span className="num">2</span>
        <div>
          <h2>Encode a sentence</h2>
          <p>
            Type anything. Your sentence is split with the merges learned above, in the order they were learned,
            and each piece is replaced by its row number in the vocabulary. Those numbers are all the model ever sees.
          </p>
        </div>
      </div>

      <input className="sentence" value={sentence} onChange={e => setSentence(e.target.value)} placeholder="Type a sentence to encode" aria-label="Sentence to encode" spellCheck={false} />

      <p className="flow">
        <b>{sentence.length}</b> characters become <b>{wordCount}</b> words become <b>{toks.length}</b> tokens.
        {step < model.merges.length && <> Using {step} of {model.merges.length} learned merges; drag the slider above to change that.</>}
        {unk > 0 && <> <span className="warn">{unk} {unk === 1 ? 'piece contains a character' : 'pieces contain characters'} the training text never used, so {unk === 1 ? 'it becomes' : 'they become'} [UNK], id 0.</span></>}
      </p>

      <LayoutGroup>
        <div className="token-stream" aria-live="polite">
          {toks.length === 0 && <p className="muted">Nothing to encode yet. Start typing above.</p>}
          <AnimatePresence mode="popLayout">
            {toks.map((t, i) => (
              <Chip key={`${i}-${t.text}`} text={t.text} id={t.id} unknown={t.id === 0} dim={!!hover && hover !== t.text} onHover={setHover} />
            ))}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      <div className="ids">
        <span className="hero-tag">what the model receives</span>
        <code>[{toks.map((t, i) => <span key={i} className={hover === t.text ? 'hl' : undefined}>{t.id}{i < toks.length - 1 ? ', ' : ''}</span>)}]</code>
      </div>
    </section>
  )
}
