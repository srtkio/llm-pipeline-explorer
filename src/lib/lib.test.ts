import { expect, test } from 'vitest'
import { train, encode, decode, EOW } from './bpe'
import { pca3, spellingVector, cosine } from './vectors'

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
