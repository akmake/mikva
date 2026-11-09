import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/geoShim.js' // מנתב navigator.geolocation לפלאגין Capacitor על native
// גופנים מוטמעים (אופליין): כותרות בסריף עברי, גוף וממשק ב-Heebo
import '@fontsource/frank-ruhl-libre/hebrew-400.css'
import '@fontsource/frank-ruhl-libre/hebrew-500.css'
import '@fontsource/frank-ruhl-libre/hebrew-700.css'
import '@fontsource/frank-ruhl-libre/latin-400.css'
import '@fontsource/frank-ruhl-libre/latin-500.css'
import '@fontsource/heebo/hebrew-300.css'
import '@fontsource/heebo/hebrew-400.css'
import '@fontsource/heebo/hebrew-500.css'
import '@fontsource/heebo/hebrew-600.css'
import '@fontsource/heebo/hebrew-700.css'
import '@fontsource/heebo/latin-300.css'
import '@fontsource/heebo/latin-400.css'
import '@fontsource/heebo/latin-500.css'
import '@fontsource/heebo/latin-600.css'
import '@fontsource/heebo/latin-700.css'
import './index.css'
import './styles/tahara-home.css'
import './styles/tahara-calendar.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
