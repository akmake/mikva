import mongoose from 'mongoose'

const hebrewDateSchema = new mongoose.Schema(
  { year: Number, month: Number, day: Number },
  { _id: false },
)

// Records what happened on a veset concern day:
// 'clean' = passed without blood (counts toward uprooting)
// sightings are stored separately in Sighting — no need to duplicate
const vesetObservationSchema = new mongoose.Schema({
  concernType: {
    type: String,
    enum: ['ona_beinonit', 'chodesh', 'haflagah', 'sirug', 'dilog'],
    required: true,
  },
  concernId: { type: String, required: true }, // e.g. 'chodesh', 'haflagah_30'
  hebrewDate: { type: hebrewDateSchema, required: true },
  onah: { type: String, enum: ['day', 'night', 'full_day'], required: true },
  result: { type: String, enum: ['clean'], default: 'clean' }, // only clean passes are stored; sightings tracked elsewhere
  relatedSightingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sighting' },
}, { timestamps: true })

export default mongoose.model('VesetObservation', vesetObservationSchema)
