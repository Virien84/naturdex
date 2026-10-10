// Classifier: runs BioCLIP's image encoder (ONNX) with onnxruntime-web and
// compares the photo's embedding with the species embeddings precomputed on
// a laptop (see ../embeddings). Everything happens on the phone.
//
// Thresholds measured with embeddings/evaluate.py on 232 real photos:
//   top probability >= 70%  -> right 84% of the time ("It's a ...!")
//   40% to 70%              -> right ~45%, but usually in the top 3 ("Which one is it?")
//   below 40%               -> right 7% ("Not sure, take another photo")
import * as ort from 'onnxruntime-web'
import { getTripFile } from '../data/tripData.js'

export const CONFIDENT = 0.7
export const UNSURE = 0.4
// Any top-5 candidate at least this likely shows its safety warning (see SAFETY.md)
export const PRECAUTION = 0.05

export const UNSURE_REMINDER =
  "Remember: never get close to snakes, and never touch mushrooms or plants you don't know."

let loading = null

// Parses species.json and gives every species its NaturDex number (No. 0001…),
// in the same order as the embeddings file
export function readCatalog(bytes) {
  const catalog = JSON.parse(new TextDecoder().decode(bytes))
  catalog.species.forEach((species, i) => (species.number = i + 1))
  return catalog
}

// "No. 0042"
export function dexNumber(species) {
  return `No. ${String(species.number).padStart(4, '0')}`
}

// Loads the model and the species list once; later calls reuse them
export function loadClassifier() {
  loading ??= (async () => {
    const [modelBytes, speciesBytes, embeddingBytes] = await Promise.all([
      getTripFile('model'),
      getTripFile('species'),
      getTripFile('embeddings'),
    ])
    const catalog = readCatalog(speciesBytes)
    const session = await ort.InferenceSession.create(new Uint8Array(modelBytes), {
      executionProviders: ['wasm'],
    })
    return {
      session,
      info: catalog.model,
      species: catalog.species,
      embeddings: new Float32Array(embeddingBytes),
    }
  })()
  // If loading fails (e.g. files not downloaded yet), allow trying again later
  loading.catch(() => (loading = null))
  return loading
}

// Photo -> 1x3xSxS tensor: resize the short side, center crop, normalize.
// Same steps as preprocess() in embeddings/evaluate.py.
function preprocess(image, { image_size: size, mean, std }) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.imageSmoothingQuality = 'high'
  const side = Math.min(image.width, image.height)
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size)

  const { data } = context.getImageData(0, 0, size, size) // RGBA, row by row
  const pixels = new Float32Array(3 * size * size) // RRR...GGG...BBB
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) {
      pixels[c * size * size + i] = (data[i * 4 + c] / 255 - mean[c]) / std[c]
    }
  }
  return new ort.Tensor('float32', pixels, [1, 3, size, size])
}

// Identifies the species in a photo (ImageBitmap, <img> or <canvas>)
export async function classify(image) {
  const { session, info, species, embeddings } = await loadClassifier()
  const output = await session.run({ pixels: preprocess(image, info) })
  const vector = output.embedding.data // 512 numbers, already normalized
  const size = vector.length

  // Cosine similarity with every species, then softmax -> probabilities
  const logits = new Float32Array(species.length)
  for (let s = 0; s < species.length; s++) {
    let dot = 0
    for (let d = 0; d < size; d++) dot += embeddings[s * size + d] * vector[d]
    logits[s] = info.logit_scale * dot
  }
  const max = Math.max(...logits)
  const exps = logits.map((l) => Math.exp(l - max))
  const total = exps.reduce((a, b) => a + b, 0)

  const candidates = [...exps.keys()]
    .sort((a, b) => exps[b] - exps[a])
    .slice(0, 5)
    .map((i) => ({ species: species[i], probability: exps[i] / total }))

  const top = candidates[0].probability
  const verdict = top >= CONFIDENT ? 'confident' : top >= UNSURE ? 'maybe' : 'unsure'
  return { candidates, verdict, warnings: precautionWarnings(candidates) }
}

// Warnings of every likely candidate, "danger" first, without repeats
function precautionWarnings(candidates) {
  const severity = { danger: 0, caution: 1 }
  const seen = new Set()
  return candidates
    .filter(({ species, probability }) => species.safety.level && probability >= PRECAUTION)
    .sort((a, b) => severity[a.species.safety.level] - severity[b.species.safety.level])
    .filter(({ species }) => !seen.has(species.safety.warning) && seen.add(species.safety.warning))
    .map(({ species }) => ({ level: species.safety.level, text: species.safety.warning, species }))
}

// "a European Robin", "an Asian Hornet", "an earwig" (when there's no common name)
export function withArticle(species) {
  const name = species.en ?? species.kind
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`
}

// "European Robin", or "An earwig" when the species has no common name
export function displayName(species) {
  if (species.en) return species.en
  const name = withArticle(species)
  return name[0].toUpperCase() + name.slice(1)
}
