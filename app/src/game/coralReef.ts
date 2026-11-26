// Coral Gardens: big corals that fill the scene. A far coral wall and a nearer
// one are painted into the backdrop (faded toward the water color with depth),
// and a dense reef of large corals grows along the seabed and over the cave.
// Everything is painted once per screen size, with a seeded PRNG so the reef
// looks the same each time.
import type { Ctx2D } from './ctx2d'

type Ctx = Ctx2D
const TAU = Math.PI * 2

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
/** Blend a coral color toward the water color: k = 0 → coral, 1 → water. */
export function fade(col: string, water: string, k: number, light = 0) {
  const a = hex(col), b = hex(water)
  const m = a.map((v, i) => Math.round(Math.min(255, v + (b[i] - v) * k + light * 40)))
  return `rgb(${m[0]},${m[1]},${m[2]})`
}

export type CoralKind = 'stag' | 'fan' | 'table' | 'pillar' | 'brain' | 'tubes' | 'soft'

/** A staghorn coral: thick, tapering, forking branches with pale tips. */
function stag(c: Ctx, x: number, y: number, h: number, col: string, tip: string, r: () => number) {
  const limb = (x0: number, y0: number, len: number, ang: number, w: number, depth: number) => {
    const bend = (r() - 0.5) * 0.4
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len
    c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = w
    c.beginPath(); c.moveTo(x0, y0)
    c.quadraticCurveTo(x0 + Math.cos(ang + bend) * len * 0.5, y0 + Math.sin(ang + bend) * len * 0.5, x1, y1)
    c.stroke()
    if (depth <= 0) { c.fillStyle = tip; c.beginPath(); c.arc(x1, y1, w * 0.55, 0, TAU); c.fill(); return }
    const n = depth > 2 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * (0.45 + r() * 0.25)
      limb(x1, y1, len * (0.62 + r() * 0.18), ang + spread, w * 0.7, depth - 1)
    }
  }
  limb(x, y, h * 0.34, -Math.PI / 2 + (r() - 0.5) * 0.3, h * 0.085, 3)
}

/** A giant sea fan: a lacy web of ribs and cross-arcs. */
function fan(c: Ctx, x: number, y: number, h: number, col: string, r: () => number) {
  const cx = x, cy = y - h * 0.18
  c.strokeStyle = col; c.lineCap = 'round'
  c.lineWidth = Math.max(2, h * 0.03)
  c.beginPath(); c.moveTo(x, y); c.lineTo(cx, cy); c.stroke()
  c.lineWidth = Math.max(1, h * 0.012)
  const ribs = 16
  for (let i = 0; i <= ribs; i++) {
    const a = -Math.PI + 0.2 + (i / ribs) * (Math.PI - 0.4)
    const len = h * (0.68 + r() * 0.2)
    c.beginPath(); c.moveTo(cx, cy)
    c.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.6, cx + Math.cos(a) * len, cy + Math.sin(a) * len)
    c.stroke()
  }
  const keep = c.globalAlpha
  c.globalAlpha = keep * 0.6
  for (let k = 1; k <= 6; k++) { c.beginPath(); c.arc(cx, cy, h * 0.12 * k, -Math.PI + 0.2, -0.2); c.stroke() }
  c.globalAlpha = keep
}

/** A table coral: a short trunk under wide, layered plates. */
function table(c: Ctx, x: number, y: number, h: number, col: string, tip: string) {
  const top = y - h * 0.55, w = h * 0.9
  c.fillStyle = col
  c.beginPath(); c.moveTo(x - h * 0.07, y); c.lineTo(x - h * 0.04, top); c.lineTo(x + h * 0.04, top); c.lineTo(x + h * 0.07, y); c.closePath(); c.fill()
  for (const [dy, k] of [[0, 1], [-h * 0.14, 0.72], [-h * 0.26, 0.45]] as const) {
    c.fillStyle = col
    c.beginPath(); c.ellipse(x, top + dy, w * k, h * 0.08, 0, 0, TAU); c.fill()
    c.fillStyle = tip
    c.beginPath(); c.ellipse(x, top + dy - h * 0.025, w * k * 0.92, h * 0.035, 0, Math.PI, TAU); c.fill()
  }
}

