package com.example.myapplication.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.myapplication.halacha.*
import com.example.myapplication.network.ZmanimResult
import java.util.Calendar
import java.util.TimeZone

// ── פלטת צבעים (מקבילה ל-Dashboard.jsx) ─────────────────────────────────────
private val CNightDefault = Color(0xFFF1F5F9)
private val CDayDefault = Color(0xFFFFFFFF)
private val CRose = Color(0xFFF43F5E)
private val CRose400 = Color(0xFFFB7185)
private val CRose300 = Color(0xFFFDA4AF)
private val CRose200 = Color(0xFFFECDD3)
private val CRose100 = Color(0xFFFFE4E6)
private val CAmber = Color(0xFFFBBF24)
private val CEmerald400 = Color(0xFF34D399)
private val CEmerald300 = Color(0xFF6EE7B7)
private val CEmerald200 = Color(0xFFA7F3D0)
private val CEmerald100 = Color(0xFFD1FAE5)
private val CBlue500 = Color(0xFF3B82F6)
private val CBlue200 = Color(0xFFBFDBFE)

private data class CellStatus(
    val nightColor: Color,
    val dayColor: Color,
    val type: String,
    val dayNum: Int?,
)

private fun cellStatus(hd: HebrewDate, st: com.example.myapplication.data.AppState, clean: CleanState): CellStatus {
    val cycle = st.cycle
    // ראייה — צובע רק את העונה שבה הייתה הראייה
    val sight = st.sightings.firstOrNull { it.hebrewDate == hd }
    if (sight != null) {
        return when (sight.onah) {
            Onah.NIGHT -> CellStatus(CRose, CDayDefault, "sighting", null)
            Onah.DAY -> CellStatus(CNightDefault, CRose, "sighting", null)
            Onah.FULL_DAY -> CellStatus(CRose, CRose400, "sighting", null)
        }
    }
    val latest = cycle.latestSighting
    if (latest != null && (cycle.phase == Phase.WAITING_5_DAYS || cycle.phase == Phase.WAITING_HEFSEK)) {
        val diff = HebrewCalendar.daysBetween(latest.hebrewDate, hd)
        if (diff in 1..4) return CellStatus(CRose200, CRose100, "waiting", null)
    }
    val hefsek = cycle.hefsekTahara
    if (hefsek != null) {
        if (hefsek == hd) return CellStatus(CRose100, CAmber, "hefsek", null)
        val diff = HebrewCalendar.daysBetween(hefsek, hd)
        if (diff in 1..7) {
            val rec = cycle.cleanDays.firstOrNull { it.dayNumber == diff }
            if (rec != null && (rec.morningCheck == com.example.myapplication.halacha.CheckResult.STAIN || rec.eveningCheck == com.example.myapplication.halacha.CheckResult.STAIN)) {
                return CellStatus(CRose400, CRose300, "clean_blocked", diff)
            }
            val isTovel = clean.complete && clean.tovelDay == diff
            return CellStatus(
                if (isTovel) CEmerald400 else CEmerald200,
                if (isTovel) CEmerald300 else CEmerald100,
                if (isTovel) "clean_7" else "clean", diff,
            )
        }
        if (clean.complete) {
            val mikveh = CycleEngine.plannedMikvehDay(hefsek, clean.tovelDay ?: 7)
            if (mikveh == hd) {
                val done = cycle.mikvehActualMillis != null
                return CellStatus(if (done) CBlue500 else CBlue200, CDayDefault,
                    if (done) "mikveh" else "mikveh_planned", null)
            }
        }
    }
    return CellStatus(CNightDefault, CDayDefault, "normal", null)
}

