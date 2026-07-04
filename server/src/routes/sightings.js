import { Router } from 'express'
import Sighting from '../models/Sighting.js'
import Cycle from '../models/Cycle.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const sightings = await Sighting.find().sort({ gregorianDatetime: -1 })
    res.json(sightings)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const { gregorianDatetime, hebrewDate, onah, sourceType, isOpenSource, lat, lng, notes } = req.body

    const sighting = await Sighting.create({
      gregorianDatetime: new Date(gregorianDatetime),
      hebrewDate,
      onah,
      sourceType: sourceType ?? 'veset',
      isOpenSource: isOpenSource ?? false,
      lat, lng, notes,
    })

    // נידה = מהדם הראשון עד הטבילה. הנידה הנוכחית = הנידה האחרונה שנוצרה.
    //  • אין נידה / הנידה האחרונה נסגרה (טבלה) → זו ראיה חדשה → נידה חדשה.
    //  • הנידה האחרונה עדיין 'active' (טרם טבלה) → זה *המשך* אותו דם → append.
    const latest = await Cycle.findOne().sort({ createdAt: -1 })

    let cycle
    if (!latest || latest.status === 'completed') {
      // נידה חדשה — מתחילה המתנת 5 ימים (דם ממצב טהרה).
      cycle = await Cycle.create({
        bleedings: [sighting._id],
        phase: 'waiting_5_days',
        status: 'active',
      })
    } else {
      // המשך אותה נידה. אם היא כבר הייתה בתוך/אחרי 7 הנקיים — אין 5 ימים מחדש
      // (כבר פרושה, אין חשש שכבת זרע), עושה הפסק בהזדמנות הראשונה. אם עדיין
      // לפני הפסק — 5 הימים ממילא נספרים מהדם הראשון (bleedings[0]).
      latest.bleedings.push(sighting._id)
      const midCount = latest.phase === 'counting_7' || latest.phase === 'waiting_mikveh'
      if (midCount) {
        latest.phase = 'waiting_hefsek'
        latest.hefsekTahara = undefined
        latest.cleanDays = []
        latest.mikveDate = {}
      }
      await latest.save()
      cycle = latest
    }

    res.status(201).json({ sighting, cycle })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
