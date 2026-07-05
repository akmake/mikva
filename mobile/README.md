# מקווה — אפליקציית מובייל (Capacitor)

אפליקציית Android שעוטפת את מסך **"לוח עברי"** של הפרויקט כאפליקציה נייטיב.
מחליפה בהדרגה את `AndroidMikva/` (Kotlin).

## עקרונות

- **המנוע ההלכתי לא שונה.** קבצי הלוגיקה הועתקו byte-for-byte מ-`client/src/lib`
  ומ-`client/src/pages` (`Dashboard.jsx`, `HebrewCalendarPage.jsx`). אין לגעת בהם.
- **זמני היום מחושבים מקומית** ב-`kosher-zmanim` על המכשיר — ללא אינטרנט.
- **נתוני הטהרה** (ראיות, נידות, הגדרות) עוברים דרך שרת ה-API הקיים (`server/`),
  בדיוק כפי ש-AndroidMikva עבד. אחסון אופליין מלא = מיילסטון עוקב.
- המסך היחיד המנותב הוא `HebrewCalendarPage` ("לוח עברי"). `Dashboard.jsx`
  מיובא רק כדי לספק את `DaySheet` / `getCellColors` / `SettingsSheet`; מסך "היום"
  אינו מוצג.

## כתובת השרת (`src/lib/api.js`)

- דפדפן dev → `/api` (פרוקסי של vite אל `localhost:5001`)
- אמולטור/מכשיר → `http://10.0.2.2:5001/api` (אמולטור), או `VITE_API_BASE` לעקיפה.

## הרצה

```bash
# פיתוח בדפדפן (צריך את השרת רץ על 5001)
npm install
npm run dev            # http://localhost:3100

# בנייה + סנכרון ל-Android
npm run build
npx cap sync android
npx cap open android   # פותח ב-Android Studio ל-build/הרצה
```

## הערות / לעשות

- קריאת מיקום משתמשת כרגע ב-`navigator.geolocation` (הקוד שהועתק). על Android
  ודאו שהרשאת המיקום ניתנת; בהיעדרה יש נפילה חזרה לקואורדינטות ירושלים.
  שדרוג עתידי: מעבר לפלאגין `@capacitor/geolocation` (כבר מותקן).
- אחסון אופליין לנתוני טהרה (`@capacitor/preferences` / SQLite) — מיילסטון עוקב.
