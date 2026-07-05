import { Capacitor } from '@capacitor/core'

// כתובת בסיס של השרת (מחסן הנתונים). ההלכה מחושבת מקומית — זו רק שכבת התעבורה.
//  • דפדפן dev  → '/api' (vite proxy → localhost:5001)
//  • אמולטור/מכשיר → 10.0.2.2:5001 (אמולטור) או כתובת פרוד — ניתן לעקוף עם VITE_API_BASE
const BASE =
  import.meta.env.VITE_API_BASE ??
  (Capacitor.isNativePlatform() ? 'http://10.0.2.2:5001/api' : '/api')

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

export const api = {
  // ── sightings ──────────────────────────────────────────────────────────
  getSightings: () => request('/sightings'),

  recordSighting: (payload) =>
    request('/sightings', { method: 'POST', body: JSON.stringify(payload) }),

  // ── cycle ──────────────────────────────────────────────────────────────
  getCycle: () => request('/cycle'),

  // כל הנידות (עם bleedings) — לקיבוץ נידות בחישוב הווסתות
  getCycles: () => request('/cycle/history'),

  recordHefsek: (payload) =>
    request('/cycle/hefsek-tahara', { method: 'POST', body: JSON.stringify(payload) }),

  recordBedika: (payload) =>
    request('/cycle/bedika', { method: 'POST', body: JSON.stringify(payload) }),

  recordMikveh: (payload) =>
    request('/cycle/mikveh', { method: 'POST', body: JSON.stringify(payload) }),

  updateSettings: (payload) =>
    request('/cycle/settings', { method: 'POST', body: JSON.stringify(payload) }),

  // ── veset observations ──────────────────────────────────────────────────
  getVesetObservations: () => request('/veset-observations'),

  recordCleanPass: (payload) =>
    request('/veset-observations', { method: 'POST', body: JSON.stringify(payload) }),

  deleteObservation: (id) =>
    request(`/veset-observations/${id}`, { method: 'DELETE' }),
}
