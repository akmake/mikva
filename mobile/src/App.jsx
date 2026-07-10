import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import HebrewCalendarPage from './pages/HebrewCalendarPage'
import MapPage from './pages/MapPage'
import SideNav from './components/SideNav'

// אפליקציית המובייל = שני מסכים בלבד, אופליין מלא:
//   • "/"     — לוח עברי (מסך הפתיחה; מעדכנים בו ראיות, הפסק, בדיקה, טבילה)
//   • "/map"  — מפת מקוואות (183 מקוואות + אריחי מפה מוטמעים במכשיר)
// הניווט בין המסכים דרך תפריט צד (SideNav) — כפתור המבורגר צף בכל מסך.
// Dashboard.jsx מיובא בתוך HebrewCalendarPage רק בשביל DaySheet/getCellColors/
// SettingsSheet — הוא עצמו לא מנותב.
// HashRouter — בטוח לטעינת file:// בתוך ה-WebView של Capacitor.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HebrewCalendarPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SideNav />
    </HashRouter>
  )
}
