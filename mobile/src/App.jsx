import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './AppState'
import Today from './screens/Today'
import Calendar from './screens/Calendar'
import Mikvaot from './screens/Mikvaot'
import TabBar from './components/TabBar'

// שלושה מסכים, אופליין מלא:
//   • "/"         — היום: תאריך, שעון, מצב טהרה, עונות ופעולות
//   • "/calendar" — לוח עברי חודשי עם סטטוס כל יום
//   • "/mikvaot"  — מפת מקוואות (אריחים מוטמעים במכשיר)
// HashRouter — בטוח לטעינת file:// בתוך ה-WebView של Capacitor.
export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <div dir="rtl" className="mx-auto min-h-[100dvh] max-w-xl">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/mikvaot" element={<Mikvaot />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <TabBar />
      </AppProvider>
    </HashRouter>
  )
}
