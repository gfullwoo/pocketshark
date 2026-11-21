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
  const h = Math.max(115, Math.min(H * 0.31, 225))
  return { w, h, top: H - h }
}

export function paintScenery(c: Ctx, W: number, H: number) {
  const r = rng(20261121)
  const between = (a: number, b: number) => a + r() * (b - a)
  const cave = caveBox(W, H)

  // ---- cave: a craggy rock outcrop rising from the left, with a deep, rounded mouth ----
  paintCave(c, W, H, cave)
  for (let i = 0; i < 125; i++) r() // keep the reef below laid out exactly as before

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

  paintCaveRubble(c, H, cave)

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


// ------------------------------------------------------------------ the cave
type Box = ReturnType<typeof caveBox>
type Pt = [number, number]

const ROCK_LIGHT = '#2b4258'
const ROCK_MID = '#172a3d'
const ROCK_DARK = '#0a1522'

/** Mouth geometry, shared with the world's "at home" check (see World.atHome). */
function mouthOf(cave: Box, H: number) {
  const mx = cave.w * 0.5, mw = cave.w * 0.24, mh = cave.h * 0.48, mb = seabedY(mx, H) + 4
  return { mx, mw, mh, mb }
}

/** A lumpy rock: a polygon with a noisy radius, lit from the upper right. */
function boulder(c: Ctx, cx: number, cy: number, rx: number, ry: number, r: () => number, light = ROCK_LIGHT, dark = ROCK_DARK) {
  const n = 9, pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.3, k = 0.78 + r() * 0.3
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }
  const g = c.createLinearGradient(cx + rx * 0.5, cy - ry, cx - rx * 0.4, cy + ry)
  g.addColorStop(0, light); g.addColorStop(0.55, ROCK_MID); g.addColorStop(1, dark)
  c.fillStyle = g
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < n; i++) c.lineTo(pts[i][0], pts[i][1])
  c.closePath(); c.fill()
  c.strokeStyle = 'rgba(2,6,12,.55)'; c.lineWidth = 1.2; c.stroke()
  // a pale edge where the light catches the top
  c.strokeStyle = 'rgba(150,195,230,.18)'; c.lineWidth = 1.5
  c.beginPath()
  const top = pts.filter((p) => p[1] < cy).sort((a, b) => a[0] - b[0])
  if (top.length > 1) { c.moveTo(top[0][0], top[0][1]); for (const p of top.slice(1)) c.lineTo(p[0], p[1]); c.stroke() }
}

