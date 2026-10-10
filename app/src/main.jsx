import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled (not loaded from Google) so the app works offline
import '@fontsource-variable/baloo-2'
import '@fontsource/silkscreen/latin-400.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
