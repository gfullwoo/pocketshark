// Predators of the home reef: the big shark, the squid and the crab, and in
// Coral Gardens the stingray, the barracuda and the moray eel.
// Each has a drawing and a set of hit circles that cover its whole outline
// (head, body, fins, tail, tentacles, claws, legs), so touching ANY part of it
// counts as being caught.
import type { Ctx2D } from './ctx2d'

export type PredKind = 'shark' | 'squid' | 'crab' | 'ray' | 'barracuda' | 'eel'

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
   * Big shark only, while coming from the background: 0 = swimming nose-first
   * straight at the viewer, 1 = side-on. In between it is turning.
   */
  yaw?: number
  /**
   * Squid only: swimming; aiming (turns its arms toward the shark and pulls the
   * long tentacles back); striking (shoots them out); retracting; resting.
   * `e` is how far the tentacles are thrown: -0.3 wound up … 0 relaxed … 1 fully out.
   */
  squid?: { state: 'swim' | 'aim' | 'strike' | 'retract' | 'cool'; t: number; e: number; warned: boolean }
  /** Crab only: walking, crouching before a leap, in the air, or resting after landing. */
  crab?: { state: 'walk' | 'crouch' | 'air' | 'cool'; t: number; vx: number; vy: number; warned: boolean }
  /** Stingray only: gliding across, chasing the pocket shark (for a while), or leaving. `t` counts down. */
  ray?: { state: 'glide' | 'chase' | 'leave'; t: number }
  /** Barracuda only: cruising, locking on (a short warning), darting in a straight line, or resting. */
  cuda?: { state: 'cruise' | 'lock' | 'dart' | 'cool'; t: number }
  /**
   * Moray eel only: it lives in a hole in the reef at (ax, ay). It peeks out,
   * lunges at a pocket shark that comes near (after a short warning), pulls
   * back, and after a while sinks back into its hole for good. `ext` is how far
   * out of the hole it is (0 hidden … 1 fully out), `len` its full length.
   */
  eel?: { state: 'peek' | 'warn' | 'lunge' | 'back' | 'cool' | 'leave'; t: number; ax: number; ay: number; ext: number; len: number; life: number; lunges: number }
  /** Finished its visit without leaving the screen (the eel going back into its hole). */
  gone?: boolean
}

export interface Circle { x: number; y: number; r: number }