@Composable
fun CalendarScreen(vm: MikvaViewModel) {
    val state by vm.state.collectAsState()
    val today = remember { HebrewCalendar.today() }
    var dispYear by remember { mutableIntStateOf(today.year) }
    var dispMonth by remember { mutableIntStateOf(today.month) }
    var selected by remember { mutableStateOf<HebrewDate?>(null) }

    val cleanState = remember(state) { CycleEngine.evaluateCleanDays(state.cycle.cleanDays) }
    val phase = remember(state) { CycleEngine.derivePhase(state.cycle, today) }
    val effectivePhase = remember(phase, cleanState) { CycleEngine.effectivePhase(phase, cleanState) }

    Box(Modifier.fillMaxSize()) {
      Surface(color = Color(0xFFF7F7F4)) {
        Column(Modifier.fillMaxSize().padding(top = 24.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("היומן שלי", fontSize = 12.sp, color = Color(0xFF718078))
                    Text("מקווה", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color(0xFF18352C))
                }
                Surface(shape = RoundedCornerShape(18.dp), color = Color(0xFFE5EFEA)) {
                    Text("פרטי ומאובטח", Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        fontSize = 11.sp, color = Color(0xFF315F50), fontWeight = FontWeight.Medium)
                }
            }
            // כותרת + ניווט חודשים
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FilledTonalButton(onClick = {
                    val p = HebrewCalendar.prevMonth(dispYear, dispMonth); dispYear = p.year; dispMonth = p.month
                }) { Text("‹", fontSize = 22.sp) }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(HebrewCalendar.monthName(dispYear, dispMonth), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text(HebrewCalendar.formatYear(dispYear), fontSize = 13.sp, color = Color.Gray)
                }
                FilledTonalButton(onClick = {
                    val n = HebrewCalendar.nextMonth(dispYear, dispMonth); dispYear = n.year; dispMonth = n.month
                }) { Text("›", fontSize = 22.sp) }
            }

            // באנר שלב
            PhaseBanner(effectivePhase, state.cycle, cleanState, today)

            // כותרות ימי שבוע
            val headers = listOf("א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "שב׳")
            Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp)) {
                headers.forEach {
                    Text(it, Modifier.weight(1f), textAlign = TextAlign.Center, color = Color.Gray, fontSize = 12.sp)
                }
            }

            // רשת
            MonthGrid(dispYear, dispMonth, today, selected, state, cleanState) { selected = it }
        }
      }

      // דף פעולות יומי — מעוגן לתחתית עם רקע כהה
      selected?.let { sel ->
        Box(
            Modifier.fillMaxSize().background(Color(0x40000000)).clickable { selected = null },
            contentAlignment = Alignment.BottomCenter,
        ) {
            Box(Modifier.clickable(enabled = false) {}) {
                DaySheet(
                    vm = vm, hd = sel, state = state, cleanState = cleanState,
                    effectivePhase = effectivePhase, today = today,
                    onClose = { selected = null },
                )
            }
        }
      }
    }
}

@Composable
private fun PhaseBanner(phase: Phase, cycle: Cycle, clean: CleanState, today: HebrewDate) {
    val (bg, fg) = when (phase) {
        Phase.TAHORAH -> Color(0xFFECFDF5) to Color(0xFF047857)
        Phase.WAITING_5_DAYS -> Color(0xFFFFF1F2) to Color(0xFFBE123C)
        Phase.WAITING_HEFSEK -> Color(0xFFFFFBEB) to Color(0xFFB45309)
        Phase.COUNTING_7 -> Color(0xFFECFDF5) to Color(0xFF047857)
        Phase.WAITING_MIKVEH -> Color(0xFFEFF6FF) to Color(0xFF1D4ED8)
        Phase.BLOCKED -> Color(0xFFFFF1F2) to Color(0xFFBE123C)
    }
    val detail = phaseDetail(phase, cycle, clean, today)
    Box(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(12.dp)).background(bg).padding(vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            buildString { append(phase.he); if (detail != null) append(" · $detail") },
            color = fg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
        )
    }
}

