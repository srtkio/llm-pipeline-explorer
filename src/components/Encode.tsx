import { AnimatePresence, LayoutGroup } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { Tiktoken } from 'js-tiktoken/lite'
import type { Model } from '../lib/bpe'
import { encode, words } from '../lib/bpe'
import { Chip } from './Chip'
import { Head } from './Layout'

// GPT-4's real tokenizer (cl100k, ~1 MB of merge ranks), loaded only when this section mounts.
function useGpt4() {
  const [enc, setEnc] = useState<Tiktoken | null>(null)
  useEffect(() => {
    Promise.all([import('js-tiktoken/lite'), import('js-tiktoken/ranks/cl100k_base')])
      .then(([{ Tiktoken }, ranks]) => setEnc(new Tiktoken(ranks.default)))
      .catch(() => {}) // comparison is optional; the section works without it
  }, [])
  return enc
}

type Props = { model: Model; step: number; sentence: string; setSentence: (s: string) => void }

export function Encode({ model, step, sentence, setSentence }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const gpt = useGpt4()
  const gptIds = gpt ? gpt.encode(sentence) : []
  const toks = encode(sentence, model, step)
  const unk = toks.filter(t => t.id === 0).length
  const wordCount = words(sentence).length

  return (
    <section id="encode" className="wrap section">
      <Head step={2} title="Encode a sentence" lead="Type anything. These numbers are all the model ever sees.">
        <p>
          Your sentence is split with the merges learned above, applied in the order they were learned, and each piece
          is replaced by its row number in the vocabulary. Hover a token to find every copy of it.
        </p>
        <p>
          Below, the same sentence goes through GPT-4's real tokenizer, trained on a huge slice of the internet with
          100,000 tokens. A bigger vocabulary means fewer, longer pieces.
        </p>
      </Head>

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
      <div className="compare">
        <div className="compare-head">
          <h3>Same sentence, GPT-4's tokenizer</h3>
          <span className="mono">{gpt ? `${gptIds.length} tokens vs your ${toks.length}` : 'loading'}</span>
        </div>
        <div className="token-stream">
          {gptIds.map((id, i) => <Chip key={`${i}-${id}`} text={gpt!.decode([id]).replace(/ /g, '␣')} id={id} />)}
        </div>
      </div>
    </section>
  )
}
