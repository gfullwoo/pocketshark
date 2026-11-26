// The opening story: a pocket shark hatches alone in a deep reef, finds a cave,
// calls for friends who never answer, finds that snacks swim away from him,
// cries, and discovers his glow. Every frame is a pure function of time `t`
// (seconds), so the story can be scrubbed, skipped, or tested frame by frame.
import type { Ctx2D } from '../game/ctx2d'
import { caveBox, drawKelp, seabedY } from '../game/scenery'
import { drawShrimp } from '../game/shrimp'
import { calmFace, drawCartoonShark, type Face } from './cartoonShark'

export const STORY_SECONDS = 72

/**
 * Narration: each line is spoken aloud and shown as the caption. Lines are
 * timed to fall between the shark's "Hello?" calls (35, 37.6, 40.2) and to
 * finish before the next beat.
 */
export const CAPTIONS: { t: number; text: string }[] = [
  { t: 0.6, text: 'Deep in a quiet reef, something was about to hatch…' },
  { t: 9.8, text: 'A tiny pocket shark! One of the rarest sharks in the whole ocean.' },
  { t: 16.2, text: 'He was scared… but curious.' },
  { t: 27.8, text: 'He found a little cave, and made it home.' },
  { t: 32.5, text: 'But it was so quiet.' },
  { t: 41.3, text: 'No one answered.' },
  { t: 43.1, text: 'So few pocket sharks are left.' },
  { t: 46.2, text: 'When he got hungry…' },
  { t: 48.5, text: '…the shrimp and fish swam away from him.' },
  { t: 54.0, text: 'So alone, he began to cry.' },
  { t: 57.3, text: 'And as he cried… something flickered.' },
  { t: 61.6, text: 'He was glowing!' },
  { t: 63.9, text: 'And the snacks came swimming to his light!' },
]

/**
 * The recorded narration (assets/voice/narration.m4a, made by
 * tools/make_narration.py): [start, length] in seconds for each caption line.
 * Used to lower the music while she speaks. Regenerate together with the track.
 */
export const NARRATION: [number, number][] = [[0.7, 3.03], [9.9, 4.16], [16.3, 1.98], [27.9, 2.26], [32.6, 1.34], [41.4, 1.24], [43.2, 1.92], [46.3, 1.3], [48.6, 2.2], [54.1, 1.98], [57.4, 2.33], [61.7, 1.11], [64.0, 2.05]]

/** True while the narrator is speaking at time t. */
export function narrating(t: number): boolean {
  return NARRATION.some(([a, d]) => t >= a - 0.15 && t <= a + d + 0.25)
}

export function captionAt(t: number): string {
  let cur = ''
  for (const c of CAPTIONS) if (t >= c.t) cur = c.text
  return t >= STORY_SECONDS - 1 ? '' : cur
}

const TAU = Math.PI * 2
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x) }
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
/** 0 → 1 over [a, a+r], hold, 1 → 0 over [b-r, b]. */
const window = (t: number, a: number, b: number, r = 0.6) => Math.min(smooth(seg(t, a, a + r)), 1 - smooth(seg(t, b - r, b)))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

interface P { x: number; y: number }
type Key = [number, () => P, number?]

function interp(keys: Key[], t: number): { p: P; z: number } {
  if (t <= keys[0][0]) return { p: keys[0][1](), z: keys[0][2] ?? 1 }
  for (let i = 1; i < keys.length; i++) {
    const [t1, f1, z1 = 1] = keys[i], [t0, f0, z0 = 1] = keys[i - 1]
    if (t <= t1) {
      const k = smooth((t - t0) / (t1 - t0)), a = f0(), b = f1()
      return { p: { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }, z: lerp(z0, z1, k) }
    }
  }
  const last = keys[keys.length - 1]
  return { p: last[1](), z: last[2] ?? 1 }
}

const CALLS = [{ t: 35, text: 'Hello?' }, { t: 37.6, text: 'Anyone there?' }, { t: 40.2, text: '…?' }]

