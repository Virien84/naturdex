// Trip data: the model and the species list, downloaded once on wifi
// ("Prepare trip") and kept in Cache Storage so the app works offline.

const BASE = import.meta.env.BASE_URL

// The model can be hosted elsewhere (e.g. Hugging Face) by setting VITE_MODEL_URL
export const FILES = {
  model: {
    url: import.meta.env.VITE_MODEL_URL || `${BASE}models/bioclip-image-int8.onnx`,
    label: 'BioCLIP model',
    approxMB: 87,
  },
  species: { url: `${BASE}species/species.json`, label: 'Species list', approxMB: 1 },
  embeddings: { url: `${BASE}species/species-embeddings.bin`, label: 'Species fingerprints', approxMB: 4 },
}

const CACHE_NAME = 'naturdex-trip-v1'

export async function isTripReady() {
  const cache = await caches.open(CACHE_NAME)
  const found = await Promise.all(Object.values(FILES).map((file) => cache.match(file.url)))
  return found.every(Boolean)
}

// Downloads every file, reporting progress as a number between 0 and 1
export async function prepareTrip(onProgress = () => {}) {
  const cache = await caches.open(CACHE_NAME)
  const totalBytes = Object.values(FILES).reduce((sum, file) => sum + file.approxMB * 1e6, 0)
  let doneBytes = 0

  for (const file of Object.values(FILES)) {
    const response = await fetch(file.url)
    if (!response.ok) throw new Error(`Could not download ${file.label} (${response.status})`)

    // Read the download in chunks to show a progress bar
    const reader = response.body.getReader()
    const chunks = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      doneBytes += value.length
      onProgress(Math.min(doneBytes / totalBytes, 0.99), file.label)
    }
    await cache.put(file.url, new Response(new Blob(chunks), { headers: response.headers }))
  }

  // Ask the browser not to delete our data when the phone runs low on space
  const persisted = (await navigator.storage?.persist?.()) ?? false
  onProgress(1)
  return { persisted }
}

// Returns a trip file as an ArrayBuffer, from the cache (offline) or the network
export async function getTripFile(name) {
  const { url } = FILES[name]
  const cache = await caches.open(CACHE_NAME)
  const response = (await cache.match(url)) || (await fetch(url))
  if (!response.ok) throw new Error(`Could not load ${FILES[name].label}`)
  return response.arrayBuffer()
}

export async function deleteTripData() {
  await caches.delete(CACHE_NAME)
}
