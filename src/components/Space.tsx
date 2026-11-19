import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { cosine, pca3, spellingVector } from '../lib/vectors'
import { reducedMotion } from '../lib/ui'

type Mode = 'spelling' | 'meaning'
type Role = 'selected' | 'neighbor' | 'sentence' | 'base'
type Positions = Map<string, THREE.Vector3>

const COLOR: Record<Role, string> = { selected: '#F28482', neighbor: '#84DCC6', sentence: '#F2C14E', base: '#C9D6E3' }

// Meaning vectors come from MiniLM running in a worker; each word is embedded once and cached.
function useMeaning(words: string[], enabled: boolean) {
  const cache = useRef(new Map<string, number[]>())
  const worker = useRef<Worker | null>(null)
  const files = useRef(new Map<string, { loaded: number; total: number }>())
  const [, setVersion] = useState(0)
  const [progress, setProgress] = useState({ loaded: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => worker.current?.terminate(), [])
  useEffect(() => {
    if (!enabled) return
    const missing = words.filter(w => !cache.current.has(w))
    if (!missing.length) return
    const w = (worker.current ??= new Worker(new URL('../lib/embed.worker.ts', import.meta.url), { type: 'module' }))
    const id = Math.random()
    setError(null)
    w.onmessage = e => {
      const d = e.data
      if (d.type === 'progress' && d.status === 'progress' && d.file) {
        files.current.set(d.file, { loaded: d.loaded ?? 0, total: d.total ?? 0 })
        let loaded = 0, total = 0
        files.current.forEach(f => { loaded += f.loaded; total += f.total })
        setProgress({ loaded, total })
      } else if (d.id !== id) return // a newer request superseded this one
      else if (d.type === 'result') { missing.forEach((m, i) => cache.current.set(m, d.vectors[i])); setVersion(v => v + 1) }
      else if (d.type === 'error') setError(d.message)
    }
    const t = setTimeout(() => w.postMessage({ id, words: missing }), 250) // debounce typing
    return () => clearTimeout(t)
  }, [words, enabled])

  const ready = enabled && words.every(w => cache.current.has(w))
  return { vectors: ready ? words.map(w => cache.current.get(w)!) : null, progress, error }
}

function Point({ word, target, role, hovered, cur, onSelect, onHover }: {
  word: string; target: THREE.Vector3; role: Role; hovered: boolean; cur: Positions
  onSelect: (w: string) => void; onHover: (w: string | null) => void
}) {
  const g = useRef<THREE.Group>(null!)
  const still = useMemo(reducedMotion, [])
  useFrame((_, dt) => {
    let p = cur.get(word)
    if (!p) cur.set(word, (p = target.clone()))
    p.lerp(target, still ? 1 : 1 - Math.exp(-dt * 3.2))
    g.current.position.copy(p)
  })
  const big = role !== 'base' || hovered
  return (
    <group ref={g}>
      <mesh scale={big ? 1.5 : 1}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color={COLOR[role]} />
      </mesh>
      {/* larger invisible target so small points are easy to click */}
      <mesh onClick={e => { e.stopPropagation(); onSelect(word) }}
        onPointerOver={e => { e.stopPropagation(); onHover(word); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html center position={[0, 0.24, 0]} distanceFactor={9} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <span className={`label is-${role}${hovered ? ' hover' : ''}`}>{word}</span>
      </Html>
    </group>
  )
}

// A polyline that follows the animated point positions every frame.
function Path({ words, targets, cur, color, width }: { words: string[]; targets: Map<string, THREE.Vector3>; cur: Positions; color: string; width: number }) {
  const ref = useRef<any>(null)
  useFrame(() => {
    const pts = words.map(w => cur.get(w) ?? targets.get(w)!)
    ref.current?.geometry.setPositions(pts.flatMap(p => [p.x, p.y, p.z]))
  })
  return <Line ref={ref} points={words.map(w => targets.get(w)!)} color={color} lineWidth={width} transparent opacity={0.85} />
}

export default function Space({ corpusWords, sentenceWords }: { corpusWords: string[]; sentenceWords: string[] }) {
  const [mode, setMode] = useState<Mode>('spelling')
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const cur = useRef<Positions>(new Map()).current

  const all = useMemo(() => [...new Set([...corpusWords, ...sentenceWords])], [corpusWords, sentenceWords])
  const spelling = useMemo(() => all.map(w => spellingVector(w)), [all])
  const meaning = useMeaning(all, mode === 'meaning')
  const shown: Mode = mode === 'meaning' && meaning.vectors ? 'meaning' : 'spelling'
  const vecs = shown === 'meaning' ? meaning.vectors! : spelling

  const targets = useMemo(() => new Map(pca3(vecs).map((p, i) => [all[i], new THREE.Vector3(...p)])), [vecs, all])

  const sel = selected && all.includes(selected) ? selected : null
  const neighbors = useMemo(() => {
    if (!sel) return []
    const v = vecs[all.indexOf(sel)]
    return all.map((w, i) => ({ w, s: cosine(v, vecs[i]) })).filter(n => n.w !== sel).sort((a, b) => b.s - a.s).slice(0, 6)
  }, [sel, vecs, all])

  const inSentence = new Set(sentenceWords)
  const near = new Set(neighbors.map(n => n.w))
  const role = (w: string): Role => w === sel ? 'selected' : near.has(w) ? 'neighbor' : inSentence.has(w) ? 'sentence' : 'base'
  const path = sentenceWords.filter(w => targets.has(w))
  const loading = mode === 'meaning' && !meaning.vectors
  const pct = meaning.progress.total ? Math.round((meaning.progress.loaded / meaning.progress.total) * 100) : 0

  return (
    <div className="space">
      <div className="space-canvas" onPointerDown={() => setTouched(true)}>
        <Canvas camera={{ position: [0, 1.6, 10], fov: 50 }} dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
          <fog attach="fog" args={['#0F2A4A', 9, 24]} />
          <gridHelper args={[14, 14, '#2E5680', '#1C3D63']} position={[0, -4.6, 0]} />
          {all.map(w => (
            <Point key={w} word={w} target={targets.get(w)!} role={role(w)} hovered={hovered === w} cur={cur} onSelect={setSelected} onHover={setHovered} />
          ))}
          {path.length > 1 && <Path key={'s' + path.join()} words={path} targets={targets} cur={cur} color={COLOR.sentence} width={2} />}
          {sel && neighbors.map(n => <Path key={sel + n.w} words={[sel, n.w]} targets={targets} cur={cur} color={COLOR.neighbor} width={1.2} />)}
          <OrbitControls enableDamping enablePan={false} minDistance={3} maxDistance={18} autoRotate={!touched && !reducedMotion()} autoRotateSpeed={0.45} />
        </Canvas>

        <div className="space-toolbar">
          <div className="seg" role="tablist" aria-label="Arrange words by">
            {(['spelling', 'meaning'] as Mode[]).map(m => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
                {mode === m && <motion.span layoutId="seg" className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span>By {m}</span>
              </button>
            ))}
          </div>
          <p className="space-note">
            {shown === 'spelling'
              ? 'Each word becomes a vector of its letter pairs and triples. Words that share chunks, like playing and played, land together.'
              : 'Each word is embedded by MiniLM, a small neural network trained on a billion sentences. Words used in similar ways, like king and queen, land together.'}
          </p>
        </div>

        <div className="legend" aria-hidden>
          <span><i style={{ background: COLOR.sentence }} />your sentence</span>
          <span><i style={{ background: COLOR.selected }} />selected</span>
          <span><i style={{ background: COLOR.neighbor }} />nearest</span>
        </div>

        <AnimatePresence>
          {loading && (
            <motion.div className="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {meaning.error ? (
                <>
                  <p>The meaning model failed to load: {meaning.error}</p>
                  <button className="btn small" onClick={() => setMode('spelling')}>Back to spelling view</button>
                </>
              ) : (
                <>
                  <div className="loader-orbit" aria-hidden>{[0, 1, 2, 3, 4, 5].map(i => <span key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>
                  <p>{pct < 100 ? `Downloading the meaning model, ${pct}%` : 'Embedding your words'}</p>
                  <div className="bar"><motion.span animate={{ width: `${pct}%` }} /></div>
                  <small>{(meaning.progress.loaded / 1e6).toFixed(1)} of {meaning.progress.total ? (meaning.progress.total / 1e6).toFixed(1) : '~23'} MB. Cached after the first visit.</small>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <aside className="inspector" aria-live="polite">
        {sel ? (
          <>
            <h3>{sel}</h3>
            <p className="muted">Closest by {shown}, measured in the full {vecs[0].length}-dimension space, not the 3D view.</p>
            <ol className="neighbors">
              {neighbors.map(n => (
                <li key={n.w}>
                  <button onClick={() => setSelected(n.w)}>{n.w}</button>
                  <span className="bar"><motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(0, n.s) * 100}%` }} /></span>
                  <span className="mono">{n.s.toFixed(2)}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <h3>Click a word</h3>
            <p className="muted">
              Drag to orbit, scroll to zoom. Pick any point to see its nearest neighbours. Then switch views and watch every
              word move to where the other way of measuring puts it.
            </p>
            <p className="muted">Your sentence is drawn as a gold path, word by word, through the space.</p>
          </>
        )}
      </aside>
    </div>
  )
}
