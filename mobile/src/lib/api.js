// שכבת התעבורה — כעת אופליין מלא. אין fetch ואין שרת: כל הנתונים נשמרים על
// המכשיר (localStore מעל @capacitor/preferences). המנוע ההלכתי מייבא את `api`
// בדיוק כמו קודם ולא יודע דבר על השינוי — אותם שמות, אותן צורות תשובה.
import * as store from './localStore'
import mikvaot from '../data/mikvaot.json'

// ── מקוואות (אופליין) ────────────────────────────────────────────────────────
// פורט נאמן של server/src/routes/mikvas.js אל נתונים מוטמעים במכשיר. אותם
// פרמטרים ואותה צורת תשובה שהמפה (MapPage) מצפה להם — רק בלי fetch/שרת.
function filterMikvas({ city, q, withCoords, supervised } = {}) {
  let list = mikvaot
  if (city) list = list.filter((m) => m.city === city)
  if (String(withCoords) === '1') list = list.filter((m) => m.lat != null)
  if (String(supervised) === '1') list = list.filter((m) => m.supervised === true)
  if (String(supervised) === '0') list = list.filter((m) => m.supervised === false)
  if (q) {
    const needle = String(q).toLowerCase()
    list = list.filter((m) =>
      `${m.name ?? ''} ${m.address ?? ''} ${m.city ?? ''}`.toLowerCase().includes(needle),
    )
  }
  return [...list].sort((a, b) =>
    (a.city ?? '').localeCompare(b.city ?? '', 'he') || (a.name ?? '').localeCompare(b.name ?? '', 'he'),
  )
}

function mikvaCities() {
  const counts = new Map()
  for (const m of mikvaot) {
    if (!m.city) continue
    counts.set(m.city, (counts.get(m.city) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
}

export const api = {
  // ── sightings ──────────────────────────────────────────────────────────
  getSightings: () => store.getSightings(),
  recordSighting: (payload) => store.recordSighting(payload),

  // ── cycle ──────────────────────────────────────────────────────────────
  getCycle: () => store.getCycle(),
  getCycles: () => store.getCycles(), // כל הנידות (עם bleedings) — לחישוב הווסתות
  recordHefsek: (payload) => store.recordHefsek(payload),
  recordBedika: (payload) => store.recordBedika(payload),
  recordMikveh: (payload) => store.recordMikveh(payload),
  updateSettings: (payload) => store.updateSettings(payload),

  // ── veset observations ──────────────────────────────────────────────────
  getVesetObservations: () => store.getVesetObservations(),
  recordCleanPass: (payload) => store.recordCleanPass(payload),
  deleteObservation: (id) => store.deleteObservation(id),

  // ── mikvas (מפת מקוואות — אופליין) ──────────────────────────────────────
  getMikvas: (params = {}) => Promise.resolve(filterMikvas(params)),
  getMikvaCities: () => Promise.resolve(mikvaCities()),

  // ── מחיקת כל הנתונים (מובייל בלבד) ───────────────────────────────────────
  clearAllData: () => store.clearAll(),
}
