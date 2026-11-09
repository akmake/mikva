import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { layers, namedTheme } from 'protomaps-themes-base'
import { api } from '../lib/api'
import Icon from '../ui/Icon'

// ── מפה אופליין מלאה ─────────────────────────────────────────────────────────
// רקע: קובץ וקטורי (PMTiles) של ישראל מוטמע במכשיר (public/israel.pmtiles),
// מוצג ע"י MapLibre עם סגנון Protomaps, גליפים מוטמעים (public/glyphs), ותוסף
// RTL מקומי לעברית. אין שום קריאת רשת — הכול על המכשיר.

// תוסף RTL לעברית/ערבית — פעם אחת, לפני שהמפה מרנדרת תוויות.
let rtlSet = false
function ensureRTL() {
  if (rtlSet) return
  rtlSet = true
  try {
    maplibregl.setRTLTextPlugin('mapbox-gl-rtl-text.js', true)
  } catch {
    /* כבר נטען */
  }
}

// פרוטוקול pmtiles — פעם אחת.
let pmtilesReady = false
function ensurePmtiles() {
  if (pmtilesReady) return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  pmtilesReady = true
}

// פלטת מפה חמה בסגנון הנייר של האפליקציה (במקום התכלת/אפור של ערכת "light")
const PAPER_MAP = {
  ...namedTheme('light'),
  background: '#DDD1B6', earth: '#E9DFCA',
  park_a: '#D6DDBA', park_b: '#B9C99C', wood_a: '#CDD7B2', wood_b: '#AABD89',
  scrub_a: '#D4D7B4', scrub_b: '#BDC89F', hospital: '#ECD5CA', industrial: '#DDD4BE',
  school: '#E6DAC0', pedestrian: '#EFE6D2', sand: '#EADFC0', beach: '#EFE3C3',
  aerodrome: '#E0D6BE', runway: '#F3EBD8', water: '#B3C6D0', zoo: '#D3DABD', military: '#DDD3BB',
  buildings: '#D6C9AB', other: '#F2EAD8', minor_service: '#F3ECDB', minor_a: '#F4EDDC',
  minor_b: '#FBF7EC', link: '#FBF7EC', major: '#FBF7EC', highway: '#F6E2AE',
  minor_service_casing: '#D9CCAE', minor_casing: '#D9CCAE', link_casing: '#D9CCAE',
  major_casing_early: '#D3C5A5', major_casing_late: '#D3C5A5',
  highway_casing_early: '#CDBE97', highway_casing_late: '#CDBE97',
  railway: '#A39A87', boundaries: '#B3A78F',
  waterway_label: '#F5EFE1', roads_label_minor: '#8B8170', roads_label_minor_halo: '#F5EFE1',
  roads_label_major: '#6B6252', roads_label_major_halo: '#F5EFE1',
  ocean_label: '#5B7C93', peak_label: '#7A7260',
  subplace_label: '#6B6252', subplace_label_halo: '#EFE6D2',
  city_label: '#2A2520', city_label_halo: '#EFE6D2',
  state_label: '#9A8F78', state_label_halo: '#EFE6D2', country_label: '#9A8F78',
}

function toGeoJSON(list) {
  return {
    type: 'FeatureCollection',
    features: list.map((m) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      properties: { ...m },
    })),
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function popupHtml(m) {
  const sup = m.supervised === true || m.supervised === 'true'
  const row = (label, value) =>
    `<div class="flex gap-2 border-t border-rule py-1.5 text-[13px] leading-snug"><span class="w-[52px] shrink-0 text-ink-mute">${label}</span><span class="min-w-0 flex-1">${value}</span></div>`
  const rows = []
  rows.push(`<div class="font-serif text-[21px] font-medium leading-tight pe-6">${esc(m.name)}</div>`)
  if (m.city) rows.push(`<div class="mb-2 mt-0.5 text-[13px] text-ink-soft">${esc(m.city)}</div>`)
  if (m.address) rows.push(row('כתובת', esc(m.address)))
  if (m.phone) rows.push(row('טלפון', `<a href="tel:${esc(m.phone)}" class="font-medium underline">${esc(m.phone)}</a>`))
  if (m.contact) rows.push(row('איש קשר', esc(m.contact)))
  if (m.openingHours) rows.push(row('שעות', esc(m.openingHours)))
  if (m.services) rows.push(row('שירותים', esc(m.services)))
  rows.push(
    `<div class="mt-2 inline-block rounded-sm border px-2 py-[3px] text-[11px] font-semibold ${
      sup ? 'border-tahor text-tahor' : 'border-concern text-concern'
    }">${sup ? 'בפיקוח המרכז הארצי לטהרת המשפחה' : 'אינו בפיקוח המרכז הארצי'}</div>`,
  )
  rows.push(
    `<div class="mt-3 grid grid-cols-2 gap-2">
       <a href="https://waze.com/ul?ll=${m.lat},${m.lng}&navigate=yes" target="_blank" rel="noreferrer" class="rounded-md bg-rose py-2 text-center text-[13px] font-semibold text-paper-bright">Waze</a>
       <a href="https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}" target="_blank" rel="noreferrer" class="rounded-md border border-rose/30 py-2 text-center text-[13px] font-semibold">Google Maps</a>
     </div>`,
  )
  return `<div dir="rtl" class="min-w-[236px] text-right">${rows.join('')}</div>`
}

