// Byte-pair encoding trained in the browser, character-level with an end-of-word marker.
export const EOW = '</w>'
export const UNK = '[UNK]'

export type Merge = { a: string; b: string; count: number }
export type Model = { merges: Merge[]; vocab: Map<string, number>; base: number } // ids below `base` are [UNK] + single characters
export type Token = { text: string; id: number; word: number }

export const words = (text: string) => text.toLowerCase().match(/[a-z0-9']+|[^\sa-z0-9']/g) ?? []

const split = (w: string) => [...w.slice(0, -1)].concat(w.slice(-1) + EOW)

export function train(corpus: string, numMerges: number): Model {
  const freq = new Map<string, number>()
  for (const w of words(corpus)) freq.set(w, (freq.get(w) ?? 0) + 1)
  let seqs = [...freq].map(([w, n]) => ({ parts: split(w), n }))

  const base = new Set<string>()
  seqs.forEach(s => s.parts.forEach(p => base.add(p)))
  const vocab = new Map<string, number>([[UNK, 0]])
  ;[...base].sort().forEach(t => vocab.set(t, vocab.size))

  const baseSize = vocab.size
  const merges: Merge[] = []
  for (let i = 0; i < numMerges; i++) {
    const pairs = new Map<string, number>()
    for (const { parts, n } of seqs)
      for (let j = 0; j < parts.length - 1; j++) {
        const k = parts[j] + '\u0000' + parts[j + 1]
        pairs.set(k, (pairs.get(k) ?? 0) + n)
      }
    let best = '', bestN = 1 // a pair seen once teaches nothing
    for (const [k, n] of pairs) if (n > bestN || (n === bestN && best && k < best)) { best = k; bestN = n }
    if (!best) break
    const [a, b] = best.split('\u0000')
    merges.push({ a, b, count: bestN })
    if (!vocab.has(a + b)) vocab.set(a + b, vocab.size) // "t"+"he" and "th"+"e" both yield "the"
    seqs = seqs.map(s => ({ ...s, parts: applyMerge(s.parts, a, b) }))
  }
  return { merges, vocab, base: baseSize }
}

function applyMerge(parts: string[], a: string, b: string) {
  const out: string[] = []
  for (let i = 0; i < parts.length; i++) {
    if (i < parts.length - 1 && parts[i] === a && parts[i + 1] === b) { out.push(a + b); i++ }
    else out.push(parts[i])
  }
  return out
}

// `upTo` replays only the first N merges, used by the merge-timeline scrubber.
export function encode(text: string, model: Model, upTo = model.merges.length): Token[] {
  const out: Token[] = []
  words(text).forEach((w, wi) => {
    let parts = split(w)
    for (const m of model.merges.slice(0, upTo)) parts = applyMerge(parts, m.a, m.b)
    for (const p of parts) out.push({ text: p, id: model.vocab.get(p) ?? 0, word: wi })
  })
  return out
}

export const decode = (tokens: Token[]) =>
  tokens.map(t => t.text).join('').split(EOW).filter(Boolean).join(' ')