export const PRED_INFO: Record<PredKind, { coming: string; caught: string; sees: string }> = {
  shark: { coming: 'A big shark is coming! Glow off or swim home', caught: 'Chomp! The big shark nipped you. Swim home!', sees: 'It sees your glow!' },
  squid: { coming: 'A squid is coming! Keep away from its tentacles', caught: 'The squid grabbed you! Wriggle home!', sees: 'The squid sees your glow!' },
  crab: { coming: 'A crab is scuttling by! Stay up high', caught: 'Pinch! The crab grabbed you. Swim home!', sees: 'The crab is about to jump!' },
  ray: { coming: 'A stingray is gliding in! Don’t let it catch you', caught: 'Zap! The stingray got you. Swim home!', sees: 'The stingray is chasing you!' },
  barracuda: { coming: 'A barracuda! Watch out when it stops and stares', caught: 'Snap! The barracuda got you. Swim home!', sees: 'The barracuda is locking on!' },
  eel: { coming: 'Something lives in the coral… keep your distance', caught: 'The eel grabbed you! Wriggle home!', sees: 'An eel is about to lunge!' },
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

// Stingray (units: 200 = the ray's size), pointing along +x: disc, wings and the long tail.
const RAY_HITS: [number, number, number][] = [
  [42, 0, 18], [18, 0, 30], [-8, 0, 30], [-30, 0, 20], [6, -34, 22], [6, 34, 22], [0, -58, 13], [0, 58, 13], [-6, -74, 7], [-6, 74, 7],
  [-58, 0, 6], [-80, 0, 6], [-102, 0, 6], [-124, 0, 7], [-146, 0, 5], // tail and barb
]
// Barracuda (units: 220 = its length), pointing along +x.
const CUDA_HITS: [number, number, number][] = [
  [104, 3, 7], [86, 1, 11], [62, 0, 14], [36, 0, 15], [8, 0, 15], [-20, 0, 13], [-46, 0, 11], [-70, 0, 8], [-90, 0, 7],
  [-106, -14, 8], [-106, 14, 8], // tail fin
  [0, -20, 7], [-30, -18, 6], [-36, 18, 6], // fins
]

/** Points along the eel's body, from its hole to its head. */
export function eelBody(p: Pred, t = 0): { x: number; y: number }[] {
  const e = p.eel ?? { ax: p.x - Math.cos(p.ang) * p.s, ay: p.y - Math.sin(p.ang) * p.s, ext: 1, len: p.s }
  const L = e.len * e.ext, ux = Math.cos(p.ang), uy = Math.sin(p.ang), N = 12, pts = []
  const amp = e.len * 0.05 * (1 - 0.6 * e.ext)
  for (let i = 0; i <= N; i++) {
    const f = i / N, w = amp * Math.sin(f * Math.PI * 2.2 - t * 4) * f * (1 - f) * 4
    pts.push({ x: e.ax + ux * L * f - uy * w, y: e.ay + uy * L * f + ux * w })
  }
  return pts
}

export function hitCircles(p: Pred): Circle[] {
  if (p.kind === 'ray') {
    const sc = p.s / 200, c = Math.cos(p.ang), sn = Math.sin(p.ang)
    return RAY_HITS.map(([x, y, r]) => ({ x: p.x + (x * c - y * sn) * sc, y: p.y + (x * sn + y * c) * sc, r: r * sc }))
  }
  if (p.kind === 'barracuda') {
    const sc = p.s / 220, c = Math.cos(p.ang), sn = Math.sin(p.ang)
    return CUDA_HITS.map(([x, y, r]) => ({ x: p.x + (x * c - y * sn) * sc, y: p.y + (x * sn + y * c) * sc, r: r * sc }))
  }
  if (p.kind === 'eel') {
    // only the part that is out of the hole can bite (the last point is the head)
    const pts = eelBody(p), th = p.s * 0.042
    return pts.slice(1).map((q, i, a) => ({ x: q.x, y: q.y, r: i === a.length - 1 ? th * 1.5 : th }))
  }
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
  else if (p.kind === 'ray') drawRay(ctx, p, t)
  else if (p.kind === 'barracuda') drawBarracuda(ctx, p, t)
  else if (p.kind === 'eel') drawEel(ctx, p, t)
  else drawCrab(ctx, p, t)
}

function drawBigShark(ctx: Ctx2D, p: Pred, t: number) {
  const yaw = p.yaw ?? 1
  if (yaw < 0.5) { drawBigSharkFront(ctx, p, t, 1 - yaw * 1.3); return }
  const s = p.s / 230, wag = Math.sin(t * (p.hunt ? 9 : 5)) * 7, rim = 'rgba(150,190,225,.28)', fin = '#1a2632'
  ctx.save()
  // finishing a turn from head-on: the side view opens out from narrow to full length
  const turnX = yaw < 1 ? 0.3 + 0.7 * ((yaw - 0.5) / 0.5) : 1
  ctx.translate(p.x, p.y); ctx.scale(p.dir * s * turnX, s)
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

/**
 * The big shark seen nose-on, swimming straight at the viewer: a rounded snout
 * with the eyes on either side, a wide mouth line, pectoral fins swept out and
 * down, and the dorsal fin standing up behind. `w` squashes it sideways as it
 * starts to turn (1 = straight on).
 */
function drawBigSharkFront(ctx: Ctx2D, p: Pred, t: number, w: number) {
  const s = p.s / 230, rim = 'rgba(150,190,225,.28)', fin = '#1a2632'
  const sway = Math.sin(t * 5) // the body rocks a little with each tail beat
  ctx.save()
  ctx.translate(p.x + sway * 3 * s, p.y)
  ctx.rotate(sway * 0.05)
  ctx.scale(s * w * (p.dir < 0 ? -1 : 1), s)
  ctx.lineWidth = 1.5 / s; ctx.strokeStyle = rim; ctx.lineJoin = 'round'
  // tail fin, far behind the body: only its tips show above and below
  ctx.fillStyle = '#121b24'
  ctx.beginPath(); ctx.moveTo(-3, -18); ctx.lineTo(-4 + sway * 6, -50); ctx.lineTo(4, -18); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-3, 18); ctx.lineTo(-3 + sway * 5, 38); ctx.lineTo(3, 18); ctx.closePath(); ctx.fill()
  // dorsal fin, standing up behind the head
  ctx.fillStyle = fin
  ctx.beginPath(); ctx.moveTo(-7, -20); ctx.quadraticCurveTo(-3, -46, 1, -66); ctx.quadraticCurveTo(5, -44, 7, -20); ctx.closePath(); ctx.fill(); ctx.stroke()
  // pectoral fins swept out and down
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * 18, 6); ctx.quadraticCurveTo(side * 44, 16, side * 66, 34 + sway * side * 2)
    ctx.quadraticCurveTo(side * 40, 24, side * 16, 18); ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  // body: dark back, pale belly
  const g = ctx.createLinearGradient(0, -26, 0, 26)
  g.addColorStop(0, '#16212c'); g.addColorStop(0.5, '#24323f'); g.addColorStop(1, '#5d6e80')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.ellipse(0, 0, 28, 25, 0, 0, TAU); ctx.fill(); ctx.stroke()
  // snout, slightly lighter, pointing at the viewer
  const sn = ctx.createRadialGradient(0, -2, 1, 0, -2, 17)
  sn.addColorStop(0, 'rgba(120,140,160,.45)'); sn.addColorStop(1, 'rgba(120,140,160,0)')
  ctx.fillStyle = sn
  ctx.beginPath(); ctx.ellipse(0, -2, 17, 14, 0, 0, TAU); ctx.fill()
  // gill slits on both flanks
  ctx.strokeStyle = 'rgba(10,16,22,.55)'; ctx.lineWidth = 1.4 / s
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = side * (21 + i * 2.2)
    ctx.beginPath(); ctx.moveTo(x, -4 + i); ctx.quadraticCurveTo(x + side * 1.5, 2, x, 8 - i); ctx.stroke()
  }
  // mouth: a wide curve under the snout, open with teeth when hunting
  const o = p.open
  if (o > 0.05) {
    ctx.fillStyle = '#07090d'
    ctx.beginPath(); ctx.moveTo(-17, 9); ctx.quadraticCurveTo(0, 13, 17, 9); ctx.quadraticCurveTo(0, 13 + o * 12, -17, 9); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(230,235,240,.75)'
    for (let i = -3; i <= 3; i++) {
      const x = i * 4.4, y = 10.5 + (1 - Math.abs(i) / 4) * 1.6
      ctx.beginPath(); ctx.moveTo(x - 1.6, y); ctx.lineTo(x, y + 3 * o); ctx.lineTo(x + 1.6, y); ctx.closePath(); ctx.fill()
    }
  } else {
    ctx.beginPath(); ctx.moveTo(-17, 9); ctx.quadraticCurveTo(0, 15, 17, 9); ctx.stroke()
  }
  // eyes, set wide on the sides of the head
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.ellipse(side * 17, -8, 2.6, 3, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = 'rgba(210,230,255,.85)'; ctx.beginPath(); ctx.arc(side * 17 + 0.6, -9, 0.8, 0, TAU); ctx.fill()
  }
  // nostrils
  ctx.fillStyle = 'rgba(5,8,12,.7)'
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 5, -3, 1.4, 0.8, 0, 0, TAU); ctx.fill() }
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

