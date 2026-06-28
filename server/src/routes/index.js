import { Router } from 'express'
import sightingsRouter from './sightings.js'
import cycleRouter from './cycle.js'

const router = Router()

router.get('/health', (_req, res) => res.json({ ok: true }))
router.use('/sightings', sightingsRouter)
router.use('/cycle', cycleRouter)

export default router
