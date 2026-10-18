// A plot as the plan draws it: its traced outline where it has one (the tilted
// perimeter rows, the plots a diagonal walk cuts), otherwise its rectangle.
export default function PlotShape({ lot, ...props }) {
  return lot.svg_points ? (
    <polygon points={lot.svg_points} {...props} />
  ) : (
    <rect x={lot.svg_x} y={lot.svg_y} width={lot.svg_w} height={lot.svg_h} {...props} />
  )
}
