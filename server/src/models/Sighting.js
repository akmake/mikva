import mongoose from 'mongoose'

const hebrewDateSchema = new mongoose.Schema(
  { year: Number, month: Number, day: Number },
  { _id: false },
)

const sightingSchema = new mongoose.Schema(
  {
    gregorianDatetime: { type: Date, required: true },
    hebrewDate: { type: hebrewDateSchema, required: true },
    onah: { type: String, enum: ['day', 'night'], required: true },
    isOpenSource: { type: Boolean, default: false },
    lat: Number,
    lng: Number,
    notes: String,
  },
  { timestamps: true },
)

export default mongoose.model('Sighting', sightingSchema)
