// Geocoding לכתובות המקוואות דרך OSM Nominatim (חינמי).
// מכבד את מדיניות השימוש: בקשה אחת לשנייה + User-Agent תקין.
// ניתן להרצה חוזרת (resume) — מדלג על מקוואות שכבר יש להם קואורדינטות.
// שימוש: node server/scripts/geocodeMikvaot.js [--refresh]
import 'dotenv/config'
import mongoose from 'mongoose'
import Mikva from '../src/models/Mikva.js'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/miikva'
const REFRESH = process.argv.includes('--refresh')
const DELAY_MS = 1100 // מדיניות Nominatim: מקסימום בקשה אחת לשנייה
const UA = 'MikvaApp/1.0 (mikvaot map geocoding; contact: yosefdaean@gmail.com)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ניקוי כתובת: הסרת כפילות ("אביעזר, אביעזר" -> "אביעזר") ורווחים מיותרים
function normalizeAddress(address, city) {
  let a = (address || '').replace(/\s+/g, ' ').trim()
  const parts = a.split(',').map((p) => p.trim()).filter(Boolean)
  const uniq = [...new Set(parts)]
  return { full: uniq.join(', '), city: (city || parts[parts.length - 1] || '').trim() }
}

async function nominatim(query, tries = 4) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&accept-language=he&q=' +
    encodeURIComponent(query)
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } })
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const j = await r.json()
      return j[0] || null
    } catch (e) {
      if (i === tries - 1) throw e
      // backoff מדורג לתקלות רשת רגעיות / הגבלת קצב
      await sleep(2000 * Math.pow(2, i))
    }
  }
}

// נסיון רב-שלבי: כתובת מלאה -> עיר בלבד
async function geocode(fullAddress, city) {
  if (fullAddress) {
    const hit = await nominatim(fullAddress + ', ישראל')
    if (hit) {
      const precise = /road|house|residential|neighbourhood|suburb/.test(hit.type || hit.class || '')
      return { lat: +hit.lat, lng: +hit.lon, precision: precise ? 'street' : 'exact' }
    }
  }
  if (city) {
    await sleep(DELAY_MS)
    const hit = await nominatim(city + ', ישראל')
    if (hit) return { lat: +hit.lat, lng: +hit.lon, precision: 'city' }
  }
  return null
}

async function main() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  const filter = REFRESH ? {} : { $or: [{ lat: null }, { lat: { $exists: false } }] }
  const list = await Mikva.find(filter).sort({ externalId: 1 })
  console.log(`מקוואות לגיאוקוד: ${list.length}${REFRESH ? ' (refresh מלא)' : ''}`)

  let ok = 0, city = 0, fail = 0, i = 0
  for (const m of list) {
    i++
    const { full, city: cityName } = normalizeAddress(m.address, m.city)
    let res = null
    try {
      res = await geocode(full, cityName)
    } catch (e) {
      process.stderr.write(`  [${m.externalId}] שגיאה: ${e.message}\n`)
    }
    if (res) {
      m.lat = res.lat
      m.lng = res.lng
      m.geoPrecision = res.precision
      m.geocodedAt = new Date()
      await m.save()
      if (res.precision === 'city') city++
      else ok++
    } else {
      m.geoPrecision = 'failed'
      m.geocodedAt = new Date()
      await m.save()
      fail++
    }
    if (i % 25 === 0)
      process.stderr.write(`  התקדמות: ${i}/${list.length} | מדויק=${ok} עיר=${city} נכשל=${fail}\n`)
    await sleep(DELAY_MS)
  }

  const withCoords = await Mikva.countDocuments({ lat: { $ne: null } })
  console.log(`הושלם: מדויק/רחוב=${ok}, רמת עיר=${city}, נכשל=${fail}`)
  console.log(`סה"כ מקוואות עם קואורדינטות: ${withCoords}/${await Mikva.countDocuments()}`)
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('שגיאה:', e.message)
  process.exit(1)
})
