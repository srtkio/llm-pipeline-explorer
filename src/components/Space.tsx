import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { cosine, pca3, spellingVector, type Vec3 } from '../lib/vectors'
import { cluster, umap3 } from '../lib/layout'
import { reducedMotion } from '../lib/ui'

type Mode = 'spelling' | 'meaning'
type Proj = 'umap' | 'pca'
type Kind = 'base' | 'sentence' | 'neighbor' | 'selected'
type Positions = Map<string, THREE.Vector3>

const L = 4.6 // half-size of the plot box; layouts fit in ±4
const HUES = ['#F2C14E', '#F28482', '#84DCC6', '#B8B8FF', '#8ECAE6', '#F7B267', '#C3E88D', '#FFB3D9']
const GOLD = '#F2C14E'
const SIZE: Record<Kind, number> = { base: 1, sentence: 1.6, neighbor: 1.4, selected: 2 }
const hue = (c: number) => HUES[c % HUES.length]

// Meaning vectors come from MiniLM running in a worker; each word is embedded once and cached.
function useMeaning(words: string[], enabled: boolean) {
  const cache = useRef(new Map<string, number[]>())
  const worker = useRef<Worker | null>(null)
  const files = useRef(new Map<string, { loaded: number; total: number }>())
  const [version, setVersion] = useState(0)
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

  return { cache: cache.current, version, progress, error }
}

// A corner frame with ticks and a faint floor, so the space reads as a 3D plot.
function Frame({ proj }: { proj: Proj }) {
  const o = new THREE.Vector3(-L, -L, -L)
  const dirs = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
  return (
    <group>
      <gridHelper args={[2 * L, 10, '#2A5079', '#1B3A5E']} position={[0, -L, 0]}
        onUpdate={g => { const m = g.material as THREE.Material; m.transparent = true; m.opacity = 0.45 }} />
      {dirs.map((d, i) => (
        <group key={i}>
          <Line points={[o, o.clone().addScaledVector(d, 2 * L)]} color="#7F9AB8" lineWidth={1} />
          {[1, 2, 3, 4, 5].map(t => (
            <mesh key={t} position={o.clone().addScaledVector(d, (t * 2 * L) / 6)}>
              <boxGeometry args={[0.05, 0.05, 0.05]} />
              <meshBasicMaterial color="#7F9AB8" />
            </mesh>
          ))}
          <Html position={o.clone().addScaledVector(d, 2 * L + 0.45)} center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
            <span className="axis">{proj === 'umap' ? 'UMAP' : 'PC'} {i + 1}</span>
          </Html>
        </group>
      ))}
    </group>
  )
}