export default function Mikvaot() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [mikvas, setMikvas] = useState([])
  const [cities, setCities] = useState([])
  const [city, setCity] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // טעינת נתוני המקוואות (אופליין)
  useEffect(() => {
    Promise.all([api.getMikvas({ withCoords: 1 }), api.getMikvaCities()])
      .then(([m, c]) => {
        setMikvas(m)
        setCities(c)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return mikvas.filter((m) => {
      if (city && m.city !== city) return false
      if (needle) {
        const hay = `${m.name} ${m.address} ${m.city}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [mikvas, city, q])

  // אתחול המפה — פעם אחת
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    ensureRTL()
    ensurePmtiles()

    let map
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          glyphs: 'glyphs/{fontstack}/{range}.pbf',
          sources: {
            protomaps: {
              type: 'vector',
              url: 'pmtiles://israel.pmtiles',
              attribution: '© OpenStreetMap',
            },
          },
          layers: layers('protomaps', PAPER_MAP, { lang: 'he' }),
        },
        bounds: [[34.1, 29.4], [35.95, 33.4]],
        fitBoundsOptions: { padding: 12 },
        minZoom: 6,
        maxZoom: 16,
        attributionControl: { compact: true },
      })
    } catch (e) {
      setError('שגיאה בטעינת המפה: ' + e.message)
      return
    }
    mapRef.current = map
    if (typeof window !== 'undefined') window.__map = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')

    map.on('error', (e) => {
      // לא מפילים את המסך על שגיאת אריח בודד
      console.warn('map error', e?.error?.message || e)
    })

    map.on('load', () => {
      map.addSource('mikvas', {
        type: 'geojson',
        data: toGeoJSON([]),
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 12,
      })
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'mikvas',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1E2A3A',
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#F5EFE1',
        },
      })
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'mikvas',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 13,
        },
        paint: { 'text-color': '#F5EFE1' },
      })
      map.addLayer({
        id: 'mikva-point',
        type: 'circle',
        source: 'mikvas',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['==', ['get', 'supervised'], true], '#3B7A55', '#B85A1B'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#F5EFE1',
        },
      })

      // לחיצה על אשכול → זום פנימה
      map.on('click', 'clusters', async (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]
        if (!f) return
        try {
          const zoom = await map.getSource('mikvas').getClusterExpansionZoom(f.properties.cluster_id)
          map.easeTo({ center: f.geometry.coordinates, zoom })
        } catch {
          /* ignore */
        }
      })
      // לחיצה על מקווה → popup
      map.on('click', 'mikva-point', (e) => {
        const f = e.features?.[0]
        if (!f) return
        new maplibregl.Popup({ offset: 12, closeButton: true, maxWidth: '280px' })
          .setLngLat(f.geometry.coordinates)
          .setHTML(popupHtml(f.properties))
          .addTo(map)
      })
      for (const layer of ['clusters', 'mikva-point']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
      }

      setMapReady(true)
    })

    // שומר את הקנבס תואם לגודל המכולה (הכותרת והלשוניות משנות את הגובה אחרי האתחול)
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // עדכון הסיכות בכל שינוי סינון / טעינת נתונים
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const src = mapRef.current.getSource('mikvas')
    if (src) src.setData(toGeoJSON(filtered))
  }, [filtered, mapReady])

  return (
    <div className="flex h-[calc(100dvh-64px-env(safe-area-inset-bottom))] flex-col" dir="rtl">
      <header className="z-10 border-b border-rule bg-paper px-5 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow mb-1">מקוואות</p>
            <h1 className="font-serif text-[34px] font-medium leading-none">מפת מקוואות</h1>
          </div>
          <p className="tabular pb-1 text-[13px] text-ink-soft">{filtered.length} מוצגים</p>
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-md border border-rose/30 bg-paper-bright px-3">
          <Icon name="search" size={19} className="text-ink-mute" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם, כתובת או עיר"
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="ניקוי" className="text-ink-mute">
              <Icon name="x" size={18} />
            </button>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-3">
          <label className="relative flex-1">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-10 w-full appearance-none rounded border border-rule bg-paper-raised pe-9 ps-3 text-[14px] font-medium outline-none"
            >
              <option value="">כל הערים ({mikvas.length})</option>
              {cities.map((c) => (
                <option key={c.city} value={c.city}>{c.city} ({c.count})</option>
              ))}
            </select>
            <Icon name="chevD" size={17} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          </label>
          <div className="flex items-center gap-3 text-[12px] text-ink-soft">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-tahor" />מפוקח</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-concern" />אחר</span>
          </div>
        </div>
      </header>

      <div className="relative flex-1">
        {error && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-paper/90 px-6 text-center text-[14px] text-blood">
            {error}
          </div>
        )}
        {loading && (
          <div className="absolute start-1/2 top-3 z-[1000] -translate-x-1/2 rounded-md bg-ink px-3 py-1.5 text-[13px] text-paper-bright">
            טוען מקוואות…
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  )
}
