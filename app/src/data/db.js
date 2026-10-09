// Local database (IndexedDB, through the idb library): stores the species
// found, their photos, the date and where. It never leaves the phone.
import { openDB } from 'idb'

const dbPromise = openDB('naturdex', 1, {
  upgrade(db) {
    const finds = db.createObjectStore('finds', { keyPath: 'id', autoIncrement: true })
    finds.createIndex('speciesKey', 'speciesKey')
  },
})

// Saves a find. `position` is already coarse for threatened species (see location.js).
export async function addFind({ species, photo, position, probability }) {
  const db = await dbPromise
  const isNew = (await db.countFromIndex('finds', 'speciesKey', species.key)) === 0
  await db.add('finds', {
    speciesKey: species.key,
    photo, // a Blob (JPEG)
    position, // { lat, lon, accuracy, hidden } or null
    probability,
    foundAt: new Date().toISOString(),
  })
  return { isNew }
}

export async function listFinds() {
  const db = await dbPromise
  return (await db.getAll('finds')).reverse() // newest first
}

export async function countSpeciesFound() {
  const db = await dbPromise
  // Walk the species index visiting each species only once ('nextunique')
  let count = 0
  let cursor = await db.transaction('finds').store.index('speciesKey').openKeyCursor(null, 'nextunique')
  while (cursor) {
    count++
    cursor = await cursor.continue()
  }
  return count
}
