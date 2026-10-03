import * as planck from 'planck';

export { planck };

export const V = (x, y) => new planck.Vec2(x, y);

// Collision categories
export const CAT = {
  STATIC: 0x0001,
  DYNAMIC: 0x0002,
  CHAR: 0x0004,
  VEHICLE: 0x0008,
  DEBRIS: 0x0010,
  SENSOR: 0x0020,
  PROJECTILE: 0x0040,
};
export const MASK = {
  ALL: 0xffff,
  DEBRIS: CAT.STATIC | CAT.DYNAMIC,
  SENSOR: CAT.CHAR | CAT.VEHICLE | CAT.DYNAMIC,
};

export const GRAVITY = -14;

export function boxShape(hw, hh, cx = 0, cy = 0, angle = 0) {
  return new planck.Box(hw, hh, V(cx, cy), angle);
}

export function polyShape(points) {
  return new planck.Polygon(points.map(([x, y]) => V(x, y)));
}

// planck polygons must be convex with <= 8 vertices. Split a simple polygon
// into triangles (ear clipping) so we can build arbitrary static shapes.
export function triangulate(points) {
  const pts = points.slice();
  // ensure CCW
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) pts.reverse();
  const idx = pts.map((_, i) => i);
  const tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(pts[j], a, b, c)) { ok = false; break; }
      }
      if (!ok) continue;
      tris.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push(idx.map((i) => pts[i]));
  return tris;
}

export function polyArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
