// A little cartoon shrimp: curled, segmented body, fanned tail, long antennae
// and fluttering legs. Drawn facing +x (call after rotating to its heading).
import type { Ctx2D } from './ctx2d'

export const SHRIMP_COLORS = [
  { body: '#ffd84d', shade: '#d9a520', name: 'yellow' },
  { body: '#ff5a4a', shade: '#c4322a', name: 'red' },
] as const

const TAU = Math.PI * 2

/** r is the shrimp's size (about half its body length); ph animates legs and antennae. */
export function drawShrimp(ctx: Ctx2D, r: number, variant: number, ph: number) {
  const c = SHRIMP_COLORS[variant % SHRIMP_COLORS.length]
  const flick = Math.sin(ph * 3) * 0.15

  // antennae: two long feelers sweeping back over the body
  ctx.strokeStyle = c.body
  ctx.lineWidth = Math.max(0.6, r * 0.08)
  ctx.lineCap = 'round'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(r * 1.15, -r * 0.15)
    ctx.quadraticCurveTo(r * 2.2, -r * (0.9 + s * 0.25) + Math.sin(ph * 2 + s) * r * 0.2, r * 0.6, -r * (1.6 + s * 0.3))
    ctx.stroke()
  }

  // legs flutter under the belly
  ctx.strokeStyle = c.shade
  ctx.lineWidth = Math.max(0.6, r * 0.09)
  for (let i = 0; i < 4; i++) {
    const x = r * (0.7 - i * 0.42), wig = Math.sin(ph * 6 + i) * r * 0.15
    ctx.beginPath(); ctx.moveTo(x, r * 0.25); ctx.lineTo(x - r * 0.15 + wig, r * 0.62); ctx.stroke()
  }

  // tail fan
  ctx.fillStyle = c.shade
  ctx.save()
  ctx.translate(-r * 1.35, r * 0.35)
  ctx.rotate(0.5 + flick)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-r * 0.7, -r * 0.42)
  ctx.quadraticCurveTo(-r * 0.85, 0, -r * 0.7, r * 0.42)
  ctx.closePath(); ctx.fill()
  ctx.restore()

  // curled, segmented body: overlapping shell plates from head to tail
  const segs = 6
  for (let i = segs - 1; i >= 0; i--) {
    const k = i / (segs - 1) // 0 = head, 1 = tail
    const x = r * (1 - k * 2.3)
    const y = r * (0.05 + k * k * 0.45 + Math.sin(k * Math.PI) * -0.12)
    const rad = r * (0.5 - k * 0.22)
    ctx.fillStyle = i % 2 ? c.shade : c.body
    ctx.beginPath(); ctx.ellipse(x, y, rad * 1.05, rad, 0.35 * k, 0, TAU); ctx.fill()
  }
  // head shell with a little pointed nose (rostrum)
  ctx.fillStyle = c.body
  ctx.beginPath()
  ctx.moveTo(r * 1.55, -r * 0.18)
  ctx.lineTo(r * 1.05, -r * 0.42)
  ctx.quadraticCurveTo(r * 0.5, -r * 0.5, r * 0.4, -r * 0.05)
  ctx.quadraticCurveTo(r * 0.8, r * 0.38, r * 1.25, r * 0.1)
  ctx.closePath(); ctx.fill()
  // shine and eye
  ctx.fillStyle = 'rgba(255,255,255,.35)'
  ctx.beginPath(); ctx.ellipse(r * 0.7, -r * 0.25, r * 0.28, r * 0.09, -0.3, 0, TAU); ctx.fill()
  ctx.fillStyle = '#0a1420'
  ctx.beginPath(); ctx.arc(r * 1.05, -r * 0.22, Math.max(1, r * 0.13), 0, TAU); ctx.fill()
}
