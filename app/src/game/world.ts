// The home reef: the pocket shark, snacks drifting by, the occasional predator
// (big shark, squid or crab), and the cave the shark calls home. Simulation and
// drawing only; the care rules (meters, points) live in ../model/care.ts and are
// applied through `WorldHooks`.
//
// Controls: a joystick vector steers the shark (setStick); holding the Glow
// button lights it (glowHeld). Cozy rule: predators never eat the pocket shark,
// but touching ANY part of one is a catch: a scare that sends it darting home.
import type { Snack } from '../model/care'
import type { Ctx2D } from './ctx2d'
import { drawPredator, drawWarning, hitCircles, PRED_INFO, sharkMouth, touches, type Circle, type Pred, type PredKind } from './predators'
import { caveBox, drawKelp, seabedY } from './scenery'
import { drawShrimp } from './shrimp'

export interface WorldHooks {
  onEat(kind: Snack, x: number, y: number): void
  onScare(): void
  onDodge(): void
  onToast(msg: string, color?: string): void
}

type Kind = Snack
interface Prey {
  k: Kind; x: number; y: number; a: number; vx: number; vy: number; ph: number; lit: number; variant: number
  /** 0→1 while being gulped: slides into the mouth and shrinks */
  eat?: number
  from?: { x: number; y: number }
  dead?: boolean
}
interface Part { x: number; y: number; vx: number; vy: number; l: number; c: string }
interface Float { x: number; y: number; txt: string; c: string; l: number }

const KINDS: Record<Kind, { r: number; col: string; spd: number; w: number; label: string }> = {
  krill: { r: 5, col: '#ff8fb1', spd: 26, w: 6, label: '+1' },
  shrimp: { r: 8, col: '#ffd84d', spd: 34, w: 3, label: '+3' },
  gold: { r: 9, col: '#ffd166', spd: 58, w: 0.4, label: '+10' },
  plankton: { r: 6, col: '#7dff9a', spd: 16, w: 1.4, label: '+glow' },
}
const KLIST = Object.keys(KINDS) as Kind[]
const KW = KLIST.reduce((s, k) => s + KINDS[k].w, 0)
const TAU = Math.PI * 2
const GULP_SECONDS = 0.22
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
function pickKind(): Kind {
  let r = Math.random() * KW
  for (const k of KLIST) {
    r -= KINDS[k].w
    if (r <= 0) return k
  }
  return 'krill'
}
function pickPredator(): PredKind {
  const r = Math.random()
  return r < 0.45 ? 'shark' : r < 0.8 ? 'squid' : 'crab'
}

