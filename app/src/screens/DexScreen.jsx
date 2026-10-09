// My NaturDex: the album of species the child has found, read from
// IndexedDB (src/data/db.js).
import { useEffect, useState } from 'react'
import { listFinds } from '../data/db.js'
import { getTripFile } from '../data/tripData.js'
import { displayName } from '../ml/classifier.js'

function Photo({ blob, alt }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url && <img src={url} alt={alt} loading="lazy" />
}

export default function DexScreen() {
  const [entries, setEntries] = useState(null) // one per species, newest find first
  const [total, setTotal] = useState(null)

  useEffect(() => {
    ;(async () => {
      const finds = await listFinds()
      let catalog = { species: [] }
      try {
        catalog = JSON.parse(new TextDecoder().decode(await getTripFile('species')))
      } catch {
        // Not downloaded yet: the album still shows, without names
      }
      const byKey = new Map(catalog.species.map((s) => [s.key, s]))
      const grouped = new Map()
      for (const find of finds) {
        const entry = grouped.get(find.speciesKey) ?? { species: byKey.get(find.speciesKey), finds: [] }
        entry.finds.push(find)
        grouped.set(find.speciesKey, entry)
      }
      setEntries([...grouped.values()])
      setTotal(catalog.species.length || null)
    })()
  }, [])

  if (!entries) return <p>Loading…</p>

  return (
    <section>
      <h1>My NaturDex</h1>
      <p className="counter">
        <strong>{entries.length}</strong>
        {total && ` of ${total.toLocaleString('en')}`} species found
      </p>

      {entries.length === 0 && <p>You haven't found any species yet. Go outside and take a photo! 🌿</p>}

      <ul className="dex">
        {entries.map(({ species, finds }) => (
          <li key={finds[0].speciesKey}>
            <Photo blob={finds[0].photo} alt={species ? displayName(species) : 'Your photo'} />
            <div>
              <strong>{species ? displayName(species) : 'Unknown species'}</strong>
              {species && (
                <p>
                  <em>{species.scientific}</em> · {species.kind}
                </p>
              )}
              <p className="hint">
                {finds.length > 1 ? `Seen ${finds.length} times · ` : ''}
                {new Date(finds[0].foundAt).toLocaleDateString('en-GB')}
                {finds[0].position?.hidden && ' · 🛡️ place hidden'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
