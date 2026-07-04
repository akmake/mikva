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

// מסמך אחד לכל נידה (אוסף היסטורי — לא סינגלטון). נידה = מהדם הראשון עד הטבילה.
// כל הדימומים באותה נידה (דם ראשון + המשכים שלפני טבילה) נצברים ב-bleedings:
//   bleedings[0]        = הדם הראשון (מוקד ה-onset לווסת החודש/עונה בינונית)
//   bleedings[last]     = הדם האחרון (מוקד ההפלגה — שוע"ר מסוף הדימום)
// status='completed' נקבע רק אחרי טבילה; ראיה חדשה בזמן 'active' = המשך (append).
const cycleSchema = new mongoose.Schema(
  {
    bleedings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sighting' }],
    phase: {
      type: String,
      enum: ['tahorah', 'waiting_5_days', 'waiting_hefsek', 'counting_7', 'waiting_mikveh'],
      default: 'waiting_5_days',
    },
    hefsekTahara: {
      gregorianDatetime: Date,
      hebrewDate: hebrewDateSchema,
    },
    cleanDays: { type: [cleanDaySchema], default: [] },
    mikveDate: {
      planned: hebrewDateSchema,
      actual:  Date,
    },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
  },
  { timestamps: true },
)

export default mongoose.model('Cycle', cycleSchema)
