package com.example.myapplication.data

import android.content.Context
import com.example.myapplication.halacha.CheckResult
import com.example.myapplication.halacha.CleanDay
import com.example.myapplication.halacha.Cycle
import com.example.myapplication.halacha.HebrewDate
import com.example.myapplication.halacha.Onah
import com.example.myapplication.halacha.Phase
import com.example.myapplication.halacha.Sighting
import com.example.myapplication.halacha.SourceType
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** מצב האפליקציה המלא — נשמר מקומית. */
data class AppState(
    val cycle: Cycle = Cycle(),
    val sightings: List<Sighting> = emptyList(),
)

/**
 * אחסון מקומי מבוסס-קובץ JSON (מקור האמת במכשיר). מופשט כך שניתן להחליף
 * בהמשך ל-Room בלי לגעת ב-UI או במנוע.
 */
object LocalStore {
    private const val FILE_NAME = "mikva_state.json"

    private fun file(ctx: Context) = File(ctx.filesDir, FILE_NAME)

    fun load(ctx: Context): AppState {
        val f = file(ctx)
        if (!f.exists()) return AppState()
        return try { fromJson(JSONObject(f.readText())) }
        catch (_: Exception) { AppState() }
    }

    fun save(ctx: Context, state: AppState) {
        try { file(ctx).writeText(toJson(state).toString()) } catch (_: Exception) {}
    }

    // ── (de)serialization ─────────────────────────────────────────────────────

    private fun hdToJson(hd: HebrewDate) = JSONObject().apply {
        put("year", hd.year); put("month", hd.month); put("day", hd.day)
    }

    private fun hdFrom(o: JSONObject?): HebrewDate? =
        o?.let { HebrewDate(it.getInt("year"), it.getInt("month"), it.getInt("day")) }

    private fun sightingToJson(s: Sighting) = JSONObject().apply {
        put("id", s.id)
        put("hebrewDate", hdToJson(s.hebrewDate))
        put("onah", s.onah.json)
        put("sourceType", s.sourceType.json)
        put("gregorianEpochMillis", s.gregorianEpochMillis)
        s.hefsekTahara?.let { put("hefsekTahara", hdToJson(it)) }
        s.lat?.let { put("lat", it) }
        s.lng?.let { put("lng", it) }
    }

    private fun sightingFrom(o: JSONObject) = Sighting(
        id = o.getString("id"),
        hebrewDate = hdFrom(o.getJSONObject("hebrewDate"))!!,
        onah = Onah.from(o.optString("onah")),
        sourceType = SourceType.from(o.optString("sourceType")),
        gregorianEpochMillis = o.optLong("gregorianEpochMillis"),
        hefsekTahara = hdFrom(o.optJSONObject("hefsekTahara")),
        lat = if (o.has("lat")) o.getDouble("lat") else null,
        lng = if (o.has("lng")) o.getDouble("lng") else null,
    )

    private fun cleanDayToJson(c: CleanDay) = JSONObject().apply {
        put("dayNumber", c.dayNumber)
        put("hebrewDate", hdToJson(c.hebrewDate))
        put("morningCheck", c.morningCheck.json)
        put("eveningCheck", c.eveningCheck.json)
        put("mochCheck", c.mochCheck.json)
    }

    private fun cleanDayFrom(o: JSONObject) = CleanDay(
        dayNumber = o.getInt("dayNumber"),
        hebrewDate = hdFrom(o.getJSONObject("hebrewDate"))!!,
        morningCheck = CheckResult.from(o.optString("morningCheck")),
        eveningCheck = CheckResult.from(o.optString("eveningCheck")),
        mochCheck = CheckResult.from(o.optString("mochCheck")),
    )

    private fun toJson(state: AppState): JSONObject {
        val c = state.cycle
        val cycleJson = JSONObject().apply {
            put("phase", c.phase.json)
            put("latestSightingId", c.latestSighting?.id)
            c.hefsekTahara?.let { put("hefsekTahara", hdToJson(it)) }
            put("cleanDays", JSONArray(c.cleanDays.map { cleanDayToJson(it) }))
            c.mikvehActualMillis?.let { put("mikvehActualMillis", it) }
            put("isPregnant", c.isPregnant)
            put("isMeineket", c.isMeineket)
            put("useShuar", c.useShuar)
            put("onaBeinonit31", c.onaBeinonit31)
            put("day30Policy", c.day30Policy)
        }
        return JSONObject().apply {
            put("cycle", cycleJson)
            put("sightings", JSONArray(state.sightings.map { sightingToJson(it) }))
        }
    }

    private fun fromJson(root: JSONObject): AppState {
        val sightingsArr = root.optJSONArray("sightings") ?: JSONArray()
        val sightings = (0 until sightingsArr.length()).map { sightingFrom(sightingsArr.getJSONObject(it)) }

        val cj = root.optJSONObject("cycle") ?: JSONObject()
        val cleanArr = cj.optJSONArray("cleanDays") ?: JSONArray()
        val cleanDays = (0 until cleanArr.length()).map { cleanDayFrom(cleanArr.getJSONObject(it)) }
        val latestId = cj.optString("latestSightingId", null.toString()).takeIf { it != "null" && it.isNotEmpty() }

        val cycle = Cycle(
            phase = Phase.from(cj.optString("phase")),
            latestSighting = sightings.firstOrNull { it.id == latestId },
            hefsekTahara = hdFrom(cj.optJSONObject("hefsekTahara")),
            cleanDays = cleanDays,
            mikvehActualMillis = if (cj.has("mikvehActualMillis")) cj.getLong("mikvehActualMillis") else null,
            isPregnant = cj.optBoolean("isPregnant"),
            isMeineket = cj.optBoolean("isMeineket"),
            useShuar = cj.optBoolean("useShuar"),
            onaBeinonit31 = cj.optBoolean("onaBeinonit31"),
            day30Policy = cj.optString("day30Policy", "tzemach_tzedek"),
        )
        return AppState(cycle, sightings)
    }
}
