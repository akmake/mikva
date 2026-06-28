import { Router } from 'express'
import Cycle from '../models/Cycle.js'

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

    // If day 7 has at least one clean check → ready for mikveh
    const day7 = cycle.cleanDays.find(d => d.dayNumber === 7)
    if (day7 && (day7.morningCheck === 'clean' || day7.eveningCheck === 'clean')) {
      cycle.phase = 'waiting_mikveh'
    }

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
    const { isPregnant, pregnancyStart, isMeineket, meinaketStart } = req.body
    const cycle = await getOrCreate()
    if (isPregnant !== undefined) cycle.isPregnant = isPregnant
    if (pregnancyStart !== undefined) cycle.pregnancyStart = pregnancyStart ? new Date(pregnancyStart) : undefined
    if (isMeineket !== undefined) cycle.isMeineket = isMeineket
    if (meinaketStart !== undefined) cycle.meinaketStart = meinaketStart ? new Date(meinaketStart) : undefined
    await cycle.save()
    res.json(cycle)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
