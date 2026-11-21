// Predators of the home reef: the big shark, the squid and the crab.
// Each has a drawing and a set of hit circles that cover its whole outline
// (head, body, fins, tail, tentacles, claws, legs), so touching ANY part of it
// counts as being caught.
import type { Ctx2D } from './ctx2d'

export type PredKind = 'shark' | 'squid' | 'crab'

export interface Pred {
  kind: PredKind
  x: number
  y: number
  dir: 1 | -1 // travel direction for the shark and crab
  ang: number // heading for the squid (radians)
  s: number // overall size in px
  warn: number // legacy: always 0 (predators no longer give a warning)
  hunt: boolean // chasing a glowing pocket shark
  open: number // mouth open / claws wide, 0–1
  minD: number // closest it came to the pocket shark (for the dodge reward)
  done: boolean // already caught the shark once this pass
  ph: number // animation phase
  entered: boolean
  /**
   * Coming in from the background: it starts small and far away, swims toward
   * the pocket shark's home while growing to full size (z 0 → 1), then turns
   * and leaves left or right like a normal pass. It can't touch the pocket
   * shark until it is nearly full size (in the same plane).
   */
  deep?: { z: number; fullS: number; x0: number; y0: number; tx: number; ty: number; dur: number }
  /**
   * Squid only: swimming; aiming (turns its arms toward the shark and pulls the
   * long tentacles back); striking (shoots them out); retracting; resting.
   * `e` is how far the tentacles are thrown: -0.3 wound up … 0 relaxed … 1 fully out.
   */
  squid?: { state: 'swim' | 'aim' | 'strike' | 'retract' | 'cool'; t: number; e: number; warned: boolean }
  /** Crab only: walking, crouching before a leap, in the air, or resting after landing. */
  crab?: { state: 'walk' | 'crouch' | 'air' | 'cool'; t: number; vx: number; vy: number; warned: boolean }
}

export interface Circle { x: number; y: number; r: number }

export const PRED_INFO: Record<PredKind, { coming: string; caught: string; sees: string }> = {
  shark: { coming: 'A big shark is coming! Glow off or swim home', caught: 'Chomp! The big shark nipped you. Swim home!', sees: 'It sees your glow!' },
  squid: { coming: 'A squid is coming! Keep away from its tentacles', caught: 'The squid grabbed you! Wriggle home!', sees: 'The squid sees your glow!' },
  crab: { coming: 'A crab is scuttling by! Stay up high', caught: 'Pinch! The crab grabbed you. Swim home!', sees: 'The crab is about to jump!' },
}

const TAU = Math.PI * 2

// Hit circles in each predator's own drawing units: [x, y, r].
const SHARK_HITS: [number, number, number][] = [
  [92, 3, 12], [72, 0, 18], [48, -2, 22], [22, -2, 23], [-4, -2, 22], [-30, -2, 19], [-56, -2, 14], [-80, 0, 9],
  [-104, -24, 12], [-118, -38, 8], [-106, 14, 10], // tail lobes
  [-14, -40, 11], [-2, -28, 9], // dorsal fin
  [22, 34, 10], [14, 44, 6], // pectoral fin
]
const SQUID_HITS: [number, number, number][] = [
  [92, 0, 12], [72, 0, 17], [50, 0, 19], [28, 0, 19], [6, 0, 17], // mantle and head
  [-18, -6, 11], [-18, 6, 11], [-38, -9, 9], [-38, 9, 9], [-58, -10, 7], [-58, 10, 7], // arms
]

/** Length of the squid's two long feeding tentacles, in squid units: relaxed 100, fully thrown 240. */
export const squidTentacleLength = (e: number) => 100 + 140 * Math.max(0, e) + 25 * Math.min(0, e)
/** Where each tentacle tip sits sideways: they spread when relaxed and close together when thrown. */
const tentacleSpread = (e: number) => 16 - 11 * Math.max(0, e)

function squidTentacleHits(e: number): [number, number, number][] {
  const L = squidTentacleLength(e), spread = tentacleSpread(e), out: [number, number, number][] = []
  for (const side of [-1, 1]) {
    for (let x = -70; x > -L; x -= 16) out.push([x, side * (4 + (spread - 4) * ((-x - 8) / (L - 8))), 6])
    out.push([-L, side * spread, 10]) // the club at the tip
  }
  return out
}
const CRAB_HITS: [number, number, number][] = [
  [0, 0, 36], [-26, -4, 22], [26, -4, 22], // shell
  [-60, -30, 18], [60, -30, 18], [-44, -18, 12], [44, -18, 12], // claws and arms
  [-50, 18, 12], [50, 18, 12], [-62, 30, 9], [62, 30, 9], // legs
  [-14, -34, 7], [14, -34, 7], // eye stalks
]

