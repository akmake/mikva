// שחזור המקוואות שנכשלו בגיאוקוד — ברובם יישובי יו"ש ש-Nominatim לא מאנדקס
// תחת countrycodes=il. כאן מחפשים ללא מגבלת מדינה, לפי שם היישוב, עם בדיקת
// גבולות (bounding box) של אזור ישראל/יו"ש כדי למנוע התאמות שגויות בעולם.
import 'dotenv/config'
import mongoose from 'mongoose'
import Mikva from '../src/models/Mikva.js'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/miikva'
const DELAY_MS = 1100
const UA = 'MikvaApp/1.0 (mikvaot map geocoding; contact: yosefdaean@gmail.com)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// תיבת גבולות מקורבת: ישראל + יו"ש
const inIsrael = (lat, lng) => lat >= 29.3 && lat <= 33.4 && lng >= 34.2 && lng <= 35.95

async function nominatim(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=3&accept-language=he&q=' +
    encodeURIComponent(query)
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return await r.json()
    } catch (e) {
      if (i === 3) throw e
      await sleep(2000 * Math.pow(2, i))
    }
  }
}

async function main() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  const failed = await Mikva.find({ lat: null }).sort({ externalId: 1 })
  console.log(`לשחזור: ${failed.length}`)

  let ok = 0,
    still = 0
  for (const m of failed) {
    const candidates = [m.city, m.name, (m.address || '').split(',')[0].trim()].filter(Boolean)
    let found = null
    for (const c of [...new Set(candidates)]) {
      let hits
      try {
        hits = await nominatim(c)
      } catch (e) {
        process.stderr.write(`  [${m.externalId}] ${c}: ${e.message}\n`)
        await sleep(DELAY_MS)
        continue
      }
      const hit = (hits || []).find((h) => inIsrael(+h.lat, +h.lon))
      await sleep(DELAY_MS)
      if (hit) {
        found = { lat: +hit.lat, lng: +hit.lon }
        break
      }
    }
    if (found) {
      m.lat = found.lat
      m.lng = found.lng
      m.geoPrecision = 'city'
      m.geocodedAt = new Date()
      await m.save()
      ok++
    } else {
      still++
      process.stderr.write(`  עדיין נכשל: [${m.externalId}] ${m.city || m.name}\n`)
    }
  }

  const withCoords = await Mikva.countDocuments({ lat: { $ne: null } })
  console.log(`שוחזרו: ${ok} | עדיין נכשלים: ${still}`)
  console.log(`סה"כ עם קואורדינטות: ${withCoords}/${await Mikva.countDocuments()}`)
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('שגיאה:', e.message)
  process.exit(1)
})
