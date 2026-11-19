import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import type { Model } from '../lib/bpe'
import { Chip } from './Chip'
import { Head } from './Layout'
import { PRESETS, reducedMotion } from '../lib/ui'

// Hugging Face tokenizers layout: model.vocab maps token to id, model.merges lists "a b" in rank order.
function download(model: Model, step: number) {
  const merges = model.merges.slice(0, step)
  const keep = new Set(merges.map(m => m.a + m.b))
  const vocab = Object.fromEntries([...model.vocab].filter(([t, id]) => id < model.base || keep.has(t)))
  const json = { version: '1.0', model: { type: 'BPE', unk_token: '[UNK]', end_of_word_suffix: '</w>', vocab, merges: merges.map(m => `${m.a} ${m.b}`) } }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }))
  a.download = 'tokenizer.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

type Props = { corpus: string; setCorpus: (s: string) => void; model: Model; step: number; setStep: (n: number) => void; setSentence: (s: string) => void }

export function Train({ corpus, setCorpus, model, step, setStep, setSentence }: Props) {
  const [playing, setPlaying] = useState(false)
  const total = model.merges.length

  useEffect(() => {
    if (!playing) return
    if (step >= total) { setPlaying(false); return }
    const t = setTimeout(() => setStep(step + 1), reducedMotion() ? 0 : 140)
    return () => clearTimeout(t)
  }, [playing, step, total, setStep])

  // Tokens known after `step` merges: base characters plus the results of the merges so far.
  const vocab = useMemo(() => {
    const learned = new Set(model.merges.slice(0, step).map(m => m.a + m.b))
    return [...model.vocab].filter(([t, id]) => id < model.base || learned.has(t))
  }, [model, step])

  const last = step > 0 ? model.merges[step - 1] : null
  const play = () => { if (step >= total) setStep(0); setPlaying(p => !p) }

  return (
    <section id="train" className="wrap section">
      <Head step={1} title="Train a tokenizer" lead="Pick some text, press play, and watch letters fuse into tokens.">
        <p>
          This is byte-pair encoding, the method behind GPT's tokenizer. It starts from single letters, finds the pair
          that appears most often in your text, and glues it into a new token. Repeat, and common chunks like
          <em> ing</em> and <em>the</em> emerge on their own.
        </p>
        <p>The ▁ mark means a token ends a word, so <em>the▁</em> and the <em>the</em> inside <em>there</em> stay different tokens.</p>
      </Head>

      <div className="train-grid">
        <div className="field">
          <div className="presets" role="group" aria-label="Load sample text">
            {PRESETS.map(p => (
              <button key={p.name} className={`preset${corpus === p.corpus ? ' on' : ''}`}
                onClick={() => { setCorpus(p.corpus); setSentence(p.sentence); setStep(0); setPlaying(true) }}>{p.name}</button>
            ))}
          </div>
          <label htmlFor="corpus">Training text</label>
          <textarea id="corpus" value={corpus} onChange={e => { setCorpus(e.target.value); setPlaying(false) }} rows={12} spellCheck={false} />
          <small>{corpus.split(/\s+/).filter(Boolean).length} words. Edit anything and the tokenizer retrains instantly.</small>
        </div>

        <div className="merge-panel">
          <div className="merge-controls">
            <button className="btn small" onClick={play} disabled={!total}>{playing ? 'Pause' : step >= total ? 'Replay merges' : 'Play merges'}</button>
            <input type="range" min={0} max={total} value={step} aria-label="Number of merges applied"
              onChange={e => { setPlaying(false); setStep(+e.target.value) }} />
            <span className="mono">{step}/{total}</span>
          </div>

          <div className="merge-now" aria-live="polite">
            {last ? (
                <motion.div key={step} className="merge-eq" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                  <Chip text={last.a} /> <span className="op">+</span> <Chip text={last.b} /> <span className="op">=</span>
                  <Chip text={last.a + last.b} id={model.vocab.get(last.a + last.b)} fresh />
                  <span className="merge-count">seen {last.count}×</span>
                </motion.div>
              ) : (
                <p className="muted">No merges yet: every token is a single letter. Press play.</p>
              )}
          </div>

          <div className="vocab-head">
            <h3>Vocabulary</h3>
            <span className="mono">{vocab.length} tokens</span>
            <button className="ghost" onClick={() => download(model, step)}>Export tokenizer.json</button>
          </div>
          <LayoutGroup>
            <div className="vocab">
              <AnimatePresence>
                {vocab.map(([t, id]) => <Chip key={t} text={t} id={id} unknown={id === 0} fresh={!!last && t === last.a + last.b} />)}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </div>
      </div>
    </section>
  )
}
