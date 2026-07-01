package com.example.myapplication.halacha

import java.util.Calendar

/**
 * לוח עברי טהור ל-Kotlin — פורט מאומת של האלגוריתם הקלנדרי
 * (Dershowitz & Reingold, "Calendrical Calculations"), שנבדק מול kosher-zmanim
 * על 1900–2100 (המרות דו-כיווניות, ימים בחודש, שנה מעוברת) — 0 סטיות.
 *
 * מספור חודשים: 1=ניסן, 7=תשרי ... 12=אדר/אדר א׳, 13=אדר ב׳ — זהה ל-JewishCalendar.
 * כל החישובים עוברים דרך "יום קבוע" (RD / fixed day) כמספר שלם.
 */

/** תאריך עברי. הַשוואה כרונולוגית אמיתית דרך היום-הקבוע. */
data class HebrewDate(val year: Int, val month: Int, val day: Int) : Comparable<HebrewDate> {
    val fixed: Int get() = HebrewCalendar.hebToFixed(year, month, day)
    override fun compareTo(other: HebrewDate): Int = fixed.compareTo(other.fixed)
}

/** תאריך גרגוריאני פרולפטי. */
data class GregorianDate(val year: Int, val month: Int, val day: Int)

object HebrewCalendar {

    private const val HEBREW_EPOCH = -1373427

    val MONTH_NAMES = mapOf(
        1 to "ניסן", 2 to "אייר", 3 to "סיוון", 4 to "תמוז", 5 to "אב", 6 to "אלול",
        7 to "תשרי", 8 to "חשוון", 9 to "כסלו", 10 to "טבת", 11 to "שבט", 12 to "אדר",
        13 to "אדר ב׳",
    )

    private val DAY_LETTERS = arrayOf(
        "", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י",
        "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ",
        "כא", "כב", "כג", "כד", "כה", "כו", "כז", "כח", "כט", "ל",
    )

    // ── עזרי מודולו/חלוקה עם עיגול כלפי מטה ──────────────────────────────────
    private fun floorDiv(a: Long, b: Long): Long = Math.floorDiv(a, b)
    private fun floorDiv(a: Int, b: Int): Int = Math.floorDiv(a, b)
    private fun amod(a: Int, b: Int): Int = ((a % b) + b) % b

    // ── גרגוריאני <-> יום קבוע ────────────────────────────────────────────────
    private fun gregLeap(y: Int): Boolean = (y % 4 == 0) && (y % 100 != 0 || y % 400 == 0)

    fun gregToFixed(y: Int, m: Int, d: Int): Int =
        365 * (y - 1) +
        floorDiv(y - 1, 4) -
        floorDiv(y - 1, 100) +
        floorDiv(y - 1, 400) +
        floorDiv(367 * m - 362, 12) +
        (if (m <= 2) 0 else if (gregLeap(y)) -1 else -2) +
        d

    private fun gregYearFromFixed(date: Int): Int {
        val d0 = date - 1
        val n400 = floorDiv(d0, 146097); val d1 = amod(d0, 146097)
        val n100 = floorDiv(d1, 36524);  val d2 = amod(d1, 36524)
        val n4   = floorDiv(d2, 1461);   val d3 = amod(d2, 1461)
        val n1   = floorDiv(d3, 365)
        val year = 400 * n400 + 100 * n100 + 4 * n4 + n1
        return if (n100 == 4 || n1 == 4) year else year + 1
    }

    fun fixedToGreg(date: Int): GregorianDate {
        val year = gregYearFromFixed(date)
        val priorDays = date - gregToFixed(year, 1, 1)
        val correction = if (date < gregToFixed(year, 3, 1)) 0 else if (gregLeap(year)) 1 else 2
        val month = floorDiv(12 * (priorDays + correction) + 373, 367)
        val day = date - gregToFixed(year, month, 1) + 1
        return GregorianDate(year, month, day)
    }

    // ── עברי ──────────────────────────────────────────────────────────────────
    fun isLeapYear(year: Int): Boolean = amod(7 * year + 1, 19) < 7
    fun lastMonthOfYear(year: Int): Int = if (isLeapYear(year)) 13 else 12

    private fun elapsedDays(year: Int): Int {
        val monthsElapsed = floorDiv(235L * year - 234L, 19L)
        val partsElapsed = 12084L + 13753L * monthsElapsed
        var day = 29L * monthsElapsed + floorDiv(partsElapsed, 25920L)
        if (amod(((3L * (day + 1)) % 7L).toInt(), 7) < 3) day += 1
        return day.toInt()
    }

    private fun yearLengthCorrection(year: Int): Int {
        val ny0 = elapsedDays(year - 1)
        val ny1 = elapsedDays(year)
        val ny2 = elapsedDays(year + 1)
        return when {
            ny2 - ny1 == 356 -> 2
            ny1 - ny0 == 382 -> 1
            else -> 0
        }
    }

