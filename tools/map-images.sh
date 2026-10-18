#!/usr/bin/env sh
# Builds the map's base images from the scanned survey plan.
#
# The plan is the map's coordinate space (4096x3072, see map/tracePaths.js), so
# every size is a uniform scale of the whole sheet: never crop or pad here, or
# the stored plot rectangles stop landing on the drawn plots. The SVG places
# each image at 4096x3072 regardless of its pixel size.
#
# Grey and a little contrast are baked in: the paper's yellow cast competes
# with the status tints, and a CSS filter would be recomputed on every pan.
#
# Needs ImageMagick 7 and cwebp, e.g. `nix shell nixpkgs#imagemagick nixpkgs#libwebp`.
set -eu
src=${1:-public/traces/survey-lines.png}
out=public/traces
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

magick "$src" -background white -alpha remove -colorspace Gray -level 4%,96% "$tmp/plan.png"
for width in 1024 2048 4096; do
  height=$((width * 3 / 4))
  cwebp -quiet -q 75 -resize "$width" "$height" "$tmp/plan.png" -o "$out/survey-$width.webp"
done
ls -l "$out"/survey-*.webp