private fun phaseDetail(phase: Phase, cycle: Cycle, clean: CleanState, today: HebrewDate): String? = when (phase) {
    Phase.WAITING_5_DAYS -> cycle.latestSighting?.let {
        val d = CycleEngine.daysUntilHefsekAllowed(it.hebrewDate, today)
        if (d == 0) "הפסק טהרה אפשרי היום" else "עוד $d ימים"
    }
    Phase.BLOCKED -> "יש לעשות הפסק טהרה חדש ולהתחיל ספירה"
    Phase.COUNTING_7 -> cycle.hefsekTahara?.let {
        CycleEngine.currentCleanDayNumber(it, today)?.let { n -> "יום $n מ-7" }
    }
    Phase.WAITING_MIKVEH -> cycle.hefsekTahara?.let {
        val m = CycleEngine.plannedMikvehDay(it, clean.tovelDay ?: 7)
        "מקווה: ליל ${HebrewCalendar.formatDate(m)}"
    }
    else -> null
}

@Composable
private fun MonthGrid(
    year: Int, month: Int, today: HebrewDate, selected: HebrewDate?,
    state: com.example.myapplication.data.AppState, clean: CleanState,
    onSelect: (HebrewDate) -> Unit,
) {
    val firstFixed = HebrewDate(year, month, 1).fixed
    val lead = ((firstFixed % 7) + 7) % 7   // 0=ראשon
    val total = HebrewCalendar.daysInMonth(year, month)
    val cells = buildList {
        repeat(lead) { add(null) }
        for (d in 1..total) add(d)
    }
    Column(Modifier.padding(horizontal = 6.dp)) {
        cells.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth()) {
                for (i in 0 until 7) {
                    val d = week.getOrNull(i)
                    Box(Modifier.weight(1f).padding(1.dp)) {
                        if (d != null) {
                            val hd = HebrewDate(year, month, d)
                            DayCell(hd, cellStatus(hd, state, clean),
                                isToday = hd == today, isSelected = hd == selected,
                                onClick = { onSelect(hd) })
                        } else {
                            Spacer(Modifier.height(56.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(hd: HebrewDate, status: CellStatus, isToday: Boolean, isSelected: Boolean, onClick: () -> Unit) {
    val border = when {
        isSelected -> Color(0xFF1F2937)
        isToday -> Color(0xFF60A5FA)
        else -> Color.Transparent
    }
    Row(
        Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(8.dp))
            .background(border).padding(if (border == Color.Transparent) 0.dp else 2.dp)
            .clip(RoundedCornerShape(7.dp)).clickable { onClick() },
    ) {
        // עונת לילה — ימין ב-RTL
        Box(Modifier.fillMaxHeight().weight(0.4f).background(status.nightColor))
        // עונת יום — נושא את מספר היום
        Box(Modifier.fillMaxHeight().weight(0.6f).background(status.dayColor), contentAlignment = Alignment.Center) {
            Text(HebrewCalendar.dayLetters(hd.day), fontSize = 14.sp, fontWeight = FontWeight.Bold,
                color = Color(0xFF1F2937))
        }
    }
}

// ── דף פעולות יומי ────────────────────────────────────────────────────────────

@Composable
private fun DaySheet(
    vm: MikvaViewModel, hd: HebrewDate, state: com.example.myapplication.data.AppState,
    cleanState: CleanState, effectivePhase: Phase, today: HebrewDate, onClose: () -> Unit,
) {
    var zmanim by remember(hd) { mutableStateOf<ZmanimResult?>(null) }
    LaunchedEffect(hd) { zmanim = vm.zmanimFor(hd) }

    val cycle = state.cycle
    val status = cellStatus(hd, state, cleanState)
    val daySighting = state.sightings.firstOrNull { it.hebrewDate == hd }
    val isFuture = hd > today
    val isBlocked = effectivePhase == Phase.BLOCKED

    val canSighting = daySighting == null && !isFuture
    val canHefsek = ((effectivePhase == Phase.WAITING_HEFSEK && cycle.hefsekTahara == null) || isBlocked) && !isFuture
    val canBedika = effectivePhase == Phase.COUNTING_7 && (status.type == "clean" || status.type == "clean_7") && !isFuture
    val canMikveh = effectivePhase == Phase.WAITING_MIKVEH && (!isFuture || status.type == "mikveh_planned")

    var view by remember(hd) { mutableStateOf("main") }
    var selectedHour by remember(hd) { mutableStateOf<Int?>(null) }
    var selectedMinute by remember(hd) { mutableStateOf<Int?>(null) }
    var manualOnah by remember(hd) { mutableStateOf<Onah?>(null) }
    var sourceType by remember(hd) { mutableStateOf(SourceType.VESET) }

    val timeInput = if (selectedHour != null && selectedMinute != null)
        "%02d:%02d".format(selectedHour, selectedMinute) else ""
    val computedOnah = remember(timeInput, zmanim, manualOnah) {
        deriveOnah(timeInput, zmanim) ?: manualOnah
    }

    Surface(
        Modifier.fillMaxWidth(), color = Color.White,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp), shadowElevation = 16.dp,
    ) {
        Column(Modifier.fillMaxWidth().padding(20.dp).verticalScroll(rememberScrollState())) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text(HebrewCalendar.formatDate(hd), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                TextButton(onClick = onClose) { Text("✕", fontSize = 16.sp) }
            }
            Spacer(Modifier.height(8.dp))

            // זמני עונות
            OnahTimes(zmanim)
            Spacer(Modifier.height(12.dp))

            // אירועים
            when (status.type) {
                "hefsek" -> EventCard(CAmber, "הפסק טהרה", null)
                "clean", "clean_7" -> EventCard(CEmerald400,
                    "יום ${status.dayNum} מ-7 ימים נקיים" + if (status.type == "clean_7") " — הושלמה הספירה" else "", null)
                "clean_blocked" -> EventCard(CRose, "נמצא דם ביום ${status.dayNum}", "הספירה נפסלה — יש להתחיל הפסק טהרה חדש")
                "mikveh", "mikveh_planned" -> EventCard(CBlue500,
                    if (status.type == "mikveh") "טבילה במקווה" else "ליל הטבילה (מתוכנן)", null)
            }
            daySighting?.let { EventCard(CRose, "ראיה", "${it.sourceType.he} · ${it.onah.he}") }
            if (isBlocked && status.type != "clean_blocked") {
                EventCard(CRose, "הספירה נפסקה", "נדרש הפסק טהרה חדש")
            }

            Spacer(Modifier.height(8.dp))

            when (view) {
                "sighting" -> SightingForm(
                    selectedHour, selectedMinute,
                    { h, m -> selectedHour = h; selectedMinute = m; manualOnah = null },
                    sourceType, { sourceType = it },
                    computedOnah, zmanim,
                    manualOnah = manualOnah, onManualOnah = { manualOnah = it },
                    onCancel = {
                        view = "main"; selectedHour = null; selectedMinute = null
                        manualOnah = null; sourceType = SourceType.VESET
                    },
                    onSave = {
                        val onah = computedOnah ?: return@SightingForm
                        val g = HebrewCalendar.fixedToGreg(hd.fixed)
                        val millis = localMillis(g, timeInput, zmanim?.tz ?: "Asia/Jerusalem")
                        val loc = vm.location.value
                        vm.recordSighting(hd, onah, sourceType, millis, loc.lat, loc.lng)
                        view = "main"; selectedHour = null; selectedMinute = null
                        manualOnah = null; sourceType = SourceType.VESET
                    },
                )
                "bedika" -> BedikaForm(status.dayNum,
                    onResult = { type, res -> vm.doBedika(status.dayNum ?: 0, hd, type, res) },
                    onClose = { view = "main" })
                else -> MainActions(
                    canSighting, canHefsek, canBedika, canMikveh, isBlocked, isFuture,
                    onSighting = { view = "sighting" },
                    onHefsek = { vm.doHefsek(hd); onClose() },
                    onBedika = { view = "bedika" },
                    onMikveh = { vm.doMikveh(); onClose() },
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun OnahTimes(z: ZmanimResult?) {
    val tz = z?.tz ?: "Asia/Jerusalem"
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))) {
        Box(Modifier.weight(1f).background(CNightDefault).padding(12.dp)) {
            Column {
                Text("🌙 לילה", fontSize = 12.sp, color = Color(0xFF64748B))
                Text("${fmt(z?.nightStart, tz)} ↓ ${fmt(z?.dayStart, tz)}", fontSize = 13.sp)
            }
        }
        Box(Modifier.weight(1f).background(Color(0xFFFFFBEB)).padding(12.dp)) {
            Column {
                Text("☀️ יום", fontSize = 12.sp, color = Color(0xFFB45309))
                Text("${fmt(z?.dayStart, tz)} ↓ ${fmt(z?.dayEnd, tz)}", fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun EventCard(dot: Color, title: String, sub: String?) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFF8FAFC)).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(5.dp)).background(dot))
        Spacer(Modifier.width(10.dp))
        Column {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            sub?.let { Text(it, fontSize = 13.sp, color = Color.Gray) }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun SightingForm(
    hour: Int?, minute: Int?, onTime: (Int, Int) -> Unit,
    source: SourceType, onSource: (SourceType) -> Unit,
    onah: Onah?, z: ZmanimResult?,
    manualOnah: Onah?, onManualOnah: (Onah) -> Unit,
    onCancel: () -> Unit, onSave: () -> Unit,
) {
    var showTimePicker by remember { mutableStateOf(false) }
    val timeState = rememberTimePickerState(
        initialHour = hour ?: Calendar.getInstance().get(Calendar.HOUR_OF_DAY),
        initialMinute = minute ?: Calendar.getInstance().get(Calendar.MINUTE),
        is24Hour = true,
    )

    if (showTimePicker) {
        TimePickerDialog(
            onDismiss = { showTimePicker = false },
            onConfirm = {
                onTime(timeState.hour, timeState.minute)
                showTimePicker = false
            },
        ) { TimePicker(state = timeState) }
    }

    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0xFFF8FAFC)).padding(14.dp)) {
        Text("סוג הראיה", fontWeight = FontWeight.SemiBold)
        FlowRowChips(source, onSource)
        Text("רק ראיה ובדיקה נכנסות לחישוב הווסתות", fontSize = 11.sp, color = Color.Gray)
        Spacer(Modifier.height(8.dp))
        Text("באיזו שעה הייתה הראיה?", fontWeight = FontWeight.SemiBold)
        Text("העונה תחושב אוטומטית לפי זמני היום", fontSize = 11.sp, color = Color.Gray)
        OutlinedButton(
            onClick = { showTimePicker = true },
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).height(58.dp),
            shape = RoundedCornerShape(14.dp),
        ) {
            Text(if (hour == null || minute == null) "בחירת שעה" else "%02d:%02d".format(hour, minute),
                fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        }
        if (z == null && hour != null) {
            Text("לא התקבלו זמני היום. כדי לא לנעול את הרישום, יש לבחור את העונה:",
                fontSize = 12.sp, color = Color(0xFF9A6700))
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = manualOnah == Onah.NIGHT, onClick = { onManualOnah(Onah.NIGHT) },
                    label = { Text("🌙 עונת הלילה") }, modifier = Modifier.weight(1f))
                FilterChip(selected = manualOnah == Onah.DAY, onClick = { onManualOnah(Onah.DAY) },
                    label = { Text("☀️ עונת היום") }, modifier = Modifier.weight(1f))
            }
        }
        if (onah != null) {
            Text(if (onah == Onah.DAY) "☀️ עונת היום" else "🌙 עונת הלילה",
                color = if (onah == Onah.DAY) Color(0xFFB45309) else Color(0xFF475569),
                fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f)) { Text("ביטול") }
            Button(onClick = onSave, enabled = onah != null && hour != null && minute != null,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = CRose)) { Text("שמור ✓") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimePickerDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    content: @Composable () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onConfirm) { Text("אישור") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("ביטול") } },
        title = { Text("שעת הראיה") },
        text = content,
        shape = RoundedCornerShape(28.dp),
    )
}

@Composable
private fun FlowRowChips(selected: SourceType, onSelect: (SourceType) -> Unit) {
    // שורה נגללת אופקית של סוגי ראייה
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)
        .horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        SourceType.entries.forEach { s ->
            val active = s == selected
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .background(if (active) CRose else Color(0xFFF1F5F9))
                    .clickable { onSelect(s) }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(s.he, color = if (active) Color.White else Color(0xFF475569), fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun BedikaForm(dayNum: Int?, onResult: (String, com.example.myapplication.halacha.CheckResult) -> Unit, onClose: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0xFFF8FAFC)).padding(14.dp)) {
        Text("בדיקות יום ${dayNum ?: ""}", fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        GreenBtn("בדיקת בוקר — נקיה ✓") { onResult("morning", com.example.myapplication.halacha.CheckResult.CLEAN) }
        GreenBtn("בדיקת ערב — נקיה ✓") { onResult("evening", com.example.myapplication.halacha.CheckResult.CLEAN) }
        Button(onClick = { onResult("morning", com.example.myapplication.halacha.CheckResult.STAIN) },
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            colors = ButtonDefaults.buttonColors(containerColor = CRose)) { Text("נמצא דם ✗") }
        TextButton(onClick = onClose, modifier = Modifier.fillMaxWidth()) { Text("סגור") }
    }
}

@Composable
private fun GreenBtn(label: String, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        colors = ButtonDefaults.buttonColors(containerColor = CEmerald400)) { Text(label) }
}

