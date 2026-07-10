import mongoose from 'mongoose'

const mikvaSchema = new mongoose.Schema(
  {
    // מזהה המקווה באתר taharat.org.il (למניעת כפילויות ולרענון עתידי)
    externalId: { type: Number, required: true, unique: true, index: true },
    source: { type: String, default: 'taharat.org.il' },
    url: String,

    // שדות מובנים
    title: String, // הכותרת המלאה: "מקווה <שם> - <עיר>"
    name: String, // שם המקווה
    city: { type: String, index: true },
    address: String,
    phone: String,
    contact: String, // איש קשר
    kashrut: String, // תיאור הכשרות המלא
    supervised: { type: Boolean, default: false }, // מפוקח ע"י המרכז הארצי לטהרת המשפחה
    openingHours: String, // שעות פתיחה
    services: String, // שירותים במקווה (טקסט גולמי מהאתר)
    notes: String, // הערות

    waze: String,
    googleMaps: String,

    // קואורדינטות (מ-geocoding), ורמת הדיוק: exact | street | city | failed
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    geoPrecision: { type: String, default: null },
    geocodedAt: Date,

    // כל השדות הגולמיים כפי שנשלפו מהאתר, לשימור מלא
    fields: { type: mongoose.Schema.Types.Mixed, default: {} },

    scrapedAt: Date,
  },
  { timestamps: true },
)

export default mongoose.model('Mikva', mikvaSchema)
