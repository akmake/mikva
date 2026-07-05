import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import HebrewCalendarPage from './pages/HebrewCalendarPage'

// אפליקציית המובייל = מסך "לוח עברי" בלבד (הלוח שבו מעדכנים ראיות, הפסק, בדיקה,
// טבילה). מסך "היום" (Dashboard) לא מנותב — Dashboard.jsx מיובא רק כדי לספק את
// DaySheet / getCellColors / SettingsSheet ש-HebrewCalendarPage משתמש בהם.
// HashRouter — בטוח לטעינת file:// בתוך ה-WebView של Capacitor.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HebrewCalendarPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
