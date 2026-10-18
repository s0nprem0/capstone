import { useEffect, useState } from 'react'
import { MAP_VIEWBOX } from './tracePaths'

// The scanned survey plan at three uniform scales of the same 4096x3072 sheet
// (tools/map-images.sh). Every size is drawn into the full map frame, so the
// stored plot rectangles land on the drawn plots whichever one is showing.
const LEVELS = [1024, 2048, 4096]
const src = (level) => `/traces/survey-${level}.webp`
const [, , WIDTH, HEIGHT] = MAP_VIEWBOX

const ready = new Set([LEVELS[0]])
const pending = new Map()

// Fetch and decode off-screen before swapping, so a sharper sheet replaces the
// soft one in a single frame instead of painting in strips over it.
const preload = (level) => {
  if (ready.has(level)) return Promise.resolve()
  if (!pending.has(level)) {
    const img = new Image()
    img.src = src(level)
    pending.set(
      level,
      img.decode().then(() => {
        ready.add(level)
      })
    )
  }
  return pending.get(level)
}

/**
 * Smallest level that still gives one image pixel per screen pixel at the
 * current zoom. `unitsPerPixel` is how many plan units one CSS pixel covers.
 */
export const levelFor = (unitsPerPixel) => {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const needed = (WIDTH / unitsPerPixel) * dpr
  return LEVELS.find((level) => level >= needed) || LEVELS[LEVELS.length - 1]
}

export default function PlanImage({ level = LEVELS[0] }) {
  const [shown, setShown] = useState(() => Math.max(...[...ready].filter((l) => l <= level)))

  useEffect(() => {
    let current = true
    const best = Math.max(...[...ready].filter((l) => l <= level))
    setShown(best)
    if (best < level) {
      preload(level).then(() => current && setShown(level))
    }
    return () => { current = false }
  }, [level])

  return (
    <g className="plan-image" pointerEvents="none" aria-hidden="true">
      {/* The smallest sheet stays underneath, so panning past the edge of a
          sharper one never shows bare paper while it decodes. */}
      <image href={src(LEVELS[0])} x="0" y="0" width={WIDTH} height={HEIGHT} preserveAspectRatio="none" />
      {shown > LEVELS[0] && (
        <image href={src(shown)} x="0" y="0" width={WIDTH} height={HEIGHT} preserveAspectRatio="none" />
      )}
    </g>
  )
}