@Composable
private fun MainActions(
    canSighting: Boolean, canHefsek: Boolean, canBedika: Boolean, canMikveh: Boolean,
    isBlocked: Boolean, isFuture: Boolean,
    onSighting: () -> Unit, onHefsek: () -> Unit, onBedika: () -> Unit, onMikveh: () -> Unit,
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (canSighting) ActionBtn("רשום ראיה", CRose, onSighting)
        if (canHefsek) ActionBtn(if (isBlocked) "הפסק טהרה חדש — התחלת ספירה מחדש" else "אישור הפסק טהרה", CAmber, onHefsek)
        if (canBedika) ActionBtn("רשום בדיקה", CEmerald400, onBedika)
        if (canMikveh) ActionBtn("אישור טבילה במקווה", CBlue500, onMikveh)
        if (!canSighting && !canHefsek && !canBedika && !canMikveh) {
            Text(if (isFuture) "תאריך עתידי" else "אין פעולות זמינות",
                Modifier.fillMaxWidth().padding(8.dp), textAlign = TextAlign.Center, color = Color.Gray)
        }
    }
}

@Composable
private fun ActionBtn(label: String, color: Color, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = color)) {
        Text(label, fontWeight = FontWeight.SemiBold)
    }
}

// ── עזרי זמן ──────────────────────────────────────────────────────────────────

