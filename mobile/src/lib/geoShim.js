// ── גשר מיקום ל-native ──────────────────────────────────────────────────────
// הקוד המועתק (HebrewCalendarPage/Dashboard) קורא ל-navigator.geolocation
// היישר. ב-WebView של Android זה לא מבקש הרשאה כמו שצריך, לכן על פלטפורמה
// native אנחנו ממפים את getCurrentPosition לפלאגין @capacitor/geolocation
// (שמטפל בהרשאות). כך אין צורך לגעת בקוד המסך — הוא נשאר verbatim.
//
// ייבוא בראש main.jsx, לפני שה-App עולה.

import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

if (Capacitor.isNativePlatform()) {
  const nav = navigator
  const shim = {
    async getCurrentPosition(success, error, options = {}) {
      try {
        const perm = await Geolocation.checkPermissions()
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          await Geolocation.requestPermissions()
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: options.enableHighAccuracy ?? false,
          timeout: options.timeout ?? 10000,
        })
        success?.({ coords: pos.coords, timestamp: pos.timestamp })
      } catch (e) {
        error?.({ code: 2, message: e?.message ?? 'location error' })
      }
    },
    // גרסה מינימלית של watchPosition — לא בשימוש כרגע, אך שומרת על החוזה.
    watchPosition() { return -1 },
    clearWatch() {},
  }
  try {
    Object.defineProperty(nav, 'geolocation', { value: shim, configurable: true })
  } catch {
    // אם ההגדרה מחדש נכשלת — משאירים את המימוש המקורי של ה-WebView.
  }
}