export function hitCircles(p: Pred): Circle[] {
  if (p.kind === 'shark') {
    const sc = p.s / 230
    return SHARK_HITS.map(([x, y, r]) => ({ x: p.x + p.dir * x * sc, y: p.y + y * sc, r: r * sc }))
  }
  if (p.kind === 'squid') {
    const sc = p.s / 200, c = Math.cos(p.ang), sn = Math.sin(p.ang)
    return [...SQUID_HITS, ...squidTentacleHits(p.squid?.e ?? 0)].map(([x, y, r]) => ({ x: p.x + (x * c - y * sn) * sc, y: p.y + (x * sn + y * c) * sc, r: r * sc }))
  }
  const sc = p.s / 120
  return CRAB_HITS.map(([x, y, r]) => ({ x: p.x + x * sc, y: p.y + y * sc, r: r * sc }))
}

export function touches(a: Circle[], b: Circle[]): boolean {
  for (const p of a) for (const q of b) if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r) return true
  return false
}

export function sharkMouth(p: Pred) {
  const sc = p.s / 230
  return { x: p.x + p.dir * 80 * sc, y: p.y + 12 * sc }
}

/** The yellow "!" shown where a predator is about to appear. */
export function drawWarning(ctx: Ctx2D, x: number, y: number, t: number) {
  ctx.save()
  ctx.globalAlpha = 0.6 + Math.sin(t * 12) * 0.4
  ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 16
  ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.fill()
  ctx.shadowBlur = 0; ctx.fillStyle = '#1a1200'
  ctx.font = '700 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('!', x, y + 1)
  ctx.restore()
}

export function drawPredator(ctx: Ctx2D, p: Pred, t: number) {
  if (p.kind === 'shark') drawBigShark(ctx, p, t)
  else if (p.kind === 'squid') drawSquid(ctx, p, t)
  else drawCrab(ctx, p, t)
}

function drawBigShark(ctx: Ctx2D, p: Pred, t: number) {
  const s = p.s / 230, wag = Math.sin(t * (p.hunt ? 9 : 5)) * 7, rim = 'rgba(150,190,225,.28)', fin = '#1a2632'
  ctx.save()
  ctx.translate(p.x, p.y); ctx.scale(p.dir * s, s)
  ctx.lineWidth = 1.5 / s; ctx.strokeStyle = rim; ctx.lineJoin = 'round'
  ctx.fillStyle = '#121b24'
  ctx.beginPath(); ctx.moveTo(34, 14); ctx.lineTo(16, 38); ctx.quadraticCurveTo(22, 26, 26, 15); ctx.closePath(); ctx.fill()
  ctx.fillStyle = fin
  ctx.beginPath(); ctx.moveTo(-86, -5); ctx.lineTo(-128, -48 + wag); ctx.quadraticCurveTo(-112, -14 + wag * 0.5, -104, 0)
  ctx.lineTo(-121, 26 + wag); ctx.quadraticCurveTo(-103, 12, -86, 5); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(12, -22); ctx.quadraticCurveTo(-4, -36, -16, -60); ctx.quadraticCurveTo(-20, -42, -32, -21); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-60, -13); ctx.lineTo(-71, -25); ctx.lineTo(-74, -10); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-36, 17); ctx.lineTo(-50, 30); ctx.lineTo(-52, 15); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-64, 11); ctx.lineTo(-72, 20); ctx.lineTo(-75, 9); ctx.closePath(); ctx.fill()
  const g = ctx.createLinearGradient(0, -25, 0, 21)
  g.addColorStop(0, '#16212c'); g.addColorStop(0.55, '#24323f'); g.addColorStop(1, '#56677a')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.moveTo(101, 3); ctx.bezierCurveTo(94, -12, 62, -23, 20, -24); ctx.bezierCurveTo(-20, -25, -60, -16, -88, -5)
  ctx.lineTo(-88, 5); ctx.bezierCurveTo(-60, 14, -20, 21, 20, 21); ctx.bezierCurveTo(56, 21, 86, 15, 101, 3); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = 'rgba(10,16,22,.55)'; ctx.lineWidth = 1.6 / s
  ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-88, 0); ctx.stroke()
  for (let i = 0; i < 5; i++) {
    const x = 56 - i * 4.5
    ctx.beginPath(); ctx.moveTo(x, -8 + i * 0.6); ctx.quadraticCurveTo(x - 3, 2, x - 1, 10); ctx.stroke()
  }
  const o = p.open
  if (o > 0.05) {
    ctx.fillStyle = '#07090d'
    ctx.beginPath(); ctx.moveTo(96, 6); ctx.quadraticCurveTo(80, 6 + o * 4, 62, 12); ctx.quadraticCurveTo(80, 12 + o * 20, 94, 9 + o * 14); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(230,235,240,.75)'
    for (let i = 0; i < 5; i++) {
      const x = 90 - i * 5.5, y = 6.5 + i * 0.9 + o * 1.5
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1.6, y + 3 * o); ctx.lineTo(x - 3.2, y); ctx.closePath(); ctx.fill()
    }
  } else {
    ctx.beginPath(); ctx.moveTo(94, 7); ctx.quadraticCurveTo(80, 10, 64, 12); ctx.stroke()
  }
  ctx.fillStyle = fin; ctx.strokeStyle = rim; ctx.lineWidth = 1.5 / s
  ctx.beginPath(); ctx.moveTo(42, 13); ctx.lineTo(12, 46); ctx.quadraticCurveTo(22, 30, 26, 16); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.ellipse(76, -7, 3.4, 2.8, 0, 0, TAU); ctx.fill()
  ctx.fillStyle = 'rgba(210,230,255,.85)'; ctx.beginPath(); ctx.arc(77, -8, 1, 0, TAU); ctx.fill()
  ctx.restore()
}