function paintCave(c: Ctx, W: number, H: number, cave: Box) {
  const r = rng(4417)
  const between = (a: number, b: number) => a + r() * (b - a)
  const { mx, mw, mh, mb } = mouthOf(cave, H)

  // 1. the outcrop: an angular, craggy silhouette (straight facets, not a smooth dome)
  const out: Pt[] = [[-20, H]]
  const steps = 22
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const lift = Math.sin(Math.min(1, f * 1.12) * Math.PI * 0.5 + Math.PI * 0.5) // 1 → 0
    const y = cave.top + (1 - lift) * cave.h * 0.92 + between(-14, 14) * (0.35 + lift)
    out.push([-20 + f * (cave.w + 46), Math.min(seabedY(f * cave.w, H) + 6, y)])
  }
  out.push([cave.w + 46, H])
  const rock = c.createLinearGradient(cave.w * 0.8, cave.top, 0, H)
  rock.addColorStop(0, '#203549'); rock.addColorStop(0.45, ROCK_MID); rock.addColorStop(1, '#050d18')
  c.fillStyle = rock
  c.beginPath(); c.moveTo(out[0][0], out[0][1])
  for (const p of out.slice(1)) c.lineTo(p[0], p[1])
  c.closePath(); c.fill()

  // 2. big boulders stacked into the outcrop give it chunky, rocky mass
  const rocks: [number, number, number, number][] = [
    [0.12, 0.2, 0.3, 0.2], [0.42, 0.18, 0.26, 0.17], [0.05, 0.5, 0.26, 0.22],
    [0.86, 0.62, 0.22, 0.2], [0.72, 0.38, 0.2, 0.16], [0.22, 0.78, 0.24, 0.2], [0.95, 0.86, 0.18, 0.13],
  ]
  for (const [fx, fy, frx, fry] of rocks) {
    const x = fx * cave.w, y = cave.top + fy * cave.h
    if (y > seabedY(x, H)) continue
    boulder(c, x, y, frx * cave.w, fry * cave.h, r)
  }

  // 3. rock layers: slanted cracks across the face, each with a pale lip under it
  for (let i = 0; i < 6; i++) {
    const y0 = cave.top + cave.h * between(0.18, 0.85), x0 = between(-10, cave.w * 0.3), len = between(cave.w * 0.25, cave.w * 0.6)
    const tilt = between(-0.18, 0.06)
    c.strokeStyle = 'rgba(2,6,12,.6)'; c.lineWidth = between(1.2, 2.2)
    c.beginPath(); c.moveTo(x0, y0)
    let x = x0, y = y0
    while (x < x0 + len) { x += between(8, 18); y += (x - x0) * 0 + between(-3, 3) + tilt * 12; c.lineTo(x, y) }
    c.stroke()
    c.strokeStyle = 'rgba(150,195,230,.07)'; c.lineWidth = 1
    c.beginPath(); c.moveTo(x0, y0 + 2); c.lineTo(x, y + 2); c.stroke()
  }

  // 4. the mouth: a rounded rock arch, with a thick shadowed rock lip around it
  const arch = (k: number, jag: number): Pt[] => {
    const pts: Pt[] = []
    const n = 18
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI // left foot → over the top → right foot
      const rx = mw * k * (1 + (i > n / 2 ? 0.06 : 0)), ry = mh * k
      const j = i === 0 || i === n ? 0 : (r() - 0.5) * jag
      pts.push([mx + Math.cos(a) * (rx + j), mb + Math.sin(a) * (ry + j) * 1.0])
    }
    return pts
  }
  const fillPts = (pts: Pt[], style: string | ReturnType<Ctx['createLinearGradient']>) => {
    c.fillStyle = style
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1])
    for (const p of pts.slice(1)) c.lineTo(p[0], p[1])
    c.closePath(); c.fill()
  }
  // outer lip (rock rim, lit on top)
  const lip = arch(1.22, 3)
  const lipG = c.createLinearGradient(mx, mb - mh * 1.25, mx, mb)
  lipG.addColorStop(0, '#2f475e'); lipG.addColorStop(0.5, '#1a2d40'); lipG.addColorStop(1, '#0c1826')
  fillPts(lip, lipG)
  c.strokeStyle = 'rgba(160,205,240,.22)'; c.lineWidth = 1.6
  c.beginPath(); c.moveTo(lip[3][0], lip[3][1]); for (const p of lip.slice(4, 16)) c.lineTo(p[0], p[1]); c.stroke()
  // the opening, dark and deep: rings of shadow going back into the rock
  const open = arch(1, 1.5)
  const deep = c.createRadialGradient(mx + mw * 0.1, mb - mh * 0.35, 2, mx, mb - mh * 0.45, mw * 1.25)
  deep.addColorStop(0, '#000000'); deep.addColorStop(0.55, '#01040a'); deep.addColorStop(1, '#0a1624')
  fillPts(open, deep)
  // inner wall: a second, smaller arch set back and to one side, so the tunnel reads as going deeper
  const back = arch(0.62, 1).map(([x, y]): Pt => [x + mw * 0.12, y + (mb - y) * 0.05])
  c.strokeStyle = 'rgba(70,110,145,.18)'; c.lineWidth = 1.4
  c.beginPath(); c.moveTo(back[0][0], back[0][1]); for (const p of back.slice(1)) c.lineTo(p[0], p[1]); c.stroke()
  // soft shadow along the inside edge of the opening
  c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 4
  c.beginPath(); c.moveTo(open[0][0], open[0][1]); for (const p of open.slice(1)) c.lineTo(p[0], p[1]); c.stroke()

  // 6. moss and sea-growth on the upper surfaces
  for (let i = 0; i < 26; i++) {
    const f = between(0.02, 0.98)
    const idx = Math.max(1, Math.min(out.length - 2, Math.round(f * (out.length - 3)) + 1))
    const [x, y] = out[idx]
    const green = r() < 0.6
    c.fillStyle = green ? `rgba(60,150,110,${between(0.18, 0.35)})` : `rgba(150,90,140,${between(0.15, 0.3)})`
    c.beginPath(); c.ellipse(x + between(-8, 8), y + between(2, 12), between(4, 11), between(2, 5), between(-0.4, 0.4), 0, TAU); c.fill()
  }
  // barnacles and tiny shells on the rock face
  for (let i = 0; i < 16; i++) {
    const x = between(cave.w * 0.03, cave.w * 0.97), y = cave.top + cave.h * between(0.25, 0.9)
    const inMouth = Math.abs(x - mx) < mw * 1.25 && y > mb - mh * 1.25
    if (inMouth || y > seabedY(x, H) - 4) continue
    c.fillStyle = 'rgba(190,210,225,.16)'
    c.beginPath(); c.arc(x, y, between(1.2, 2.4), 0, TAU); c.fill()
  }
  // a few glowing specks deep inside, like tiny cave dwellers
  for (let i = 0; i < 6; i++) {
    c.fillStyle = `rgba(92,225,255,${between(0.25, 0.6)})`
    c.beginPath(); c.arc(mx + between(-mw * 0.45, mw * 0.55), mb - between(mh * 0.15, mh * 0.6), between(0.8, 1.6), 0, TAU); c.fill()
  }
}

