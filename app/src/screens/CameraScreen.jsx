// Camera screen: takes a photo with the phone's camera, checks it isn't
// blurry or dark, asks the classifier which species it is and saves the find.
import { useEffect, useRef, useState } from 'react'
import SpeciesCard from '../components/SpeciesCard.jsx'
import { addFind } from '../data/db.js'
import { getPosition, protectPosition } from '../data/location.js'
import { isTripReady } from '../data/tripData.js'
import { classify, displayName, loadClassifier } from '../ml/classifier.js'
import { checkPhoto } from '../ml/photoQuality.js'

// Smaller copy of the photo for the album (saves space on old phones)
function shrink(image, maxSide = 1024) {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
}

export default function CameraScreen({ onGoPrepare }) {
  const input = useRef(null)
  const photo = useRef(null) // { image, position } of the photo being checked
  const [step, setStep] = useState('loading') // loading | not-prepared | idle | quality | thinking | result | saved | error
  const [preview, setPreview] = useState(null)
  const [quality, setQuality] = useState(null)
  const [result, setResult] = useState(null)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)

  // Load the model as soon as the screen opens, so the first photo is fast
  useEffect(() => {
    isTripReady().then((ready) => {
      if (!ready) return setStep('not-prepared')
      setStep('idle')
      loadClassifier().catch((e) => {
        setError(e.message)
        setStep('error')
      })
    })
  }, [])

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  function retake() {
    setResult(null)
    setQuality(null)
    setStep('idle')
    input.current?.click()
  }

  async function onPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // so the same file can be picked again
    if (!file) return
    setPreview(URL.createObjectURL(file))
    const image = await createImageBitmap(file) // respects the photo's rotation
    photo.current = { image, position: getPosition() } // GPS runs while the model thinks

    const check = checkPhoto(image)
    if (check.blurry || check.dark) {
      setQuality(check)
      setStep('quality')
      return
    }
    await identify()
  }

  async function identify() {
    setStep('thinking')
    try {
      setResult(await classify(photo.current.image))
      setStep('result')
    } catch (e) {
      setError(e.message)
      setStep('error')
    }
  }

  async function pick({ species, probability }) {
    const { image, position } = photo.current
    const { isNew } = await addFind({
      species,
      probability,
      photo: await shrink(image),
      position: protectPosition(await position, species),
    })
    setSaved({ species, isNew })
    setStep('saved')
  }

  return (
    <section>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />

      {step === 'not-prepared' && (
        <>
          <h1>Camera</h1>
          <p>NaturDex isn't ready yet: download the model and the species list first (you need wifi).</p>
          <button type="button" className="primary" onClick={onGoPrepare}>
            🎒 Prepare trip
          </button>
        </>
      )}

      {(step === 'idle' || step === 'loading') && (
        <>
          <h1>What did you find?</h1>
          <button type="button" className="primary big" onClick={() => input.current.click()}>
            📷 Take a photo
          </button>
          <p className="hint">Get close, and keep the plant or animal in the middle.</p>
        </>
      )}

      {preview && ['quality', 'thinking', 'result'].includes(step) && <img className="preview" src={preview} alt="Your photo" />}

      {step === 'quality' && (
        <div className="card">
          <h2>{quality.dark ? 'Too dark!' : 'Blurry photo!'}</h2>
          <p>{quality.dark ? 'Find more light, or move so the sun is behind you.' : 'Hold the phone still and tap the screen to focus.'}</p>
          <button type="button" className="primary" onClick={retake}>
            Take another photo
          </button>
          <button type="button" className="link" onClick={identify}>
            Try with this one anyway
          </button>
        </div>
      )}

      {step === 'thinking' && <p className="thinking">🔍 Looking closely…</p>}

      {step === 'result' && <SpeciesCard result={result} onPick={pick} onRetake={retake} />}

      {step === 'saved' && (
        <div className="card">
          <h2>{saved.isNew ? '🎉 New species!' : '✅ Saved!'}</h2>
          <p>
            {displayName(saved.species)} {saved.isNew ? 'is now in your NaturDex.' : 'was already in your NaturDex — great spotting!'}
          </p>
          {saved.species.safety.hide_location && (
            <p className="hint">🛡️ This species is threatened, so NaturDex won't save exactly where you found it.</p>
          )}
          <button type="button" className="primary" onClick={retake}>
            📷 Find another one
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="card">
          <p className="banner danger">Something went wrong: {error}</p>
          <button type="button" className="primary" onClick={retake}>
            Try again
          </button>
        </div>
      )}
    </section>
  )
}
