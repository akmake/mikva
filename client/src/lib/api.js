const BASE = 'http://localhost:5001/api'

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
