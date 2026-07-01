package com.example.myapplication.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.myapplication.data.AppState
import com.example.myapplication.data.LocalStore
import com.example.myapplication.halacha.CheckResult
import com.example.myapplication.halacha.CleanDay
import com.example.myapplication.halacha.Cycle
import com.example.myapplication.halacha.HebrewCalendar
import com.example.myapplication.halacha.HebrewDate
import com.example.myapplication.halacha.Onah
import com.example.myapplication.halacha.Phase
import com.example.myapplication.halacha.Sighting
import com.example.myapplication.halacha.SourceType
import com.example.myapplication.location.LocationProvider
import com.example.myapplication.network.SyncApi
import com.example.myapplication.network.ZmanimApi
import com.example.myapplication.network.ZmanimResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

class MikvaViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(LocalStore.load(app))
    val state: StateFlow<AppState> = _state.asStateFlow()

    private val _location = MutableStateFlow(LocationProvider.FALLBACK)
    val location: StateFlow<LocationProvider.Loc> = _location.asStateFlow()

    fun refreshLocation() {
        _location.value = LocationProvider.current(getApplication())
    }

    private fun persist(next: AppState) {
        _state.value = next
        LocalStore.save(getApplication(), next)
    }

    /** זמני היום עבור תאריך עברי, לפי המיקום הנוכחי (מהשרת). */
    suspend fun zmanimFor(hd: HebrewDate): ZmanimResult? {
        val g = HebrewCalendar.fixedToGreg(hd.fixed)
        val loc = _location.value
        return ZmanimApi.forDay(loc.lat, loc.lng, g)
    }

    // ── פעולות ────────────────────────────────────────────────────────────────

    fun recordSighting(
        hd: HebrewDate, onah: Onah, sourceType: SourceType,
        gregMillis: Long, lat: Double?, lng: Double?,
    ) {
        val sighting = Sighting(
            id = UUID.randomUUID().toString(),
            hebrewDate = hd, onah = onah, sourceType = sourceType,
            gregorianEpochMillis = gregMillis, lat = lat, lng = lng,
        )
        val cur = _state.value
        // דם באמצע/אחרי ספירת ה-7 נקיים (כבר פרושה) → אין 5 ימים מחדש, הפסק מיידי.
        val midCount = cur.cycle.phase == Phase.COUNTING_7 || cur.cycle.phase == Phase.WAITING_MIKVEH
        val cycle = cur.cycle.copy(
            phase = if (midCount) Phase.WAITING_HEFSEK else Phase.WAITING_5_DAYS,
            latestSighting = sighting,
            hefsekTahara = null,
            cleanDays = emptyList(),
            mikvehActualMillis = null,
        )
        persist(cur.copy(cycle = cycle, sightings = cur.sightings + sighting))
        sync { SyncApi.pushSighting(sighting) }
    }

    fun doHefsek(hd: HebrewDate) {
        val cur = _state.value
        // חותם את ההפסק על הראייה שפתחה את המחזור (לחישובי ווסת עתידיים)
        val stampedLatest = cur.cycle.latestSighting?.copy(hefsekTahara = hd)
        val sightings = if (stampedLatest != null)
            cur.sightings.map { if (it.id == stampedLatest.id) stampedLatest else it }
        else cur.sightings
        val cycle = cur.cycle.copy(
            phase = Phase.COUNTING_7,
            hefsekTahara = hd,
            cleanDays = emptyList(),
            latestSighting = stampedLatest ?: cur.cycle.latestSighting,
        )
        persist(cur.copy(cycle = cycle, sightings = sightings))
        sync { SyncApi.pushHefsek(hd, System.currentTimeMillis()) }
    }

    fun doBedika(dayNumber: Int, hd: HebrewDate, type: String, result: CheckResult) {
        val cur = _state.value
        val days = cur.cycle.cleanDays.toMutableList()
        val idx = days.indexOfFirst { it.dayNumber == dayNumber }
        val base = if (idx >= 0) days[idx] else CleanDay(dayNumber, hd)
        val updated = when (type) {
            "morning" -> base.copy(morningCheck = result)
            "evening" -> base.copy(eveningCheck = result)
            else -> base.copy(mochCheck = result)
        }
        if (idx >= 0) days[idx] = updated else days.add(updated)
        persist(cur.copy(cycle = cur.cycle.copy(cleanDays = days)))
        sync { SyncApi.pushBedika(dayNumber, hd, type, result) }
    }

    fun doMikveh() {
        val cur = _state.value
        val now = System.currentTimeMillis()
        persist(cur.copy(cycle = cur.cycle.copy(phase = Phase.TAHORAH, mikvehActualMillis = now)))
        sync { SyncApi.pushMikveh(now) }
    }

    fun updateSettings(transform: (Cycle) -> Cycle) {
        val cur = _state.value
        val cycle = transform(cur.cycle)
        persist(cur.copy(cycle = cycle))
        sync { SyncApi.pushSettings(cycle) }
    }

    private fun sync(block: suspend () -> Unit) {
        viewModelScope.launch(Dispatchers.IO) { runCatching { block() } }
    }
}
