import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const STATUS_COLORS = {
  available: '#2f9e44',
  reserved: '#f59f00',
  occupied: '#c92a2a',
}

const STATUS_LABELS = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
}

const lotIcon = (color) =>
  L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:2px;background:${color};border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })

export default function Cemetery() {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const [mapData, setMapData] = useState(null)
  const [error, setError] = useState('')
  const { user } = useAuth()

  useEffect(() => {
    api('/api/map').then(({ ok, data }) => {
      if (ok) setMapData(data)
      else setError(data?.error || 'Failed to load map data')
    })
  }, [])

  useEffect(() => {
    if (!mapData || mapRef.current) return

    const map = L.map(containerRef.current).setView(
      [mapData.center.lat, mapData.center.lng],
      18.4
    )
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapData.sections.forEach((section) => {
      section.lots.forEach((lot) => {
        if (!lot.latitude || !lot.longitude) return
        const color = STATUS_COLORS[lot.status] || '#868e96'
        const marker = L.marker([Number(lot.latitude), Number(lot.longitude)], {
          icon: lotIcon(color),
        }).addTo(map)

        const reserveLink =
          lot.status === 'available' && user && user.role === 'user'
            ? `<a class="btn btn-primary btn-sm" href="/reservations/new?lot=${lot.lot_id}">Reserve this plot</a>`
            : lot.status === 'available'
              ? '<span class="text-muted">Sign in to reserve</span>'
              : ''

        marker.bindPopup(`
          <strong>${lot.lot_code}</strong><br/>
          Section: ${section.section_name}<br/>
          Block: ${lot.block || '—'} · Type: ${lot.lot_type}<br/>
          Price: ₱${Number(lot.price).toLocaleString()}<br/>
          Status: <span class="badge badge--${lot.status}">${STATUS_LABELS[lot.status]}</span>
          ${reserveLink ? `<br/>${reserveLink}` : ''}
        `)
      })
    })

    mapRef.current = map
  }, [mapData, user])

  const counts = mapData
    ? mapData.sections.flatMap((s) => s.lots).reduce(
        (acc, lot) => {
          if (lot.latitude && lot.longitude) {
            acc[lot.status] = (acc[lot.status] || 0) + 1
          } else {
            acc.without_coords = (acc.without_coords || 0) + 1
          }
          return acc
        },
        { available: 0, reserved: 0, occupied: 0, without_coords: 0 }
      )
    : null

  return (
    <div>
      <h2>Cemetery Map</h2>
      {error && <p className="alert alert--error">{error}</p>}
      {!mapData && !error && <p className="text-muted">Loading map...</p>}

      {counts && (
        <div className="map-legend">
          <span><i className="dot" style={{ background: STATUS_COLORS.available }} /> Available ({counts.available})</span>
          <span><i className="dot" style={{ background: STATUS_COLORS.reserved }} /> Reserved ({counts.reserved})</span>
          <span><i className="dot" style={{ background: STATUS_COLORS.occupied }} /> Occupied ({counts.occupied})</span>
        </div>
      )}

      {counts?.without_coords > 0 && (
        <p className="text-muted map-hint">
          {counts.without_coords} lot(s) have no coordinates and are not shown on the map.
        </p>
      )}

      <div ref={containerRef} className="map-canvas" />

      {user?.role !== 'user' && (
        <p className="text-muted map-hint">
          {user ? (
            <Link to="/reservations/new">Make a reservation</Link>
          ) : (
            <Link to="/login">Sign in</Link>
          )} to reserve an available plot.
        </p>
      )}
    </div>
  )
}
