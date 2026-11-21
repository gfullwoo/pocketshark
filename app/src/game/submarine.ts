// The research submarine: it cruises across the reef looking for rare species,
// sweeping a spotlight through the water. If the pocket shark stays in the beam
// for a moment it is caught and the game ends (with an option to continue).
// The home cave is always safe. A glowing shark draws the beam toward it.
import type { Ctx2D } from './ctx2d'

const TAU = Math.PI * 2

export interface Sub {
  x: number
  y: number
  dir: 1 | -1
  s: number // hull length in px
  beam: number // spotlight direction (radians, absolute; PI/2 = straight down)
  spot: number // 0–1: how close it is to catching the shark in the beam
  hunt: boolean // the beam is following a glowing shark
  ph: number // animation phase
  stop: number // 0–1: slowing to a stop (after a catch)
}

/** Half-width of the spotlight cone, in radians. */
export const BEAM_HALF = 0.2

/** Seconds the shark has to stay in the beam before it is caught. */
export const SPOT_SECONDS = 0.45

export function subLamp(sb: Sub) {
  const k = sb.s / 200
  return { x: sb.x + sb.dir * 74 * k, y: sb.y + 22 * k }
}

export function beamLength(SH: number) { return SH * 0.75 }

/** Is a circle (the pocket shark) inside the spotlight cone? */
export function inBeam(sb: Sub, SH: number, x: number, y: number, r: number) {
  const l = subLamp(sb), dx = x - l.x, dy = y - l.y, d = Math.hypot(dx, dy)
  if (d > beamLength(SH) + r || d < 1) return d < r
  let da = Math.atan2(dy, dx) - sb.beam
  while (da > Math.PI) da -= TAU
  while (da < -Math.PI) da += TAU
  return Math.abs(da) < BEAM_HALF + Math.asin(Math.min(1, r / d)) * 0.6
}

/** The spotlight cone. Warm white, turning red as it locks onto the shark. */
export function drawBeam(ctx: Ctx2D, sb: Sub, SH: number) {
  const l = subLamp(sb), L = beamLength(SH)
  const r = 255, g = Math.round(245 - 150 * sb.spot), b = Math.round(200 - 120 * sb.spot)
  const grad = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, L)
  grad.addColorStop(0, `rgba(${r},${g},${b},${0.42 + 0.2 * sb.spot})`)
  grad.addColorStop(0.45, `rgba(${r},${g},${b},${0.16 + 0.12 * sb.spot})`)
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.save()
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(l.x, l.y)
  ctx.arc(l.x, l.y, L, sb.beam - BEAM_HALF, sb.beam + BEAM_HALF)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** A bright yellow research sub: conning tower, portholes, spinning propeller, lamp. */
export function drawSub(ctx: Ctx2D, sb: Sub, t: number) {
  const k = sb.s / 200
  ctx.save()
  ctx.translate(sb.x, sb.y)
  ctx.scale(sb.dir * k, k)
  ctx.lineJoin = 'round'
  const edge = 'rgba(40,30,10,.55)'
  ctx.lineWidth = 2 / k; ctx.strokeStyle = edge
  // tail fins
  ctx.fillStyle = '#c99a1c'
  ctx.beginPath(); ctx.moveTo(-70, -6); ctx.lineTo(-96, -30); ctx.lineTo(-88, -4); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-70, 8); ctx.lineTo(-96, 30); ctx.lineTo(-88, 6); ctx.closePath(); ctx.fill(); ctx.stroke()
  // propeller (spinning blades seen edge-on)
  ctx.fillStyle = '#3a3f46'
  ctx.beginPath(); ctx.ellipse(-92, 0, 5, 9, 0, 0, TAU); ctx.fill()
  const spin = Math.cos(t * 30)
  ctx.fillStyle = 'rgba(70,78,88,.85)'
  ctx.beginPath(); ctx.ellipse(-99, 0, 3, 16 * Math.abs(spin) + 2, 0, 0, TAU); ctx.fill()
  // conning tower
  ctx.fillStyle = '#e8b62a'
  ctx.beginPath(); ctx.moveTo(-30, -24); ctx.lineTo(-24, -50); ctx.lineTo(16, -50); ctx.lineTo(24, -24); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#3a3f46'; ctx.lineWidth = 3 / k
  ctx.beginPath(); ctx.moveTo(-8, -50); ctx.lineTo(-8, -64); ctx.lineTo(4, -64); ctx.stroke() // periscope
  // blinking red beacon
  ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ff4d4d' : '#7a1f1f'
  ctx.beginPath(); ctx.arc(10, -54, 3.5, 0, TAU); ctx.fill()
  // hull
  const hull = ctx.createLinearGradient(0, -30, 0, 30)
  hull.addColorStop(0, '#ffd54a'); hull.addColorStop(0.55, '#f0b624'); hull.addColorStop(1, '#a8770f')
  ctx.fillStyle = hull; ctx.strokeStyle = edge; ctx.lineWidth = 2 / k
  ctx.beginPath()
  ctx.moveTo(-80, -22); ctx.lineTo(60, -26)
  ctx.bezierCurveTo(98, -26, 98, 28, 60, 28)
  ctx.lineTo(-80, 22)
  ctx.bezierCurveTo(-96, 18, -96, -18, -80, -22)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  // stripe
  ctx.fillStyle = 'rgba(40,50,60,.35)'
  ctx.fillRect(-70, 8, 128, 4)
  // portholes
  for (const x of [-44, -14, 16]) {
    ctx.fillStyle = '#5c4a12'; ctx.beginPath(); ctx.arc(x, -6, 9, 0, TAU); ctx.fill()
    const gl = ctx.createRadialGradient(x - 2, -8, 1, x, -6, 7)
    gl.addColorStop(0, '#d8f4ff'); gl.addColorStop(1, '#3f9fd0')
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, -6, 6.5, 0, TAU); ctx.fill()
  }
  // front viewport dome
  ctx.fillStyle = 'rgba(120,200,240,.75)'
  ctx.beginPath(); ctx.ellipse(76, -6, 9, 13, 0, 0, TAU); ctx.fill(); ctx.stroke()
  // spotlight lamp under the nose
  ctx.fillStyle = '#3a3f46'
  ctx.beginPath(); ctx.ellipse(74, 22, 9, 6, 0, 0, TAU); ctx.fill()
  ctx.fillStyle = '#fff6d0'; ctx.shadowColor = '#fff2b0'; ctx.shadowBlur = 18
  ctx.beginPath(); ctx.arc(74, 22, 4.5, 0, TAU); ctx.fill()
  ctx.restore()
}

/** A faint sonar ring spreading out from the sub every couple of seconds. */
export function drawSonar(ctx: Ctx2D, sb: Sub) {
  const p = (sb.ph / 2.5) % 1
  ctx.save()
  ctx.strokeStyle = `rgba(160,220,255,${0.35 * (1 - p)})`
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(sb.x, sb.y, sb.s * (0.4 + p * 1.6), 0, TAU); ctx.stroke()
  ctx.restore()
}
