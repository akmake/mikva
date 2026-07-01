package com.example.myapplication.halacha

/** סטטוס ספירת שבעה נקיים. */
enum class CleanStatus { COMPLETE, BLOCKED, NO_BEDIKOT, INCOMPLETE }

/** תוצאת הערכת שבעה נקיים. */
data class CleanState(
    val complete: Boolean,
    val tovelDay: Int?,          // יום (1..7 מהפסק) שבו נסגר החלון; טובלת במוצאיו
    val cleanChecked: List<Int>,
    val status: CleanStatus,
)

/**
 * מנוע המחזור — פורט נאמן של cleanDaysEngine.js + cycleCalculator.js.
 *
 * בדיעבד (פרק יז, ח/כב): די בבדיקה נקייה ביום הראשון *ובשביעי* של חלון 7 הימים —
 * האמצע מוחזק בחזקת טהרה. ספירה תקפה = קיים חלון [A, A+6] ששני קצותיו נקיים
 * ואין ביניהם יום שנמצא בו דם. גישור ≤5 (סוגיית הנוב"י) *טרם מומש* — שמרני.
 */
object CycleEngine {

    private fun isClean(d: CleanDay) =
        d.morningCheck == CheckResult.CLEAN || d.eveningCheck == CheckResult.CLEAN

    private fun isBlocked(d: CleanDay) =
        d.morningCheck == CheckResult.STAIN || d.eveningCheck == CheckResult.STAIN

    fun evaluateCleanDays(cleanDays: List<CleanDay>): CleanState {
        val cleanSet = HashSet<Int>()
        val blockedSet = HashSet<Int>()
        for (d in cleanDays) {
            if (isClean(d)) cleanSet.add(d.dayNumber)
            if (isBlocked(d)) blockedSet.add(d.dayNumber)
        }
        val checked = cleanSet.sorted()

        // החלון המוקדם ביותר [A, A+6] ששני קצותיו נקיים ואין דם בתווך
        var tovelDay: Int? = null
        for (a in checked) {
            if (!cleanSet.contains(a + 6)) continue
            var ok = true
            for (k in a..a + 6) if (blockedSet.contains(k)) { ok = false; break }
            if (ok) { tovelDay = a + 6; break }
        }

        val status = when {
            tovelDay != null -> CleanStatus.COMPLETE
            blockedSet.isNotEmpty() -> CleanStatus.BLOCKED
            checked.isEmpty() -> CleanStatus.NO_BEDIKOT
            else -> CleanStatus.INCOMPLETE
        }
        return CleanState(tovelDay != null, tovelDay, checked, status)
    }

    // ── עוגני זמן במחזור ──────────────────────────────────────────────────────

    /** יום 5 מהראייה (יום 1 = יום הראייה עצמו) — מוקדם ביותר להפסק טהרה. */
    fun hefsekTaharaDay(sightingHD: HebrewDate): HebrewDate = HebrewCalendar.addDays(sightingHD, 4)

    /** יום 1 של שבעה נקיים = יום אחרי הפסק הטהרה. */
    fun firstCleanDay(hefsekHD: HebrewDate): HebrewDate = HebrewCalendar.addDays(hefsekHD, 1)

    /** ליל הטבילה = הלילה שאחרי היום שבו נסגרה הספירה (tovelDay, ברירת מחדל 7). */
    fun plannedMikvehDay(hefsekHD: HebrewDate, tovelDay: Int = 7): HebrewDate =
        HebrewCalendar.addDays(hefsekHD, tovelDay + 1)

    /** איזה יום נקי (1..7) הוא היום ביחס להפסק; null אם מחוץ לטווח. */
    fun currentCleanDayNumber(hefsekHD: HebrewDate, today: HebrewDate = HebrewCalendar.today()): Int? {
        val diff = HebrewCalendar.daysBetween(firstCleanDay(hefsekHD), today)
        return if (diff < 0 || diff > 6) null else diff + 1
    }

    /** כמה ימים עד שמותר הפסק טהרה (0 = היום). */
    fun daysUntilHefsekAllowed(sightingHD: HebrewDate, today: HebrewDate = HebrewCalendar.today()): Int {
        val diff = HebrewCalendar.daysBetween(today, hefsekTaharaDay(sightingHD))
        return maxOf(0, diff)
    }

    /** שלב המחזור מהנתונים + התאריך העברי של היום. */
    fun derivePhase(cycle: Cycle, today: HebrewDate = HebrewCalendar.today()): Phase {
        if (cycle.phase == Phase.WAITING_5_DAYS && cycle.latestSighting != null) {
            val earliest = hefsekTaharaDay(cycle.latestSighting.hebrewDate)
            return if (today >= earliest) Phase.WAITING_HEFSEK else Phase.WAITING_5_DAYS
        }
        return cycle.phase
    }

    /**
     * שלב אפקטיבי: בזמן ספירה, מנוע הבדיקות גובר על הדגל הנאיבי —
     * דם באמצע → BLOCKED (הפסק חדש), חלון סגור → WAITING_MIKVEH.
     */
    fun effectivePhase(phase: Phase, cleanState: CleanState): Phase {
        if (phase != Phase.COUNTING_7) return phase
        return when {
            cleanState.status == CleanStatus.BLOCKED -> Phase.BLOCKED
            cleanState.complete -> Phase.WAITING_MIKVEH
            else -> Phase.COUNTING_7
        }
    }
}
