package com.example.myapplication.halacha

/** עונה — יחידת הזמן הבסיסית. לילה קודם ליום באותה יממה. */
enum class Onah(val json: String, val he: String) {
    NIGHT("night", "עונת הלילה"),
    DAY("day", "עונת היום"),
    FULL_DAY("full_day", "יממה שלמה");

    companion object {
        fun from(json: String?): Onah = entries.firstOrNull { it.json == json } ?: DAY
    }
}

/** תוצאת בדיקה. */
enum class CheckResult(val json: String) {
    CLEAN("clean"), STAIN("stain"), NOT_DONE("not_done");

    companion object {
        fun from(json: String?): CheckResult = entries.firstOrNull { it.json == json } ?: NOT_DONE
    }
}

/**
 * סוג ראייה (פרק כד, סעיפים ג–ה). רק ראיה ובדיקה (דאורייתא ודאי) נכנסות
 * לחישובי הווסתות; השאר מטמאים בלבד.
 */
enum class SourceType(val json: String, val he: String, val countsForVeset: Boolean) {
    VESET("veset", "ראיה", true),
    BEDIKA("bedika", "בדיקה", true),
    KINUACH("kinuach", "קינוח", false),
    KESEM("kesem", "כתם", false),
    BESULIM("besulim", "דם בתולים", false),
    LEIDA("leida", "דם לידה", false),
    HAFLATA("haflata", "הפלה", false),
    DOCTOR_SAFEK("doctor_safek", "בדיקת רופא (ספק)", false);

    companion object {
        fun from(json: String?): SourceType = entries.firstOrNull { it.json == json } ?: VESET
    }
}

/** שלב המחזור. */
enum class Phase(val json: String, val he: String) {
    TAHORAH("tahorah", "טהורה"),
    WAITING_5_DAYS("waiting_5_days", "ימי המתנה"),
    WAITING_HEFSEK("waiting_hefsek", "ממתינה להפסק טהרה"),
    COUNTING_7("counting_7", "ספירת 7 נקיים"),
    WAITING_MIKVEH("waiting_mikveh", "מוכנה לטבילה"),
    BLOCKED("blocked", "נמצא דם — הספירה נפסקה");

    companion object {
        fun from(json: String?): Phase = entries.firstOrNull { it.json == json } ?: TAHORAH
    }
}

/** ראייה — נקודת העוגן של המחזור ושל חישובי הווסתות. */
data class Sighting(
    val id: String,
    val hebrewDate: HebrewDate,
    val onah: Onah,
    val sourceType: SourceType = SourceType.VESET,
    val gregorianEpochMillis: Long,
    val hefsekTahara: HebrewDate? = null,   // סוף הדימום של המחזור שראייה זו פתחה (V-24, שוע"ר)
    val lat: Double? = null,
    val lng: Double? = null,
)

/** יום מתוך שבעת הנקיים. */
data class CleanDay(
    val dayNumber: Int,                     // 1..7 מהפסק הטהרה
    val hebrewDate: HebrewDate,
    val morningCheck: CheckResult = CheckResult.NOT_DONE,
    val eveningCheck: CheckResult = CheckResult.NOT_DONE,
    val mochCheck: CheckResult = CheckResult.NOT_DONE,
)

/** מצב המחזור הנוכחי (מקביל ל-Cycle בשרת). */
data class Cycle(
    val phase: Phase = Phase.TAHORAH,
    val latestSighting: Sighting? = null,
    val hefsekTahara: HebrewDate? = null,
    val cleanDays: List<CleanDay> = emptyList(),
    val mikvehActualMillis: Long? = null,
    // הגדרות מנוע הווסתות
    val isPregnant: Boolean = false,
    val isMeineket: Boolean = false,
    val useShuar: Boolean = false,
    val onaBeinonit31: Boolean = false,
    val day30Policy: String = "tzemach_tzedek",
) {
    val isMesulekes: Boolean get() = isPregnant || isMeineket
}