/** When the pocket glow is on during the crying scene: flickers that come faster, then steady. */
export function storyGlow(t: number): number {
  if (t < 56.8) return 0
  if (t >= 61.5) return smooth(seg(t, 61.5, 62.3))
  const flashes: [number, number][] = [[56.8, 57.05], [57.9, 58.2], [58.7, 59.05], [59.4, 59.8], [60.05, 60.5], [60.7, 61.25]]
  let g = 0
  for (const [a, b] of flashes) if (t >= a && t <= b) g = Math.max(g, Math.sin(((t - a) / (b - a)) * Math.PI) * 0.85)
  return g
}

export class Story {
  W: number
  H: number
  SH: number
  S: number
  egg: P
  eggR: number
  home: P
  preyAt: P
  private sharkKeys: Key[]
  private camKeys: Key[]
  private snow: { x: number; y: number; r: number; s: number; a: number }[]
  private prey: { a: number; r: number; k: 'krill' | 'shrimp' | 'gold'; ph: number }[]

  constructor(W: number, H: number) {
    this.W = W
    this.H = H
    this.SH = H - 30
    this.S = Math.max(50, Math.min(W, H) * 0.17)
    const cave = caveBox(W, this.SH)
    const ex = W * 0.7
    this.eggR = this.S * 0.42
    this.egg = { x: ex, y: seabedY(ex, this.SH) - this.eggR * 0.9 }
    this.home = { x: cave.w * 0.5, y: seabedY(cave.w * 0.5, this.SH) - cave.h * 0.2 }
    this.preyAt = { x: W * 0.74, y: H * 0.42 }
    const pt = (x: number, y: number) => () => ({ x, y })
    const E = this.egg, C = this.home
    this.sharkKeys = [
      [9.5, pt(E.x, E.y)],
      [11, pt(E.x, E.y - this.S * 0.35)],
      [16, pt(E.x, E.y - this.S * 0.45)],
      [19, pt(W * 0.56, H * 0.44)],
      [20.8, pt(W * 0.7, H * 0.36)],
      [21.6, pt(W * 0.6, H * 0.42)], // startled by the jellyfish, darts back
      [25, pt(W * 0.42, H * 0.55)],
      [28, pt(C.x + this.S * 0.8, C.y - this.S * 0.6)],
      [30, pt(C.x, C.y)],
      [41, pt(C.x, C.y)],
      [43.5, pt(C.x, C.y + this.S * 0.08)], // sinks a little, sad
      [46, pt(W * 0.38, H * 0.5)],
      [49.5, pt(W * 0.55, H * 0.46)],
      [52.5, pt(W * 0.6, H * 0.47)],
      [STORY_SECONDS, pt(W * 0.6, H * 0.47)],
    ]
    const shark = () => this.sharkPos(this.t)
    const face = () => { const p = this.sharkPos(this.t); return { x: p.x + this.S * 0.22, y: p.y - this.S * 0.04 } }
    const center = pt(W / 2, H / 2)
    this.camKeys = [
      [0, center, 1],
      [4, pt(E.x, E.y - this.S * 0.2), 1.7],
      [8.5, pt(E.x, E.y - this.S * 0.1), 2.5],
      [10.3, pt(E.x, E.y - this.S * 0.3), 2.6],
      [11.6, face, 4.2],
      [15.2, face, 4.2],
      [17.6, shark, 1.5],
      [26, shark, 1.3],
      [30, pt(C.x, C.y - this.S * 0.2), 1.9],
      [34.5, pt(C.x, C.y - this.S * 0.2), 2.1],
      [36.2, face, 3],
      [43.2, face, 3],
      [45.6, shark, 1.25],
      [53.2, shark, 1.25],
      [55.6, face, 3.6],
      [60.6, face, 3.6],
      [62.2, face, 2.6],
      [64.4, shark, 1.9],
      [STORY_SECONDS, shark, 2],
    ]
    let seed = 7
    const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    this.snow = Array.from({ length: 70 }, () => ({ x: r(), y: r(), r: 0.5 + r() * 1.4, s: 0.006 + r() * 0.014, a: 0.15 + r() * 0.3 }))
    this.prey = Array.from({ length: 9 }, (_, i) => ({
      a: (i / 9) * TAU + r() * 0.5, r: this.S * (0.5 + r() * 0.9), k: i === 4 ? 'gold' : i % 2 ? 'shrimp' : 'krill', ph: r() * 6,
    }))
  }

