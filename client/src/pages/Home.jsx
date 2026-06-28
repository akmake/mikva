import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-blue-800 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="mb-6 text-7xl select-none">🌊</div>
        <h1 className="text-5xl font-bold text-white tracking-wide mb-4">מקווה</h1>
        <p className="text-blue-200 text-xl max-w-md leading-relaxed mb-10">
          מצא את המקווה הקרוב אליך — טהרה, שלווה ומסורת
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <Link
            to="/map"
            className="bg-white text-blue-900 font-semibold text-lg px-8 py-3 rounded-full shadow-lg hover:bg-blue-50 transition"
          >
            מצא מקווה קרוב
          </Link>
          <Link
            to="/zmanim"
            className="bg-blue-600 text-white font-semibold text-lg px-8 py-3 rounded-full shadow-lg hover:bg-blue-500 transition"
          >
            זמנים הלכתיים
          </Link>
          <Link
            to="/calendar"
            className="bg-white/20 text-white font-semibold text-lg px-8 py-3 rounded-full shadow-lg hover:bg-white/30 transition"
          >
            לוח עברי
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="bg-white/10 backdrop-blur-sm py-14 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center text-white">
          <div>
            <div className="text-4xl mb-3">📍</div>
            <h3 className="font-semibold text-lg mb-1">מיקום מדויק</h3>
            <p className="text-blue-200 text-sm">מקוואות על גבי מפה אינטראקטיבית</p>
          </div>
          <div>
            <div className="text-4xl mb-3">🕯️</div>
            <h3 className="font-semibold text-lg mb-1">שעות פתיחה</h3>
            <p className="text-blue-200 text-sm">מידע מעודכן על זמני כניסה</p>
          </div>
          <div>
            <div className="text-4xl mb-3">📞</div>
            <h3 className="font-semibold text-lg mb-1">פרטי קשר</h3>
            <p className="text-blue-200 text-sm">טלפון וכתובת לכל מקווה</p>
          </div>
        </div>
      </div>

      <footer className="text-center text-blue-300 text-sm py-5">
        © {new Date().getFullYear()} מקווה — כל הזכויות שמורות
      </footer>
    </div>
  )
}
