// The expressive baby pocket shark used in the opening story: big eyes, brows
// and mouth shapes for scared / sad / happy / surprised, plus blinking, tears,
// shivering and the pocket glow. Drawn in the same local coordinates as the
// game's shark (nose at +x ≈ 33), so the two read as the same character.
import type { Ctx2D } from '../game/ctx2d'

const TAU = Math.PI * 2

export interface Face {
  fear: number // 0–1: worried brows, tiny "o" mouth, shiver
  sad: number // 0–1: droopy brows, frown
  happy: number // 0–1: smile, blush
  surprise: number // 0–1: wide eyes, raised brows
  blink: number // 0 open … 1 closed
  look: { x: number; y: number } // pupil direction, -1…1
  mouthOpen: number // 0–1: calling out or biting
  tears: number // 0–1
  glow: number // 0–1 pocket glow
}

export const calmFace = (): Face => ({
  fear: 0, sad: 0, happy: 0, surprise: 0, blink: 0, look: { x: 0.3, y: 0 }, mouthOpen: 0, tears: 0, glow: 0,
})

/**
 * Draw the cartoon shark at (x, y). `size` is its length in world units,
 * `dir` 1 faces right, -1 left. `t` drives tail wag, shiver and tears.
 */
export function drawCartoonShark(ctx: Ctx2D, x: number, y: number, size: number, dir: 1 | -1, tilt: number, f: Face, t: number) {
  const sc = size / 80
  ctx.save()
  ctx.translate(x + Math.sin(t * 45) * f.fear * 1.2, y)
  ctx.rotate(tilt)
  ctx.scale(dir * sc, sc)
  ctx.translate(0, Math.sin(t * 2.6) * 1.5 - f.sad * 2)

  // Glow halo from the pockets, behind everything.
  if (f.glow > 0.01) {
    const h = ctx.createRadialGradient(1, 8, 0, 1, 8, 120)
    h.addColorStop(0, `rgba(125,255,154,${0.45 * f.glow})`)
    h.addColorStop(0.45, `rgba(125,255,154,${0.14 * f.glow})`)
    h.addColorStop(1, 'rgba(125,255,154,0)')
    ctx.fillStyle = h
    ctx.beginPath(); ctx.arc(1, 8, 120, 0, TAU); ctx.fill()
  }

  const wag = Math.sin(t * (f.sad > 0.5 ? 3 : 8)) * 3
  ctx.fillStyle = '#6f7b88'
  // tail
  ctx.beginPath(); ctx.moveTo(-34, -3); ctx.lineTo(-52, -16 + wag); ctx.quadraticCurveTo(-47, -2, -51, 9 + wag); ctx.lineTo(-34, 4); ctx.closePath(); ctx.fill()
  // dorsal fins
  ctx.beginPath(); ctx.moveTo(-2, -14); ctx.quadraticCurveTo(-8, -26, -15, -12); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-20, -10); ctx.quadraticCurveTo(-24, -19, -29, -7); ctx.closePath(); ctx.fill()

  // body: a chubbier, rounder baby version of the game shark
  const bg = ctx.createLinearGradient(0, -18, 0, 17)
  bg.addColorStop(0, '#b6c1cc'); bg.addColorStop(1, '#68747f')
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.moveTo(34, 1); ctx.bezierCurveTo(34, -17, 14, -19, -2, -16); ctx.bezierCurveTo(-18, -12, -28, -6, -38, -3)
  ctx.lineTo(-38, 4); ctx.bezierCurveTo(-28, 9, -16, 16, 0, 17); ctx.bezierCurveTo(20, 18, 34, 15, 34, 1); ctx.closePath(); ctx.fill()
  // pale belly
  ctx.fillStyle = 'rgba(232,240,248,.35)'
  ctx.beginPath(); ctx.moveTo(30, 8); ctx.bezierCurveTo(18, 15, -4, 16, -22, 8); ctx.bezierCurveTo(-6, 11, 16, 11, 30, 8); ctx.closePath(); ctx.fill()
  // spots (a nod to the real shark's light organs)
  ctx.fillStyle = 'rgba(228,238,248,.55)'
  for (const [sx, sy] of [[4, -12], [-8, -11], [-19, -7], [-28, -4], [-2, -6], [-13, -4]]) { ctx.beginPath(); ctx.arc(sx, sy, 1.3, 0, TAU); ctx.fill() }
  // gill slits
  ctx.strokeStyle = 'rgba(40,50,60,.55)'; ctx.lineWidth = 1.1
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(9 - i * 3.5, -3); ctx.lineTo(8 - i * 3.5, 5); ctx.stroke() }

  // pocket glow
  ctx.save()
  ctx.shadowColor = '#7dff9a'; ctx.shadowBlur = 4 + f.glow * 30
  ctx.fillStyle = `rgba(125,255,154,${0.25 + f.glow * 0.75})`
  ctx.beginPath(); ctx.ellipse(0, 9, 5, 2.6, -0.2, 0, TAU); ctx.fill()
  ctx.restore()
  // pectoral fin, flapping faster when scared
  const flap = Math.sin(t * (6 + f.fear * 14)) * 2
  ctx.fillStyle = '#7a8693'
  ctx.beginPath(); ctx.moveTo(7, 11); ctx.quadraticCurveTo(3, 25 + flap, -5, 18 + flap); ctx.quadraticCurveTo(-2, 13, 7, 11); ctx.closePath(); ctx.fill()

  // blush when happy
  if (f.happy > 0.05) {
    ctx.fillStyle = `rgba(255,143,177,${0.45 * f.happy})`
    ctx.beginPath(); ctx.ellipse(16, 4, 4, 2.2, 0, 0, TAU); ctx.fill()
  }

  // eye: big, round baby eye; wider when surprised or scared
  const ex = 20, ey = -4
  const rx = 7.4 + f.surprise * 1.4 + f.fear * 0.8, ry = 8 + f.surprise * 1.8 + f.fear * 1
  ctx.fillStyle = '#f4f8fc'
  ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU); ctx.fill()
  // big shiny pupils read as cute; they shrink and tremble when he's frightened
  const pr = 4.4 - f.surprise * 0.9 - f.fear * 1.5
  const shake = f.fear * Math.sin(t * 37) * 0.5
  const px = ex + 0.4 + f.look.x * (rx - pr - 0.8) + shake, py = ey + 0.6 + f.look.y * (ry - pr - 0.8) + f.sad * 1.4
  ctx.fillStyle = '#0b1118'
  ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.arc(px + pr * 0.35, py - pr * 0.4, pr * 0.42, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.arc(px - pr * 0.35, py + pr * 0.4, pr * 0.17, 0, TAU); ctx.fill()
  // watery shine along the bottom of the eye when sad or crying
  if (f.sad + f.tears > 0.3) {
    ctx.fillStyle = `rgba(170,215,255,${0.55 * Math.min(1, f.sad + f.tears)})`
    ctx.beginPath(); ctx.ellipse(ex, ey + ry * 0.62, rx * 0.8, ry * 0.26, 0, 0, TAU); ctx.fill()
  }
  // eyelid: blinking, plus a heavy upper lid when sad
  const lid = Math.max(f.blink, f.sad * 0.32)
  if (lid > 0.02) {
    ctx.fillStyle = '#a3afba'
    ctx.beginPath()
    ctx.moveTo(ex - rx - 1, ey - ry - 1)
    ctx.lineTo(ex + rx + 1, ey - ry - 1)
    ctx.lineTo(ex + rx + 1, ey - ry + lid * ry * 2.1)
    ctx.quadraticCurveTo(ex, ey - ry + lid * ry * 2.1 + 2, ex - rx - 1, ey - ry + lid * ry * 2.1)
    ctx.closePath(); ctx.fill()
  }
  ctx.strokeStyle = 'rgba(30,40,50,.55)'; ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU); ctx.stroke()

  // brow: a soft arch that floats above the eye. Worry tips it up toward the
  // middle of the head (like a "please?" face); surprise lifts it higher.
  const worry = Math.min(1, f.fear + f.sad)
  const lift = f.surprise * 4 + f.fear * 1.5
  const by = ey - ry - 3.2 - lift
  ctx.strokeStyle = 'rgba(58,70,82,.85)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ex - 5.5, by + 1 - worry * 2.6)
  ctx.quadraticCurveTo(ex - 0.5, by - 2.2 - worry * 0.6, ex + 5, by + worry * 2.2)
  ctx.stroke()

  // mouth
  const mx = 28, my = 6.5
  ctx.strokeStyle = '#2a333d'; ctx.lineWidth = 1.4
  if (f.mouthOpen > 0.05) {
    ctx.fillStyle = '#3a1f2a'
    ctx.beginPath(); ctx.ellipse(mx - 0.5, my, 2.4 + f.mouthOpen * 1.3, 1 + f.mouthOpen * 3.4, 0, 0, TAU); ctx.fill()
  } else if (f.fear > 0.4) {
    // a wobbly, worried little mouth
    ctx.beginPath()
    for (let i = 0; i <= 8; i++) {
      const xx = mx - 4 + i, yy = my + 0.6 + Math.sin(i * 1.6 + t * 18) * 0.7
      if (i === 0) ctx.moveTo(xx, yy)
      else ctx.lineTo(xx, yy)
    }
    ctx.stroke()
  } else if (f.sad > f.happy) {
    ctx.beginPath(); ctx.arc(mx - 1, my + 4, 3.4, Math.PI + 0.55, TAU - 0.55); ctx.stroke()
  } else {
    const r = 3 + f.happy * 1.6
    ctx.beginPath(); ctx.arc(mx - 1.5, my - 2, r, 0.35, 1.8 + f.happy * 0.4); ctx.stroke()
  }

  // tears drift up and back from the eye (we're underwater)
  if (f.tears > 0.02) {
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.7 + i / 4) % 1
      const tx = ex - 2 - p * 14, ty = ey + ry - 1 - p * 10 + Math.sin(p * 6 + i) * 2
      ctx.fillStyle = `rgba(170,215,255,${f.tears * (1 - p) * 0.9})`
      ctx.beginPath()
      ctx.moveTo(tx, ty - 3.2)
      ctx.quadraticCurveTo(tx + 2.4, ty, tx, ty + 2.2)
      ctx.quadraticCurveTo(tx - 2.4, ty, tx, ty - 3.2)
      ctx.closePath(); ctx.fill()
    }
  }
  ctx.restore()
}