/** Pillar coral: a cluster of tall, rounded columns. */
function pillar(c: Ctx, x: number, y: number, h: number, col: string, tip: string, r: () => number) {
  const n = 4 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const px = x + (i - (n - 1) / 2) * h * 0.13, ph = h * (0.45 + r() * 0.55), w = h * 0.1
    c.fillStyle = col
    c.beginPath(); c.moveTo(px - w / 2, y); c.lineTo(px - w / 2, y - ph); c.arc(px, y - ph, w / 2, Math.PI, TAU); c.lineTo(px + w / 2, y); c.closePath(); c.fill()
    c.fillStyle = tip
    c.beginPath(); c.arc(px, y - ph, w * 0.32, 0, TAU); c.fill()
  }
}

/** A brain coral mound with winding grooves. */
function brain(c: Ctx, x: number, y: number, h: number, col: string, dark: string) {
  const rad = h * 0.5
  const g = c.createRadialGradient(x - rad * 0.3, y - rad * 0.7, 2, x, y - rad * 0.3, rad * 1.3)
  g.addColorStop(0, col); g.addColorStop(1, dark)
  c.fillStyle = g
  c.beginPath(); c.ellipse(x, y, rad * 1.3, rad, 0, Math.PI, TAU); c.closePath(); c.fill()
  c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = Math.max(1, h * 0.02)
  for (let k = 1; k <= 4; k++) {
    c.beginPath()
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (i / 20) * Math.PI
      const rr = rad * (k / 4.6) * (1 + 0.12 * Math.sin(i * 1.9 + k))
      const px = x + Math.cos(a) * rr * 1.3, py = y + Math.sin(a) * rr
      if (i === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    }
    c.stroke()
  }
}

/** Tube sponges / tube coral: a bunch of open-topped tubes. */
function tubes(c: Ctx, x: number, y: number, h: number, col: string, r: () => number) {
  for (let i = 0; i < 4; i++) {
    const tx = x + (i - 1.5) * h * 0.16, th = h * (0.5 + r() * 0.5), w = h * 0.13
    c.fillStyle = col
    c.beginPath(); c.moveTo(tx - w / 2, y); c.lineTo(tx - w * 0.62, y - th); c.lineTo(tx + w * 0.62, y - th); c.lineTo(tx + w / 2, y); c.closePath(); c.fill()
    c.fillStyle = 'rgba(3,7,13,.85)'
    c.beginPath(); c.ellipse(tx, y - th, w * 0.56, w * 0.22, 0, 0, TAU); c.fill()
  }
}

/** Soft coral: a puffy, bushy dome of round lobes. */
function soft(c: Ctx, x: number, y: number, h: number, col: string, tip: string, r: () => number) {
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + 0.25 + (i / 8) * (Math.PI - 0.5), d = h * (0.25 + r() * 0.2)
    const bx = x + Math.cos(a) * d * 1.2, by = y + Math.sin(a) * d - h * 0.08, br = h * (0.14 + r() * 0.08)
    c.fillStyle = col
    c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill()
    c.fillStyle = tip
    c.beginPath(); c.arc(bx - br * 0.25, by - br * 0.3, br * 0.4, 0, TAU); c.fill()
  }
}

export function drawCoral(c: Ctx, kind: CoralKind, x: number, y: number, h: number, col: string, tip: string, dark: string, r: () => number) {
  if (kind === 'stag') stag(c, x, y, h, col, tip, r)
  else if (kind === 'fan') fan(c, x, y, h, col, r)
  else if (kind === 'table') table(c, x, y, h, col, tip)
  else if (kind === 'pillar') pillar(c, x, y, h, col, tip, r)
  else if (kind === 'brain') brain(c, x, y, h, col, dark)
  else if (kind === 'tubes') tubes(c, x, y, h, col, r)
  else soft(c, x, y, h, col, tip, r)
}

