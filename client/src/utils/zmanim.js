import { getZmanimJson } from 'kosher-zmanim'

const fmt = (isoStr) => {
  if (!isoStr || isoStr === 'N/A') return '—'
  return new Date(isoStr).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  })
}

export function getZmanim(lat, lng, elevation = 0) {
  const result = getZmanimJson({
    date: new Date(),
    timeZoneId: 'Asia/Jerusalem',
    locationName: '',
    latitude: lat,
    longitude: lng,
    elevation,
    complexZmanim: true,
  })

  const z = result.Zmanim

  return [
    { label: 'עלות השחר',          value: fmt(z.Alos72) },
    { label: 'נץ החמה',            value: fmt(z.Sunrise) },
    { label: 'סוף ק"ש (גר"א)',     value: fmt(z.SofZmanShmaGRA) },
    { label: 'סוף ק"ש (מג"א)',     value: fmt(z.SofZmanShmaMGA) },
    { label: 'סוף תפילה (גר"א)',   value: fmt(z.SofZmanTfilaGRA) },
    { label: 'חצות',               value: fmt(z.Chatzos) },
    { label: 'מנחה גדולה',         value: fmt(z.MinchaGedola) },
    { label: 'מנחה קטנה',          value: fmt(z.MinchaKetana) },
    { label: 'פלג המנחה',          value: fmt(z.PlagHamincha) },
    { label: 'שקיעה',              value: fmt(z.Sunset) },
    { label: 'צאת הכוכבים',        value: fmt(z.Tzais8Point5Degrees) },
  ]
}