/** Squid swims mantle-first (+x is the direction of travel); arms and tentacles trail behind. */
function drawSquid(ctx: Ctx2D, p: Pred, t: number) {
  const sc = p.s / 200
  const pulse = Math.max(0, Math.sin(p.ph)) // jetting squeezes the mantle
  ctx.save()
  ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(sc, sc)
  const body = '#a8436f', dark = '#6e2547', rim = 'rgba(255,190,220,.25)'
  // arms and the two long feeding tentacles, waving behind
  ctx.lineCap = 'round'
  for (let i = 0; i < 8; i++) {
    const off = (i - 3.5) * 3.2
    const wave = Math.sin(t * 4 + i) * 6
    ctx.strokeStyle = i % 2 ? body : dark
    ctx.lineWidth = 6 - Math.abs(i - 3.5) * 0.6
    ctx.beginPath(); ctx.moveTo(-6, off * 0.8)
    ctx.quadraticCurveTo(-36, off * 1.6 + wave, -62 - (i % 3) * 4, off * 2.2 + wave * 1.4)
    ctx.stroke()
  }
  // the two long feeding tentacles: wavy when relaxed, pulled back to wind up, shot straight out to strike
  const e = p.squid?.e ?? 0
  const L = squidTentacleLength(e), spread = tentacleSpread(e)
  const straight = Math.max(0, Math.min(1, e * 1.5))
  for (const side of [-1, 1]) {
    ctx.strokeStyle = dark; ctx.lineWidth = 3 + straight
    ctx.beginPath(); ctx.moveTo(-8, side * 4)
    const wobble = Math.sin(t * 3 + side) * 8 * (1 - straight)
    ctx.quadraticCurveTo(-L * 0.6, side * (spread * 0.75 + wobble), -L, side * spread)
    ctx.stroke()
    // clubs with suckers, bigger and open when striking
    const cw = 7 + straight * 5, ch = 4 + straight * 3
    ctx.fillStyle = body
    ctx.beginPath(); ctx.ellipse(-L, side * spread, cw, ch, side * 0.3 * (1 - straight), 0, TAU); ctx.fill()
    if (straight > 0.2) {
      ctx.fillStyle = 'rgba(255,220,235,.7)'
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-L - 4 + k * 4, side * spread, 1.3, 0, TAU); ctx.fill() }
    }
  }
  // fins at the mantle tip
  ctx.fillStyle = dark
  ctx.beginPath(); ctx.moveTo(78, 0); ctx.quadraticCurveTo(96, -26, 106, -2); ctx.lineTo(106, 2); ctx.quadraticCurveTo(96, 26, 78, 0); ctx.closePath(); ctx.fill()
  // mantle
  const w = 20 - pulse * 4
  const g = ctx.createLinearGradient(0, -w, 0, w)
  g.addColorStop(0, '#c45a87'); g.addColorStop(1, '#7c2a52')
  ctx.fillStyle = g
  ctx.strokeStyle = rim; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(104, 0)
  ctx.bezierCurveTo(90, -w, 30, -w - 2, 0, -w * 0.8)
  ctx.quadraticCurveTo(-12, 0, 0, w * 0.8)
  ctx.bezierCurveTo(30, w + 2, 90, w, 104, 0)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  // spots
  ctx.fillStyle = 'rgba(255,200,225,.3)'
  for (const [sx, sy, sr] of [[70, -6, 3], [50, 5, 4], [30, -8, 3], [20, 7, 2.5], [84, 3, 2]]) { ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill() }
  // big eyes
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#f2e6c8'; ctx.beginPath(); ctx.arc(2, side * 9, 6, 0, TAU); ctx.fill()
    ctx.fillStyle = '#0a0a10'; ctx.beginPath(); ctx.arc(1, side * 9, 3.6, 0, TAU); ctx.fill()
  }
  ctx.restore()
}

