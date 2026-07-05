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

    // ── שיוך כרונולוגי (תומך תיעוד-עבר) ──────────────────────────────────────
    // נידה = מהדם הראשון עד הטבילה. הראיה משתייכת לנידה לפי *התאריך שלה*, לא לפי
    // סדר ההקלדה — כדי שרישום ראיה בעבר לא ייבלע לתוך הנידה של ההווה.
    //  • ממשיכה את הנידה הפעילה שה-onset שלה ≤ תאריך הראיה, בתנאי שהפער מהדם
    //    האחרון בה קטן מ-7 ימים (אותה היוריסטיקה של מנוע הווסתות; פער ≥7 = נידה
    //    חדשה, וכך גם ראיה אחרי נידה שנסגרה בטבילה).
    //  • אחרת → פותחת נידה חדשה משלה (כולל ראיה מוקדמת שאין לפניה כלום).
    const DAY_MS = 86_400_000
    const sTime = new Date(gregorianDatetime).getTime()
    const onsetTime = (c) =>
      Math.min(...c.bleedings.map((b) => +new Date(b.gregorianDatetime)))
    const lastTime = (c) =>
      Math.max(...c.bleedings.map((b) => +new Date(b.gregorianDatetime)))

    const cycles = await Cycle.find().populate('bleedings')

    // הנידה הקרובה ביותר שה-onset שלה ≤ תאריך הראיה (לא כולל את הראיה שנוצרה זה עתה)
    let nearest = null
    for (const c of cycles) {
      const others = c.bleedings.filter((b) => String(b._id) !== String(sighting._id))
      if (!others.length) continue
      const ot = Math.min(...others.map((b) => +new Date(b.gregorianDatetime)))
      if (ot <= sTime && (!nearest || ot > onsetTime(nearest))) nearest = c
    }

    const continuation =
      nearest &&
      nearest.status !== 'completed' &&
      (sTime - lastTime(nearest)) / DAY_MS < 7

    let cycle
    if (continuation) {
      // המשך אותה נידה — מוסיפים וממיינים כרונולוגית כך ש-bleedings[0] הוא ה-onset האמיתי.
      const all = [...nearest.bleedings.filter((b) => String(b._id) !== String(sighting._id)), sighting]
      all.sort((a, b) => +new Date(a.gregorianDatetime) - +new Date(b.gregorianDatetime))
      nearest.bleedings = all.map((b) => b._id)
      // ראיה בתוך/אחרי 7 הנקיים → הספירה נפסלת, נדרש הפסק טהרה חדש (כד — אפיון).
      const midCount = nearest.phase === 'counting_7' || nearest.phase === 'waiting_mikveh'
      if (midCount) {
        nearest.phase = 'waiting_hefsek'
        nearest.hefsekTahara = undefined
        nearest.cleanDays = []
        nearest.mikveDate = {}
      }
      await nearest.save()
      cycle = nearest
    } else {
      // נידה חדשה — מתחילה המתנת 5 ימים (דם ממצב טהרה).
      cycle = await Cycle.create({
        bleedings: [sighting._id],
        phase: 'waiting_5_days',
        status: 'active',
      })
    }

    res.status(201).json({ sighting, cycle })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
