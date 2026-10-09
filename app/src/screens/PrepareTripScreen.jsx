// Prepare trip: on wifi, before leaving, downloads the BioCLIP model and the
// local species list so that everything works offline afterwards.
import { useEffect, useState } from 'react'
import { FILES, deleteTripData, isTripReady, prepareTrip } from '../data/tripData.js'

const TOTAL_MB = Object.values(FILES).reduce((sum, file) => sum + file.approxMB, 0)

export default function PrepareTripScreen({ onReady }) {
  const [status, setStatus] = useState('checking') // checking | missing | downloading | ready | error
  const [progress, setProgress] = useState({ value: 0, label: '' })
  const [error, setError] = useState(null)
  const [persisted, setPersisted] = useState(null)

  useEffect(() => {
    isTripReady().then((ready) => setStatus(ready ? 'ready' : 'missing'))
  }, [])

  async function download() {
    setStatus('downloading')
    try {
      const result = await prepareTrip((value, label) => setProgress((p) => ({ value, label: label ?? p.label })))
      setPersisted(result.persisted)
      setStatus('ready')
      onReady?.()
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  async function reset() {
    await deleteTripData()
    setStatus('missing')
  }

  return (
    <section>
      <h1>Prepare trip</h1>

      {status === 'checking' && <p>Checking…</p>}

      {(status === 'missing' || status === 'error') && (
        <>
          <p>
            Before the trip, connect to wifi and download what NaturDex needs to recognise plants and animals
            <strong> without internet</strong>.
          </p>
          <button type="button" className="primary" onClick={download}>
            Download ({TOTAL_MB} MB)
          </button>
          {error && <p className="banner danger">{error}. Check the wifi and try again.</p>}
        </>
      )}

      {status === 'downloading' && (
        <>
          <p>Downloading {progress.label}…</p>
          <progress value={progress.value} max="1" />
          <p className="hint">{Math.round(progress.value * 100)}%</p>
        </>
      )}

      {status === 'ready' && (
        <>
          <p className="banner ok">✅ Ready! NaturDex now works without internet.</p>
          {persisted === false && (
            <p className="hint">The browser may delete the data if the phone runs out of space. Install the app to avoid it.</p>
          )}
          <button type="button" className="link" onClick={reset}>
            Delete downloaded data
          </button>
        </>
      )}
    </section>
  )
}
