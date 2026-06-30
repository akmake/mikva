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
    // סוג הראייה (פרק כד,ג–ה) — קובע אם נכנסת לחישובי הווסתות
    sourceType: {
      type: String,
      enum: ['veset', 'bedika', 'kinuach', 'kesem', 'besulim', 'leida', 'haflata', 'doctor_safek'],
      default: 'veset',
    },
    isOpenSource: { type: Boolean, default: false },
    // תאריך הפסק הטהרה של המחזור שראייה זו פתחה (סוף הדימום).
    // משמש לחישוב שוע"ר (סוף→תחילה) ולעקירת המשך-ראייה בווסת החודש (V-24).
    hefsekTahara: { type: hebrewDateSchema, default: undefined },
    lat: Number,
    lng: Number,
    notes: String,
  },
  { timestamps: true },
)

export default mongoose.model('Sighting', sightingSchema)
