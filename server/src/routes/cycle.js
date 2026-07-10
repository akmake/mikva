import { Router } from 'express'
import Cycle from '../models/Cycle.js'
import Settings from '../models/Settings.js'
import Sighting from '../models/Sighting.js'

const router = Router()

// זמן ה-onset של נידה = הדם המוקדם ביותר בה (fallback: createdAt לנידה ריקה).
function onsetTime(cycle) {
  if (cycle.bleedings?.length)
    return Math.min(...cycle.bleedings.map((b) => +new Date(b.gregorianDatetime)))
  return +new Date(cycle.createdAt)
}

// המחזור הנוכחי = הנידה הכרונולוגית האחרונה (ה-onset המאוחר ביותר), עם הדימומים
// שלה. לא לפי createdAt — כי תיעוד-עבר יוצר נידות מחוץ לסדר ההקלדה.
async function currentCycle() {
  const cycles = await Cycle.find().populate('bleedings')
  if (!cycles.length) return null
  cycles.sort((a, b) => onsetTime(b) - onsetTime(a))
  return cycles[0]
}

// נידה מסוימת לפי id (עם דימומים) — לפעולות תהליך על נידת-עבר; נפילה לנוכחית.
async function cycleByIdOrCurrent(cycleId) {
  if (cycleId) {
    const c = await Cycle.findById(cycleId).populate('bleedings')
    if (c) return c
  }
  return currentCycle()
}

async function settingsDoc() {
  let s = await Settings.findOne()
  if (!s) s = await Settings.create({})
  return s
}

// צורת תשובה תואמת-לאחור ל-Dashboard: מצב המחזור הנוכחי + הגדרות גלובליות
// ממוזגות + latestSighting = הדם הראשון של הנידה (מוקד ספירת 5 הימים).
function serialize(cycle, settings) {
  const base = cycle
    ? cycle.toObject()
    : { phase: 'tahorah', cleanDays: [], mikveDate: {}, bleedings: [] }
  const onset = cycle?.bleedings?.[0] ?? null
  return {
    ...base,
    latestSighting: onset,
    isPregnant:     settings.isPregnant,
    pregnancyStart: settings.pregnancyStart,
    isMeineket:     settings.isMeineket,
    meinaketStart:  settings.meinaketStart,
    useShuar:       settings.useShuar,
    onaBeinonit31:  settings.onaBeinonit31,
    day30Policy:    settings.day30Policy,
    pregnancyPromptDays:       settings.pregnancyPromptDays,
    pregnancyPromptSnoozedFor: settings.pregnancyPromptSnoozedFor,
  }
}

// GET /api/cycle — המחזור הנוכחי + הגדרות
router.get('/', async (_req, res) => {
  try {
    const [cycle, settings] = await Promise.all([currentCycle(), settingsDoc()])
    res.json(serialize(cycle, settings))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/cycle/history — כל הנידות (לחישוב הווסתות: קיבוץ לפי טבילה)
router.get('/history', async (_req, res) => {
  try {
    const cycles = await Cycle.find().sort({ createdAt: 1 }).populate('bleedings')
    res.json(cycles)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/cycle/hefsek-tahara
router.post('/hefsek-tahara', async (req, res) => {
  try {
    const { gregorianDatetime, hebrewDate, cycleId } = req.body
    const cycle = await cycleByIdOrCurrent(cycleId)
    if (!cycle) return res.status(400).json({ error: 'no active cycle' })

    cycle.hefsekTahara = { gregorianDatetime: new Date(gregorianDatetime), hebrewDate }
    cycle.phase = 'counting_7'
    cycle.cleanDays = []
    await cycle.save()

    // חותם את ההפסק על *הדם האחרון* של הנידה — ממנו נמדדת ההפלגה (שוע"ר: סוף→תחילה)
    // וגם עקירת המשך-ראייה (V-24).
    const last = cycle.bleedings[cycle.bleedings.length - 1]
    if (last) await Sighting.findByIdAndUpdate(last._id ?? last, { hefsekTahara: hebrewDate })

    res.json(serialize(cycle, await settingsDoc()))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/cycle/bedika  { dayNumber, hebrewDate, type, result }
router.post('/bedika', async (req, res) => {
  try {
    const { dayNumber, hebrewDate, type, result, cycleId } = req.body
    const cycle = await cycleByIdOrCurrent(cycleId)
    if (!cycle) return res.status(400).json({ error: 'no active cycle' })

    let day = cycle.cleanDays.find(d => d.dayNumber === dayNumber)
    if (!day) {
      cycle.cleanDays.push({ dayNumber, hebrewDate })
      day = cycle.cleanDays[cycle.cleanDays.length - 1]
    }

    if (type === 'morning') day.morningCheck = result
    else if (type === 'evening') day.eveningCheck = result
    else if (type === 'moch') day.mochCheck = result

    // הערכת השלמת הספירה בקליינט (evaluateCleanDays). כאן רק אחסון.
    cycle.phase = 'counting_7'
    cycle.markModified('cleanDays')
    await cycle.save()
    res.json(serialize(cycle, await settingsDoc()))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/cycle/mikveh — סוגר את הנידה (status=completed). ראיה חדשה אחריה = נידה חדשה.
router.post('/mikveh', async (req, res) => {
  try {
    const { gregorianDatetime, cycleId } = req.body
    const cycle = await cycleByIdOrCurrent(cycleId)
    if (!cycle) return res.status(400).json({ error: 'no active cycle' })

    cycle.phase = 'tahorah'
    cycle.mikveDate = { ...cycle.mikveDate, actual: new Date(gregorianDatetime) }
    cycle.status = 'completed'
    await cycle.save()
    res.json(serialize(cycle, await settingsDoc()))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/cycle/settings — הגדרות גלובליות (Settings סינגלטון)
router.post('/settings', async (req, res) => {
  try {
    const {
      isPregnant, pregnancyStart, isMeineket, meinaketStart,
      useShuar, onaBeinonit31, day30Policy,
      pregnancyPromptDays, pregnancyPromptSnoozedFor,
    } = req.body
    const s = await settingsDoc()
    if (isPregnant !== undefined) s.isPregnant = isPregnant
    if (pregnancyStart !== undefined) s.pregnancyStart = pregnancyStart ? new Date(pregnancyStart) : undefined
    if (isMeineket !== undefined) s.isMeineket = isMeineket
    if (meinaketStart !== undefined) s.meinaketStart = meinaketStart ? new Date(meinaketStart) : undefined
    if (useShuar !== undefined) s.useShuar = useShuar
    if (onaBeinonit31 !== undefined) s.onaBeinonit31 = onaBeinonit31
    if (day30Policy !== undefined) s.day30Policy = day30Policy
    if (pregnancyPromptDays !== undefined) s.pregnancyPromptDays = pregnancyPromptDays
    if (pregnancyPromptSnoozedFor !== undefined) s.pregnancyPromptSnoozedFor = pregnancyPromptSnoozedFor
    await s.save()

    res.json(serialize(await currentCycle(), s))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