/** Stingray, seen from above as it glides: a broad rippling disc and a long, barbed tail. */
function drawRay(ctx: Ctx2D, p: Pred, t: number) {
  const sc = p.s / 200, flap = Math.sin(t * (p.hunt ? 7 : 4) + p.ph)
  ctx.save()
  ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(sc, sc)
  // tail with its barb
  ctx.strokeStyle = '#4a3f36'; ctx.lineCap = 'round'; ctx.lineWidth = 6
  const tw = Math.sin(t * 3 + p.ph) * 10
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-95, tw, -150, -tw * 0.5); ctx.stroke()
  ctx.fillStyle = '#d9c9a8'
  ctx.beginPath(); ctx.moveTo(-112, tw * 0.6 - 3); ctx.lineTo(-136, tw * 0.3 - 9); ctx.lineTo(-118, tw * 0.6 + 2); ctx.closePath(); ctx.fill()
  // the disc: wing tips ripple up and down (narrower from above when raised)
  const span = 76 * (0.88 + 0.12 * flap), tipX = -4 + flap * 6
  const g = ctx.createRadialGradient(10, -10, 4, 0, 0, 90)
  g.addColorStop(0, '#9a8a72'); g.addColorStop(0.7, '#6f6252'); g.addColorStop(1, '#4a4036')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(56, 0)
  ctx.bezierCurveTo(48, -26, 24, -span * 0.75, tipX, -span)
  ctx.bezierCurveTo(-18, -span * 0.7, -38, -26, -44, 0)
  ctx.bezierCurveTo(-38, 26, -18, span * 0.7, tipX, span)
  ctx.bezierCurveTo(24, span * 0.75, 48, 26, 56, 0)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(210,190,160,.35)'; ctx.lineWidth = 2; ctx.stroke()
  // spots
  ctx.fillStyle = 'rgba(40,32,26,.45)'
  for (const [x, y, r] of [[8, -30, 5], [-12, 22, 6], [22, 14, 4], [-20, -14, 4], [0, 46, 4], [2, -52, 4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill() }
  // eyes on top of the head, angry when chasing
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#f2e6c8'; ctx.beginPath(); ctx.ellipse(30, side * 12, 6, 5, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = '#120c08'; ctx.beginPath(); ctx.arc(32, side * 12, 3, 0, TAU); ctx.fill()
    if (p.hunt) { ctx.strokeStyle = '#120c08'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(24, side * 20); ctx.lineTo(38, side * 13); ctx.stroke() }
  }
  ctx.restore()
}

