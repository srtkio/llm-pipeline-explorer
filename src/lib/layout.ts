import { UMAP } from 'umap-js'
import { cosine, pca3, type Vec3 } from './vectors'

// Deterministic PRNG so the same words always produce the same picture.
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Centre each axis on its median and scale it so 95% of points fall within ±3.6, clamping outliers to ±4.
// Per-axis scaling is fine here because UMAP axes carry no meaning of their own.
function fit4(pts: number[][]): Vec3[] {
  const axis = [0, 1, 2].map(k => {
    const v = pts.map(p => p[k]).sort((a, b) => a - b)
    const mid = v[Math.floor(v.length / 2)]
    const dev = v.map(x => Math.abs(x - mid)).sort((a, b) => a - b)
    return { mid, s: dev[Math.min(dev.length - 1, Math.floor(dev.length * 0.95))] || 1 }
  })
  return pts.map(p => axis.map(({ mid, s }, k) => Math.max(-4, Math.min(4, ((p[k] - mid) / s) * 3.6))) as Vec3)
}

// UMAP keeps neighbourhoods, so clusters stay separate instead of collapsing into one blob.
// Rows must be L2-normalised (both vector sources are), so 1 - dot is cosine distance.
export function umap3(rows: number[][]): Vec3[] {
  if (rows.length < 6) return pca3(rows).points // too few points for a neighbour graph
  const u = new UMAP({
    nComponents: 3,
    nNeighbors: Math.min(10, rows.length - 1),
    minDist: 0.08,
    spread: 1,
    nEpochs: 300,
    random: mulberry32(7),
    distanceFn: (a, b) => 1 - cosine(a, b),
  })
  return fit4(u.fit(rows))
}

export type Clusters = { of: number[]; names: string[] }

const dist2 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0)

// k-means with k-means++ seeding. Spherical (cosine) by default for embeddings;
// `euclid` for low-dimensional layout coordinates. Each cluster is named by its member nearest the centroid.
export function cluster(rows: number[][], labels: string[], euclid = false): Clusters {
  const sim = euclid ? (a: number[], b: number[]) => -dist2(a, b) : cosine
  const gap = euclid ? dist2 : (a: number[], b: number[]) => Math.max(0, 1 - cosine(a, b)) ** 2 // squared distance for seeding
  const n = rows.length
  if (n === 0) return { of: [], names: [] }
  const k = Math.max(1, Math.min(8, Math.round(Math.sqrt(n / 2.5))))
  const rand = mulberry32(11)
  const centers = [rows[Math.floor(rand() * n)]]
  while (centers.length < k) {
    const d = rows.map(r => Math.min(...centers.map(c => gap(r, c))))
    let pick = rand() * d.reduce((s, x) => s + x, 0), i = 0
    while (i < n - 1 && (pick -= d[i]) > 0) i++
    centers.push(rows[i])
  }
  let of = new Array(n).fill(0)
  for (let it = 0; it < 30; it++) {
    const next = rows.map(r => centers.reduce((best, c, j) => sim(r, c) > sim(r, centers[best]) ? j : best, 0))
    const same = next.every((c, i) => c === of[i])
    of = next
    centers.forEach((_, j) => {
      const members = rows.filter((_, i) => of[i] === j)
      if (!members.length) return
      const sum = members[0].map((_, d) => members.reduce((s, m) => s + m[d], 0))
      const len = euclid ? members.length : Math.hypot(...sum) || 1
      centers[j] = sum.map(x => x / len)
    })
    if (same && it > 0) break
  }
  const names = centers.map((c, j) => {
    let best = -Infinity, name = ''
    rows.forEach((r, i) => { if (of[i] === j && sim(r, c) > best) { best = sim(r, c); name = labels[i] } })
    return name
  })
  return { of, names }
}
