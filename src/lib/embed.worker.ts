import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

let extractor: Promise<FeatureExtractionPipeline> | null = null

self.onmessage = async (e: MessageEvent<{ id: number; words: string[] }>) => {
  try {
    extractor ??= pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',
      progress_callback: (p: { status: string; progress?: number; file?: string }) =>
        self.postMessage({ type: 'progress', ...p }),
    }) as Promise<FeatureExtractionPipeline>
    const out = await (await extractor)(e.data.words, { pooling: 'mean', normalize: true })
    self.postMessage({ type: 'result', id: e.data.id, vectors: out.tolist() })
  } catch (err) {
    extractor = null
    self.postMessage({ type: 'error', id: e.data.id, message: String(err) })
  }
}
