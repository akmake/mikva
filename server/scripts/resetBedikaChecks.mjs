// סקריפט חד-פעמי: מאפס את כל סימוני בדיקות ה-7 הנקיים (בוקר/ערב/מוך) בכל
// הנידות — מחזיר morningCheck/eveningCheck/mochCheck ל-'not_done' בכל יום.
// לא נוגע בהפסק טהרה / טבילה / דימומים — רק בסימוני הבדיקה עצמם.
// מריצים מתיקיית server:  node scripts/resetBedikaChecks.mjs
import 'dotenv/config'
import mongoose from 'mongoose'
import Cycle from '../src/models/Cycle.js'

await mongoose.connect(process.env.MONGO_URI)

const cycles = await Cycle.find()
let touchedCycles = 0
let touchedDays = 0

for (const c of cycles) {
  if (!c.cleanDays?.length) continue
  let changed = false
  for (const day of c.cleanDays) {
    if (day.morningCheck !== 'not_done' || day.eveningCheck !== 'not_done' || day.mochCheck !== 'not_done') {
      day.morningCheck = 'not_done'
      day.eveningCheck = 'not_done'
      day.mochCheck = 'not_done'
      changed = true
      touchedDays++
    }
  }
  if (changed) {
    c.markModified('cleanDays')
    await c.save()
    touchedCycles++
    console.log(`אופסו בדיקות בנידה ${c._id} (${c.cleanDays.length} ימים)`)
  }
}

console.log(`\nסה"כ אופסו ${touchedDays} ימי בדיקה ב-${touchedCycles} נידות (מתוך ${cycles.length} נידות בסה"כ).`)
await mongoose.disconnect()
