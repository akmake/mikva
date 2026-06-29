import { Router } from 'express'
import sightingsRouter from './sightings.js'
import cycleRouter from './cycle.js'
import vesetRouter from './veset.js'

const router = Router()

router.get('/health', (_req, res) => res.json({ ok: true }))
router.use('/sightings', sightingsRouter)
router.use('/cycle', cycleRouter)
router.use('/veset-observations', vesetRouter)

export default router
