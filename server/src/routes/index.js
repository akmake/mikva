import { Router } from 'express'
import sightingsRouter from './sightings.js'
import cycleRouter from './cycle.js'
import vesetRouter from './veset.js'
import zmanimRouter from './zmanim.js'

const router = Router()

router.get('/health', (_req, res) => res.json({ ok: true }))
router.use('/sightings', sightingsRouter)
router.use('/cycle', cycleRouter)
router.use('/veset-observations', vesetRouter)
router.use('/zmanim', zmanimRouter)

export default router
