// סקריפט חד-פעמי: בונה מחדש את מסמכי ה-Cycle מרשימת הראיות לפי כרונולוגיה.
// מתקן נתונים שנוצרו לפני תיקון השיוך הכרונולוגי (ראיות-עבר שנבלעו לנידה של ההווה).
// מריצים מתיקיית server:  node scripts/rebuildCycles.mjs
import 'dotenv/config'
import mongoose from 'mongoose'
import Sighting from '../src/models/Sighting.js'
import Cycle from '../src/models/Cycle.js'

const DAY_MS = 86_400_000
const GAP_DAYS = 7

await mongoose.connect(process.env.MONGO_URI)

const sightings = await Sighting.find().sort({ gregorianDatetime: 1 })
const existing = await Cycle.find()

// גבולות טבילה מנידות קיימות — נידה שנסגרה בטבילה גוררת נידה חדשה אחריה.
const tevilot = existing
  .map((c) => (c.mikveDate?.actual ? +new Date(c.mikveDate.actual) : null))
  .filter(Boolean)

// ── קיבוץ כרונולוגי לנידות: גבול = טבילה ביניהן או פער ≥ 7 ימים ──
const groups = []
for (const s of sightings) {
  const g = groups[groups.length - 1]
  const prev = g ? g[g.length - 1] : null
  let boundary = false
  if (!prev) boundary = true
  else {
    const pT = +new Date(prev.gregorianDatetime)
    const sT = +new Date(s.gregorianDatetime)
    const toveledBetween = tevilot.some((t) => t > pT && t <= sT)
    boundary = toveledBetween || (sT - pT) / DAY_MS >= GAP_DAYS
  }
  if (boundary) groups.push([s])
  else g.push(s)
}

// ── התאמת כל קבוצה לנידה קיימת (שימור מצב תהליך: phase/hefsek/cleanDays/mikveh) ──
const used = new Set()
const kept = new Set()
for (const group of groups) {
  const ids = group.map((s) => String(s._id))
  let match = null
  let best = 0
  for (const c of existing) {
    if (used.has(String(c._id))) continue
    const overlap = c.bleedings.filter((b) => ids.includes(String(b))).length
    if (overlap > best) { best = overlap; match = c }
  }
  if (match) {
    used.add(String(match._id))
    match.bleedings = group.map((s) => s._id)
    await match.save()
    kept.add(String(match._id))
    console.log(`עודכנה נידה ${match._id} → ${group.length} דימומים (onset ${JSON.stringify(group[0].hebrewDate)})`)
  } else {
    const created = await Cycle.create({
      bleedings: group.map((s) => s._id),
      phase: 'waiting_5_days',
      status: 'active',
    })
    kept.add(String(created._id))
    console.log(`נוצרה נידה ${created._id} → ${group.length} דימומים (onset ${JSON.stringify(group[0].hebrewDate)})`)
  }
}

// ── מחיקת נידות שנותרו בלי דימומים ──
for (const c of existing) {
  if (!kept.has(String(c._id))) {
    await Cycle.deleteOne({ _id: c._id })
    console.log(`נמחקה נידה ריקה ${c._id}`)
  }
}

console.log(`\nסה"כ ${groups.length} נידות מ-${sightings.length} ראיות.`)
await mongoose.disconnect()
