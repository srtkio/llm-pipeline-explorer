import { expect, test } from 'vitest'
import { train, encode, decode, EOW } from './bpe'
import { pca3, spellingVector, cosine } from './vectors'
import { cluster, umap3 } from './layout'

test('umap and k-means separate obvious groups deterministically', () => {
  const ws = ['play', 'played', 'playing', 'player', 'plays', 'replay', 'zebra', 'zebras', 'zebu', 'zero', 'zeros', 'zest']
  const rows = ws.map(w => spellingVector(w))
  const a = umap3(rows), b = umap3(rows)
  expect(a).toEqual(b)
  expect(a).toHaveLength(ws.length)
  a.forEach(p => p.forEach(x => { expect(Number.isFinite(x)).toBe(true); expect(Math.abs(x)).toBeLessThanOrEqual(4.0001) }))
  const { of, names } = cluster(rows, ws)
  expect(of.slice(0, 6).every(c => c === of[0])).toBe(true) // all "play" words share a cluster
  expect(of[6]).not.toBe(of[0])
  expect(names[of[0]]).toMatch(/play/)
  expect(cluster([], [])).toEqual({ of: [], names: [] })
  const pts = [[0, 0, 0], [0.1, 0, 0], [0, 0.1, 0], [5, 5, 5], [5.1, 5, 5], [5, 5.1, 5]]
  const e = cluster(pts, ['a', 'b', 'c', 'x', 'y', 'z'], true)
  expect(e.of[0]).toBe(e.of[2])
  expect(e.of[3]).toBe(e.of[5])
  expect(e.of[0]).not.toBe(e.of[3])
  expect(e.names.every(Boolean)).toBe(true) // negative euclidean scores still yield a name
  expect(umap3(rows.slice(0, 3))).toHaveLength(3) // tiny inputs fall back to PCA
})

const corpus = 'the cat sat on the mat. the cats sat. lower lowest newer newest'

test('bpe roundtrips and learns frequent merges', () => {
  const m = train(corpus, 30)
  expect(m.merges[0]).toEqual({ a: 'a', b: 't' + EOW, count: 4 }) // cat, sat, mat, sat
  const toks = encode('the cats sat', m)
  expect(decode(toks)).toBe('the cats sat')
  expect(toks.some(t => t.text === 'the' + EOW)).toBe(true)
  expect(new Set(m.vocab.values()).size).toBe(m.vocab.size) // ids unique
})

test('bpe is deterministic and handles unseen chars', () => {
  expect(train(corpus, 20)).toEqual(train(corpus, 20))
  expect(encode('zzz', train(corpus, 20)).every(t => t.id === 0)).toBe(true)
})

test('spelling vectors cluster by spelling; pca returns 3d', () => {
  expect(cosine(spellingVector('playing'), spellingVector('player'))).toBeGreaterThan(
    cosine(spellingVector('playing'), spellingVector('mat')))
  const { points: pts, kept } = pca3(['cat', 'cats', 'mat', 'newest', 'lowest'].map(w => spellingVector(w)))
  expect(kept).toBeGreaterThan(0.5) // 5 points span at most 4 dims, so 3 PCs keep most variance
  expect(kept).toBeLessThanOrEqual(1.0001)
  expect(pts).toHaveLength(5)
  pts.forEach(p => { expect(p).toHaveLength(3); p.forEach(x => expect(Number.isFinite(x)).toBe(true)) })
})