  private t = 0

  sharkPos(t: number): P {
    return interp(this.sharkKeys, t).p
  }

  private camera(t: number) {
    this.t = t
    const { p, z } = interp(this.camKeys, t)
    const hw = this.W / (2 * z), hh = this.H / (2 * z)
    return { x: Math.max(hw, Math.min(this.W - hw, p.x)), y: Math.max(hh, Math.min(this.H - hh, p.y)), z }
  }

  private face(t: number): Face {
    const f = calmFace()
    // scared hatchling, settling into curiosity, startled once by a jellyfish
    f.fear = Math.max(window(t, 9.6, 17, 0.8), 0.35 * window(t, 16.5, 27.5, 2), window(t, 20.9, 23.2, 0.4))
    // a happy moment in the new home, and the big smile at the end
    f.happy = Math.max(window(t, 30.3, 34.6, 0.8), smooth(seg(t, 64, 67.6)))
    // lonely and sad, until the glow takes over
    f.sad = Math.max(smooth(seg(t, 40.6, 42.5)) * (1 - smooth(seg(t, 61.6, 63.4))), 0.5 * window(t, 33.8, 41, 1))
    f.surprise = window(t, 61.4, 64.2, 0.5)
    f.tears = window(t, 54.6, 62.5, 0.8)
    f.glow = storyGlow(t)
    // blinks
    for (const b of [14.3, 26.2, 33.2, 43.6, 51, 69.5]) f.blink = Math.max(f.blink, Math.sin(clamp01((t - b) / 0.22) * Math.PI))
    // eyes dart left and right right after hatching; look up while calling
    if (t > 12.2 && t < 13.1) f.look = { x: -1, y: 0.1 }
    else if (t > 13.3 && t < 14.1) f.look = { x: 1, y: -0.2 }
    else if (t > 34.8 && t < 41) f.look = { x: 0.6, y: -0.6 }
    else if (t > 54 && t < 61) f.look = { x: 0.1, y: 0.5 }
    // calling out, and the first bite
    for (const c of CALLS) f.mouthOpen = Math.max(f.mouthOpen, window(t, c.t, c.t + 1, 0.2))
    f.mouthOpen = Math.max(f.mouthOpen, window(t, 66.3, 67, 0.15))
    return f
  }

  /** Position of snack `i` at time t, or null when it isn't on screen. */
  private preyPos(i: number, t: number, shark: P): P | null {
    if (t < 43) return null
    const q = this.prey[i]
    const enter = 1 - smooth(seg(t, 43, 46.5))
    const wob = { x: Math.sin(t * 1.3 + q.ph) * 6, y: Math.cos(t * 1.1 + q.ph) * 5 }
    let p = { x: this.preyAt.x + Math.cos(q.a) * q.r + enter * this.W * 0.5 + wob.x, y: this.preyAt.y + Math.sin(q.a) * q.r * 0.7 + wob.y }
    // flee from the dark shark
    const flee = smooth(seg(t, 47.2, 50.5))
    if (flee > 0) {
      const dx = p.x - shark.x, dy = p.y - shark.y, d = Math.hypot(dx, dy) || 1
      p = { x: p.x + (dx / d) * this.W * 0.42 * flee, y: p.y + (dy / d) * this.H * 0.25 * flee }
      p.x = Math.min(this.W - 10, p.x)
      p.y = Math.max(40, Math.min(this.SH - 30, p.y))
    }
    // come to the glowing shark
    const come = smooth(seg(t, 63.6 + i * 0.22, 66.3 + i * 0.22))
    if (come > 0) {
      let target: P
      if (i === 0) {
        if (t > 66.85) return null // the first bite
        target = { x: shark.x + this.S * 0.42, y: shark.y + this.S * 0.06 }
      } else {
        const ang = q.a + Math.max(0, t - 66.5) * 0.55
        target = { x: shark.x + Math.cos(ang) * this.S * 0.95, y: shark.y + Math.sin(ang) * this.S * 0.62 }
      }
      p = { x: lerp(p.x, target.x, come), y: lerp(p.y, target.y, come) }
    }
    return p
  }

