// Steel lattice tower builder ported directly from jeantimex/tokyo/src/world/tower.js
// Builds 4 leaning braced legs, curved arches, braced shaft, observation decks, warning beacons, and antenna mast.

const ORANGE = [0.47, 0.1, 0.036];
const WHITE = [0.72, 0.72, 0.69];
const GLASS = [0.05, 0.07, 0.09];
const BEACON = [6.0, 0.25, 0.12];
const BULB = [5.0, 3.3, 1.5];
const FLASHER = [6.0, 0.2, 0.1];

const PROFILE: [number, number][] = [
  [0, 1],
  [0.04, 0.86],
  [0.08, 0.73],
  [0.12, 0.62],
  [0.2, 0.46],
  [0.3, 0.33],
  [0.4, 0.25],
  [0.45, 0.22],
  [0.6, 0.14],
  [0.75, 0.085],
  [0.84, 0.06],
];
const LEGS = 0.12;
const MAIN: [number, number] = [0.415, 0.455];
const TOP: [number, number] = [0.74, 0.765];

function profile(t: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    if (t <= PROFILE[i][0]) {
      const [t0, r0] = PROFILE[i - 1];
      const [t1, r1] = PROFILE[i];
      return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

const paint = (t: number): number[] =>
  t < 0.415 || (t > 0.455 && t < 0.57) || (t > 0.63 && t < 0.73) || t > 0.84 ? ORANGE : WHITE;

export interface TowerSpec {
  x: number;
  z: number;
  y0: number;
  H: number;
  R: number;
  angle: number;
}

export type QuadEmitter = (
  p: number[],
  q: number[],
  r: number[],
  s: number[],
  outward: number[],
  colour: number[]
) => void;

export function buildTower({ x, z, y0, H, R, angle }: TowerSpec, quad: QuadEmitter): void {
  const e1 = [Math.cos(angle), Math.sin(angle)];
  const e2 = [-e1[1], e1[0]];
  const P = (u: number, w: number, h: number) => [
    x + e1[0] * u + e2[0] * w,
    y0 + h,
    z + e1[1] * u + e2[1] * w,
  ];
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a: number[]) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };

  const beam = (p: number[], q: number[], thick: number, colour: number[]) => {
    const d = unit(sub(q, p));
    const a = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const b = cross(d, a);
    const k = thick / 2;
    const at = (o: number[], sa: number, sb: number) => [
      o[0] + (a[0] * sa + b[0] * sb) * k,
      o[1] + (a[1] * sa + b[1] * sb) * k,
      o[2] + (a[2] * sa + b[2] * sb) * k,
    ];
    const faces: [number[], [number, number], [number, number]][] = [
      [a, [1, -1], [1, 1]],
      [b, [1, 1], [-1, 1]],
      [[-a[0], -a[1], -a[2]], [-1, 1], [-1, -1]],
      [[-b[0], -b[1], -b[2]], [-1, -1], [1, -1]],
    ];
    for (const [n, c1, c2] of faces) {
      quad(at(p, c1[0], c1[1]), at(q, c1[0], c1[1]), at(q, c2[0], c2[1]), at(p, c2[0], c2[1]), n, colour);
    }
  };

  const box = (h0: number, h1: number, half: number, colour: number[]) => {
    const c = (su: number, sw: number, h: number) => P(su * half, sw * half, h);
    const ring: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    ring.forEach(([u, w], i) => {
      const [u2, w2] = ring[(i + 1) % 4];
      const n = sub(P((u + u2) / 2, (w + w2) / 2, 0), P(0, 0, 0));
      quad(c(u, w, h0), c(u2, w2, h0), c(u2, w2, h1), c(u, w, h1), unit(n), colour);
    });
    quad(c(-1, -1, h1), c(1, -1, h1), c(1, 1, h1), c(-1, 1, h1), [0, 1, 0], colour);
    quad(c(-1, -1, h0), c(1, -1, h0), c(1, 1, h0), c(-1, 1, h0), [0, -1, 0], colour);
  };

  const panels = (side: number) => Math.max(1, Math.min(6, Math.round(side / 9)));
  const column = (
    h0: number,
    h1: number,
    square: (h: number) => [number, number, number, number],
    thick: (side: number) => number
  ) => {
    const levels: number[] = [];
    for (let h = h0; h < h1 - 0.5; ) {
      levels.push(h);
      const [u0, , u1] = square(h);
      const side = Math.abs(u1 - u0);
      const div = panels(side);
      h += Math.min(Math.max(3.2, (side / div) * 1.05), h1 - h > 4 ? Infinity : h1 - h);
    }
    levels.push(h1);
    const ringAt = (h: number) => {
      const [u0, w0, u1, w1] = square(h);
      const corners: [number, number][] = [
        [u0, w0],
        [u1, w0],
        [u1, w1],
        [u0, w1],
      ];
      const side = Math.abs(u1 - u0);
      const div = panels(side);
      const pts: number[][] = [];
      corners.forEach((a, i) => {
        const b = corners[(i + 1) % 4];
        for (let j = 0; j < div; j++) {
          pts.push(P(a[0] + ((b[0] - a[0]) * j) / div, a[1] + ((b[1] - a[1]) * j) / div, h));
        }
      });
      return { pts, div, t: thick(side) };
    };
    let below: { pts: number[][]; div: number; t: number; h: number } | null = null;
    for (const h of levels) {
      const ring = ringAt(h);
      const n = ring.pts.length;
      const colour = paint(h / H);
      for (let i = 0; i < n; i++) {
        beam(ring.pts[i], ring.pts[(i + 1) % n], ring.t * 0.6, colour);
      }
      if (below && below.pts.length === n) {
        for (let i = 0; i < n; i++) {
          const c = paint((h + below.h) / 2 / H);
          const corner = i % ring.div === 0;
          beam(below.pts[i], ring.pts[i], corner ? ring.t : ring.t * 0.6, c);
          beam(below.pts[i], ring.pts[(i + 1) % n], ring.t * 0.45, c);
          beam(below.pts[(i + 1) % n], ring.pts[i], ring.t * 0.45, c);
        }
      } else if (below) {
        for (let k = 0; k < 4; k++) {
          beam(below.pts[k * below.div], ring.pts[k * ring.div], ring.t, colour);
        }
      }
      below = { ...ring, h };
    }
  };
  const thick = (side: number) => Math.min(1.5, 0.3 + side * 0.035);

  const hLegs = LEGS * H;
  const r = (h: number) => R * profile(h / H);
  const legSide = (h: number) => {
    const k = h / hLegs;
    return R * 0.27 * (1 - k) + r(hLegs) * k;
  };
  for (const su of [-1, 1]) {
    for (const sw of [-1, 1]) {
      column(
        0,
        hLegs,
        (h) => {
          const o = r(h);
          const i = o - legSide(h);
          return [su > 0 ? i : -o, sw > 0 ? i : -o, su > 0 ? o : -i, sw > 0 ? o : -i];
        },
        thick
      );
    }
  }

  const archFoot = 0.035 * H;
  const archTop = hLegs * 0.9;
  for (let face = 0; face < 4; face++) {
    const at = (f: number, h: number) => {
      const u = f * (r(h) - legSide(h));
      const w = r(h);
      return face === 0 ? P(u, w, h) : face === 1 ? P(w, -u, h) : face === 2 ? P(-u, -w, h) : P(-w, u, h);
    };
    const top = (f: number) => {
      const u = f * r(hLegs) * 0.92;
      const w = r(hLegs);
      return face === 0
        ? P(u, w, hLegs)
        : face === 1
          ? P(w, -u, hLegs)
          : face === 2
            ? P(-u, -w, hLegs)
            : P(-w, u, hLegs);
    };
    const N = 12;
    const hOf = (f: number) => archFoot + (archTop - archFoot) * (1 - f * f);
    for (let i = 0; i < N; i++) {
      const f0 = -1 + (2 * i) / N;
      const f1 = -1 + (2 * (i + 1)) / N;
      const a = at(f0, hOf(f0));
      const b = at(f1, hOf(f1));
      beam(a, b, 0.9, ORANGE);
      if (i > 0) beam(a, top(f0), 0.45, ORANGE);
      beam(i % 2 ? a : b, top(i % 2 ? f1 : f0), 0.4, ORANGE);
    }
  }

  column(
    hLegs,
    PROFILE[PROFILE.length - 1][0] * H,
    (h) => {
      const o = r(h);
      return [-o, -o, o, o];
    },
    thick
  );

  const decks: [[number, number], number][] = [
    [MAIN, R * 0.36],
    [TOP, R * 0.15],
  ];
  for (const [[t0, t1], half] of decks) {
    const h0 = t0 * H;
    const h1 = t1 * H;
    const g0 = h0 + (h1 - h0) * 0.35;
    const g1 = h0 + (h1 - h0) * 0.8;
    box(h0, g0, half, WHITE);
    box(g0, g1, half * 0.98, GLASS);
    box(g1, h1, half, WHITE);
    box(h0 - (h1 - h0) * 0.5, h0, half * 0.8, WHITE);
  }

  const lamp = (u: number, w: number, h: number, size: number, colour: number[]) => {
    const c = P(u, w, h);
    const k = size / 2;
    const v = (sx: number, sy: number, sz: number) => [c[0] + sx * k, c[1] + sy * k, c[2] + sz * k];
    quad(v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1), [0, 1, 0], colour);
    quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), [0, -1, 0], colour);
    quad(v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1), [0, 0, -1], colour);
    quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), [0, 0, 1], colour);
    quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), [-1, 0, 0], colour);
    quad(v(1, -1, -1), v(1, -1, 1), v(1, 1, 1), v(1, 1, -1), [1, 0, 0], colour);
  };

  for (let h = 6; h < 0.84 * H; h += 5.5) {
    for (const su of [-1, 1]) {
      for (const sw of [-1, 1]) {
        lamp(su * (r(h) + 0.5), sw * (r(h) + 0.5), h, 0.9, BULB);
      }
    }
  }
  for (let h = 8.75; h < 0.84 * H; h += 11) {
    for (const [su, sw] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      lamp(su * (r(h) + 0.5), sw * (r(h) + 0.5), h, 0.8, BULB);
    }
  }
  for (const t of [MAIN[1], TOP[1], 0.3, 0.6]) {
    for (const su of [-1, 1]) {
      for (const sw of [-1, 1]) {
        const half = t === MAIN[1] ? R * 0.36 : t === TOP[1] ? R * 0.15 : r(t * H) + 0.8;
        lamp(su * half, sw * half, t * H + 0.8, 1.3, BEACON);
      }
    }
  }
  lamp(0, 0, H + 0.8, 1.6, FLASHER);
  lamp(0, 0, 0.94 * H + 0.5, 1.3, FLASHER);

  box(0.84 * H, 0.86 * H, R * 0.075, ORANGE);
  box(0.86 * H, 0.94 * H, R * 0.035, ORANGE);
  box(0.94 * H, H, R * 0.016, WHITE);
}
