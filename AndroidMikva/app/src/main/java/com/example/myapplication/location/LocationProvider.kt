package com.example.myapplication.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.core.content.ContextCompat

/** מיקום נוכחי — קובע את זמני היום/לילה של המשתמש. */
object LocationProvider {
    data class Loc(val lat: Double, val lng: Double)

    /** ברירת מחדל — ירושלים (כשאין הרשאה/מיקום זמין). */
    val FALLBACK = Loc(31.7683, 35.2137)

    fun hasPermission(ctx: Context): Boolean =
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    /** המיקום האחרון הידוע (best-effort). נופל לירושלים אם אין. */
    fun current(ctx: Context): Loc {
        if (!hasPermission(ctx)) return FALLBACK
        return try {
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val providers = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER,
            )
            val loc = providers
                .mapNotNull { p -> try { lm.getLastKnownLocation(p) } catch (_: SecurityException) { null } }
                .maxByOrNull { it.time }
            if (loc != null) Loc(loc.latitude, loc.longitude) else FALLBACK
        } catch (_: Exception) { FALLBACK }
    }
}
