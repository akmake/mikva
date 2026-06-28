import { useEffect, useState } from 'react'
import { getZmanim } from '../utils/zmanim'

export default function ZmanimPanel({ mikva, onClose }) {
  const [zmanim, setZmanim] = useState([])

  useEffect(() => {
    if (!mikva) return
    setZmanim(getZmanim(mikva.lat, mikva.lng, mikva.elevation ?? 0))
  }, [mikva])

  if (!mikva) return null

  const today = new Date().toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-blue-950 text-white shadow-2xl z-[1000] flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-blue-900 border-b border-blue-700">
        <div>
          <h2 className="font-bold text-lg">{mikva.name}</h2>
          <p className="text-blue-300 text-sm">{mikva.city}</p>
        </div>
        <button onClick={onClose} className="text-blue-300 hover:text-white text-2xl leading-none">×</button>
      </div>

      {/* Date */}
      <div className="px-5 py-3 bg-blue-900/50 border-b border-blue-800 text-blue-200 text-sm">
        זמנים להיום — {today}
      </div>

      {/* Zmanim list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {zmanim.map(({ label, value }) => (
          <div
            key={label}
            className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-blue-800/50 transition"
          >
            <span className="text-blue-200 text-sm">{label}</span>
            <span className="font-mono font-semibold text-white">{value}</span>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 text-blue-400 text-xs border-t border-blue-800 text-center">
        מחושב לפי שיטת הגר"א
      </div>
    </div>
  )
}