/** Coral size unit: the scene's height, but no more than the width allows (so phones held upright don't get giant coral). */
const coralUnit = (W: number, H: number) => Math.min(H, W * 0.8)

const TALL: CoralKind[] = ['stag', 'fan', 'table', 'pillar', 'stag', 'fan']
const LOW: CoralKind[] = ['brain', 'soft', 'tubes', 'brain', 'soft']

/**
 * The coral wall behind the play area: a far layer, faded into the water, and
 * a nearer, brighter layer. Both stand on a rocky reef ridge.
 */
export function paintCoralWall(c: Ctx, W: number, H: number, palette: string[], water: string) {
  const r = rng(4040)
  const u = coralUnit(W, H)
  const layers = [
    { fade: 0.86, ridge: 0.74, tall: [0.4, 0.6], gap: [55, 95] },
    { fade: 0.74, ridge: 0.84, tall: [0.3, 0.48], gap: [75, 130] },
  ]
  for (const L of layers) {
    // the rock the corals grow on
    c.fillStyle = fade('#2a3644', water, L.fade)
    c.beginPath(); c.moveTo(-20, H)
    for (let x = -20; x <= W + 20; x += 16) c.lineTo(x, H * L.ridge + Math.sin(x * 0.013 + L.fade * 9) * H * 0.03 + Math.sin(x * 0.041) * H * 0.012)
    c.lineTo(W + 20, H); c.closePath(); c.fill()
    let x = -10 + r() * 20
    while (x < W + 20) {
      const base = H * L.ridge + Math.sin(x * 0.013 + L.fade * 9) * H * 0.03 + H * 0.02
      const col = palette[Math.floor(r() * palette.length)]
      const tall = r() < 0.7
      const kind = tall ? TALL[Math.floor(r() * TALL.length)] : LOW[Math.floor(r() * LOW.length)]
      const h = u * (L.tall[0] + r() * (L.tall[1] - L.tall[0])) * (tall ? 1 : 0.5)
      drawCoral(c, kind, x, base, h, fade(col, water, L.fade), fade(col, water, L.fade * 0.8, 1), fade('#0a1626', water, L.fade), r)
      x += L.gap[0] + r() * (L.gap[1] - L.gap[0])
    }
  }
}

/**
 * The near reef along the seabed (right of the cave) and on top of the cave
 * rock: big, colorful corals, packed close. `ground(x)` is the seabed height.
 */
export function paintCoralFront(c: Ctx, W: number, H: number, caveW: number, caveTop: number, palette: string[], water: string, ground: (x: number) => number) {
  const r = rng(777)
  const u = coralUnit(W, H)
  // back row: tall corals, a little dimmer so snacks stand out against them
  let x = caveW * 0.85
  while (x < W + 30) {
    const col = palette[Math.floor(r() * palette.length)]
    const kind = TALL[Math.floor(r() * TALL.length)]
    const h = u * (0.26 + r() * 0.16)
    drawCoral(c, kind, x, ground(x) + 6, h, fade(col, water, 0.5), fade(col, water, 0.38, 1), '#0a1626', r)
    x += 110 + r() * 90
  }
  // front row: low, round corals
  x = caveW * 0.8
  while (x < W + 30) {
    const col = palette[Math.floor(r() * palette.length)]
    const kind = LOW[Math.floor(r() * LOW.length)]
    drawCoral(c, kind, x, ground(x) + 10, u * (0.1 + r() * 0.08), fade(col, water, 0.15), fade(col, '#ffffff', 0.3), '#0a1626', r)
    x += 70 + r() * 70
  }
  // corals growing over the cave rock (the mouth stays clear)
  for (const [fx, kind, k] of [[0.2, 'fan', 0.16], [0.75, 'stag', 0.15]] as const) {
    const col = palette[Math.floor(r() * palette.length)]
    drawCoral(c, kind, caveW * fx, caveTop + u * 0.03, u * k * 1.2, fade(col, water, 0.4), fade(col, water, 0.25, 1), '#0a1626', r)
  }
}
