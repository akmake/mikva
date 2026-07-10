import { Router } from 'express'
import Mikva from '../models/Mikva.js'

const router = Router()

// GET /api/mikvas
// פרמטרים אופציונליים:
//   city=<שם עיר>       סינון לפי עיר
//   q=<טקסט>            חיפוש חופשי בשם/כתובת/עיר
//   withCoords=1        רק מקוואות עם קואורדינטות (למפה)
//   supervised=1|0      רק מפוקחים / רק לא-מפוקחים
router.get('/', async (req, res) => {
  try {
    const { city, q, withCoords, supervised } = req.query
    const filter = {}
    if (city) filter.city = city
    if (withCoords === '1') filter.lat = { $ne: null }
    if (supervised === '1') filter.supervised = true
    if (supervised === '0') filter.supervised = false
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: rx }, { address: rx }, { city: rx }, { title: rx }]
    }

    const mikvas = await Mikva.find(filter)
      .select(
        'externalId title name city address phone contact kashrut supervised openingHours services notes waze googleMaps lat lng geoPrecision url',
      )
      .sort({ city: 1, name: 1 })
      .lean()

    res.json(mikvas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/mikvas/cities — רשימת ערים + ספירה (לתפריט סינון)
router.get('/cities', async (_req, res) => {
  try {
    const cities = await Mikva.aggregate([
      { $match: { city: { $ne: '' } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    res.json(cities.map((c) => ({ city: c._id, count: c.count })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/mikvas/:externalId — מקווה בודד עם כל הפרטים
router.get('/:externalId', async (req, res) => {
  try {
    const mikva = await Mikva.findOne({ externalId: +req.params.externalId }).lean()
    if (!mikva) return res.status(404).json({ error: 'מקווה לא נמצא' })
    res.json(mikva)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
