import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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

const L = 4.6 // half-size of the plot box; PCA output fits in ±4
const tmp = new THREE.Color()

// Soft radial sprite used for point halos and the sentence runner.
let glowTex: THREE.Texture | null = null
const glow = () => glowTex ??= (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()

// Principal axes with ticks and faint grid walls, so the space reads as a 3D plot.
const AXES: [string, string, THREE.Vector3][] = [
  ['PC1', '#F28482', new THREE.Vector3(1, 0, 0)],
  ['PC2', '#84DCC6', new THREE.Vector3(0, 1, 0)],
  ['PC3', '#8ECAE6', new THREE.Vector3(0, 0, 1)],
]
function Axes() {
  return (
    <group>
      <gridHelper args={[2 * L, 12, '#2E5680', '#1A3A5E']} position={[0, -L, 0]} />
      <gridHelper args={[2 * L, 12, '#24486F', '#163556']} position={[0, 0, -L]} rotation={[Math.PI / 2, 0, 0]} />
      <gridHelper args={[2 * L, 12, '#24486F', '#163556']} position={[-L, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
      {AXES.map(([name, color, d]) => (
        <group key={name}>
          <Line points={[d.clone().multiplyScalar(-L), d.clone().multiplyScalar(L)]} color={color} lineWidth={1.2} transparent opacity={0.65} />
          {[-4, -2, 2, 4].map(t => (
            <mesh key={t} position={d.clone().multiplyScalar(t)}><sphereGeometry args={[0.03, 8, 8]} /><meshBasicMaterial color={color} /></mesh>
          ))}
          <Html position={d.clone().multiplyScalar(L + 0.4)} center style={{ pointerEvents: 'none' }}>
            <span className="axis" style={{ color }}>{name}</span>
          </Html>
        </group>
      ))}
    </group>
  )
}

function Point({ word, target, role, hovered, delay, cur, onSelect, onHover }: {
  word: string; target: THREE.Vector3; role: Role; hovered: boolean; delay: number; cur: Positions
  onSelect: (w: string) => void; onHover: (w: string | null) => void
}) {
  const g = useRef<THREE.Group>(null!)
  const halo = useRef<THREE.Sprite>(null!)
  const still = useMemo(reducedMotion, [])
  const start = useRef<number | null>(null)
  useEffect(() => { start.current = null }, [target]) // each new layout replays as a staggered wave
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    let p = cur.get(word)
    if (!p) cur.set(word, (p = still ? target.clone() : new THREE.Vector3())) // new words are injected at the origin
    start.current ??= t + delay
    if (still || t >= start.current) p.lerp(target, still ? 1 : 1 - Math.exp(-dt * 4))
    g.current.position.copy(p)
    const pulse = role === 'selected' && !still ? 1 + 0.3 * Math.sin(t * 5) : 1
    halo.current.scale.setScalar((role === 'base' ? (hovered ? 0.8 : 0.42) : 1) * pulse)
  })
  return (
    <group ref={g}>
      <sprite ref={halo}>
        <spriteMaterial map={glow()} color={COLOR[role]} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={role === 'base' ? 0.55 : 0.95} />
      </sprite>
      <mesh scale={role !== 'base' || hovered ? 1.4 : 1}>
        <sphereGeometry args={[0.055, 16, 16]} />
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

// Every embedding drawn as a vector from the origin, fading in from the centre.
function Stems({ words, roleOf, cur }: { words: string[]; roleOf: (w: string) => Role; cur: Positions }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(words.length * 6), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(words.length * 6), 3))
    return g
  }, [words.length])
  useEffect(() => () => geo.dispose(), [geo])
  useFrame(() => {
    const pos = geo.attributes.position.array as Float32Array
    const col = geo.attributes.color.array as Float32Array
    words.forEach((w, i) => {
      const p = cur.get(w)
      if (!p) return
      const role = roleOf(w), k = role === 'base' ? 0.3 : 0.9
      tmp.set(COLOR[role])
      pos.set([0, 0, 0, p.x, p.y, p.z], i * 6)
      col.set([0, 0, 0, tmp.r * k, tmp.g * k, tmp.b * k], i * 6)
    })
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  })
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  )
}

