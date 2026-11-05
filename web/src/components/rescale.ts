export interface Size {
  width: number;
  height: number;
}

/** Move points so they keep their relative position when the field resizes. */
export function rescale(points: { x: number; y: number }[], from: Size, to: Size) {
  if (from.width === 0 || from.height === 0) return;
  for (const p of points) {
    p.x = (p.x / from.width) * to.width;
    p.y = (p.y / from.height) * to.height;
  }
}
