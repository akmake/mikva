// ייבוא נתוני המקוואות שנאספו מ-taharat.org.il אל מסד הנתונים.
// שימוש: node server/scripts/importMikvaot.js [path-to-mikvaot.json]
import 'dotenv/config'
import fs from 'node:fs'
import mongoose from 'mongoose'
import Mikva from '../src/models/Mikva.js'

const JSON_PATH =
  process.argv[2] ||
  'C:/Users/yosef dahan/Documents/taharat_mikvaot/mikvaot.json'
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/miikva'

// חילוץ העיר מתוך הכותרת: "מקווה <שם> - <עיר>" => החלק אחרי המקף האחרון
function cityFromTitle(title) {
  if (!title) return ''
  const parts = title.replace(/^מקווה\s+/, '').split(' - ')
  return parts.length > 1 ? parts[parts.length - 1].trim() : ''
}

function toDoc(r) {
  const f = r.fields || {}
  const kashrut = f['כשרות'] || ''
  return {
    externalId: r.id,
    source: 'taharat.org.il',
    url: r.url,
    title: r.title || '',
    name: f['שם המקווה'] || '',
    city: cityFromTitle(r.title),
    address: f['כתובת'] || '',
    phone: f['טלפון'] || '',
    contact: f['איש קשר'] || '',
    kashrut,
    supervised: /מפוקח/.test(kashrut) && !/אינו בפיקוח/.test(kashrut),
    openingHours: f['שעות פתיחה'] || '',
    services: f['שירותים במקווה'] || '',
    notes: f['הערות'] || '',
    waze: r.waze || '',
    googleMaps: r.google_maps || '',
    fields: f,
    scrapedAt: new Date(),
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
  console.log(`נטענו ${data.length} רשומות מהקובץ`)

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  console.log('מחובר ל-MongoDB')

  const ops = data.map((r) => ({
    updateOne: {
      filter: { externalId: r.id },
      update: { $set: toDoc(r) },
      upsert: true,
    },
  }))

  const res = await Mikva.bulkWrite(ops, { ordered: false })
  const total = await Mikva.countDocuments()
  console.log(
    `הושלם: upserted=${res.upsertedCount}, modified=${res.modifiedCount}, matched=${res.matchedCount}`,
  )
  console.log(`סה"כ מקוואות באוסף 'mikvas': ${total}`)

  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('שגיאה בייבוא:', e.message)
  process.exit(1)
})