  draw(ctx: Ctx2D, t: number, scenery: () => void) {
    const { W, H, SH, S } = this
    const cam = this.camera(t)
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#0a2440'); g.addColorStop(0.5, '#06162a'); g.addColorStop(1, '#020812')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.scale(cam.z, cam.z)
    ctx.translate(-cam.x, -cam.y)

    const ray = ctx.createLinearGradient(0, 0, 0, H * 0.75)
    ray.addColorStop(0, 'rgba(191,227,255,.07)'); ray.addColorStop(1, 'rgba(191,227,255,0)')
    ctx.fillStyle = ray
    for (let i = 0; i < 4; i++) {
      const x = W * (0.12 + i * 0.26) + Math.sin(t * 0.3 + i) * 20
      ctx.beginPath(); ctx.moveTo(x - 20, 0); ctx.lineTo(x + 20, 0); ctx.lineTo(x + 100, H * 0.75); ctx.lineTo(x - 10, H * 0.75); ctx.closePath(); ctx.fill()
    }
    for (const s of this.snow) {
      ctx.fillStyle = `rgba(200,225,255,${s.a})`
      ctx.beginPath(); ctx.arc(s.x * W, ((s.y + s.s * t) % 1) * H, s.r, 0, TAU); ctx.fill()
    }
    ctx.fillStyle = '#030b16'
    ctx.fillRect(0, SH - 2, W, H - SH + 2)
    scenery()
    drawKelp(ctx, W, SH, t)

    if (t >= 27) this.drawShellBed(ctx)
    this.drawEgg(ctx, t)
    if (t > 18.5 && t < 25) this.drawJelly(ctx, t)

    const shark = this.sharkPos(t)
    for (let i = 0; i < this.prey.length; i++) {
      const p = this.preyPos(i, t, shark)
      if (p) this.drawPrey(ctx, this.prey[i].k, p, shark, t, i)
    }
    if (t > 66.8 && t < 67.8) this.sparkle(ctx, { x: shark.x + S * 0.42, y: shark.y + S * 0.06 }, t - 66.8)

    // calling out: rings of sound and the words floating up
    for (const c of CALLS) {
      const k = (t - c.t) / 2.6
      if (k < 0 || k > 1) continue
      const o = { x: shark.x + S * 0.45, y: shark.y + S * 0.05 }
      for (let r = 0; r < 3; r++) {
        const kk = k - r * 0.12
        if (kk <= 0) continue
        ctx.strokeStyle = `rgba(190,225,255,${(1 - kk) * 0.45})`
        ctx.lineWidth = S * 0.02
        ctx.beginPath(); ctx.arc(o.x, o.y, S * (0.2 + kk * 1.6), -0.9, 0.9); ctx.stroke()
      }
      ctx.globalAlpha = Math.min(1, (1 - k) * 2)
      ctx.fillStyle = '#e6f2ff'
      const size = Math.round(S * 0.16)
      ctx.font = `600 ${size}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      // keep the words inside the frame, even in the close-ups
      const hw = this.W / (2 * cam.z), hh = this.H / (2 * cam.z), pad = 16 / cam.z
      const half = c.text.length * size * 0.3
      const tx = Math.max(cam.x - hw + pad + half, Math.min(cam.x + hw - pad - half, o.x + S * 0.45))
      const ty = Math.max(cam.y - hh + pad + size + 60 / cam.z, o.y - S * (0.55 + k * 0.35))
      ctx.fillText(c.text, tx, ty)
      ctx.globalAlpha = 1
    }

    if (t >= 9.5) {
      const grow = 0.55 + 0.45 * smooth(seg(t, 9.5, 10.6))
      const ahead = this.sharkPos(t + 0.2)
      const dx = ahead.x - shark.x
      const dir: 1 | -1 = dx < -0.5 ? -1 : 1
      const tilt = Math.max(-0.35, Math.min(0.35, ((ahead.y - shark.y) / Math.max(Math.abs(dx), 4)) * 0.4)) * dir
      drawCartoonShark(ctx, shark.x, shark.y, S * grow, dir, tilt, this.face(t), t)
    }
    ctx.restore()

    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,4,10,.55)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    // fade in from black, and dim behind the title at the end
    const dark = Math.max(1 - smooth(seg(t, 0, 2)), 0.8 * smooth(seg(t, STORY_SECONDS - 2, STORY_SECONDS)))
    if (dark > 0.01) { ctx.fillStyle = `rgba(2,6,12,${dark})`; ctx.fillRect(0, 0, W, H) }
  }

  private drawEgg(ctx: Ctx2D, t: number) {
    const { egg: E, eggR: r } = this
    if (t > 14) return
    const wob = smooth(seg(t, 2.5, 9.3))
    const jolt = [5, 6.8, 8.2, 9].reduce((m, j) => m + Math.max(0, 1 - Math.abs(t - j) * 4) * 0.12, 0)
    const rot = Math.sin(t * 9) * 0.07 * wob + Math.sin(t * 30) * jolt
    const crack = smooth(seg(t, 6, 9.2))
    const burst = smooth(seg(t, 9.4, 10.6))
    const fade = 1 - smooth(seg(t, 11, 13.5))
    const rx = r * 0.82, ry = r
    // zigzag seam across the middle
    const zig: P[] = []
    const n = 9
    for (let i = 0; i <= n; i++) zig.push({ x: -rx + (2 * rx * i) / n, y: (i % 2 ? -1 : 1) * r * 0.1 })

    const shell = (top: boolean) => {
      const gr = ctx.createRadialGradient(-rx * 0.35, -ry * 0.45, r * 0.05, 0, 0, r * 1.15)
      gr.addColorStop(0, '#f2f7fb'); gr.addColorStop(0.6, '#b9c8d6'); gr.addColorStop(1, '#7f93a8')
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.moveTo(zig[0].x, zig[0].y)
      for (const z of zig) ctx.lineTo(z.x, z.y)
      if (top) ctx.ellipse(0, 0, rx, ry, 0, 0, -Math.PI, true)
      else ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI, false)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(90,110,135,.35)'
      for (const [sx, sy] of top ? [[-0.3, -0.55], [0.25, -0.35], [0.05, -0.75]] : [[0.3, 0.45], [-0.25, 0.6]]) {
        ctx.beginPath(); ctx.arc(sx * rx, sy * ry, r * 0.07, 0, TAU); ctx.fill()
      }
    }

    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(E.x, E.y)
    // soft shadow on the sand
    ctx.fillStyle = 'rgba(0,0,0,.35)'
    ctx.beginPath(); ctx.ellipse(0, ry * 0.95, rx * 1.1, ry * 0.18, 0, 0, TAU); ctx.fill()
    ctx.rotate(rot)
    // bottom half stays as a little cup
    ctx.save(); ctx.translate(0, burst * r * 0.12); shell(false); ctx.restore()
    // top half pops off and drifts away
    ctx.save(); ctx.translate(-burst * r * 1.3, -burst * r * 1.5); ctx.rotate(-burst * 1.1); shell(true); ctx.restore()
    // light leaking through the cracks
    if (crack > 0 && burst < 1) {
      const m = Math.max(1, Math.round(crack * n))
      ctx.strokeStyle = `rgba(255,244,214,${0.85 * (1 - burst)})`
      ctx.shadowColor = '#fff4d6'; ctx.shadowBlur = 10
      ctx.lineWidth = r * 0.045
      ctx.beginPath(); ctx.moveTo(zig[0].x, zig[0].y)
      for (let i = 1; i <= m; i++) ctx.lineTo(zig[i].x, zig[i].y)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    ctx.restore()
  }

  private drawShellBed(ctx: Ctx2D) {
    const { home: C, S } = this
    const y = seabedY(C.x, this.SH) - 3
    const shells: [number, string][] = [[-0.45, '#e9b7a3'], [-0.1, '#f2d6c4'], [0.3, '#d9a4b8'], [0.55, '#c9d7e3']]
    for (const [dx, col] of shells) {
      const x = C.x + dx * S, r = S * 0.12
      ctx.fillStyle = col
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y - r * 1.6, x + r, y); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(120,80,80,.35)'; ctx.lineWidth = S * 0.012
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k * r * 0.4, y - r * 0.7); ctx.stroke() }
    }
    // a bit of sea glass he found
    ctx.fillStyle = 'rgba(92,225,255,.55)'
    ctx.beginPath(); ctx.ellipse(C.x + S * 0.12, y - S * 0.03, S * 0.05, S * 0.03, 0.4, 0, TAU); ctx.fill()
  }

  private drawJelly(ctx: Ctx2D, t: number) {
    const { W, H, S } = this
    const k = seg(t, 18.5, 25)
    const x = W * 0.9 - k * W * 0.15, y = H * 0.3 + Math.sin(t * 2) * 6
    const a = window(t, 18.5, 25, 0.8)
    const r = S * 0.22, pulse = 1 + Math.sin(t * 4) * 0.08
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = 'rgba(255,170,210,.55)'
    ctx.shadowColor = '#ffaad2'; ctx.shadowBlur = 12
    ctx.beginPath(); ctx.ellipse(x, y, r * pulse, r * 0.8, 0, 0, -Math.PI, true); ctx.closePath(); ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,170,210,.5)'; ctx.lineWidth = S * 0.015
    for (let i = 0; i < 4; i++) {
      const tx = x - r * 0.6 + i * r * 0.4
      ctx.beginPath(); ctx.moveTo(tx, y)
      ctx.quadraticCurveTo(tx + Math.sin(t * 3 + i) * 5, y + r * 0.8, tx + Math.sin(t * 2 + i) * 4, y + r * 1.5)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawPrey(ctx: Ctx2D, k: 'krill' | 'shrimp' | 'gold', p: P, shark: P, t: number, i: number) {
    const col = k === 'gold' ? '#ffd166' : '#ff8fb1'
    const r = this.S * (k === 'krill' ? 0.07 : 0.1)
    // face away from the shark while fleeing, toward it once he glows
    const toward = t > 63.6
    const a = Math.atan2(p.y - shark.y, p.x - shark.x) + (toward ? Math.PI : 0) + Math.sin(t * 2 + i) * 0.3
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(a)
    if (k === 'shrimp') {
      // alternate red and yellow shrimp among the baitfish
      drawShrimp(ctx, this.S * 0.1, Math.floor(i / 2) % 2, t * 1.3 + i)
      ctx.restore()
      return
    }
    if (k === 'gold') { ctx.shadowColor = col; ctx.shadowBlur = 12 }
    ctx.fillStyle = col
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, TAU); ctx.fill()
    const w = Math.sin(t * 8 + i) * r * 0.2
    ctx.beginPath(); ctx.moveTo(-r * 1.1, 0); ctx.lineTo(-r * 2, -r * 0.7 + w); ctx.lineTo(-r * 2, r * 0.7 + w); ctx.closePath(); ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#0a1420'
    ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.15, Math.max(1, r * 0.16), 0, TAU); ctx.fill()
    ctx.restore()
  }

  private sparkle(ctx: Ctx2D, at: P, k: number) {
    const S = this.S
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, d = S * (0.05 + k * 0.35)
      ctx.fillStyle = `rgba(255,209,102,${1 - k})`
      ctx.beginPath(); ctx.arc(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d, S * 0.025, 0, TAU); ctx.fill()
    }
  }
}
