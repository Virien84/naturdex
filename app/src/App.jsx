import { useState } from 'react'
import CameraScreen from './screens/CameraScreen.jsx'
import DexScreen from './screens/DexScreen.jsx'
import PrepareTripScreen from './screens/PrepareTripScreen.jsx'

const TABS = {
  camera: '📷 Camera',
  dex: '📖 My NaturDex',
  prepare: '🎒 Prepare trip',
}

function App() {
  const [screen, setScreen] = useState('camera')

  return (
    <>
      <main>
        {screen === 'camera' && <CameraScreen onGoPrepare={() => setScreen('prepare')} />}
        {screen === 'dex' && <DexScreen />}
        {screen === 'prepare' && <PrepareTripScreen />}
      </main>
      <nav className="tabs">
        {Object.entries(TABS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={key === screen ? 'page' : undefined}
            onClick={() => setScreen(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}

export default App
