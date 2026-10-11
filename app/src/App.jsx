import { useState } from 'react'
import CameraScreen from './screens/CameraScreen.jsx'
import DexScreen from './screens/DexScreen.jsx'
import PrepareTripScreen from './screens/PrepareTripScreen.jsx'

// The device's physical buttons; the camera is the big one in the middle
const BUTTONS = [
  { key: 'dex', icon: '📖', label: 'My NaturDex' },
  { key: 'camera', icon: '📷', label: 'Camera' },
  { key: 'prepare', icon: '🎒', label: 'Prepare trip' },
]

function App() {
  const [screen, setScreen] = useState('camera')
  // Pressing a button always starts that screen afresh (e.g. the camera after
  // "New species!"), because a new key makes React mount it again
  const [visit, setVisit] = useState(0)
  function go(key) {
    setScreen(key)
    setVisit((v) => v + 1)
  }

  return (
    <div className="device">
      <header className="shell-top">
        <span className="lens" aria-hidden="true" />
        <span className="leds" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="brand">NaturDex</span>
      </header>

      <main className="screen">
        <div className="lcd">
          {screen === 'camera' && <CameraScreen key={visit} onGoPrepare={() => go('prepare')} />}
          {screen === 'dex' && <DexScreen key={visit} onGoCamera={() => go('camera')} />}
          {screen === 'prepare' && <PrepareTripScreen key={visit} />}
        </div>
      </main>

      <nav className="pad">
        {BUTTONS.map(({ key, icon, label }) => (
          <button
            key={key}
            type="button"
            className={`pad-button pad-${key}`}
            aria-current={key === screen ? 'page' : undefined}
            onClick={() => go(key)}
          >
            <span className="pad-icon" aria-hidden="true">
              {icon}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
