export type Vec3 = [number, number, number]

// Spelling vector: hashed character trigrams (with word boundaries), L2-normalised.
export function spellingVector(word: string, dims = 96): number[] {
  const v = new Array(dims).fill(0)
  const s = `^${word}$`
  for (let n = 2; n <= 3; n++)
    for (let i = 0; i + n <= s.length; i++) {
      let h = 2166136261 // FNV-1a
      for (const c of s.slice(i, i + n)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
      v[(h >>> 0) % dims] += 1
    }
  return normalize(v)
}

export function normalize(v: number[]) {
  const n = Math.hypot(...v) || 1
  return v.map(x => x / n)
}

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)

// PCA to 3D via power iteration with deflation on the covariance matrix.
// `kept` is the share of total variance the three components explain.
export function pca3(rows: number[][]): { points: Vec3[]; kept: number } {
  if (rows.length === 0) return { points: [], kept: 0 }
  const d = rows[0].length
  const mean = new Array(d).fill(0)
  rows.forEach(r => r.forEach((x, i) => (mean[i] += x / rows.length)))
  const X = rows.map(r => r.map((x, i) => x - mean[i]))
  const C = Array.from({ length: d }, () => new Array(d).fill(0))
  for (const r of X) for (let i = 0; i < d; i++) if (r[i]) for (let j = 0; j < d; j++) C[i][j] += r[i] * r[j]

  const comps: number[][] = []
  for (let k = 0; k < 3; k++) {
    let v = Array.from({ length: d }, (_, i) => Math.sin(i * 12.9898 + k * 78.233)) // deterministic seed
    for (let it = 0; it < 80; it++) {
      const w = C.map(row => row.reduce((s, x, j) => s + x * v[j], 0))
      for (const c of comps) { const p = cosine(w, c); w.forEach((_, i) => (w[i] -= p * c[i])) }
      v = normalize(w)
    }
    comps.push(v)
  }
  const trace = C.reduce((s, row, i) => s + row[i], 0) || 1
  const kept = comps.reduce((s, c) => s + cosine(c, C.map(row => cosine(row, c))), 0) / trace
  const pts = X.map(r => comps.map(c => cosine(r, c)) as Vec3)
  const scale = Math.max(...pts.flat().map(Math.abs)) || 1
  return { points: pts.map(p => p.map(x => (x / scale) * 4) as Vec3), kept } // fit into a ±4 cube
}
