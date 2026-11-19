# Tokenscope: a live LLM pipeline explorer

Follow a sentence through the first stages of a language model, live in the browser.

1. **Train a tokenizer.** Byte-pair encoding (BPE), written from scratch and trained on your own text. A merge-replay scrubber plays back each merge it learns while the vocabulary grows.
2. **Encode a sentence.** As you type, the sentence is split into tokens and you see each token's ID. Characters the tokenizer never saw become `[UNK]`.
3. **Place every word in space.** An interactive 3D map of the words, with two views:
   - **By spelling.** Vectors built from each word's character n-grams (letter pairs and triples), so words with shared chunks like `playing` and `played` cluster together.
   - **By meaning.** Embeddings from `all-MiniLM-L6-v2`, run on your own device with transformers.js in a Web Worker, so words like `king` and `queen` cluster together.

   The map is laid out with UMAP (or PCA, with the variance it keeps) and coloured by k-means groups, each named by its two most central words. Your sentence's words are injected as vectors from the origin and joined in reading order. Click a word to see its raw vector and nearest neighbours by cosine similarity. Stopwords are hidden from the map.

No server is involved.

## Run

```bash
npm install
npm run dev      # local dev server
npx vitest run   # unit tests for the BPE, the spelling vectors and the PCA
npm run build    # static build in dist/
```

## Layout

| Path | What |
|---|---|
| `src/lib/bpe.ts` | BPE training, encoding and decoding |
| `src/lib/vectors.ts` | spelling vectors, cosine similarity, PCA to 3D |
| `src/lib/layout.ts` | UMAP to 3D, k-means clustering |
| `src/lib/embed.worker.ts` | MiniLM feature extraction in a worker |
| `src/components/` | Intro loader, Hero, Train, Encode, Space (3D, lazy-loaded) |

The stack is Vite, React, TypeScript, three.js / react-three-fiber, framer-motion and transformers.js. It's deployed on Vercel as a static site.
