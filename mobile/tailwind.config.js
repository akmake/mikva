/** @type {import('tailwindcss').Config} */
// מערכת העיצוב של האפליקציה: רקע ורוד-פודרה רך, דיו שזיף, ואקסנט שזיף-ורדרד.
// צבעי המצב ההלכתי (דם/הפסק/חשש/ספירה/טהרה/מקווה) נשארים נבדלים וברורים.
// כל הערכים כאן — אין צבעי Tailwind גולמיים במסכים.
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#F8ECEC', // רקע האפליקציה (פודרה)
          deep: '#F0DADD',
          raised: '#FDF7F6', // כרטיסים/גיליונות
          bright: '#FFFCFB',
        },
        ink: {
          DEFAULT: '#3B1F2F', // שזיף עמוק
          soft: '#6E4B5E',
          mute: '#9B7F8E',
          faint: '#CDB5BF',
        },
        rule: {
          DEFAULT: '#EBD3D8', // קו שערה
          strong: '#3B1F2F',
        },
        // אקסנט ראשי: שזיף-ורדרד (כפתורים, לשונית פעילה)
        rose: { DEFAULT: '#93416A', deep: '#7A3358', tint: '#F0D2DE', wash: '#F8E3EB' },
        night: {
          DEFAULT: '#2E1D3A', // לילה — חציל עמוק
          soft: '#42304F',
          text: '#F4E6EA',
        },
        // סמנטיים
        blood:   { DEFAULT: '#A9303A', tint: '#EBC0C4', wash: '#F6D9DB' },
        hefsek:  { DEFAULT: '#B98A22', tint: '#EDD9A0', wash: '#F6EBC7' },
        concern: { DEFAULT: '#BC5A1E', tint: '#EFCBA9', wash: '#F6DFC8' },
        count:   { DEFAULT: '#2C747A', tint: '#B8D8D6', wash: '#D8EAE6' },
        tahor:   { DEFAULT: '#3B7A55', tint: '#BDDCC6', wash: '#DAEBDB' },
        mikveh:  { DEFAULT: '#3A5F94', tint: '#C3D2E8', wash: '#DCE6F2' },
      },
      fontFamily: {
        serif: ['"Frank Ruhl Libre"', 'Georgia', 'serif'],
        sans: ['Heebo', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        micro: ['11px', { lineHeight: '14px', letterSpacing: '0.06em' }],
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '14px',
        md: '16px',
        lg: '20px',
        sheet: '28px',
      },
      boxShadow: {
        sheet: '0 -1px 0 #EBD3D8, 0 -18px 48px -12px rgba(59,31,47,0.35)',
        lift: '0 1px 0 rgba(147,65,106,0.05), 0 10px 24px -12px rgba(147,65,106,0.35)',
        card: '0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 22px -14px rgba(147,65,106,0.35)',
      },
      spacing: {
        safeb: 'env(safe-area-inset-bottom)',
        safet: 'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
}
