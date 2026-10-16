const STORAGE_KEY = 'cemetery-map-reference-v1'

export const DEFAULT_REFERENCE = {
  visible: true,
  opacity: 0.55,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
}

export function readReference() {
  try {
    return { ...DEFAULT_REFERENCE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }
  } catch {
    return { ...DEFAULT_REFERENCE }
  }
}

export function saveReference(reference) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reference))
}

export function MapReferenceImage({ reference, width, height }) {
  if (!reference.visible) return null
  return (
    <g
      transform={`translate(${reference.offsetX} ${reference.offsetY}) translate(${width / 2} ${height / 2}) rotate(${reference.rotation}) scale(${reference.scaleX} ${reference.scaleY}) translate(${-width / 2} ${-height / 2})`}
      opacity={reference.opacity}
      pointerEvents="none"
    >
      {/* The base is a render of line detailed.svg, which carries the line work
          only - the red section-number layer was rasterised from a different
          export and sits about 22px off this frame, so it is not composited
          here. Keeping it would draw numbers a couple of plots away from the
          plots they label. */}
      <image
        href="/traces/cemetery-base.png"
        x="0"
        y="0"
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      />
    </g>
  )
}