/** Fallen rocks and pebbles piled at the cave entrance, sitting on the sand. */
function paintCaveRubble(c: Ctx, H: number, cave: Box) {
  const r = rng(9021)
  const between = (a: number, b: number) => a + r() * (b - a)
  const { mx, mw } = mouthOf(cave, H)
  const spots: [number, number][] = [[mx - mw * 1.35, 12], [mx - mw * 1.05, 7], [mx + mw * 1.15, 10], [mx + mw * 1.45, 15], [mx + mw * 0.75, 5]]
  for (const [x, size] of spots) {
    const s = size * (cave.w / 300)
    boulder(c, x, seabedY(x, H) - s * 0.35, s * 1.3, s * 0.8, r)
  }
  for (let i = 0; i < 10; i++) {
    const x = mx + between(-mw * 1.8, mw * 1.8)
    if (Math.abs(x - mx) < mw * 0.7) continue // keep the doorway clear
    c.fillStyle = `rgba(90,120,150,${between(0.15, 0.3)})`
    c.beginPath(); c.ellipse(x, seabedY(x, H) + between(-1, 4), between(1.5, 3.5), between(1, 2.2), 0, 0, TAU); c.fill()
  }
}

// ------------------------------------------------------------- the backdrop
/**
 * Distant structure behind the reef, so the open water isn't empty: layers of
 * rock that fade into the blue the farther away they are. A far ridge, a sunken
 * ship lying on it, rock spires and a natural arch in the middle distance, kelp
 * forest silhouettes, and low rock shelves just behind the reef. Drawn behind
 * everything that swims (including predators coming in from the background).
 */