private fun minutesOfDay(millis: Long?, tz: String): Int? {
    if (millis == null) return null
    val c = Calendar.getInstance(TimeZone.getTimeZone(tz)); c.timeInMillis = millis
    return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
}

private fun deriveOnah(time: String, z: ZmanimResult?): Onah? {
    val parts = time.split(":")
    if (parts.size != 2) return null
    val h = parts[0].toIntOrNull() ?: return null
    val m = parts[1].toIntOrNull() ?: return null
    val entered = h * 60 + m
    val tz = z?.tz ?: "Asia/Jerusalem"
    val sunrise = minutesOfDay(z?.dayStart, tz) ?: return null
    val sunset = minutesOfDay(z?.dayEnd, tz) ?: return null
    return if (entered in sunrise until sunset) Onah.DAY else Onah.NIGHT
}

private fun localMillis(g: GregorianDate, time: String, tz: String): Long {
    val parts = time.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: 12
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
    val c = Calendar.getInstance(TimeZone.getTimeZone(tz))
    c.clear(); c.set(g.year, g.month - 1, g.day, h, m, 0)
    return c.timeInMillis
}

private fun fmt(millis: Long?, tz: String): String {
    if (millis == null) return "—"
    val c = Calendar.getInstance(TimeZone.getTimeZone(tz)); c.timeInMillis = millis
    return "%02d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
}
