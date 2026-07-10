import mongoose from 'mongoose'

// הגדרות משתמש גלובליות (סינגלטון) — אינן שייכות לנידה בודדת ולכן הופרדו מ-Cycle
// כשה-Cycle הפך לאוסף היסטורי (מסמך אחד לכל נידה).
const settingsSchema = new mongoose.Schema(
  {
    isPregnant:      { type: Boolean, default: false },
    pregnancyStart:  Date,
    isMeineket:      { type: Boolean, default: false },
    meinaketStart:   Date,

    // ── הגדרות מנוע הווסתות (פרק כד) ──────────────────────────────────────
    useShuar:      { type: Boolean, default: false }, // שיטת שוע"ר להפלגה (סוף→תחילה)
    onaBeinonit31: { type: Boolean, default: false }, // חומרת יום ל"א (כד,כט)
    day30Policy:   { type: String, enum: ['tzemach_tzedek', 'rosh_chodesh'], default: 'tzemach_tzedek' },

    // מספר ימים מהראייה האחרונה שאחריו נשאלת האם היא בהריון (0 = כבוי).
    pregnancyPromptDays: { type: Number, default: 60 },
    // ה-onset (gregorian) שעבורו כבר נדחתה שאלת ההריון — כדי לא לשאול שוב באותה נידה.
    pregnancyPromptSnoozedFor: { type: String, default: null },
  },
  { timestamps: true },
)

export default mongoose.model('Settings', settingsSchema)