/** Barracuda: long, silver, dark bars, a jutting lower jaw full of teeth. */
function drawBarracuda(ctx: Ctx2D, p: Pred, t: number) {
  const sc = p.s / 220, flip = Math.cos(p.ang) < 0 ? -1 : 1
  const wag = Math.sin(t * (p.cuda?.state === 'dart' ? 18 : 6) + p.ph) * 6
  ctx.save()
  ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(sc, sc * flip)
  ctx.lineJoin = 'round'
  // tail fin
  ctx.fillStyle = '#4c5d6c'
  ctx.beginPath(); ctx.moveTo(-88, 0); ctx.lineTo(-114, -20 + wag); ctx.lineTo(-104, 0); ctx.lineTo(-114, 20 + wag); ctx.closePath(); ctx.fill()
  // fins
  ctx.beginPath(); ctx.moveTo(4, -15); ctx.lineTo(-6, -28); ctx.lineTo(-14, -14); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-26, -13); ctx.lineTo(-36, -24); ctx.lineTo(-42, -11); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-30, 12); ctx.lineTo(-40, 24); ctx.lineTo(-46, 10); ctx.closePath(); ctx.fill()
  // body
  const g = ctx.createLinearGradient(0, -16, 0, 16)
  g.addColorStop(0, '#5b6f80'); g.addColorStop(0.5, '#b9c7d2'); g.addColorStop(1, '#e8eef2')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(108, 2)
  ctx.bezierCurveTo(96, -10, 60, -16, 20, -16)
  ctx.bezierCurveTo(-30, -16, -70, -10, -92, -3)
  ctx.lineTo(-92, 3)
  ctx.bezierCurveTo(-70, 10, -30, 15, 20, 15)
  ctx.bezierCurveTo(60, 15, 98, 12, 112, 6)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(30,40,50,.5)'; ctx.lineWidth = 1.5; ctx.stroke()
  // dark bars
  ctx.fillStyle = 'rgba(40,52,64,.45)'
  for (const x of [52, 30, 8, -14, -36, -56]) { ctx.beginPath(); ctx.ellipse(x, -7, 4, 7, 0.25, 0, TAU); ctx.fill() }
  // teeth along the jutting jaw
  ctx.fillStyle = '#fff'
  for (let x = 74; x <= 104; x += 6) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 2, 0); ctx.lineTo(x + 4, 4); ctx.closePath(); ctx.fill() }
  // eye: a fierce stare while locking on
  const lock = p.cuda?.state === 'lock' || p.cuda?.state === 'dart'
  ctx.fillStyle = '#f6f2d8'; ctx.beginPath(); ctx.arc(84, -5, 5.5, 0, TAU); ctx.fill()
  ctx.fillStyle = '#0c1014'; ctx.beginPath(); ctx.arc(86, -5, lock ? 2 : 3.2, 0, TAU); ctx.fill()
  if (lock) { ctx.strokeStyle = '#0c1014'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(77, -12); ctx.lineTo(92, -8); ctx.stroke() }
  ctx.restore()
}