export class World {
  W = 1
  H = 1
  /** Height of the scene above the on-screen controls; the seabed sits here. */
  SH = 1
  t = 0
  shark = { x: 0, y: 0, dir: 1, tilt: 0 }
  /** Joystick input, each axis -1…1. */
  stick = { x: 0, y: 0 }
  /** The player is holding the Glow button. */
  glowHeld = false
  /** Glow is actually on this frame (held, has glow left, not fleeing or resting). */
  glowOn = false
  gI = 0
  pred: Pred | null = null
  private vel = { x: 0, y: 0 }
  private homing = false
  private home0 = { x: 0, y: 0 }
  private prey: Prey[] = []
  private parts: Part[] = []
  private floats: Float[] = []
  private nextPred = 18
  private mouth = 0
  private flash = 0
  private fleeT = 0
  private emptyWarned = false
  private snow = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.5, 1.8), s: rnd(0.006, 0.02), a: rnd(0.15, 0.45) }))

  resize(W: number, H: number, floorInset = 0) {
    const first = this.W <= 1
    this.W = W
    this.H = H
    this.SH = Math.max(H * 0.55, H - floorInset)
    if (first) {
      const h = this.home()
      this.shark.x = h.x
      this.shark.y = h.y
      this.prey = Array.from({ length: this.preyTarget() }, () => this.spawn(false))
    }
  }

  private preyTarget() { return Math.round(6 + (this.W * this.H) / 60000) }
  size() { return Math.max(52, Math.min(90, Math.min(this.W, this.H) * 0.16)) }
  private lureR() { return Math.min(this.W, this.H) * 0.42 }
  private maxSpeed() { return Math.max(170, Math.min(this.W, this.H) * 0.6) }

  /** Where the shark sits when it is home: inside the cave mouth. */
  home() {
    const cave = caveBox(this.W, this.SH)
    const mx = cave.w * 0.5
    return { x: mx, y: seabedY(mx, this.SH) - cave.h * 0.2 }
  }

  /** Inside the cave mouth: safe from every predator, recovers fastest. */
  atHome() {
    const cave = caveBox(this.W, this.SH)
    const mx = cave.w * 0.5, mw = cave.w * 0.24, mh = cave.h * 0.48, mb = seabedY(mx, this.SH)
    return Math.abs(this.shark.x - mx) < mw * 0.9 && this.shark.y > mb - mh * 0.95 && this.shark.y < mb + 4
  }

  /** Joystick vector, each axis -1…1. Steering cancels "swim home". */
  setStick(x: number, y: number) {
    this.stick.x = x
    this.stick.y = y
    if (Math.hypot(x, y) > 0.15) this.homing = false
  }

  goHome() { this.homing = true }

  /** Where the pocket shark's mouth is, in world coordinates. */
  mouthPos() {
    const s = this.size()
    return { x: this.shark.x + this.shark.dir * s * 0.36, y: this.shark.y + s * 0.07 }
  }

  /** Circles covering the pocket shark: head, body and tail. */
  sharkCircles(): Circle[] {
    const s = this.size(), { x, y, dir } = this.shark
    return [
      { x, y, r: s * 0.2 },
      { x: x + dir * s * 0.27, y: y + s * 0.02, r: s * 0.15 },
      { x: x - dir * s * 0.32, y, r: s * 0.11 },
    ]
  }

  private spawn(edge: boolean): Prey {
    const k = pickKind(), K = KINDS[k], { W, H } = this
    let x: number, y: number
    if (edge) {
      const side = Math.random() < 0.5
      x = side ? -20 : W + 20
      y = rnd(60, this.SH * 0.8)
    } else {
      x = rnd(caveBox(W, this.SH).w, W - 20)
      y = rnd(80, this.SH * 0.8)
    }
    const a = Math.atan2(H / 2 - y, W / 2 - x) + rnd(-0.8, 0.8)
    return { k, x, y, a, vx: Math.cos(a) * K.spd, vy: Math.sin(a) * K.spd, ph: Math.random() * 6, lit: 0, variant: Math.floor(Math.random() * 2) }
  }

  spawnPredator(kind: PredKind): Pred {
    const { W, SH } = this
    const fromLeft = Math.random() < 0.5
    const base = { kind, dir: (fromLeft ? 1 : -1) as 1 | -1, ang: 0, hunt: false, open: 0, minD: 1e9, done: false, ph: 0, entered: false }
    if (kind === 'shark') {
      const s = Math.min(W, this.H) * 0.6 + 100
      return { ...base, s, x: fromLeft ? -s * 0.6 : W + s * 0.6, y: Math.max(s * 0.25, Math.min(SH * 0.7, this.shark.y + rnd(-60, 60))), warn: 2.5 }
    }
    if (kind === 'squid') {
      const s = Math.min(W, this.H) * 0.34 + 50
      const x = fromLeft ? -s * 0.6 : W + s * 0.6, y = rnd(SH * 0.1, SH * 0.55)
      const aimX = this.shark.x + rnd(-80, 80), aimY = this.shark.y + rnd(-60, 60)
      return { ...base, s, x, y, ang: Math.atan2(aimY - y, aimX - x), warn: 2.2 }
    }
    const s = Math.min(W, this.H) * 0.22 + 30
    const x = fromLeft ? -s * 0.8 : W + s * 0.8
    return { ...base, s, x, y: seabedY(Math.max(0, Math.min(W, x)), SH) - s * 0.22, warn: 2 }
  }

  /** Where the "!" warning for a predator shows. */
  private warnAt(p: Pred) {
    const x = p.x < this.W / 2 ? 28 : this.W - 28
    return { x, y: Math.max(40, Math.min(this.SH - 24, p.y)) }
  }

  private caught(p: Pred, hooks: WorldHooks) {
    p.done = true
    p.hunt = false
    this.flash = 1
    this.fleeT = 2.5
    this.homing = true
    hooks.onScare()
    hooks.onToast(PRED_INFO[p.kind].caught, '#ff8fb1')
    // the squid jets off after a grab
    if (p.kind === 'squid') p.ang += Math.PI
  }

  /** `canGlow`: the care model has glow left. `resting`: shark is asleep at home. */
  update(dt: number, canGlow: boolean, resting: boolean, hooks: WorldHooks) {
    const { W, H } = this
    this.t += dt
    if (this.fleeT > 0) this.fleeT -= dt
    const auto = resting || this.fleeT > 0 || this.homing

    // ---- swimming: joystick, or automatic when heading home ----
    const sp = this.maxSpeed()
    let want = { x: this.stick.x * sp, y: this.stick.y * sp }
    if (auto) {
      const h = this.home(), dx = h.x - this.shark.x, dy = h.y - this.shark.y, d = Math.hypot(dx, dy)
      const fast = this.fleeT > 0 ? 1.15 : 0.8
      want = d < 4 ? { x: 0, y: 0 } : { x: (dx / d) * Math.min(sp * fast, d * 4), y: (dy / d) * Math.min(sp * fast, d * 4) }
      if (d < 4 && this.homing && !resting && this.fleeT <= 0) this.homing = false
    }
    const k = Math.min(1, dt * 6)
    this.vel.x += (want.x - this.vel.x) * k
    this.vel.y += (want.y - this.vel.y) * k
    const s = this.size()
    this.shark.x = Math.max(s * 0.3, Math.min(W - s * 0.3, this.shark.x + this.vel.x * dt))
    this.shark.y = Math.max(s * 0.3, Math.min(this.SH - 12, this.shark.y + this.vel.y * dt))
    if (Math.abs(this.vel.x) > 12) this.shark.dir = this.vel.x > 0 ? 1 : -1
    this.shark.tilt += (Math.max(-0.5, Math.min(0.5, this.vel.y / 420)) * this.shark.dir - this.shark.tilt) * Math.min(1, dt * 5)

    // ---- glow: on only while the button is held ----
    if (this.glowHeld && !canGlow && !this.emptyWarned) {
      hooks.onToast('Out of glow. Rest at home to recharge', '#ff8fb1')
      this.emptyWarned = true
    }
    if (!this.glowHeld) this.emptyWarned = false
    this.glowOn = this.glowHeld && canGlow && !resting && this.fleeT <= 0
    this.gI += ((this.glowOn ? 1 : 0) - this.gI) * Math.min(1, dt * 6)
    const home = this.atHome()

    // ---- snacks: drawn to the glow, shy of a dark shark, gulped into the mouth ----
    const R = this.lureR(), mouth = this.mouthPos()
    for (const p of this.prey) {
      const K = KINDS[p.k]
      p.ph += dt * 4
      if (p.eat !== undefined) {
        p.eat += dt / GULP_SECONDS
        const e = Math.min(1, p.eat), m = this.mouthPos(), q = e * e * (3 - 2 * e)
        p.x = p.from!.x + (m.x - p.from!.x) * q
        p.y = p.from!.y + (m.y - p.from!.y) * q
        this.mouth = 1
        if (p.eat >= 1) {
          p.dead = true
          const col = p.k === 'shrimp' ? (p.variant ? '#ff5a4a' : '#ffd84d') : K.col
          this.floats.push({ x: m.x, y: m.y - 10, txt: K.label, c: col, l: 1 })
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * TAU, v = rnd(20, 70)
            this.parts.push({ x: m.x, y: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 0.45, c: col })
          }
          hooks.onEat(p.k, m.x, m.y)
        }
        continue
      }
      const dx = this.shark.x - p.x, dy = this.shark.y - p.y, d = Math.hypot(dx, dy) || 1
      if (this.gI > 0.3 && d < R) {
        const v = K.spd + 60 * this.gI, ta = Math.atan2(dy, dx), f = Math.min(1, dt * 2.2)
        p.vx += (Math.cos(ta) * v - p.vx) * f
        p.vy += (Math.sin(ta) * v - p.vy) * f
        p.lit = 1
      } else if (this.gI < 0.3 && d < R * 0.55 && !resting) {
        const away = Math.atan2(-dy, -dx), v = K.spd + 100 * (1 - d / (R * 0.55)) + 30, f = Math.min(1, dt * 3.5)
        p.vx += (Math.cos(away) * v - p.vx) * f
        p.vy += (Math.sin(away) * v - p.vy) * f
        p.a = away
        p.lit = Math.max(0, p.lit - dt)
      } else {
        p.a += rnd(-1, 1) * dt * 1.5
        p.vx += (Math.cos(p.a) * K.spd - p.vx) * Math.min(1, dt)
        p.vy += (Math.sin(p.a) * K.spd - p.vy) * Math.min(1, dt)
        p.lit = Math.max(0, p.lit - dt)
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.y > this.SH - 30) p.vy -= 40 * dt
      // close to the mouth, or bumping the head: start the gulp
      const dm = Math.hypot(mouth.x - p.x, mouth.y - p.y)
      if (!resting && (dm < s * 0.24 + K.r || d < s * 0.2 + K.r)) {
        p.eat = 0
        p.from = { x: p.x, y: p.y }
      }
      if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) p.dead = true
    }
    this.prey = this.prey.filter((p) => !p.dead)
    while (this.prey.length < this.preyTarget()) this.prey.push(this.spawn(true))

    // ---- predators ----
    this.nextPred -= dt
    if (!this.pred && this.nextPred <= 0 && !resting) {
      this.pred = this.spawnPredator(pickPredator())
      hooks.onToast(PRED_INFO[this.pred.kind].coming, '#ffd166')
    }
    const pr = this.pred
    if (pr) {
      if (pr.warn > 0) pr.warn -= dt
      else {
        pr.ph += dt * (pr.kind === 'squid' ? 3.2 : 4)
        const d = Math.hypot(pr.x - this.shark.x, pr.y - this.shark.y)
        pr.minD = Math.min(pr.minD, d)
        if (pr.kind === 'shark') {
          const ahead = pr.dir > 0 ? this.shark.x > pr.x : this.shark.x < pr.x
          if (!pr.done && !pr.hunt && ahead && this.gI > 0.35 && !home && d < pr.s * 0.8) {
            pr.hunt = true
            hooks.onToast(PRED_INFO.shark.sees, '#ff8fb1')
          } else if (pr.hunt && (this.gI < 0.2 || !ahead || home)) pr.hunt = false
          const sc = pr.s / 230
          if (pr.hunt) pr.y += (this.shark.y - 10 * sc - pr.y) * Math.min(1, dt * 2.4)
          pr.x += pr.dir * (W * 0.3 + 110) * (pr.hunt ? 1.4 : 1) * dt
          const m = sharkMouth(pr), dm = Math.hypot(m.x - this.shark.x, m.y - this.shark.y)
          pr.open += ((pr.hunt && dm < pr.s * 0.45 ? 1 : 0) - pr.open) * Math.min(1, dt * 8)
        } else if (pr.kind === 'squid') {
          // jet propulsion: bursts of speed, drifting between them
          if (!pr.done && this.gI > 0.35 && !home && d < pr.s * 1.6) {
            if (!pr.hunt) hooks.onToast(PRED_INFO.squid.sees, '#ff8fb1')
            pr.hunt = true
          } else if (pr.hunt && (this.gI < 0.2 || home)) pr.hunt = false
          if (pr.hunt) {
            const want2 = Math.atan2(this.shark.y - pr.y, this.shark.x - pr.x)
            let da = want2 - pr.ang
            while (da > Math.PI) da -= TAU
            while (da < -Math.PI) da += TAU
            pr.ang += Math.max(-1.4 * dt, Math.min(1.4 * dt, da))
          }
          const burst = 0.35 + 1.3 * Math.max(0, Math.sin(pr.ph))
          const v = (W * 0.18 + 70) * burst * (pr.hunt ? 1.2 : 1)
          pr.x += Math.cos(pr.ang) * v * dt
          pr.y += Math.sin(pr.ang) * v * dt
          pr.y = Math.max(-pr.s, Math.min(this.SH - pr.s * 0.12, pr.y))
        } else {
          pr.x += pr.dir * (W * 0.12 + 40) * dt
          pr.y = seabedY(Math.max(0, Math.min(W, pr.x)), this.SH) - pr.s * 0.22
        }
        // any touch with any part of the predator is a catch (home is safe)
        if (!pr.done && !home && !resting && touches(hitCircles(pr), this.sharkCircles())) this.caught(pr, hooks)
        const inside = pr.x > -pr.s * 0.2 && pr.x < W + pr.s * 0.2 && pr.y > -pr.s * 0.2 && pr.y < H + pr.s * 0.2
        if (inside) pr.entered = true
        const gone = pr.entered && (pr.x < -pr.s * 0.7 || pr.x > W + pr.s * 0.7 || pr.y < -pr.s * 0.7 || pr.y > H + pr.s * 0.7)
        if (gone) {
          if (!pr.done && pr.minD < pr.s * 0.75) {
            hooks.onDodge()
            hooks.onToast(home ? 'Safe at home! +5' : 'Great dodging! +5', '#7dff9a')
          }
          this.pred = null
          this.nextPred = rnd(18, 34)
        }
      }
    }

    for (const q of this.parts) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; q.l -= dt
    }
    this.parts = this.parts.filter((q) => q.l > 0)
    for (const f of this.floats) { f.y -= 40 * dt; f.l -= dt }
    this.floats = this.floats.filter((f) => f.l > 0)
    if (resting && Math.random() < dt * 0.8) {
      this.floats.push({ x: this.shark.x + 14, y: this.shark.y - 20, txt: 'z', c: '#cfe1f1', l: 1.6 })
    }
    this.mouth = Math.max(0, this.mouth - dt * 4)
    this.flash = Math.max(0, this.flash - dt * 1.5)
    for (const sn of this.snow) { sn.y += sn.s * dt; if (sn.y > 1) sn.y = 0 }
  }

  // ---------- drawing ----------
  draw(ctx: Ctx2D, scenery: () => void, resting: boolean) {
    const { W, H, t } = this
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#0b2742'); g.addColorStop(0.5, '#06172b'); g.addColorStop(1, '#020812')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    const ray = ctx.createLinearGradient(0, 0, 0, H * 0.75)
    ray.addColorStop(0, 'rgba(191,227,255,.07)'); ray.addColorStop(1, 'rgba(191,227,255,0)')
    ctx.fillStyle = ray
    for (let i = 0; i < 4; i++) {
      const x = W * (0.12 + i * 0.26) + Math.sin(t * 0.3 + i) * 20
      ctx.beginPath(); ctx.moveTo(x - 20, 0); ctx.lineTo(x + 20, 0); ctx.lineTo(x + 100, H * 0.75); ctx.lineTo(x - 10, H * 0.75); ctx.closePath(); ctx.fill()
    }
    for (const s of this.snow) {
      ctx.fillStyle = `rgba(200,225,255,${s.a})`
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TAU); ctx.fill()
    }
    // seabed below the scene (under the on-screen controls)
    ctx.fillStyle = '#030b16'
    ctx.fillRect(0, this.SH - 2, W, H - this.SH + 2)
    scenery()
    drawKelp(ctx, W, this.SH, t)
    if (this.gI > 0.01) {
      const R = this.lureR() * (0.4 + 0.6 * this.gI), { x, y } = this.shark
      const h = ctx.createRadialGradient(x, y, 0, x, y, R)
      h.addColorStop(0, `rgba(125,255,154,${0.32 * this.gI})`); h.addColorStop(0.5, `rgba(125,255,154,${0.1 * this.gI})`); h.addColorStop(1, 'rgba(125,255,154,0)')
      ctx.fillStyle = h
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill()
    }
    // a crab walks on the seabed, behind the swimmers
    if (this.pred && this.pred.warn <= 0 && this.pred.kind === 'crab') drawPredator(ctx, this.pred, t)
    for (const p of this.prey) if (p.eat === undefined) this.drawPrey(ctx, p)
    ctx.save()
    if (this.atHome()) ctx.globalAlpha = 0.75
    this.drawShark(ctx, resting)
    ctx.restore()
    // snacks being gulped are drawn over the open mouth
    for (const p of this.prey) if (p.eat !== undefined) this.drawPrey(ctx, p)
    if (this.pred) {
      if (this.pred.warn > 0) { const w = this.warnAt(this.pred); drawWarning(ctx, w.x, w.y, t) }
      else if (this.pred.kind !== 'crab') drawPredator(ctx, this.pred, t)
    }
    for (const q of this.parts) {
      ctx.globalAlpha = Math.max(0, q.l / 0.6); ctx.fillStyle = q.c
      ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, TAU); ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.font = '600 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const f of this.floats) { ctx.globalAlpha = Math.max(0, Math.min(1, f.l)); ctx.fillStyle = f.c; ctx.fillText(f.txt, f.x, f.y) }
    ctx.globalAlpha = 1
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,4,10,.5)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,80,120,${this.flash * 0.2})`; ctx.fillRect(0, 0, W, H) }
  }

  private drawPrey(ctx: Ctx2D, p: Prey) {
    const K = KINDS[p.k], r = K.r
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.globalAlpha = Math.min(1, 0.6 + p.lit * 0.4)
    if (p.eat !== undefined) {
      // shrinking into the mouth
      const sc = Math.max(0.05, 1 - p.eat * 0.85)
      ctx.scale(sc, sc)
      ctx.globalAlpha = 1
    }
    if (p.k === 'plankton') {
      const rr = r * (1 + Math.sin(p.ph) * 0.2)
      ctx.shadowColor = K.col; ctx.shadowBlur = 14; ctx.fillStyle = K.col
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.6, 0, TAU); ctx.fill()
      ctx.globalAlpha *= 0.35
      ctx.beginPath(); ctx.arc(0, 0, rr * 1.4, 0, TAU); ctx.fill()
    } else if (p.k === 'shrimp') {
      // red and yellow shrimp swim among the baitfish
      ctx.rotate(Math.atan2(p.vy, p.vx))
      drawShrimp(ctx, r, p.variant, p.ph)
    } else {
      ctx.rotate(Math.atan2(p.vy, p.vx))
      if (p.k === 'gold') { ctx.shadowColor = K.col; ctx.shadowBlur = 16 }
      ctx.fillStyle = K.col
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, TAU); ctx.fill()
      const w = Math.sin(p.ph * 2) * r * 0.2
      ctx.beginPath(); ctx.moveTo(-r * 1.1, 0); ctx.lineTo(-r * 2, -r * 0.7 + w); ctx.lineTo(-r * 2, r * 0.7 + w); ctx.closePath(); ctx.fill()
      ctx.shadowBlur = 0; ctx.fillStyle = '#0a1420'
      ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.15, Math.max(1.2, r * 0.16), 0, TAU); ctx.fill()
      if (p.k !== 'gold') {
        ctx.strokeStyle = K.col; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 2, -r * 0.8); ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 2, r * 0.6); ctx.stroke()
      }
    }
    ctx.restore()
  }

  private drawShark(ctx: Ctx2D, resting: boolean) {
    const sc = this.size() / 80, { t, gI, mouth } = this
    ctx.save()
    ctx.translate(this.shark.x, this.shark.y); ctx.rotate(this.shark.tilt); ctx.scale(this.shark.dir * sc, sc)
    ctx.translate(0, Math.sin(t * (resting ? 1 : 3)) * 2)
    const wag = Math.sin(t * (resting ? 2 : 8)) * 3
    ctx.fillStyle = '#6f7b88'
    ctx.beginPath(); ctx.moveTo(-36, -3); ctx.lineTo(-56, -17 + wag); ctx.quadraticCurveTo(-50, -2, -55, 9 + wag); ctx.lineTo(-36, 4); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(-2, -13); ctx.quadraticCurveTo(-8, -25, -15, -11); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(-20, -9); ctx.quadraticCurveTo(-25, -19, -30, -6); ctx.closePath(); ctx.fill()
    const bg = ctx.createLinearGradient(0, -16, 0, 16)
    bg.addColorStop(0, '#aeb9c4'); bg.addColorStop(1, '#64707d')
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.moveTo(33, 1); ctx.bezierCurveTo(33, -14, 16, -17, -2, -14); ctx.bezierCurveTo(-18, -11, -30, -6, -40, -3)
    ctx.lineTo(-40, 4); ctx.bezierCurveTo(-30, 8, -16, 14, 0, 15); ctx.bezierCurveTo(18, 16, 33, 14, 33, 1); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(228,238,248,.55)'
    for (const [x, y] of [[6, -11], [-6, -10], [-17, -7], [-27, -4], [0, -6], [-12, -4]]) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill() }
    ctx.strokeStyle = 'rgba(40,50,60,.6)'; ctx.lineWidth = 1.2
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(11 - i * 3.5, -3); ctx.lineTo(10 - i * 3.5, 5); ctx.stroke() }
    ctx.save()
    ctx.shadowColor = '#7dff9a'; ctx.shadowBlur = 6 + gI * 26; ctx.fillStyle = `rgba(125,255,154,${0.35 + gI * 0.65})`
    ctx.beginPath(); ctx.ellipse(1, 8, 4.5, 2.4, -0.2, 0, TAU); ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#7a8693'
    ctx.beginPath(); ctx.moveTo(8, 10); ctx.quadraticCurveTo(4, 24, -4, 17); ctx.quadraticCurveTo(-1, 12, 8, 10); ctx.closePath(); ctx.fill()
    if (resting) {
      // closed, sleepy eye
      ctx.strokeStyle = '#0b1118'; ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.arc(21, -5, 3.2, 0.2, Math.PI - 0.2); ctx.stroke()
    } else {
      ctx.fillStyle = '#0b1118'; ctx.beginPath(); ctx.arc(21, -4, 3.4, 0, TAU); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(22.2, -5.2, 1.1, 0, TAU); ctx.fill()
    }
    if (mouth > 0.05) { ctx.fillStyle = '#2a1a22'; ctx.beginPath(); ctx.ellipse(27, 6, 3, 1 + mouth * 3, 0, 0, TAU); ctx.fill() }
    else { ctx.strokeStyle = '#2a333d'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(26, 4, 3.5, 0.3, 1.6); ctx.stroke() }
    ctx.restore()
  }
}