// A light that travels your sentence word by word, in reading order.
function Runner({ words, cur }: { words: string[]; cur: Positions }) {
  const s = useRef<THREE.Sprite>(null!)
  useFrame(({ clock }) => {
    const pts = words.map(w => cur.get(w)).filter(Boolean) as THREE.Vector3[]
    if (pts.length < 2) return
    const f = (clock.elapsedTime * 1.3) % (pts.length - 1), i = Math.floor(f)
    s.current.position.lerpVectors(pts[i], pts[i + 1], f - i)
  })
  return (
    <sprite ref={s} scale={0.7}>
      <spriteMaterial map={glow()} color="#FFF1BF" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  )
}

// Glides the orbit centre to the selected word, and back to the origin when nothing is selected.
function Focus({ word, cur }: { word: string | null; cur: Positions }) {
  const controls = useThree(s => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const goal = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    if (!controls) return
    const p = word ? cur.get(word) : null
    if (p) goal.copy(p)
    else goal.set(0, 0, 0)
    controls.target.lerp(goal, 1 - Math.exp(-dt * 2.5))
    controls.update()
  })
  return null
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

// The raw embedding: one cell per dimension, gold for positive, blue for negative.
function Vector({ v }: { v: number[] }) {
  const m = Math.max(...v.map(Math.abs)) || 1
  return (
    <div className="vec" role="img" aria-label={`${v.length}-number vector`}>
      {v.map((x, i) => <i key={i} title={x.toFixed(3)} style={{ background: x >= 0 ? '#F2C14E' : '#8ECAE6', opacity: 0.08 + 0.92 * Math.abs(x) / m }} />)}
    </div>
  )
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

  const pca = useMemo(() => pca3(vecs), [vecs])
  const targets = useMemo(() => new Map(pca.points.map((p, i) => [all[i], new THREE.Vector3(...p)])), [pca, all])

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
  // shortcut: small config files finish before the model file starts, so measure against its known size; update if the model changes
  const total = Math.max(meaning.progress.total, 23.7e6)
  const pct = Math.round((meaning.progress.loaded / total) * 100)

  return (
    <div className="space">
      <div className="space-canvas" onPointerDown={() => setTouched(true)}>
        <Canvas camera={{ position: [7.5, 4.5, 9.5], fov: 45 }} dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
          <fog attach="fog" args={['#0B2240', 13, 30]} />
          <Axes />
          <Stems words={all} roleOf={role} cur={cur} />
          {all.map((w, i) => (
            <Point key={w} word={w} target={targets.get(w)!} role={role(w)} hovered={hovered === w} delay={(i % 120) * 0.012}
              cur={cur} onSelect={setSelected} onHover={setHovered} />
          ))}
          {path.length > 1 && <Path key={'s' + path.join()} words={path} targets={targets} cur={cur} color={COLOR.sentence} width={2.5} />}
          {path.length > 1 && !reducedMotion() && <Runner words={path} cur={cur} />}
          {sel && neighbors.map(n => <Path key={sel + n.w} words={[sel, n.w]} targets={targets} cur={cur} color={COLOR.neighbor} width={1.4} />)}
          <Focus word={sel} cur={cur} />
          <OrbitControls makeDefault enableDamping enablePan={false} minDistance={3} maxDistance={22} autoRotate={!touched && !reducedMotion()} autoRotateSpeed={0.4} />
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

        <div className="specs">
          <code>{shown === 'meaning' ? 'Xenova/all-MiniLM-L6-v2, q8 ONNX, mean-pooled, L2-normalised' : 'char 2/3-gram FNV-1a hash, L2-normalised'}</code>
          <code>float32[{all.length}×{vecs[0].length}] → PCA → [{all.length}×3], {Math.round(pca.kept * 100)}% variance kept</code>
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
                  <small>{(meaning.progress.loaded / 1e6).toFixed(1)} of {(total / 1e6).toFixed(1)} MB. Cached after the first visit.</small>
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
            <code className="coords">({targets.get(sel)!.toArray().map(x => x.toFixed(2)).join(', ')}) in PC space</code>
            <Vector v={vecs[all.indexOf(sel)]} />
            <p className="muted">Its {vecs[0].length} numbers above. Closest by {shown}, measured with all of them, not the 3D view:</p>
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