/** Moray eel: a spotted green body coming out of a dark hole in the reef. */
function drawEel(ctx: Ctx2D, p: Pred, t: number) {
  const e = p.eel, pts = eelBody(p, t), th = p.s * 0.08
  const ax = e?.ax ?? pts[0].x, ay = e?.ay ?? pts[0].y
  // the hole
  ctx.fillStyle = '#03070c'
  ctx.beginPath(); ctx.ellipse(ax, ay, th * 1.1, th * 0.75, 0, 0, TAU); ctx.fill()
  // body
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = '#3d5a2a'; ctx.lineWidth = th * 1.08
  ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke()
  ctx.strokeStyle = '#6f8f3a'; ctx.lineWidth = th * 0.85
  ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke()
  ctx.fillStyle = 'rgba(30,44,18,.55)'
  for (let i = 1; i < pts.length - 1; i++) { const q = pts[i]; ctx.beginPath(); ctx.arc(q.x + ((i * 7) % 5) - 2, q.y + ((i * 3) % 5) - 2, th * 0.14, 0, TAU); ctx.fill() }
  // head
  const h = pts[pts.length - 1], a = p.ang, open = p.open
  ctx.save()
  ctx.translate(h.x, h.y); ctx.rotate(a)
  if (Math.cos(a) < 0) ctx.scale(1, -1)
  ctx.fillStyle = '#6f8f3a'
  ctx.beginPath(); ctx.ellipse(th * 0.25, -th * 0.08 - open * th * 0.18, th * 0.85, th * 0.42, -open * 0.35, 0, TAU); ctx.fill()
  ctx.fillStyle = '#5e7c30'
  ctx.beginPath(); ctx.ellipse(th * 0.2, th * 0.18 + open * th * 0.18, th * 0.75, th * 0.3, open * 0.35, 0, TAU); ctx.fill()
  if (open > 0.1) {
    ctx.fillStyle = '#2a0b10'
    ctx.beginPath(); ctx.ellipse(th * 0.55, th * 0.05, th * 0.45, th * 0.25 * open, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = '#fff'
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(th * (0.3 + k * 0.17), -th * 0.12 * open, th * 0.05, 0, TAU); ctx.fill() }
  }
  ctx.fillStyle = '#f4f0c8'; ctx.beginPath(); ctx.arc(th * 0.55, -th * 0.28 - open * th * 0.15, th * 0.15, 0, TAU); ctx.fill()
  ctx.fillStyle = '#0b0f06'; ctx.beginPath(); ctx.arc(th * 0.6, -th * 0.28 - open * th * 0.15, th * 0.08, 0, TAU); ctx.fill()
  ctx.restore()
  // a rocky lip in front of the hole, hiding where the body goes in
  ctx.fillStyle = '#2a2f36'
  ctx.beginPath(); ctx.ellipse(ax, ay + th * 0.45, th * 1.5, th * 0.5, 0, Math.PI, TAU); ctx.fill()
}