// A word. Injected words start at the origin and fly out after `delay`; others grow in place.
function Point({ word, target, color, kind, label, labelClass, inject, delay, launchKey, cur, onSelect, onHover }: {
  word: string; target: THREE.Vector3; color: string; kind: Kind; label: boolean; labelClass: string
  inject: boolean; delay: number; launchKey: number; cur: Positions
  onSelect: (w: string) => void; onHover: (w: string | null) => void
}) {
  const g = useRef<THREE.Group>(null!)
  const core = useRef<THREE.Mesh>(null!)
  const text = useRef<HTMLSpanElement>(null)
  const still = useMemo(reducedMotion, [])
  const start = useRef<number | null>(null)
  const scale = useRef(0)
  useEffect(() => {
    start.current = null
    if (inject && !still) cur.set(word, new THREE.Vector3())
  }, [launchKey]) // relaunch only on replay, not on every prop change
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    let p = cur.get(word)
    if (!p) cur.set(word, (p = inject && !still ? new THREE.Vector3() : target.clone()))
    start.current ??= t + (still ? 0 : delay)
    const live = t >= start.current
    if (live) p.lerp(target, still ? 1 : 1 - Math.exp(-dt * 4.5))
    g.current.position.copy(p)
    const want = live ? SIZE[kind] * (kind === 'selected' && !still ? 1 + 0.18 * Math.sin(t * 4) : 1) : 0
    scale.current += (want - scale.current) * (still ? 1 : 1 - Math.exp(-dt * 10))
    core.current.scale.setScalar(scale.current)
    if (text.current) text.current.style.opacity = live ? '' : '0'
  })
  return (
    <group ref={g}>
      <mesh ref={core}>
        <sphereGeometry args={[0.08, 20, 20]} />
        <meshBasicMaterial color={kind === 'selected' ? '#FFFFFF' : color} />
      </mesh>
      {/* larger invisible target so small points are easy to click */}
      <mesh onClick={e => { e.stopPropagation(); onSelect(word) }}
        onPointerOver={e => { e.stopPropagation(); onHover(word); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}>
        <sphereGeometry args={[0.24, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {label && (
        <Html center position={[0, 0.26, 0]} distanceFactor={10} style={{ pointerEvents: 'none' }} zIndexRange={[20, 10]}>
          <span ref={text} className={`label ${labelClass}`}>{word}</span>
        </Html>
      )}
    </group>
  )
}

// A sentence word's embedding drawn as an arrow from the origin.
function Arrow({ word, cur }: { word: string; cur: Positions }) {
  const line = useRef<any>(null)
  const head = useRef<THREE.Mesh>(null!)
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const grow = useRef(reducedMotion() ? 1 : 0)
  useFrame((_, dt) => {
    grow.current = Math.min(1, grow.current + dt * 1.6)
    const p = cur.get(word)
    const len = p ? p.length() * (1 - (1 - grow.current) ** 3) : 0
    head.current.visible = len > 0.3
    if (!p || len < 1e-4) { line.current?.geometry.setPositions([0, 0, 0, 0, 0, 0]); return }
    dir.copy(p).normalize()
    const tail = Math.max(0, len - 0.16) // stop the shaft at the cone's base
    line.current?.geometry.setPositions([0, 0, 0, dir.x * tail, dir.y * tail, dir.z * tail])
    head.current.position.copy(dir).multiplyScalar(tail + 0.04)
    head.current.quaternion.setFromUnitVectors(up, dir)
  })
  return (
    <group>
      <Line ref={line} points={[[0, 0, 0], [0, 0, 0]]} color={GOLD} lineWidth={1.6} transparent opacity={0.75} />
      <mesh ref={head}>
        <coneGeometry args={[0.07, 0.2, 14]} />
        <meshBasicMaterial color={GOLD} />
      </mesh>
    </group>
  )
}

// The sentence in reading order. Words not yet injected collapse onto the last injected one.
function SentencePath({ words, cur }: { words: string[]; cur: Positions }) {
  const ref = useRef<any>(null)
  useFrame(() => {
    let last: THREE.Vector3 | null = null
    const flat: number[] = []
    for (const w of words) {
      const p = cur.get(w)
      if (p && p.lengthSq() > 1e-6) last = p
      const q = last ?? new THREE.Vector3()
      flat.push(q.x, q.y, q.z)
    }
    ref.current?.geometry.setPositions(flat)
  })
  return <Line ref={ref} points={words.map(() => [0, 0, 0] as [number, number, number])} color={GOLD} lineWidth={2.4} transparent opacity={0.9} />
}

// A cluster's name, floating over the centre of its members.
function ClusterLabel({ name, color, members, cur, dim }: { name: string; color: string; members: string[]; cur: Positions; dim: boolean }) {
  const g = useRef<THREE.Group>(null!)
  const c = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    c.set(0, 0, 0)
    let n = 0
    let top = -Infinity
    for (const w of members) { const p = cur.get(w); if (p) { c.add(p); n++; top = Math.max(top, p.y) } }
    if (n) g.current.position.set(c.x / n, top + 0.55, c.z / n)
  })
  return (
    <group ref={g}>
      <Html center style={{ pointerEvents: 'none' }} zIndexRange={[9, 0]}>
        <span className="cl" style={{ color, opacity: dim ? 0.35 : 1 }}>{name}</span>
      </Html>
    </group>
  )
}

function Link({ from, to, cur }: { from: string; to: string; cur: Positions }) {
  const ref = useRef<any>(null)
  useFrame(() => {
    const a = cur.get(from), b = cur.get(to)
    if (a && b) ref.current?.geometry.setPositions([a.x, a.y, a.z, b.x, b.y, b.z])
  })
  return <Line ref={ref} points={[[0, 0, 0], [0, 0, 0]]} color="#FFFFFF" lineWidth={1} transparent opacity={0.45} />
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

// The raw embedding: one cell per dimension, gold for positive, blue for negative.
function Vector({ v }: { v: number[] }) {
  const m = Math.max(...v.map(Math.abs)) || 1
  return (
    <div className="vec" role="img" aria-label={`${v.length}-number vector`}>
      {v.map((x, i) => <i key={i} title={x.toFixed(3)} style={{ background: x >= 0 ? '#F2C14E' : '#8ECAE6', opacity: 0.08 + 0.92 * Math.abs(x) / m }} />)}
    </div>
  )
}

function Seg<T extends string>({ id, value, options, onChange, label }: { id: string; value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}>
          {value === v && <motion.span layoutId={id} className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span>{text}</span>
        </button>
      ))}
    </div>
  )
}

