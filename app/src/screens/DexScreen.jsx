// My NaturDex: the album of species the child has found, read from
// IndexedDB (src/data/db.js).
import { useEffect, useState } from 'react'
import { listFinds } from '../data/db.js'
import { getTripFile } from '../data/tripData.js'
import KindChip from '../components/KindChip.jsx'
import { dexNumber, displayName, readCatalog } from '../ml/classifier.js'

function Photo({ blob, alt }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url && <img src={url} alt={alt} loading="lazy" />
}

export default function DexScreen({ onGoCamera }) {
  const [entries, setEntries] = useState(null) // one per species, newest find first
  const [total, setTotal] = useState(null)

  useEffect(() => {
    ;(async () => {
      const finds = await listFinds()
      let catalog = { species: [] }
      try {
        catalog = readCatalog(await getTripFile('species'))
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
      <div className="counter">
        <p>
          <span className="readout big">{String(entries.length).padStart(3, '0')}</span>
          {total && <span className="readout"> / {total}</span>} species found
        </p>
      </div>

      {entries.length === 0 && (
        <div className="card empty">
          <p>Your NaturDex is empty. Photograph a plant or an animal to add your first species.</p>
          <button type="button" className="primary" onClick={onGoCamera}>
            📷 Take a photo
          </button>
        </div>
      )}

      <ul className="dex">
        {entries.map(({ species, finds }) => (
          <li key={finds[0].speciesKey}>
            <Photo blob={finds[0].photo} alt={species ? displayName(species) : 'Your photo'} />
            <div>
              {species && <span className="readout">{dexNumber(species)}</span>}
              <strong className="dex-name">{species ? displayName(species) : 'Unknown species'}</strong>
              {species && (
                <p>
                  <em>{species.scientific}</em> <KindChip kind={species.kind} />
                </p>
              )}
              <p className="hint">
                {finds.length > 1 ? `Seen ${finds.length} times, last on ` : 'Found on '}
                {new Date(finds[0].foundAt).toLocaleDateString('en-GB')}
              </p>
              {finds[0].position?.hidden && <p className="hint">🛡️ Place hidden to protect it</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
