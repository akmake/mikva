package com.example.myapplication.network

import com.example.myapplication.halacha.CheckResult
import com.example.myapplication.halacha.Cycle
import com.example.myapplication.halacha.HebrewDate
import com.example.myapplication.halacha.Sighting
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * סנכרון best-effort של פעולות מקומיות אל השרת הקיים (מקור האמת = המכשיר).
 * כל קריאה מחזירה true/false ואינה זורקת — כישלון רשת לא חוסם את ה-UI.
 * (משיכה מהשרת אל המכשיר טרם מומשה — v1 דוחף בלבד.)
 */
object SyncApi {
    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private fun isoOf(millis: Long): String = iso.format(Date(millis))

    private fun hd(h: HebrewDate) = JSONObject().apply {
        put("year", h.year); put("month", h.month); put("day", h.day)
    }

    suspend fun pushSighting(s: Sighting): Boolean {
        val body = JSONObject().apply {
            put("gregorianDatetime", isoOf(s.gregorianEpochMillis))
            put("hebrewDate", hd(s.hebrewDate))
            put("onah", s.onah.json)
            put("sourceType", s.sourceType.json)
            s.lat?.let { put("lat", it) }
            s.lng?.let { put("lng", it) }
        }
        return Http.postJson("/sightings", body) != null
    }

    suspend fun pushHefsek(hefsekHD: HebrewDate, millis: Long): Boolean {
        val body = JSONObject().apply {
            put("gregorianDatetime", isoOf(millis))
            put("hebrewDate", hd(hefsekHD))
        }
        return Http.postJson("/cycle/hefsek-tahara", body) != null
    }

    suspend fun pushBedika(dayNumber: Int, hebrewDate: HebrewDate, type: String, result: CheckResult): Boolean {
        val body = JSONObject().apply {
            put("dayNumber", dayNumber)
            put("hebrewDate", hd(hebrewDate))
            put("type", type)
            put("result", result.json)
        }
        return Http.postJson("/cycle/bedika", body) != null
    }

    suspend fun pushMikveh(millis: Long): Boolean {
        val body = JSONObject().apply { put("gregorianDatetime", isoOf(millis)) }
        return Http.postJson("/cycle/mikveh", body) != null
    }

    suspend fun pushSettings(c: Cycle): Boolean {
        val body = JSONObject().apply {
            put("isPregnant", c.isPregnant)
            put("isMeineket", c.isMeineket)
            put("useShuar", c.useShuar)
            put("onaBeinonit31", c.onaBeinonit31)
            put("day30Policy", c.day30Policy)
        }
        return Http.postJson("/cycle/settings", body) != null
    }
}
