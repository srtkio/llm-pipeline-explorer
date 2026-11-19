import { AnimatePresence } from 'framer-motion'
import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { encode, train, words } from './lib/bpe'
import { DEFAULT_CORPUS, DEFAULT_SENTENCE, STOPWORDS, reducedMotion } from './lib/ui'
import { Intro } from './components/Intro'
import { Hero } from './components/Hero'
import { Train } from './components/Train'
import { Encode } from './components/Encode'
import { Head, Rail } from './components/Layout'

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
  const corpusWords = useMemo(() => [...new Set(wordList(deferredCorpus).filter(w => !STOPWORDS.has(w)))].slice(0, MAX_POINTS), [deferredCorpus])
  const sentenceWords = useMemo(() => wordList(deferredSentence).filter(w => !STOPWORDS.has(w)), [deferredSentence])
  const [spaceRef, spaceNear] = useNear<HTMLElement>()

  return (
    <>
      <AnimatePresence>{intro && <Intro onDone={() => setIntro(false)} />}</AnimatePresence>

      <Rail stages={[
        { id: 'train', label: 'Tokens', value: `${model.base + at} in vocab` },
        { id: 'encode', label: 'IDs', value: `${encode(sentence, model, at).length} for your sentence` },
        { id: 'space', label: 'Vectors', value: `${new Set([...corpusWords, ...sentenceWords]).size} words in 3D` },
      ]} />

      <main id="top">
        {!intro && <Hero model={HERO_MODEL} />}
        <Train corpus={corpus} setCorpus={setCorpus} model={model} step={at} setStep={n => setStep(n >= total ? null : n)} setSentence={setSentence} />
        <Encode model={model} step={at} sentence={sentence} setSentence={setSentence} />

        <section id="space" className="wrap section" ref={spaceRef}>
          <Head step={3} title="Place every word in space" lead="Every word becomes a point. Close points mean similar words. Switch how similarity is measured.">
            <p>
              A model turns each token into a long list of numbers, an embedding. Words with similar lists are treated as
              similar. Here every word from your training text and your sentence is squeezed from hundreds of dimensions
              down to three with PCA so you can fly around it.
            </p>
            <p>
              Spelling vectors count the letter pairs and triples in a word. Meaning vectors come from MiniLM, a small
              neural network trained on a billion sentence pairs, running on your device.
            </p>
          </Head>
          {spaceNear
            ? <Suspense fallback={<div className="space space-wait">Loading the 3D view</div>}><Space corpusWords={corpusWords} sentenceWords={sentenceWords} /></Suspense>
            : <div className="space space-wait" />}
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-grid">
          <div className="footer-credit">
            <a href="#top" className="logo"><span className="logo-a">token</span><span className="logo-b">scope</span></a>
            <p>Made by <a href="https://github.com/srtkio" target="_blank" rel="noreferrer">Sarthak Rai</a></p>
          </div>
          <dl className="footer-stack">
            <div><dt>Tokenizer</dt><dd>BPE from scratch, trained live</dd></div>
            <div><dt>Spelling</dt><dd>char 2/3-gram hashing</dd></div>
            <div><dt>Meaning</dt><dd>all-MiniLM-L6-v2, transformers.js</dd></div>
            <div><dt>Compare</dt><dd>GPT-4 cl100k_base, js-tiktoken</dd></div>
            <div><dt>Render</dt><dd>three.js, react-three-fiber</dd></div>
            <div><dt>Projection</dt><dd>UMAP (umap-js) or PCA, k-means groups</dd></div>
          </dl>
          <nav className="footer-links" aria-label="Footer">
            <a href="https://github.com/srtkio/llm-pipeline-explorer" target="_blank" rel="noreferrer">Source on GitHub</a>
            <a href="https://github.com/srtkio" target="_blank" rel="noreferrer">@srtkio</a>
            <a href="#top">Back to top</a>
          </nav>
        </div>
        <p className="wrap footer-note">Runs entirely in your browser. Your text never leaves your device.</p>
      </footer>
    </>
  )
}
