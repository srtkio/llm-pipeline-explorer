import { AnimatePresence } from 'framer-motion'
import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { train, words } from './lib/bpe'
import { DEFAULT_CORPUS, DEFAULT_SENTENCE, reducedMotion } from './lib/ui'
import { Intro } from './components/Intro'
import { Hero } from './components/Hero'
import { Train } from './components/Train'
import { Encode } from './components/Encode'

// three.js only loads once the section is near. A tab opened before a redeploy asks for a chunk
// that no longer exists, so reload once to pick up the new build instead of blanking the page.
const Space = lazy(() => import('./components/Space').then(m => { sessionStorage.removeItem('chunk-reload'); return m }, err => {
  if (sessionStorage.getItem('chunk-reload')) throw err // shortcut: no error boundary, so a second failure blanks the page; add one if this shows up
  sessionStorage.setItem('chunk-reload', '1')
  location.reload()
  return new Promise<never>(() => {})
}))
const MAX_MERGES = 400
const MAX_POINTS = 300 // shortcut: caps 3D points for frame rate; raise if labels move to instancing
const wordList = (s: string) => words(s).filter(w => /[a-z0-9]/.test(w))

const HERO_MODEL = train(DEFAULT_CORPUS, MAX_MERGES)

function useNear<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '600px' })
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return [ref, near] as const
}

export default function App() {
  const [intro, setIntro] = useState(() => !reducedMotion())
  const [corpus, setCorpus] = useState(DEFAULT_CORPUS)
  const [sentence, setSentence] = useState(DEFAULT_SENTENCE)
  const [step, setStep] = useState<number | null>(null) // null = all learned merges, so retraining keeps showing the latest

  const model = useMemo(() => train(corpus, MAX_MERGES), [corpus])
  const total = model.merges.length
  const at = Math.min(step ?? total, total)

  const deferredCorpus = useDeferredValue(corpus)
  const deferredSentence = useDeferredValue(sentence)
  const corpusWords = useMemo(() => [...new Set(wordList(deferredCorpus))].slice(0, MAX_POINTS), [deferredCorpus])
  const sentenceWords = useMemo(() => wordList(deferredSentence), [deferredSentence])
  const [spaceRef, spaceNear] = useNear<HTMLElement>()

  return (
    <>
      <AnimatePresence>{intro && <Intro onDone={() => setIntro(false)} />}</AnimatePresence>

      <nav className="nav wrap">
        <a href="#top" className="logo"><span className="logo-a">token</span><span className="logo-b">scope</span></a>
        <div className="nav-links">
          <a href="#train">Train</a>
          <a href="#encode">Encode</a>
          <a href="#space">Embed</a>
          <a href="https://github.com/srtkio/llm-pipeline-explorer" target="_blank" rel="noreferrer">Source</a>
        </div>
      </nav>

      <main id="top">
        {!intro && <Hero model={HERO_MODEL} />}
        <Train corpus={corpus} setCorpus={setCorpus} model={model} step={at} setStep={n => setStep(n >= total ? null : n)} />
        <Encode model={model} step={at} sentence={sentence} setSentence={setSentence} />

        <section id="space" className="wrap section" ref={spaceRef}>
          <div className="section-head">
            <span className="num">3</span>
            <div>
              <h2>Place every word in space</h2>
              <p>
                A model turns each token into a long list of numbers, an embedding. Words with similar lists are treated
                as similar. Here every word from your training text and your sentence is squeezed down to three
                dimensions so you can fly around it. Compare two ways of deciding what "similar" means.
              </p>
            </div>
          </div>
          {spaceNear
            ? <Suspense fallback={<div className="space space-wait">Loading the 3D view</div>}><Space corpusWords={corpusWords} sentenceWords={sentenceWords} /></Suspense>
            : <div className="space space-wait" />}
        </section>
      </main>

      <footer className="wrap footer">
        <p>
          Tokenizer: byte-pair encoding written from scratch and trained live on your text. Spelling vectors: hashed
          character n-grams. Meaning vectors: all-MiniLM-L6-v2 via transformers.js, run on your device. 3D layout: PCA.
        </p>
      </footer>
    </>
  )
}
