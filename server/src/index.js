import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'
import apiRoutes from './routes/index.js'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }))
app.use(express.json())

app.use('/api', apiRoutes)

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB מחובר')
    app.listen(PORT, () => console.log(`שרת רץ על פורט ${PORT}`))
  })
  .catch((err) => {
    console.error('שגיאה בחיבור ל-MongoDB:', err.message)
    process.exit(1)
  })
