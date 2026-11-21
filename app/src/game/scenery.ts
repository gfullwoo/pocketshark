// Glow & Gulp background: a rocky cave, a coral reef and swaying kelp.
// The rock and coral are painted once per tank size onto an offscreen canvas;
// only the kelp is drawn every frame. Colors are kept dim so the brighter prey
// (pink krill, orange shrimp, gold fish) never get lost against the reef.

import type { Ctx2D } from './ctx2d'

type Ctx = Ctx2D
const TAU = Math.PI * 2

/** Small seeded PRNG so the reef looks the same every time the tank is resized. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const seabedY = (x: number, H: number) => H - 24 - Math.sin(x * 0.02) * 6 - Math.sin(x * 0.007) * 10

export function caveBox(W: number, H: number) {
  const w = Math.max(150, Math.min(W * 0.42, 360))
  const h = Math.max(150, Math.min(H * 0.42, 300))
  return { w, h, top: H - h }
}

export function paintScenery(c: Ctx, W: number, H: number) {
  const r = rng(20261121)
  const between = (a: number, b: number) => a + r() * (b - a)
  const cave = caveBox(W, H)

  // ---- cave: a rock outcrop rising from the left with a dark mouth ----
  const pts: [number, number][] = [[-20, H]]
  const steps = 14
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    // dome profile: tall near the wall, sloping down to the seabed
    const lift = Math.sin(Math.min(1, f * 1.15) * Math.PI * 0.5 + Math.PI * 0.5) // 1 → 0
    const y = cave.top + (1 - lift) * cave.h * 0.92 + between(-10, 10) * (0.4 + lift)
    pts.push([-20 + f * (cave.w + 40), Math.min(seabedY(f * cave.w, H), y)])
  }
  pts.push([cave.w + 40, H])
  const rock = c.createLinearGradient(0, cave.top, 0, H)
  rock.addColorStop(0, '#13263a')
  rock.addColorStop(0.6, '#0a1828')
  rock.addColorStop(1, '#050d18')
  c.fillStyle = rock
  c.beginPath()
  c.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [nx, ny] = pts[i + 1]
    c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
  }
  c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
  c.closePath()
  c.fill()
  // moonlit rim along the top of the rock
  c.strokeStyle = 'rgba(140,185,225,.2)'
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(pts[1][0], pts[1][1])
  for (let i = 1; i < pts.length - 2; i++) {
    const [x, y] = pts[i], [nx, ny] = pts[i + 1]
    c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
  }
  c.stroke()
  // rock texture: darker blotches and a few ledges
  for (let i = 0; i < 18; i++) {
    const x = between(0, cave.w * 0.9), y = between(cave.top + cave.h * 0.25, H - 10)
    c.fillStyle = `rgba(2,6,12,${between(0.15, 0.35)})`
    c.beginPath(); c.ellipse(x, y, between(8, 26), between(4, 12), between(-0.4, 0.4), 0, TAU); c.fill()
  }
  // the mouth
  const mx = cave.w * 0.5, mw = cave.w * 0.24, mh = cave.h * 0.48, mb = seabedY(mx, H) + 4
  const mouth = c.createRadialGradient(mx, mb - mh * 0.45, 4, mx, mb - mh * 0.4, mw * 1.3)
  mouth.addColorStop(0, '#000104')
  mouth.addColorStop(0.7, '#020610')
  mouth.addColorStop(1, '#07111e')
  c.fillStyle = mouth
  c.beginPath()
  c.moveTo(mx - mw, mb)
  c.bezierCurveTo(mx - mw * 1.05, mb - mh * 0.7, mx - mw * 0.55, mb - mh, mx, mb - mh)
  c.bezierCurveTo(mx + mw * 0.6, mb - mh, mx + mw * 1.1, mb - mh * 0.6, mx + mw, mb)
  c.closePath()
  c.fill()
  c.strokeStyle = 'rgba(140,185,225,.1)'; c.lineWidth = 1.5; c.stroke()
  // a few glowing specks deep inside, like tiny cave dwellers
  for (let i = 0; i < 5; i++) {
    c.fillStyle = `rgba(92,225,255,${between(0.25, 0.6)})`
    c.beginPath(); c.arc(mx + between(-mw * 0.5, mw * 0.5), mb - between(mh * 0.15, mh * 0.6), between(0.8, 1.6), 0, TAU); c.fill()
  }

  // ---- seabed ----
  const sand = c.createLinearGradient(0, H - 50, 0, H)
  sand.addColorStop(0, '#0a1a2c')
  sand.addColorStop(1, '#030b16')
  c.fillStyle = sand
  c.beginPath(); c.moveTo(0, H)
  for (let x = 0; x <= W + 20; x += 20) c.lineTo(x, seabedY(x, H))
  c.lineTo(W, H); c.closePath(); c.fill()
  // pebbles
  for (let i = 0; i < Math.round(W / 18); i++) {
    const x = between(0, W)
    c.fillStyle = `rgba(120,150,180,${between(0.05, 0.14)})`
    c.beginPath(); c.ellipse(x, seabedY(x, H) + between(4, 18), between(2, 5), between(1, 3), 0, 0, TAU); c.fill()
  }

  // ---- coral reef from the cave to the right wall ----
  const scale = Math.max(0.6, Math.min(1.1, W / 700))
  const palette = ['#7d3f68', '#8c5638', '#4f5e95', '#2f7a6c', '#9a4a5a']
  let x = cave.w + between(10, 30)
  let n = 0
  while (x < W - 16) {
    const base = seabedY(x, H) + 4
    const col = palette[Math.floor(r() * palette.length)]
    const kind = n % 4 === 0 ? 'fan' : n % 4 === 1 ? 'branch' : n % 4 === 2 ? 'brain' : 'tubes'
    const s = scale * between(0.75, 1.15)
    c.save()
    c.globalAlpha = 0.9
    if (kind === 'branch') branch(c, x, base, 34 * s, -Math.PI / 2, 4, 6 * s, col, r)
    else if (kind === 'fan') fan(c, x, base, 46 * s, col, r)
    else if (kind === 'brain') brain(c, x, base, 26 * s, col)
    else tubes(c, x, base, s, col, r)
    c.restore()
    x += between(48, 92) * scale
    n++
  }
  // a smaller reef patch on top of the cave rock
  branch(c, cave.w * 0.22, cave.top + cave.h * 0.12, 20 * scale, -Math.PI / 2 - 0.2, 3, 4 * scale, '#7d3f68', r)
  brain(c, cave.w * 0.78, seabedY(cave.w * 0.78, H) - cave.h * 0.18, 14 * scale, '#4f5e95')
}

function branch(c: Ctx, x: number, y: number, len: number, ang: number, depth: number, w: number, col: string, r: () => number) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len
  c.strokeStyle = col
  c.lineCap = 'round'
  c.lineWidth = w
  c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke()
  if (depth <= 0) {
    c.fillStyle = 'rgba(255,190,220,.35)'
    c.beginPath(); c.arc(ex, ey, w * 0.55, 0, TAU); c.fill()
    return
  }
  const spread = 0.35 + r() * 0.35
  branch(c, ex, ey, len * (0.65 + r() * 0.15), ang - spread, depth - 1, w * 0.72, col, r)
  branch(c, ex, ey, len * (0.65 + r() * 0.15), ang + spread, depth - 1, w * 0.72, col, r)
}

function fan(c: Ctx, x: number, y: number, h: number, col: string, r: () => number) {
  c.strokeStyle = col
  c.lineCap = 'round'
  // stalk
  c.lineWidth = 3
  c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h * 0.25); c.stroke()
  // ribs
  c.lineWidth = 1.2
  const cx = x, cy = y - h * 0.25
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI + 0.25 + (i / 12) * (Math.PI - 0.5)
    const len = h * (0.75 + r() * 0.25)
    c.beginPath(); c.moveTo(cx, cy)
    c.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.6, cx + Math.cos(a) * len, cy + Math.sin(a) * len)
    c.stroke()
  }
  // mesh arcs
  c.globalAlpha *= 0.55
  for (let k = 1; k <= 4; k++) {
    c.beginPath(); c.arc(cx, cy, h * 0.2 * k, -Math.PI + 0.25, -0.25); c.stroke()
  }
}

function brain(c: Ctx, x: number, y: number, rad: number, col: string) {
  const g = c.createRadialGradient(x - rad * 0.3, y - rad * 0.6, 2, x, y - rad * 0.3, rad * 1.2)
  g.addColorStop(0, col)
  g.addColorStop(1, '#0a1626')
  c.fillStyle = g
  c.beginPath(); c.ellipse(x, y, rad * 1.25, rad, 0, Math.PI, TAU); c.closePath(); c.fill()
  c.strokeStyle = 'rgba(0,0,0,.35)'
  c.lineWidth = 1.2
  for (let k = 1; k <= 3; k++) {
    c.beginPath()
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI
      const rr = rad * (k / 3.6) * (1 + 0.12 * Math.sin(i * 1.7 + k))
      const px = x + Math.cos(a) * rr * 1.25, py = y + Math.sin(a) * rr
      if (i === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    }
    c.stroke()
  }
}

function tubes(c: Ctx, x: number, y: number, s: number, col: string, r: () => number) {
  for (let i = 0; i < 3; i++) {
    const tx = x + (i - 1) * 10 * s, h = (26 + r() * 30) * s, w = 8 * s
    c.fillStyle = col
    c.beginPath()
    c.moveTo(tx - w / 2, y)
    c.lineTo(tx - w * 0.6, y - h)
    c.lineTo(tx + w * 0.6, y - h)
    c.lineTo(tx + w / 2, y)
    c.closePath(); c.fill()
    c.fillStyle = '#03070d'
    c.beginPath(); c.ellipse(tx, y - h, w * 0.55, w * 0.22, 0, 0, TAU); c.fill()
  }
}

/** Kelp sways every frame, so it isn't part of the cached layer. */
export function drawKelp(c: Ctx, W: number, H: number, t: number) {
  const cave = caveBox(W, H)
  const stalks = [
    { x: cave.w * 0.08, h: cave.h * 1.1, ph: 0 },
    { x: cave.w * 0.9, h: cave.h * 0.75, ph: 1.7 },
    { x: Math.min(W - 30, cave.w + (W - cave.w) * 0.55), h: H * 0.32, ph: 3.1 },
    { x: W - 22, h: H * 0.42, ph: 4.4 },
  ]
  c.save()
  c.lineCap = 'round'
  for (const k of stalks) {
    const by = seabedY(k.x, H) + 6
    const sway = Math.sin(t * 0.8 + k.ph) * 14
    const tipX = k.x + sway, tipY = by - k.h
    c.strokeStyle = 'rgba(38,92,72,.75)'
    c.lineWidth = 4
    c.beginPath(); c.moveTo(k.x, by)
    c.bezierCurveTo(k.x - 10 + sway * 0.3, by - k.h * 0.35, k.x + 12 + sway * 0.7, by - k.h * 0.7, tipX, tipY)
    c.stroke()
    // leaves along the stalk
    c.fillStyle = 'rgba(46,110,84,.6)'
    for (let i = 1; i <= 6; i++) {
      const f = i / 7
      const lx = k.x + (tipX - k.x) * f + Math.sin(f * 3 + k.ph) * 6, ly = by - k.h * f
      const side = i % 2 ? 1 : -1
      c.beginPath()
      c.ellipse(lx + side * 9, ly, 11, 4, side * (0.5 + Math.sin(t + i) * 0.15), 0, TAU)
      c.fill()
    }
  }
  c.restore()
}
