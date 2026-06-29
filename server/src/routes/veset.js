import { Router } from 'express'
import VesetObservation from '../models/VesetObservation.js'

const router = Router()

// GET /api/veset-observations — all stored clean passes
router.get('/', async (_req, res) => {
  try {
    const obs = await VesetObservation.find().sort({ createdAt: -1 })
    res.json(obs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/veset-observations — record that a concern day passed clean
router.post('/', async (req, res) => {
  try {
    const { concernType, concernId, hebrewDate, onah, relatedSightingId } = req.body

    // Idempotent: don't duplicate the same observation
    const existing = await VesetObservation.findOne({
      concernId,
      'hebrewDate.year':  hebrewDate.year,
      'hebrewDate.month': hebrewDate.month,
      'hebrewDate.day':   hebrewDate.day,
    })
    if (existing) return res.json(existing)

    const obs = await VesetObservation.create({
      concernType, concernId, hebrewDate, onah,
      result: 'clean',
      relatedSightingId,
    })
    res.status(201).json(obs)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/veset-observations/:id — undo a clean-pass observation
router.delete('/:id', async (req, res) => {
  try {
    await VesetObservation.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
