// סקריפט חד-פעמי: מוחק את כל נתוני המעקב (ראיות, נידות, תצפיות ווסת) —
// איפוס מלא לצורך בדיקות. לא נוגע ב-Settings (הגדרות הלכתיות גלובליות).
// מריצים מתיקיית server:  node scripts/resetAllTrackingData.mjs
import 'dotenv/config'
import mongoose from 'mongoose'
import Sighting from '../src/models/Sighting.js'
import Cycle from '../src/models/Cycle.js'
import VesetObservation from '../src/models/VesetObservation.js'

await mongoose.connect(process.env.MONGO_URI)

const [sightings, cycles, observations] = await Promise.all([
  Sighting.deleteMany({}),
  Cycle.deleteMany({}),
  VesetObservation.deleteMany({}),
])

console.log(`נמחקו ${sightings.deletedCount} ראיות, ${cycles.deletedCount} נידות, ${observations.deletedCount} תצפיות ווסת.`)
console.log('Settings לא נגעו בהן.')
await mongoose.disconnect()