export function paintBackdrop(c: Ctx, W: number, H: number) {
  const r = rng(77031)
  const between = (a: number, b: number) => a + r() * (b - a)
  const ridge = (base: number, amp: number, step: number, seed: number) => {
    const pts: Pt[] = []
    for (let x = -20; x <= W + 40; x += step) {
      const y = base - amp * (0.55 + 0.45 * Math.sin(x * 0.011 + seed) * Math.sin(x * 0.004 + seed * 2)) + between(-amp * 0.12, amp * 0.12)
      pts.push([x, y])
    }
    return pts
  }
  const fillRidge = (pts: Pt[], top: string, bottom: string, y0: number) => {
    const g = c.createLinearGradient(0, y0, 0, H)
    g.addColorStop(0, top); g.addColorStop(1, bottom)
    c.fillStyle = g
    c.beginPath(); c.moveTo(-20, H)
    c.lineTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [nx, ny] = pts[i + 1]
      c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
    }
    c.lineTo(W + 40, H); c.closePath(); c.fill()
  }

  // 1. far seamount ridge, almost lost in the blue
  const far = ridge(H * 0.74, H * 0.2, 30, 1.3)
  fillRidge(far, 'rgba(30,70,106,.5)', 'rgba(10,30,52,.65)', H * 0.5)

  // 2. a sunken ship resting on the far ridge, tilted, faint
  {
    const x = W * 0.72, y = H * 0.6, k = Math.min(W, H) / 380
    c.save()
    c.translate(x, y); c.rotate(-0.12); c.scale(k, k)
    c.fillStyle = 'rgba(28,62,94,.75)'
    c.beginPath()
    c.moveTo(-70, -6); c.lineTo(62, -10); c.lineTo(78, -24); c.lineTo(72, 6)
    c.quadraticCurveTo(10, 22, -60, 14); c.closePath(); c.fill() // hull
    c.fillRect(-30, -24, 34, 16) // cabin
    c.fillRect(-6, -70, 4, 48) // broken mast
    c.beginPath(); c.moveTo(-4, -64); c.lineTo(22, -52); c.lineTo(-2, -48); c.closePath(); c.fill() // torn sail
    c.fillStyle = 'rgba(120,200,255,.18)'
    for (const px of [-48, -28, 22, 42]) { c.beginPath(); c.arc(px, 2, 2.2, 0, TAU); c.fill() } // portholes
    c.restore()
  }

  // 3. middle distance: tall rock spires and a natural arch
  const rockShape = (pts: Pt[], alpha: number) => {
    const ys = pts.map((p) => p[1]), top = Math.min(...ys)
    const g = c.createLinearGradient(0, top, 0, H)
    g.addColorStop(0, `rgba(42,86,124,${alpha})`); g.addColorStop(1, `rgba(10,28,48,${alpha})`)
    c.fillStyle = g
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.closePath(); c.fill()
    c.strokeStyle = `rgba(160,210,245,${alpha * 0.35})`; c.lineWidth = 1.2
    c.beginPath(); c.moveTo(pts[1][0], pts[1][1]); for (const p of pts.slice(2, -1)) c.lineTo(p[0], p[1]); c.stroke()
  }
  const spire = (x: number, w: number, h: number, alpha: number) => {
    const base = H * 0.86, pts: Pt[] = [[x - w, H]]
    const n = 7
    for (let i = 0; i <= n; i++) {
      const f = i / n, side = f < 0.5 ? -1 : 1, t = f < 0.5 ? f * 2 : (1 - f) * 2 // 0 at feet → 1 at top
      pts.push([x + side * w * (1 - t * 0.75) + between(-w * 0.12, w * 0.12), base - h * t + between(-h * 0.04, h * 0.04)])
    }
    pts.push([x + w, H])
    rockShape(pts, alpha)
  }
  spire(W * 0.88, W * 0.07, H * 0.4, 0.7)
  spire(W * 0.97, W * 0.045, H * 0.27, 0.62)
  spire(W * 0.4, W * 0.04, H * 0.24, 0.55)
  // the arch: a thick band of rock bending over open water
  {
    const cx = W * 0.62, half = W * 0.13, top = H * 0.6, base = H + 4
    const g = c.createLinearGradient(0, top, 0, H)
    g.addColorStop(0, 'rgba(42,86,124,.62)'); g.addColorStop(1, 'rgba(10,28,48,.62)')
    c.strokeStyle = g
    c.lineWidth = W * 0.055
    c.lineCap = 'butt'
    c.beginPath()
    c.moveTo(cx - half, base)
    c.bezierCurveTo(cx - half * 1.05, top + (base - top) * 0.2, cx - half * 0.55, top, cx, top)
    c.bezierCurveTo(cx + half * 0.6, top, cx + half * 1.1, top + (base - top) * 0.25, cx + half, base)
    c.stroke()
    // light along the top of the span
    c.strokeStyle = 'rgba(160,210,245,.18)'; c.lineWidth = 1.4
    c.beginPath()
    c.moveTo(cx - half - W * 0.026, top + (base - top) * 0.35)
    c.bezierCurveTo(cx - half * 1.1, top - W * 0.02, cx - half * 0.3, top - W * 0.028, cx + half * 0.5, top - W * 0.022)
    c.stroke()
  }

  // 4. kelp forest silhouettes in the middle distance
  for (let i = 0; i < 9; i++) {
    const x = between(W * 0.3, W * 0.98), h = between(H * 0.22, H * 0.42), base = H * 0.95
    c.strokeStyle = `rgba(24,86,84,${between(0.35, 0.5)})`
    c.lineWidth = between(2, 3.5)
    c.beginPath(); c.moveTo(x, base)
    const bend = between(-14, 14)
    c.bezierCurveTo(x + bend, base - h * 0.35, x - bend, base - h * 0.7, x + bend * 0.5, base - h)
    c.stroke()
    c.fillStyle = c.strokeStyle
    for (let j = 1; j < 6; j++) {
      const f = j / 6, ly = base - h * f, lx = x + Math.sin(f * 3 + i) * bend * 0.6
      c.beginPath(); c.ellipse(lx + (j % 2 ? 6 : -6), ly, 7, 2.6, j % 2 ? 0.5 : -0.5, 0, TAU); c.fill()
    }
  }

  // 5. low rock shelves just behind the reef
  const near = ridge(H * 0.96, H * 0.07, 28, 4.2)
  fillRidge(near, 'rgba(20,46,72,.75)', 'rgba(6,18,32,.9)', H * 0.8)

  // 6. faint glowing specks on the far rocks: life down in the deep
  for (let i = 0; i < 22; i++) {
    const x = between(W * 0.25, W), y = between(H * 0.62, H * 0.95)
    c.fillStyle = `rgba(${r() < 0.5 ? '92,225,255' : '125,255,154'},${between(0.12, 0.35)})`
    c.beginPath(); c.arc(x, y, between(0.7, 1.4), 0, TAU); c.fill()
  }

  // 7. a soft blue haze over all of it so it stays in the distance
  const haze = c.createLinearGradient(0, H * 0.45, 0, H)
  haze.addColorStop(0, 'rgba(8,28,50,0)'); haze.addColorStop(1, 'rgba(6,20,38,.25)')
  c.fillStyle = haze
  c.fillRect(0, H * 0.45, W, H * 0.55)
}