/** Crab walks sideways along the seabed, claws snapping. Drawn facing the viewer. */
function drawCrab(ctx: Ctx2D, p: Pred, t: number) {
  const sc = p.s / 120
  const st = p.crab?.state ?? 'walk'
  const step = st === 'walk' ? Math.sin(p.ph * 2) : 0
  // claws snap while walking and spread wide for a grab
  const snap = Math.max(0.35 + 0.35 * Math.max(0, Math.sin(t * 5)), p.open * 1.1)
  // squash while crouching, stretch while leaping
  const sy = st === 'crouch' ? 0.82 : st === 'air' ? 1.12 : 1
  const sx = st === 'crouch' ? 1.12 : st === 'air' ? 0.92 : 1
  const shell = '#d4543a', dark = '#9c3424', light = '#f08a63'
  ctx.save()
  ctx.translate(p.x, p.y + Math.abs(step) * -2 * sc); ctx.scale(sc * sx, sc * sy)
  ctx.lineCap = 'round'
  // legs, three each side, stepping
  ctx.strokeStyle = dark; ctx.lineWidth = 6
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const lift = Math.sin(p.ph * 2 + i * 2 + (side > 0 ? 1 : 0)) * 5
      const bx = side * (22 + i * 6), by = 10 + i * 4
      ctx.beginPath(); ctx.moveTo(bx, by)
      ctx.lineTo(side * (46 + i * 8), by + 6 + lift)
      ctx.lineTo(side * (54 + i * 9), by + 24 + lift)
      ctx.stroke()
    }
  }
  // arms up to the claws
  ctx.strokeStyle = shell; ctx.lineWidth = 9
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * 26, -6); ctx.quadraticCurveTo(side * 44, -10, side * 52, -24); ctx.stroke()
  }
  // claws (pincers) snapping
  const reach = p.open * 14 // claws reach further up for a grab
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * (60 + reach * 0.3), -30 - reach)
    ctx.scale(side, 1)
    ctx.fillStyle = shell
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, -0.4, 0, TAU); ctx.fill()
    ctx.fillStyle = light
    ctx.save(); ctx.rotate(-0.6 - snap); ctx.beginPath(); ctx.ellipse(8, -6, 14, 5, 0, 0, TAU); ctx.fill(); ctx.restore()
    ctx.save(); ctx.rotate(-0.2 + snap * 0.6); ctx.beginPath(); ctx.ellipse(10, 2, 12, 4.5, 0, 0, TAU); ctx.fill(); ctx.restore()
    ctx.restore()
  }
  // shell
  const g = ctx.createRadialGradient(-10, -14, 4, 0, 0, 44)
  g.addColorStop(0, light); g.addColorStop(1, shell)
  ctx.fillStyle = g
  ctx.beginPath(); ctx.ellipse(0, 0, 40, 26, 0, 0, TAU); ctx.fill()
  ctx.strokeStyle = dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(0, 4, 26, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke()
  // eyes on stalks
  for (const side of [-1, 1]) {
    ctx.strokeStyle = dark; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(side * 10, -20); ctx.lineTo(side * 14, -34); ctx.stroke()
    ctx.fillStyle = '#f7f2e6'; ctx.beginPath(); ctx.arc(side * 14, -36, 6, 0, TAU); ctx.fill()
    ctx.fillStyle = '#0a0a10'; ctx.beginPath(); ctx.arc(side * 14 + p.dir * 1.5, -36, 3, 0, TAU); ctx.fill()
  }
  // grumpy little mouth
  ctx.strokeStyle = dark; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(0, -6); ctx.lineTo(6, -4); ctx.stroke()
  ctx.restore()
}