    private fun newYear(year: Int): Int =
        HEBREW_EPOCH + elapsedDays(year) + yearLengthCorrection(year)

    fun daysInYear(year: Int): Int = newYear(year + 1) - newYear(year)
    private fun longHeshvan(year: Int): Boolean = daysInYear(year).let { it == 355 || it == 385 }
    private fun shortKislev(year: Int): Boolean = daysInYear(year).let { it == 353 || it == 383 }

    /** מספר הימים בחודש עברי (29 או 30). */
    fun daysInMonth(year: Int, month: Int): Int = when {
        month == 2 || month == 4 || month == 6 || month == 10 || month == 13 -> 29
        month == 8 && !longHeshvan(year) -> 29
        month == 9 && shortKislev(year) -> 29
        month == 12 && !isLeapYear(year) -> 29
        else -> 30
    }

    fun hebToFixed(year: Int, month: Int, day: Int): Int {
        var sum = 0
        if (month < 7) {
            val last = lastMonthOfYear(year)
            for (m in 7..last) sum += daysInMonth(year, m)
            for (m in 1 until month) sum += daysInMonth(year, m)
        } else {
            for (m in 7 until month) sum += daysInMonth(year, m)
        }
        return newYear(year) + day - 1 + sum
    }

    fun fixedToHeb(date: Int): HebrewDate {
        var year = floorDiv(date - HEBREW_EPOCH, 366) + 1
        while (newYear(year + 1) <= date) year++
        val start = if (date < hebToFixed(year, 1, 1)) 7 else 1
        var month = start
        while (date > hebToFixed(year, month, daysInMonth(year, month))) month++
        val day = date - hebToFixed(year, month, 1) + 1
        return HebrewDate(year, month, day)
    }

    // ── ממשק גבוה — מקביל ל-hebrewCalendar.js שבקליינט ─────────────────────────

    fun addDays(hd: HebrewDate, n: Int): HebrewDate = fixedToHeb(hd.fixed + n)

    fun daysBetween(from: HebrewDate, to: HebrewDate): Int = to.fixed - from.fixed

    /** אותו יום בחודש הבא, עם קיצוץ אם החודש הבא קצר יותר. */
    fun nextMonthSameDay(hd: HebrewDate): HebrewDate {
        val nm = nextMonth(hd.year, hd.month)
        val targetDay = minOf(hd.day, daysInMonth(nm.year, nm.month))
        return HebrewDate(nm.year, nm.month, targetDay)
    }

    fun addMonths(hd: HebrewDate, n: Int): HebrewDate {
        var r = hd
        repeat(n) { r = nextMonthSameDay(r) }
        return r
    }

    /** החודש העברי הבא (ניסן=1..אלול=6, תשרי=7..אדר=12/13). */
    fun nextMonth(year: Int, month: Int): YM {
        val leap = isLeapYear(year)
        return when {
            month == 6 -> YM(year + 1, 7)                 // אלול → תשרי (שנה הבאה)
            month == 12 -> if (leap) YM(year, 13) else YM(year, 1) // אדר → אדר ב׳ / ניסן
            month == 13 -> YM(year, 1)                    // אדר ב׳ → ניסן
            else -> YM(year, month + 1)
        }
    }

    fun prevMonth(year: Int, month: Int): YM {
        val leap = isLeapYear(year)
        return when {
            month == 7 -> YM(year - 1, 6)                 // תשרי → אלול (שנה קודמת)
            month == 1 -> if (leap) YM(year, 13) else YM(year, 12)
            else -> YM(year, month - 1)
        }
    }

    fun today(): HebrewDate {
        val c = Calendar.getInstance()
        return fixedToHeb(gregToFixed(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH)))
    }

    fun monthName(year: Int, month: Int): String =
        if (isLeapYear(year) && month == 12) "אדר א׳" else MONTH_NAMES[month] ?: ""

    fun dayLetters(day: Int): String = DAY_LETTERS.getOrElse(day) { day.toString() }

    fun formatDate(hd: HebrewDate): String = "${dayLetters(hd.day)} ${monthName(hd.year, hd.month)}"

    /** אותיות גימטריה לשנה (למשל תשפ״ו). */
    fun formatYear(year: Int): String {
        val H = arrayOf("", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק")
        val T = arrayOf("", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ")
        val U = arrayOf("", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט")
        val n = year % 1000
        val h = n / 100; val tu = n % 100; val t = tu / 10; val u = tu % 10
        var r = if (h > 0) H[h] else ""
        when {
            tu == 15 -> r += "טו"
            tu == 16 -> r += "טז"
            else -> { if (t > 0) r += T[t]; if (u > 0) r += U[u] }
        }
        return if (r.length <= 1) "$r׳" else r.dropLast(1) + "״" + r.last()
    }
}

/** זוג שנה/חודש עברי. */
data class YM(val year: Int, val month: Int)
