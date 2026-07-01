package com.example.myapplication.network

import com.example.myapplication.halacha.GregorianDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * הגדרת בסיס. אמולטור מגיע ל-localhost של המחשב דרך 10.0.2.2.
 * למכשיר פיזי — יש לשנות לכתובת ה-LAN של השרת (או לכתובת פרוד).
 */
object Config {
    @Volatile var baseUrl: String = "http://10.0.2.2:5000/api"
}

/** גבולות העונות ליום נתון, במילישניות epoch (מגיע מהשרת לפי מיקום). */
data class ZmanimResult(
    val tz: String,
    val nightStart: Long?,   // שקיעת אתמול → תחילת עונת הלילה
    val dayStart: Long?,     // זריחה → תחילת עונת היום
    val dayEnd: Long?,       // שקיעה → סוף עונת היום
    val minchaKetana: Long?, // חלון הפסק טהרה
)

internal object Http {
    private const val TIMEOUT = 10_000

    suspend fun getJson(path: String): JSONObject? = withContext(Dispatchers.IO) {
        val conn = (URL(Config.baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"; connectTimeout = TIMEOUT; readTimeout = TIMEOUT
        }
        try {
            if (conn.responseCode in 200..299) JSONObject(conn.inputStream.bufferedReader().readText())
            else null
        } catch (_: Exception) { null } finally { conn.disconnect() }
    }

    suspend fun postJson(path: String, body: JSONObject): JSONObject? = withContext(Dispatchers.IO) {
        val conn = (URL(Config.baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true
            connectTimeout = TIMEOUT; readTimeout = TIMEOUT
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            if (conn.responseCode in 200..299) JSONObject(conn.inputStream.bufferedReader().readText())
            else null
        } catch (_: Exception) { null } finally { conn.disconnect() }
    }
}

object ZmanimApi {
    private val isoFmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private fun parseIso(s: String?): Long? =
        if (s.isNullOrEmpty() || s == "null") null
        else try { isoFmt.parse(s)?.time } catch (_: Exception) { null }

    /** זמני היום עבור תאריך גרגוריאני + מיקום. null אם השרת לא זמין. */
    suspend fun forDay(lat: Double, lng: Double, g: GregorianDate): ZmanimResult? {
        val o = Http.getJson("/zmanim?lat=$lat&lng=$lng&year=${g.year}&month=${g.month}&day=${g.day}")
            ?: return null
        return ZmanimResult(
            tz = o.optString("tz", "Asia/Jerusalem"),
            nightStart = parseIso(o.optString("nightStart")),
            dayStart = parseIso(o.optString("dayStart")),
            dayEnd = parseIso(o.optString("dayEnd")),
            minchaKetana = parseIso(o.optString("minchaKetana")),
        )
    }
}
