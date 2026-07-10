import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { layers, namedTheme } from 'protomaps-themes-base'
import { api } from '../lib/api'

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
  const rows = []
  rows.push(`<div class="font-bold text-base">${esc(m.name)}</div>`)
  if (m.city) rows.push(`<div class="text-gray-600 text-xs">${esc(m.city)}</div>`)
  if (m.address) rows.push(`<div>📍 ${esc(m.address)}</div>`)
  if (m.phone) rows.push(`<div>📞 <a href="tel:${esc(m.phone)}">${esc(m.phone)}</a></div>`)
  if (m.contact) rows.push(`<div>👤 ${esc(m.contact)}</div>`)
  if (m.openingHours) rows.push(`<div class="text-xs text-gray-700">🕒 ${esc(m.openingHours)}</div>`)
  if (m.services) rows.push(`<div class="text-xs text-gray-700">🛁 ${esc(m.services)}</div>`)
  rows.push(
    `<div class="text-xs font-semibold ${sup ? 'text-green-700' : 'text-orange-700'}">${
      sup ? '✓ מפוקח ע"י המרכז הארצי לטהרת המשפחה' : 'אינו בפיקוח המרכז הארצי'
    }</div>`,
  )
  rows.push(
    `<div class="flex gap-2 pt-1">
       <a href="https://waze.com/ul?ll=${m.lat},${m.lng}&navigate=yes" target="_blank" rel="noreferrer" class="text-blue-600 text-xs">Waze</a>
       <a href="https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}" target="_blank" rel="noreferrer" class="text-blue-600 text-xs">Google Maps</a>
     </div>`,
  )
  return `<div dir="rtl" class="text-right space-y-1 min-w-[200px]">${rows.join('')}</div>`
}

export default function MapPage() {
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
          layers: layers('protomaps', namedTheme('light'), { lang: 'he' }),
        },
        center: [35.0, 31.6],
        zoom: 7,
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
          'circle-color': '#0d9488',
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
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
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: 'mikva-point',
        type: 'circle',
        source: 'mikvas',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['==', ['get', 'supervised'], true], '#22c55e', '#f97316'],
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
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

    return () => {
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
    <div className="h-screen flex flex-col bg-blue-950" dir="rtl">
      <div className="flex flex-wrap items-center gap-3 py-3 pl-6 pr-16 bg-blue-950 text-white shadow-md z-10 relative">
        <h2 className="font-bold text-lg">מפת מקוואות</h2>

        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש שם / כתובת / עיר..."
          className="bg-blue-900 text-white placeholder-blue-300 rounded px-3 py-1 text-sm outline-none focus:ring-2 ring-blue-400 w-56"
        />

        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="bg-blue-900 text-white rounded px-3 py-1 text-sm outline-none focus:ring-2 ring-blue-400"
        >
          <option value="">כל הערים ({mikvas.length})</option>
          {cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.count})
            </option>
          ))}
        </select>

        <span className="text-blue-200 text-sm mr-auto">מציג {filtered.length} מקוואות</span>
        <span className="flex items-center gap-3 text-xs text-blue-200">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500" /> מפוקח
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-orange-500" /> אחר
          </span>
        </span>
      </div>

      <div className="flex-1 relative">
        {error && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-blue-950/80 text-red-300 px-6 text-center">
            {error}
          </div>
        )}
        {loading && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] rounded bg-blue-950/70 px-3 py-1 text-white text-sm">
            טוען מקוואות...
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  )
}
