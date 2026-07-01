import { Router } from 'express'
import Cycle from '../models/Cycle.js'
import Sighting from '../models/Sighting.js'

const router = Router()

async function getOrCreate() {
  let cycle = await Cycle.findOne().populate('latestSighting')
  if (!cycle) cycle = await Cycle.create({ phase: 'tahorah' })
  return cycle
}

// GET /api/cycle
router.get('/', async (_req, res) => {
  try {
    res.json(await getOrCreate())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/cycle/hefsek-tahara
router.post('/hefsek-tahara', async (req, res) => {
  try {
    const { gregorianDatetime, hebrewDate } = req.body
    const cycle = await getOrCreate()
    cycle.hefsekTahara = { gregorianDatetime: new Date(gregorianDatetime), hebrewDate }
    cycle.phase = 'counting_7'
    cycle.cleanDays = []
    await cycle.save()

    // חותם את תאריך ההפסק על הראייה שפתחה מחזור זה (לחישובי ווסת — שוע"ר, V-24)
    const sid = cycle.latestSighting?._id ?? cycle.latestSighting
    if (sid) await Sighting.findByIdAndUpdate(sid, { hefsekTahara: hebrewDate })

    res.json(cycle)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/cycle/bedika  { dayNumber, hebrewDate, type: 'morning'|'evening'|'moch', result: 'clean'|'stain' }
router.post('/bedika', async (req, res) => {
  try {
    const { dayNumber, hebrewDate, type, result } = req.body
    const cycle = await getOrCreate()

    let day = cycle.cleanDays.find(d => d.dayNumber === dayNumber)
    if (!day) {
      cycle.cleanDays.push({ dayNumber, hebrewDate })
      day = cycle.cleanDays[cycle.cleanDays.length - 1]
    }

    if (type === 'morning') day.morningCheck = result
    else if (type === 'evening') day.eveningCheck = result
    else if (type === 'moch') day.mochCheck = result

    // הערכת השלמת הספירה נעשית בקליינט ע"י evaluateCleanDays (מנוע חלון [ראשון,שביעי],
    // כולל איפוס כשנמצא דם בתווך). כאן רק אחסון — נשארים ב-counting_7.
    cycle.phase = 'counting_7'

    cycle.markModified('cleanDays')
    await cycle.save()
    res.json(cycle)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/cycle/mikveh
router.post('/mikveh', async (req, res) => {
  try {
    const { gregorianDatetime } = req.body
    const cycle = await getOrCreate()
    cycle.phase = 'tahorah'
    cycle.mikveDate = { actual: new Date(gregorianDatetime) }
    await cycle.save()
    res.json(cycle)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/cycle/settings  (pregnancy / meineket / etc.)
router.post('/settings', async (req, res) => {
  try {
    const {
      isPregnant, pregnancyStart, isMeineket, meinaketStart,
      useShuar, onaBeinonit31, day30Policy,
    } = req.body
    const cycle = await getOrCreate()
    if (isPregnant !== undefined) cycle.isPregnant = isPregnant
    if (pregnancyStart !== undefined) cycle.pregnancyStart = pregnancyStart ? new Date(pregnancyStart) : undefined
    if (isMeineket !== undefined) cycle.isMeineket = isMeineket
    if (meinaketStart !== undefined) cycle.meinaketStart = meinaketStart ? new Date(meinaketStart) : undefined
    if (useShuar !== undefined) cycle.useShuar = useShuar
    if (onaBeinonit31 !== undefined) cycle.onaBeinonit31 = onaBeinonit31
    if (day30Policy !== undefined) cycle.day30Policy = day30Policy
    await cycle.save()
    res.json(cycle)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
