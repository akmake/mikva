import mongoose from 'mongoose'

const hebrewDateSchema = new mongoose.Schema(
  { year: Number, month: Number, day: Number },
  { _id: false },
)

const cleanDaySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, min: 1, max: 7 },
    hebrewDate: hebrewDateSchema,
    morningCheck: { type: String, enum: ['clean', 'stain', 'not_done'], default: 'not_done' },
    eveningCheck: { type: String, enum: ['clean', 'stain', 'not_done'], default: 'not_done' },
    mochCheck:    { type: String, enum: ['clean', 'stain', 'not_done'], default: 'not_done' },
  },
  { _id: false },
)

const cycleSchema = new mongoose.Schema(
  {
    phase: {
      type: String,
      enum: ['tahorah', 'waiting_5_days', 'waiting_hefsek', 'counting_7', 'waiting_mikveh'],
      default: 'tahorah',
    },
    latestSighting: { type: mongoose.Schema.Types.ObjectId, ref: 'Sighting' },
    hefsekTahara: {
      gregorianDatetime: Date,
      hebrewDate: hebrewDateSchema,
    },
    cleanDays: { type: [cleanDaySchema], default: [] },
    mikveDate: {
      planned: hebrewDateSchema,
      actual:  Date,
    },
    isPregnant:      { type: Boolean, default: false },
    pregnancyStart:  Date,
    isMeineket:      { type: Boolean, default: false },
    meinaketStart:   Date,
  },
  { timestamps: true },
)

export default mongoose.model('Cycle', cycleSchema)