export default function Space({ corpusWords, sentenceWords }: { corpusWords: string[]; sentenceWords: string[] }) {
  const [mode, setMode] = useState<Mode>('meaning')
  const [proj, setProj] = useState<Proj>('umap')
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [replay, setReplay] = useState(0)
  const cur = useRef<Positions>(new Map()).current

  const base = corpusWords
  const baseSet = useMemo(() => new Set(base), [base])
  const extra = useMemo(() => [...new Set(sentenceWords.filter(w => !baseSet.has(w)))], [sentenceWords, baseSet])
  const wanted = useMemo(() => [...base, ...extra], [base, extra])

  const meaning = useMeaning(wanted, mode === 'meaning')
  const meaningReady = base.length > 0 && base.every(w => meaning.cache.has(w))
  const shown: Mode = mode === 'meaning' && meaningReady ? 'meaning' : 'spelling'
  const vec = (w: string) => shown === 'meaning' ? meaning.cache.get(w) : spellingVector(w)

  // The map is built from the training words only, so typing never reshuffles it.
  const baseKey = `${shown}|${proj}|${base.join(' ')}`
  const layout = useMemo(() => {
    const rows = base.map(w => vec(w)!)
    if (!rows.length) return { pos: [] as Vec3[], of: [] as number[], names: [] as string[][], kept: null as number | null, rows }
    const p = proj === 'pca' ? pca3(rows) : null
    const pos = p ? p.points : umap3(rows)
    const { of } = cluster(pos, base, true) // cluster what you see, so colours match the islands
    // Name each group by its two words closest to the group's mean vector in the full space.
    const names = [...new Set(of)].sort((a, b) => a - b).map(c => {
      const idx = of.flatMap((o, i) => o === c ? [i] : [])
      const mean = rows[0].map((_, d) => idx.reduce((s, i) => s + rows[i][d], 0))
      return idx.sort((a, b) => cosine(rows[b], mean) - cosine(rows[a], mean)).slice(0, 2).map(i => base[i])
    })
    return { pos, of, names, kept: p ? p.kept : null, rows }
  }, [baseKey]) // baseKey captures base, shown and proj

  // Typed words that aren't in the training text land between their 3 nearest training words.
  const extras = useMemo(() => extra.flatMap(w => {
    const v = vec(w)
    if (!v || !layout.rows.length) return []
    const near = layout.rows.map((r, i) => ({ i, s: cosine(v, r) })).sort((a, b) => b.s - a.s).slice(0, 3)
    const wt = near.map(n => Math.max(n.s, 0.01)), W = wt.reduce((s, x) => s + x, 0)
    const p = [0, 1, 2].map(k => near.reduce((s, n, j) => s + layout.pos[n.i][k] * wt[j], 0) / W) as Vec3
    return [{ w, p, c: layout.of[near[0].i], v }]
  }), [extra, layout, meaning.version]) // vec depends on shown, captured via layout

  const all = useMemo(() => [...base, ...extras.map(e => e.w)], [base, extras])
  const targets = useMemo(() => new Map<string, THREE.Vector3>([
    ...base.map((w, i) => [w, new THREE.Vector3(...layout.pos[i])] as const),
    ...extras.map(e => [e.w, new THREE.Vector3(...e.p)] as const),
  ]), [base, extras, layout])
  const clusterOf = useMemo(() => new Map<string, number>([...base.map((w, i) => [w, layout.of[i]] as const), ...extras.map(e => [e.w, e.c] as const)]), [base, extras, layout])
  const members = useMemo(() => layout.names.map((_, c) => all.filter(w => clusterOf.get(w) === c)), [layout, all, clusterOf])

  const sel = selected && targets.has(selected) ? selected : null
  const neighbors = useMemo(() => {
    if (!sel) return []
    const v = vec(sel)!
    return all.filter(w => w !== sel).map(w => ({ w, s: cosine(v, vec(w)!) })).sort((a, b) => b.s - a.s).slice(0, 6)
  }, [sel, all, layout]) // layout changes whenever the vectors do

  const path = sentenceWords.filter(w => targets.has(w))
  const order = useMemo(() => { const m = new Map<string, number>(); path.forEach((w, i) => { if (!m.has(w)) m.set(w, i) }); return m }, [path.join(' ')])
  const near = new Set(neighbors.map(n => n.w))
  const kind = (w: string): Kind => w === sel ? 'selected' : near.has(w) ? 'neighbor' : order.has(w) ? 'sentence' : 'base'

  const loading = mode === 'meaning' && !meaningReady
  // shortcut: small config files finish before the model file starts, so measure against its known size; update if the model changes
  const total = Math.max(meaning.progress.total, 23.7e6)
  const pct = Math.round((meaning.progress.loaded / total) * 100)
  const dims = all.length ? vec(all[0])!.length : 0

  return (
    <div className="space">
      <div className="space-canvas" onPointerDown={() => setTouched(true)}>
        <Canvas camera={{ position: [7.2, 4.6, 8.8], fov: 42 }} dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
          <fog attach="fog" args={['#0B2240', 16, 30]} />
          <Frame proj={proj} />
          {all.map((w, i) => {
            const k = kind(w), o = order.get(w)
            return (
              <Point key={w} word={w} target={targets.get(w)!} color={hue(clusterOf.get(w) ?? 0)} kind={k}
                label={k !== 'base' || hovered === w}
                labelClass={hovered === w && k === 'base' ? 'w-hover' : `w-${k}`}
                inject={o !== undefined || !baseSet.has(w)} launchKey={o !== undefined ? replay : 0}
                delay={o !== undefined ? 0.4 + o * 0.35 : i * 0.006}
                cur={cur} onSelect={setSelected} onHover={setHovered} />
            )
          })}
          {[...order.keys()].map(w => <Arrow key={w} word={w} cur={cur} />)}
          {path.length > 1 && <SentencePath words={path} cur={cur} />}
          {layout.names.map((n, c) => members[c].length > 1 && (
            <ClusterLabel key={`${shown}-${proj}-${c}`} name={n.join(', ')} color={hue(c)} members={members[c]} cur={cur} dim={!!sel && clusterOf.get(sel) !== c} />
          ))}
          {sel && neighbors.map(n => <Link key={sel + n.w} from={sel} to={n.w} cur={cur} />)}
          <Focus word={sel} cur={cur} />
          <OrbitControls makeDefault enableDamping enablePan={false} minDistance={4} maxDistance={24} autoRotate={!touched && !reducedMotion()} autoRotateSpeed={0.35} />
        </Canvas>

        <div className="space-toolbar">
          <Seg id="seg-mode" label="Measure similarity by" value={mode} onChange={setMode} options={[['meaning', 'Meaning'], ['spelling', 'Spelling']]} />
          <Seg id="seg-proj" label="Projection" value={proj} onChange={setProj} options={[['umap', 'UMAP'], ['pca', 'PCA']]} />
        </div>

        <div className="space-foot">
          <button className="ghost" onClick={() => setReplay(r => r + 1)} disabled={!path.length}>Replay sentence</button>
          <code>
            {shown === 'meaning' ? 'MiniLM-L6-v2 q8' : 'char 2/3-gram hash'} float32[{all.length}×{dims}] → {proj === 'umap' ? 'UMAP (k=10, cosine)' : `PCA, ${Math.round((layout.kept ?? 0) * 100)}% variance kept`} → [{all.length}×3], k-means k={layout.names.length}, stopwords hidden
          </code>
        </div>

        <AnimatePresence>
          {loading && (
            <motion.div className="loading-pill" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              {meaning.error ? (
                <>
                  <span>Meaning model failed to load, showing spelling.</span>
                  <button className="ghost" onClick={() => setMode('spelling')}>OK</button>
                </>
              ) : (
                <>
                  <span>{pct < 100 ? `Loading meaning model, ${(meaning.progress.loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB` : 'Embedding your words'}</span>
                  <span className="bar"><motion.span animate={{ width: `${pct}%` }} /></span>
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
            <code className="coords">({targets.get(sel)!.toArray().map(x => x.toFixed(2)).join(', ')}) in {proj.toUpperCase()} space</code>
            <Vector v={vec(sel)!} />
            <p className="muted">Its {dims} numbers. Nearest by {shown}, by cosine similarity over all of them:</p>
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
            <h3>{layout.names.length} clusters</h3>
            <p className="muted">Groups found by k-means on the map. Pick one, or click any point.</p>
            <ul className="clusters">
              {layout.names.map((n, c) => (
                <li key={c}>
                  <button onClick={() => setSelected(n[0])}>
                    <i style={{ background: hue(c) }} />{n.join(', ')}<span className="mono">{members[c].length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  )
}
