// Replace the entire Mikva collection with the merged mikvaot.co.il dataset.
// Safety: backs up the current collection to server/data/backup_mikvas_<timestamp>.json first.
// Usage: node server/scripts/replaceMikvaot.js
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import Mikva from '../src/models/Mikva.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MERGED = path.join(__dirname, '..', 'data', 'mikvaot_merged.json')
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/miikva'

async function main() {
  const docs = JSON.parse(fs.readFileSync(MERGED, 'utf8'))
  console.log(`נטענו ${docs.length} מקוואות מקובץ המיזוג`)

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  console.log('מחובר ל-MongoDB')

  const before = await Mikva.countDocuments()
  console.log(`במסד כרגע: ${before} מקוואות`)

  // --- גיבוי לפני מחיקה ---
  if (before > 0) {
    const existing = await Mikva.find({}).lean()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(__dirname, '..', 'data', `backup_mikvas_${stamp}.json`)
    fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2), 'utf8')
    console.log(`גובו ${existing.length} רשומות אל: ${backupPath}`)
  }

  // --- החלפה מלאה ---
  const del = await Mikva.deleteMany({})
  console.log(`נמחקו ${del.deletedCount} רשומות ישנות`)

  const res = await Mikva.insertMany(docs, { ordered: false })
  const after = await Mikva.countDocuments()
  console.log(`הוכנסו ${res.length} מקוואות חדשים. סה"כ במסד כעת: ${after}`)

  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('שגיאה:', e.message)
  process.exit(1)
})
