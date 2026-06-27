import { Router } from 'express'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ message: 'שרת פעיל ומחובר למסד הנתונים' })
})

export default router
