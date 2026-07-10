# מקווה — אפליקציית מובייל (Capacitor)

אפליקציית Android שעוטפת את מסך **"לוח עברי"** של הפרויקט כאפליקציה נייטיב.
מחליפה בהדרגה את `AndroidMikva/` (Kotlin).

## עקרונות

- **אופליין מלא — אין תלות בשרת.**
  - **זמני היום** מחושבים מקומית ב-`kosher-zmanim` על המכשיר.
  - **נתוני הטהרה** (ראיות, נידות, הגדרות, תצפיות) נשמרים על המכשיר ב-
    `@capacitor/preferences` (בדפדפן dev — נופל אוטומטית ל-localStorage).
- **המנוע ההלכתי לא שונה.** קבצי הלוגיקה הועתקו byte-for-byte מ-`client/src/lib`
  ומ-`client/src/pages` (`Dashboard.jsx`, `HebrewCalendarPage.jsx`). אין לגעת בהם.
- שכבת האחסון `src/lib/localStore.js` היא **פורט נאמן** של לוגיקת השרת
  (`server/src/routes/sightings.js` + `cycle.js`) — שיוך ראיה לנידה כרונולוגית,
  כלל 7 הימים, איפוס ספירה על דם. אותם כללים בדיוק, בלי הלכה חדשה.
  `src/lib/api.js` הוא מתאם דק שמפנה את המנוע ל-localStore במקום ל-fetch.
- המסך היחיד המנותב הוא `HebrewCalendarPage` ("לוח עברי"). `Dashboard.jsx`
  מיובא רק כדי לספק את `DaySheet` / `getCellColors` / `SettingsSheet`; מסך "היום"
  אינו מוצג.
- קריאת מיקום עוברת דרך shim (`src/lib/geoShim.js`) שמנתב את
  `navigator.geolocation` לפלאגין `@capacitor/geolocation` על native (טיפול בהרשאות),
  כדי לשמור על קוד המסך verbatim. בהיעדר מיקום — נפילה חזרה לקואורדינטות ירושלים.

## הרצה

```bash
# פיתוח בדפדפן
npm install
npm run dev            # http://localhost:3100

# בניית APK (בטרמינל רגיל — ראה build-apk.ps1)
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
# או ידנית:
npm run build && npx cap sync android && npx cap open android
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

## לעשות (עתידי)

- ייצוא/ייבוא גיבוי של נתוני הטהרה (הכל מקומי כרגע — אין סנכרון בין מכשירים).
- מעבר אופציונלי ל-SQLite אם נפח הנתונים יגדל.
