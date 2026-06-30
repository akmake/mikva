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

    // Transition cycle to waiting_5_days
    let cycle = await Cycle.findOne()
    if (!cycle) cycle = new Cycle()
    cycle.phase = 'waiting_5_days'
    cycle.latestSighting = sighting._id
    cycle.hefsekTahara = undefined
    cycle.cleanDays = []
    cycle.mikveDate = {}
    await cycle.save()

    res.status(201).json({ sighting, cycle })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
