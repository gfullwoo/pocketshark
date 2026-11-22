// Garden eels (Sandy Flats): colonies of thin spotted eels that live in burrows
// in the sand. Each one sticks up out of its hole, swaying in the current and
// leaning toward a glowing shark, and ducks back down into the sand when the
// pocket shark swims too close, then slowly peeks back out.
import type { Ctx2D } from './ctx2d'
import { seabedY } from './scenery'

const TAU = Math.PI * 2

export interface Eel {
  x: number
  base: number // y of the burrow (the sand surface)
  h: number // full height when all the way out
  e: number // how far out: 0 hidden in the sand, 1 all the way out
  ph: number // sway phase
  lean: number // leaning toward the glow (-1..1)
}

/** Seeded so the colonies sit in the same spots every time. */
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

/** A few colonies spread across the open sand to the right of the cave. */
export function makeEels(W: number, SH: number, caveW: number): Eel[] {
  const r = rng(3303)
  const eels: Eel[] = []
  const colonies = Math.max(2, Math.round((W - caveW) / 150))
  for (let c = 0; c < colonies; c++) {
    const cx = caveW + 40 + ((c + 0.5) / colonies) * (W - caveW - 60)
    const n = 4 + Math.floor(r() * 4)
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * 70
      eels.push({ x, base: seabedY(x, SH) + 3 + r() * 6, h: 34 + r() * 30, e: 1, ph: r() * TAU, lean: 0 })
    }
  }
  return eels.sort((a, b) => a.base - b.base) // farther ones first
}

/** Hide from a nearby shark; peek back out slowly; lean toward the glow. */
export function updateEels(eels: Eel[], dt: number, shark: { x: number; y: number }, glow: number, size: number) {
  const scare = size * 1.6
  for (const el of eels) {
    const tipY = el.base - el.h * el.e
    const d = Math.hypot(shark.x - el.x, shark.y - (el.base + tipY) / 2)
    const want = d < scare ? 0 : 1
    el.e += (want - el.e) * Math.min(1, dt * (want < el.e ? 9 : 0.7)) // zip down fast, come up slowly
    const towards = glow > 0.3 && d < size * 5 ? Math.max(-1, Math.min(1, (shark.x - el.x) / (size * 2))) : 0
    el.lean += (towards - el.lean) * Math.min(1, dt * 2)
  }
}

export function drawEels(ctx: Ctx2D, eels: Eel[], t: number) {
  for (const el of eels) {
    // the burrow
    ctx.fillStyle = 'rgba(8,8,4,.55)'
    ctx.beginPath(); ctx.ellipse(el.x, el.base, 4.2, 1.6, 0, 0, TAU); ctx.fill()
    if (el.e < 0.04) continue
    const h = el.h * el.e
    const sway = Math.sin(t * 1.3 + el.ph) * 4 + el.lean * 9
    // the body: an S-curve standing up out of the sand, bending over at the top like a question mark
    const tipX = el.x + sway + el.lean * 4, tipY = el.base - h
    ctx.strokeStyle = '#e8e1cc'; ctx.lineCap = 'round'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(el.x, el.base)
    ctx.bezierCurveTo(el.x + sway * 0.2 - 3, el.base - h * 0.4, el.x + sway * 0.8 + 3, el.base - h * 0.75, tipX, tipY)
    ctx.stroke()
    // black spots along the body
    ctx.fillStyle = 'rgba(20,20,20,.75)'
    for (let k = 1; k < 6; k++) {
      const f = k / 6, u = 1 - f
      const bx = u * u * u * el.x + 3 * u * u * f * (el.x + sway * 0.2 - 3) + 3 * u * f * f * (el.x + sway * 0.8 + 3) + f * f * f * tipX
      const by = u * u * u * el.base + 3 * u * u * f * (el.base - h * 0.4) + 3 * u * f * f * (el.base - h * 0.75) + f * f * f * tipY
      ctx.beginPath(); ctx.arc(bx + (k % 2 ? 0.8 : -0.8), by, 0.9, 0, TAU); ctx.fill()
    }
    // head, bent over and facing the current (or the glow)
    const face = el.lean !== 0 ? Math.sign(el.lean) : Math.sin(el.ph) >= 0 ? 1 : -1
    ctx.fillStyle = '#efe9d6'
    ctx.beginPath(); ctx.ellipse(tipX + face * 2.5, tipY + 1, 3.6, 2.6, face * 0.4, 0, TAU); ctx.fill()
    ctx.fillStyle = '#0b0b0b'
    ctx.beginPath(); ctx.arc(tipX + face * 3.6, tipY, 0.9, 0, TAU); ctx.fill()
    ctx.lineCap = 'butt'
  }
}
