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
import { drawBeam, drawSonar, drawSub, inBeam, subLamp, type Sub } from './submarine'
import { level as levelDef, type Difficulty, type Look } from './levels'
import { drawPocketShark, PLAYER_LOOK, type SharkLook } from './pocketShark'
import { drawEels, makeEels, updateEels, type Eel } from './eels'
import { drawPredator, eelBody, hitCircles, PRED_INFO, sharkMouth, squidTentacleLength, touches, type Circle, type Pred, type PredKind } from './predators'
import { caveBox, drawKelp, seabedY } from './scenery'
import { drawShrimp } from './shrimp'

export interface WorldHooks {
  onEat(kind: Snack, x: number, y: number): void
  onScare(): void
  onDodge(): void
  onToast(msg: string, color?: string): void
  /** The research submarine caught the pocket shark: the game is over (the screen offers Continue). */
  onCaptured?(): void
  /** A friend found the pocket shark (the level's goal was reached). */
  onFriendMet?(): void
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
  krill: { r: 5, col: '#ff8fb1', spd: 36, w: 6, label: '+1' },
  shrimp: { r: 8, col: '#ffd84d', spd: 48, w: 3, label: '+3' },
  gold: { r: 9, col: '#ffd166', spd: 80, w: 0.4, label: '+10' },
  plankton: { r: 6, col: '#7dff9a', spd: 22, w: 1.4, label: '+glow' },
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
function pickPredator(hunters: Partial<Record<PredKind, number>>): PredKind {
  const list = Object.entries(hunters) as [PredKind, number][]
  let r = Math.random() * list.reduce((a, [, w]) => a + w, 0)
  for (const [k, w] of list) { r -= w; if (r <= 0) return k }
  return list[0][0]
}

/** A little heart shape (drawn, so it doesn't depend on the font). */
function drawHeart(ctx: Ctx2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x, y + r * 0.9)
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45)
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9)
  ctx.closePath(); ctx.fill()
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
  private nextPred = 5
  private mouth = 0
  private flash = 0
  private fleeT = 0
  /** Camera: zooms in on the shark and its cave while it's home. 1 = whole reef. */
  private cam = { z: 1, x: 0, y: 0 }
  static readonly HOME_ZOOM = 1.7
  /** The research submarine, while it's crossing the reef. */
  sub: Sub | null = null
  nextSub = rnd(25, 40)
  /** This place's difficulty and look (see levels.ts). */
  diff: Difficulty = levelDef(1).diff
  look: Look = levelDef(1).look!
  /** Who hunts in this place. */
  hunters = levelDef(1).hunters
  /** A friend who has come to find the pocket shark (see summonFriend). */
  friend: { x: number; y: number; dir: number; tilt: number; look: SharkLook; met: boolean; t: number } | null = null
  /** No new predators or submarines (a friend is on the way). */
  calm = false
  /** Garden eels in the sand (places whose look has them). */
  eels: Eel[] = []
  /** Being pulled up into the submarine (seconds since the catch), then caught for good. */
  capture: { t: number; x: number; y: number; done: boolean } | null = null
  /** The sub is hunting: the music turns scary. */
  get danger() { return !!this.sub || !!this.capture }
  /** Seconds left of being sad and scared, hiding in the cave after a catch. */
  private scaredT = 0
  /** Hurt: running home after a catch, then sad and scared in the cave for a bit. */
  get scared() { return this.fleeT > 0 || this.scaredT > 0 }
  private emptyWarned = false
  private snow = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.5, 1.8), s: rnd(0.006, 0.02), a: rnd(0.15, 0.45) }))

  resize(W: number, H: number, floorInset = 0) {
    const first = this.W <= 1
    this.W = W
    this.H = H
    this.SH = Math.max(H * 0.55, H - floorInset)
    this.placeEels()
    if (first) {
      const h = this.home()
      this.shark.x = h.x
      this.shark.y = h.y
      this.prey = Array.from({ length: this.preyTarget() }, () => this.spawn(false))
    }
  }

  private preyTarget() { return Math.round((6 + (this.W * this.H) / 60000) * this.diff.preyCount) }
  size() { return Math.max(52, Math.min(90, Math.min(this.W, this.H) * 0.16)) }
  private lureR() { return Math.min(this.W, this.H) * 0.42 }
  private maxSpeed() { return Math.max(158, Math.min(this.W, this.H) * 0.5625) }

  /** How hard the shark is swimming right now, 0 (still) to 1 (full speed). Swimming costs health. */
  get effort() { return Math.min(1, Math.hypot(this.vel.x, this.vel.y) / this.maxSpeed()) }

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
    const k = pickKind(), K = KINDS[k], { W } = this
    let x: number, y: number
    if (edge) {
      const side = Math.random() < 0.5
      x = side ? -20 : W + 20
      y = rnd(60, this.SH * 0.8)
    } else {
      x = rnd(caveBox(W, this.SH).w, W - 20)
      y = rnd(80, this.SH * 0.8)
    }
    const a = Math.atan2(this.SH / 2 - y, W / 2 - x) + rnd(-0.8, 0.8)
    return { k, x, y, a, vx: Math.cos(a) * (K.spd * this.diff.preySpeed), vy: Math.sin(a) * (K.spd * this.diff.preySpeed), ph: Math.random() * 6, lit: 0, variant: Math.floor(Math.random() * 2) }
  }

  spawnPredator(kind: PredKind): Pred {
    const { W, SH } = this
    const fromLeft = Math.random() < 0.5
    const base = { kind, dir: (fromLeft ? 1 : -1) as 1 | -1, ang: 0, hunt: false, open: 0, minD: 1e9, done: false, ph: 0, entered: false }
    if (kind === 'shark') {
      const s = Math.min(W, this.H) * 0.6 + 100
      return { ...base, s, x: fromLeft ? -s * 0.6 : W + s * 0.6, y: Math.max(s * 0.25, Math.min(SH * 0.7, this.shark.y + rnd(-60, 60))), warn: 0 }
    }
    if (kind === 'squid') {
      const s = Math.min(W, this.H) * 0.34 + 50
      const x = fromLeft ? -s * 0.6 : W + s * 0.6, y = rnd(SH * 0.1, SH * 0.55)
      const aimX = this.shark.x + rnd(-80, 80), aimY = this.shark.y + rnd(-60, 60)
      return { ...base, s, x, y, ang: Math.atan2(aimY - y, aimX - x), warn: 0, squid: { state: 'swim', t: 0, e: 0, warned: false } }
    }
    if (kind === 'ray') {
      const s = Math.min(W, this.H) * 0.36 + 50
      const y = rnd(SH * 0.15, SH * 0.6)
      return { ...base, s, x: fromLeft ? -s * 0.8 : W + s * 0.8, y, ang: fromLeft ? 0 : Math.PI, warn: 0, ray: { state: 'glide', t: 0 } }
    }
    if (kind === 'barracuda') {
      const s = Math.min(W, this.H) * 0.42 + 60
      const y = Math.max(s * 0.2, Math.min(SH * 0.75, this.shark.y + rnd(-90, 90)))
      return { ...base, s, x: fromLeft ? -s * 0.6 : W + s * 0.6, y, ang: fromLeft ? 0 : Math.PI, warn: 0, cuda: { state: 'cruise', t: 0 } }
    }
    if (kind === 'eel') {
      // a hole in the reef, out in the open part of the seabed (never near the cave)
      const s = Math.min(W, this.H) * 0.5 + 40
      const cw = caveBox(W, SH).w, ax = rnd(Math.min(W - 60, cw + 50), W - 50), ay = seabedY(ax, SH) - 6
      const ang = -Math.PI / 2 + rnd(-0.4, 0.4)
      return {
        ...base, s, x: ax, y: ay, ang, warn: 0, entered: true,
        eel: { state: 'peek', t: 0.6, ax, ay, ext: 0, len: s, life: rnd(11, 15), lunges: 0 },
      }
    }
    const s = Math.min(W, this.H) * 0.22 + 30
    const x = fromLeft ? -s * 0.8 : W + s * 0.8
    return {
      ...base, s, x, y: seabedY(Math.max(0, Math.min(W, x)), SH) - s * 0.22, warn: 0,
      crab: { state: 'walk', t: 0, vx: 0, vy: 0, warned: false },
    }
  }

  /**
   * A big shark or squid that starts small, far off in the background, and
   * swims toward the pocket shark's home while it grows to full size.
   */
  spawnFromBackground(kind: 'shark' | 'squid'): Pred {
    const { W, SH } = this, h = this.home()
    const p = this.spawnPredator(kind)
    const fullS = p.s
    const tx = h.x + rnd(40, 140)
    const ty = Math.max(fullS * 0.28, h.y - fullS * (kind === 'shark' ? 0.3 : 0.45))
    const x0 = rnd(W * 0.35, W * 0.9), y0 = rnd(SH * 0.12, SH * 0.32)
    p.dir = tx >= x0 ? 1 : -1
    p.x = x0; p.y = y0
    p.ang = Math.atan2(ty - y0, tx - x0)
    p.entered = true
    p.deep = { z: 0, fullS, x0, y0, tx, ty, dur: rnd(3.2, 4.4) }
    p.s = fullS * 0.12
    return p
  }

  /** Still small and far enough back to be drawn behind the reef. */
  private farAway(p: Pred) { return !!p.deep && p.deep.z < 0.7 }

  /** The approach from the background, then hand over to a normal pass left or right. */
  private updateDeep(pr: Pred, dt: number, home: boolean, resting: boolean, hooks: WorldHooks) {
    const dp = pr.deep!
    dp.z = Math.min(1, dp.z + dt / dp.dur)
    const smooth = (v: number) => { const c = Math.max(0, Math.min(1, v)); return c * c * (3 - 2 * c) }
    // nose-first toward the viewer for most of the way (only a little sideways
    // drift), then it turns side-on and swims off sideways toward the exit
    const TURN = 0.72
    const turning = smooth((dp.z - TURN) / (1 - TURN))
    if (pr.kind === 'shark') pr.yaw = turning
    const lateral = pr.kind === 'shark' ? 0.3 * Math.min(1, dp.z / TURN) + 0.7 * turning : smooth(dp.z)
    pr.x = dp.x0 + (dp.tx - dp.x0) * lateral
    pr.y = dp.y0 + (dp.ty - dp.y0) * smooth(dp.z)
    pr.s = dp.fullS * (0.12 + 0.88 * dp.z)
    pr.ph += dt * (pr.kind === 'squid' ? 3.2 : 4)
    const d = Math.hypot(pr.x - this.shark.x, pr.y - this.shark.y)
    pr.minD = Math.min(pr.minD, d)
    // close enough to be in the same plane as the pocket shark: it can catch it
    if (dp.z > 0.9 && (pr.yaw ?? 1) >= 0.5 && !pr.done && !home && !resting && touches(hitCircles(pr), this.sharkCircles())) this.caught(pr, hooks)
    if (dp.z >= 1) {
      // turn and leave the screen to the left or right
      pr.deep = undefined
      pr.yaw = undefined
      pr.s = dp.fullS
      pr.minD = 1e9
      if (pr.kind === 'squid') {
        pr.ang = pr.dir > 0 ? 0 : Math.PI
        if (pr.squid) { pr.squid.state = 'swim'; pr.squid.t = 0.6 }
      }
    }
  }

  /** Draw a predator, faded by distance while it is still coming from the background. */
  private drawDeep(ctx: Ctx2D, p: Pred, t: number) {
    if (!p.deep) { drawPredator(ctx, p, t); return }
    ctx.save()
    ctx.globalAlpha = Math.min(1, 0.3 + p.deep.z * 0.85)
    drawPredator(ctx, p, t)
    ctx.restore()
  }

  /** How far a squid's tentacles reach from its body when thrown, in px. */
  squidReach(pr: Pred) { return squidTentacleLength(1) * (pr.s / 200) }

  /**
   * The squid swims in jet bursts (homing in on a glowing shark). When the
   * pocket shark comes within tentacle reach, it stops, turns its arms toward
   * the shark and pulls its tentacles back (a short warning), shoots them out,
   * pulls them in, rests, and swims on.
   */
  private updateSquid(pr: Pred, dt: number, d: number, home: boolean, hooks: WorldHooks) {
    const q = (pr.squid ??= { state: 'swim', t: 0, e: 0, warned: false })
    const W = this.W
    q.t -= dt
    const turnToward = (want: number, rate: number) => {
      let da = want - pr.ang
      while (da > Math.PI) da -= TAU
      while (da < -Math.PI) da += TAU
      pr.ang += Math.max(-rate * dt, Math.min(rate * dt, da))
    }
    if (q.state === 'swim' || q.state === 'cool') {
      if (!pr.done && this.gI > 0.35 && !home && d < pr.s * 1.6) {
        pr.hunt = true
      } else if (pr.hunt && (this.gI < 0.2 || home)) pr.hunt = false
      if (pr.hunt && q.state === 'swim') turnToward(Math.atan2(this.shark.y - pr.y, this.shark.x - pr.x), 1.4)
      // jet propulsion: bursts of speed, drifting between them
      const burst = 0.35 + 1.3 * Math.max(0, Math.sin(pr.ph))
      const v = (W * 0.18 + 70) * burst * (pr.hunt ? 1.2 : 1) * (q.state === 'cool' ? 0.6 : 1)
      pr.x += Math.cos(pr.ang) * v * dt
      pr.y += Math.sin(pr.ang) * v * dt
      q.e += (0 - q.e) * Math.min(1, dt * 5)
      if (q.state === 'cool' && q.t <= 0) q.state = 'swim'
      if (q.state === 'swim' && !pr.done && !home && q.t <= 0 && d < this.squidReach(pr) * 0.92) {
        q.state = 'aim'
        q.t = 0.45
      }
    } else if (q.state === 'aim') {
      // point the arms (the back of the squid) at the shark and wind up
      turnToward(Math.atan2(pr.y - this.shark.y, pr.x - this.shark.x), 7)
      q.e += (-0.3 - q.e) * Math.min(1, dt * 10)
      if (q.t <= 0) { q.state = 'strike'; q.t = 0.2 }
    } else if (q.state === 'strike') {
      q.e = Math.min(1, q.e + dt / 0.18)
      if (q.t <= 0) { q.state = 'retract'; q.t = 0.45 }
    } else if (q.state === 'retract') {
      q.e = Math.max(0, q.e - dt / 0.45)
      if (q.t <= 0) { q.state = 'cool'; q.t = 1.8 }
    }
    pr.y = Math.max(-pr.s, Math.min(this.SH - pr.s * 0.12, pr.y))
  }

  private turn(pr: Pred, want: number, rate: number, dt: number) {
    let da = want - pr.ang
    while (da > Math.PI) da -= TAU
    while (da < -Math.PI) da += TAU
    pr.ang += Math.max(-rate * dt, Math.min(rate * dt, da))
  }

  /**
   * The stingray glides across with a gentle wave. When the pocket shark comes
   * close (from farther away if it's glowing), it turns and chases it for a few
   * seconds, a little slower than the shark can swim, then gives up and leaves.
   */
  private updateRay(pr: Pred, dt: number, d: number, home: boolean) {
    const q = (pr.ray ??= { state: 'glide', t: 0 }), W = this.W
    q.t -= dt
    const sees = pr.s * (1.6 + 1.2 * this.gI)
    let v = W * 0.14 + 60
    if (q.state === 'glide') {
      this.turn(pr, (pr.dir > 0 ? 0 : Math.PI) + Math.sin(pr.ph * 0.5) * 0.35, 1.2, dt)
      if (!pr.done && !home && d < sees) { q.state = 'chase'; q.t = rnd(3.5, 5); pr.hunt = true }
    } else if (q.state === 'chase') {
      this.turn(pr, Math.atan2(this.shark.y - pr.y, this.shark.x - pr.x), 1.9, dt)
      v = Math.min(W * 0.32 + 70, this.maxSpeed() * 0.82)
      if (q.t <= 0 || pr.done || home) { q.state = 'leave'; pr.hunt = false; pr.dir = pr.x < W / 2 ? -1 : 1 }
    } else {
      this.turn(pr, pr.dir > 0 ? 0 : Math.PI, 1.5, dt)
      v = W * 0.2 + 80
    }
    pr.x += Math.cos(pr.ang) * v * dt
    pr.y += Math.sin(pr.ang) * v * dt
    pr.y = Math.max(pr.s * 0.25, Math.min(this.SH - pr.s * 0.25, pr.y))
  }

  /**
   * The barracuda cruises across. When the pocket shark is ahead of it and
   * close, it stops dead and stares (a short warning), then darts in a
   * straight line at where the shark was, very fast, and cruises on.
   */
  private updateBarracuda(pr: Pred, dt: number, d: number, home: boolean) {
    const q = (pr.cuda ??= { state: 'cruise', t: 0 }), W = this.W
    q.t -= dt
    if (q.state === 'cruise' || q.state === 'cool') {
      this.turn(pr, pr.dir > 0 ? 0 : Math.PI, 1.2, dt)
      const v = (W * 0.2 + 80) * (q.state === 'cool' ? 0.7 : 1)
      pr.x += Math.cos(pr.ang) * v * dt
      pr.y += Math.sin(pr.ang) * v * dt
      if (q.state === 'cool' && q.t <= 0) q.state = 'cruise'
      const ahead = pr.dir > 0 ? this.shark.x > pr.x : this.shark.x < pr.x
      if (q.state === 'cruise' && !pr.done && !home && ahead && d < pr.s * (1.6 + 0.6 * this.gI) && Math.abs(this.shark.y - pr.y) < pr.s * 0.8) {
        q.state = 'lock'; q.t = 0.6; pr.hunt = true
      }
    } else if (q.state === 'lock') {
      // stop and aim
      this.turn(pr, Math.atan2(this.shark.y - pr.y, this.shark.x - pr.x), 6, dt)
      pr.open = Math.min(1, pr.open + dt * 3)
      if (q.t <= 0) { q.state = 'dart'; q.t = 0.5 }
    } else {
      const v = W * 1.2 + 320
      pr.x += Math.cos(pr.ang) * v * dt
      pr.y += Math.sin(pr.ang) * v * dt
      if (q.t <= 0) { q.state = 'cool'; q.t = 2.2; pr.hunt = false; pr.open = 0; pr.dir = Math.cos(pr.ang) >= 0 ? 1 : -1 }
    }
    pr.y = Math.max(pr.s * 0.1, Math.min(this.SH - pr.s * 0.08, pr.y))
  }

  /**
   * The moray eel lives in a hole in the reef. It pokes its head out and
   * watches. If the pocket shark comes within reach it opens its mouth (a short
   * warning), lunges out at it, pulls back, and rests. After a while (or a few
   * lunges) it slides back into its hole.
   */
  private updateEel(pr: Pred, dt: number, home: boolean) {
    const e = (pr.eel ??= { state: 'peek', t: 0, ax: pr.x - Math.cos(pr.ang) * pr.s, ay: pr.y - Math.sin(pr.ang) * pr.s, ext: 1, len: pr.s, life: 12, lunges: 0 })
    e.t -= dt
    e.life -= dt
    const toShark = Math.atan2(this.shark.y - e.ay, this.shark.x - e.ax)
    const reach = Math.hypot(this.shark.x - e.ax, this.shark.y - e.ay)
    // it only lunges up and to the sides, never down into the sand
    const aimUp = (a: number) => Math.max(-Math.PI + 0.25, Math.min(-0.25, a > Math.PI / 2 ? a - TAU : a))
    if (e.state === 'peek' || e.state === 'cool') {
      e.ext += (0.3 - e.ext) * Math.min(1, dt * 3)
      pr.open = Math.max(0, pr.open - dt * 3)
      this.turn(pr, aimUp(toShark), 1.5, dt)
      if (e.state === 'cool' && e.t <= 0) e.state = 'peek'
      if (e.life <= 0 || e.lunges >= 3) { e.state = 'leave' }
      else if (e.state === 'peek' && e.t <= 0 && !pr.done && !home && reach < e.len * 0.95) { e.state = 'warn'; e.t = 0.45; pr.hunt = true }
    } else if (e.state === 'warn') {
      this.turn(pr, aimUp(toShark), 4, dt)
      pr.open = Math.min(1, pr.open + dt * 3)
      e.ext += (0.22 - e.ext) * Math.min(1, dt * 6) // pulls back a little, coiling
      if (e.t <= 0) { e.state = 'lunge'; e.t = 0.24; e.lunges++ }
    } else if (e.state === 'lunge') {
      e.ext = Math.min(1, e.ext + dt / 0.2)
      if (e.t <= 0) { e.state = 'back'; e.t = 0.6 }
    } else if (e.state === 'back') {
      e.ext += (0.3 - e.ext) * Math.min(1, dt * 4)
      pr.open = Math.max(0, pr.open - dt * 2)
      if (e.t <= 0) { e.state = 'cool'; e.t = 1.4; pr.hunt = false }
    } else {
      e.ext = Math.max(0, e.ext - dt * 0.8)
      if (e.ext <= 0) pr.gone = true
    }
    const head = eelBody(pr)
    pr.x = head[head.length - 1].x
    pr.y = head[head.length - 1].y
  }

  /** Highest a crab can leap above its walking line: staying above this is safe. */
  crabReach() { return this.SH * 0.42 }

  /**
   * The crab walks the seabed. When the pocket shark is above it and within
   * reach, it crouches (a short warning), then leaps up at the shark with its
   * claws open, lands, rests a moment, and walks on.
   */
  private updateCrab(pr: Pred, dt: number, home: boolean, hooks: WorldHooks) {
    const c = (pr.crab ??= { state: 'walk', t: 0, vx: 0, vy: 0, warned: false }), W = this.W
    const ground = (x: number) => seabedY(Math.max(0, Math.min(W, x)), this.SH) - pr.s * 0.22
    const G = 1500 // gravity for the leap, px/s²
    c.t -= dt
    if (c.state === 'walk') {
      pr.x += pr.dir * (W * 0.12 + 40) * dt
      pr.y = ground(pr.x)
      pr.open = Math.max(0, pr.open - dt * 3)
      const dx = this.shark.x - pr.x, above = pr.y - this.shark.y
      const inRange = Math.abs(dx) < pr.s * 1.7 && above > 0 && above < this.crabReach()
      if (!pr.done && !home && inRange && c.t <= 0) {
        c.state = 'crouch'
        c.t = 0.4
      }
    } else if (c.state === 'crouch') {
      pr.y = ground(pr.x) + pr.s * 0.04
      pr.open = Math.min(1, pr.open + dt * 4)
      if (c.t <= 0) {
        // aim at where the shark is now: rise to its height, drift sideways toward it
        const rise = Math.min(this.crabReach(), Math.max(pr.s * 0.4, pr.y - this.shark.y + pr.s * 0.15))
        c.vy = -Math.sqrt(2 * G * rise)
        const flight = (2 * -c.vy) / G
        c.vx = Math.max(-W * 0.8, Math.min(W * 0.8, (this.shark.x - pr.x) / (flight * 0.5)))
        c.state = 'air'
      }
    } else if (c.state === 'air') {
      pr.open = 1
      pr.x += c.vx * dt
      c.vy += G * dt
      pr.y += c.vy * dt
      const g = ground(pr.x)
      if (c.vy > 0 && pr.y >= g) {
        pr.y = g
        c.state = 'cool'
        c.t = 1.6
      }
    } else {
      pr.y = ground(pr.x)
      pr.open = Math.max(0, pr.open - dt * 2)
      if (c.t <= 0) { c.state = 'walk'; c.t = 0.8 }
    }
  }

  private caught(p: Pred, hooks: WorldHooks) {
    p.done = true
    p.hunt = false
    this.flash = 1
    this.fleeT = 6 // runs for the cave (until it gets there)
    this.scaredT = 0
    this.homing = true
    hooks.onScare()
    hooks.onToast(PRED_INFO[p.kind].caught, '#ff8fb1')
    // after a grab the squid reels its tentacles in and jets off, mantle-first (away from the shark)
    if (p.kind === 'squid' && p.squid) { p.squid.state = 'retract'; p.squid.t = 0.45 }
  }

  /**
   * The research submarine cruises across near the top, sweeping its spotlight
   * down through the water. A glowing shark draws the beam toward it. Staying
   * in the beam for a moment means getting caught; the cave is always safe.
   */
  private updateSub(dt: number, home: boolean, resting: boolean) {
    const { W, SH } = this
    if (!this.sub) {
      this.nextSub -= dt
      if (this.nextSub > 0 || resting || this.pred || this.calm) return
      const s = Math.min(W, this.H) * 0.42 + 20, dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
      this.sub = { x: dir > 0 ? -s * 0.7 : W + s * 0.7, y: SH * 0.3, dir, s, beam: Math.PI / 2, spot: 0, hunt: false, ph: 0, stop: 0 }
      return
    }
    const sb = this.sub
    sb.ph += dt
    sb.y = SH * 0.3 + Math.sin(sb.ph * 0.8) * 6 // below the top bar
    const lamp = subLamp(sb), sz = this.size()
    // the beam: a slow search sweep, or it follows a glowing shark (slowly, so you can slip out)
    const toShark = Math.atan2(this.shark.y - lamp.y, this.shark.x - lamp.x)
    sb.hunt = !home && this.gI > 0.35 && Math.hypot(this.shark.x - lamp.x, this.shark.y - lamp.y) < SH * 0.95 && toShark > 0.15 && toShark < Math.PI - 0.15
    const want = sb.hunt ? toShark : Math.PI / 2 + Math.sin(sb.ph * 0.75) * 0.75
    let da = want - sb.beam
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    const rate = sb.hunt ? 0.85 : 1.2
    sb.beam += Math.max(-rate * dt, Math.min(rate * dt, da))
    sb.x += sb.dir * (W * 0.08 + 22) * (sb.hunt ? 0.55 : 1) * dt
    // caught in the light?
    const lit = !home && !resting && inBeam(sb, SH, this.shark.x, this.shark.y, sz * 0.3)
    sb.spot = Math.max(0, Math.min(1, sb.spot + (lit ? dt / this.diff.spotSeconds : -dt / 0.6)))
    if (sb.spot >= 1) {
      this.capture = { t: 0, x: this.shark.x, y: this.shark.y, done: false }
      this.glowOn = false
      this.homing = false
      this.fleeT = 0
      this.scaredT = 0
      return
    }
    if (sb.x < -sb.s * 0.8 || sb.x > W + sb.s * 0.8) {
      this.sub = null
      this.nextSub = rnd(...this.diff.subGap)
    }
  }

  /** Pulled up the beam into the sub, shrinking, then the game is over. */
  private updateCapture(dt: number, hooks: WorldHooks) {
    const c = this.capture!, sb = this.sub
    c.t += dt
    this.gI += (0 - this.gI) * Math.min(1, dt * 6)
    if (sb) {
      sb.ph += dt
      const l = subLamp(sb), k = Math.min(1, c.t / 1.3), e = k * k * (3 - 2 * k)
      this.shark.x = c.x + (l.x - c.x) * e
      this.shark.y = c.y + (l.y - c.y) * e
    }
    this.shark.tilt = Math.sin(c.t * 18) * 0.25 // wriggling
    for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.l -= dt }
    this.parts = this.parts.filter((q) => q.l > 0)
    if (c.t >= 1.4 && !c.done) {
      c.done = true
      hooks.onCaptured?.()
    }
  }

  /**
   * After the game-over screen: the pocket shark wriggles free (Continue) or a
   * new one starts (Start over). Either way it's back in its cave and the sub is gone.
   */
  release() {
    this.capture = null
    this.sub = null
    this.nextSub = rnd(...this.diff.subGap)
    this.pred = null
    this.nextPred = rnd(...this.diff.predGap)
    const h = this.home()
    this.shark.x = h.x
    this.shark.y = h.y
    this.shark.tilt = 0
    this.vel = { x: 0, y: 0 }
    this.fleeT = 0
    this.scaredT = 2.5
  }

  /** Where the middle of the playfield is on screen (above the on-screen controls). */
  private camCenterY() { return this.SH * 0.55 }

  /** Ease the camera toward a close-up of the cave while the shark is home, and back out when it leaves. */
  private updateCamera(dt: number) {
    const home = this.atHome() && !this.capture
    const Z = World.HOME_ZOOM, c = this.cam
    c.z += ((home ? Z : 1) - c.z) * Math.min(1, dt * 3)
    if (Math.abs(c.z - 1) < 0.002) c.z = 1
    // focus slides from the middle of the screen to the shark in its cave as the zoom grows
    const k = (c.z - 1) / (Z - 1), h = this.home()
    const fx = this.W / 2 + ((home ? this.shark.x : h.x) - this.W / 2) * k
    const fy = this.camCenterY() + ((home ? this.shark.y : h.y) - this.camCenterY()) * k
    c.x = fx
    c.y = fy
  }

  /** Apply the camera: scale around the focus point, never showing past the edges of the reef. */
  private applyCamera(ctx: Ctx2D) {
    const { z } = this.cam
    if (z === 1) return
    const W = this.W, SH = this.SH, cy = this.camCenterY()
    const fx = Math.max(W / (2 * z), Math.min(W - W / (2 * z), this.cam.x))
    // keep the seabed edge where it is on screen (just above the controls)
    const fy = Math.max(cy / z, Math.min(SH - (SH - cy) / z, this.cam.y))
    ctx.translate(W / 2, cy)
    ctx.scale(z, z)
    ctx.translate(-fx, -fy)
  }

  /** The camera zoom right now (1 = the whole reef). */
  get zoom() { return this.cam.z }

  /** `canGlow`: the care model has glow left. `resting`: shark is asleep at home. */
  update(dt: number, canGlow: boolean, resting: boolean, hooks: WorldHooks) {
    const { W, H } = this
    this.t += dt
    this.updateCamera(dt)
    if (this.capture) { this.updateCapture(dt, hooks); return }
    this.updateFriend(dt, hooks)
    if (this.eels.length) updateEels(this.eels, dt, this.shark, this.gI, this.size())
    if (this.fleeT > 0) this.fleeT -= dt
    if (this.scaredT > 0) this.scaredT -= dt
    const auto = resting || this.scared || this.homing

    // ---- swimming: joystick, or automatic when heading home ----
    const sp = this.maxSpeed()
    let want = { x: this.stick.x * sp, y: this.stick.y * sp }
    if (auto) {
      const h = this.home(), dx = h.x - this.shark.x, dy = h.y - this.shark.y, d = Math.hypot(dx, dy)
      const fast = this.fleeT > 0 ? 1.25 : 0.8
      want = d < 4 ? { x: 0, y: 0 } : { x: (dx / d) * Math.min(sp * fast, d * 4), y: (dy / d) * Math.min(sp * fast, d * 4) }
      // made it back to the cave after a catch: hide there, sad and scared, for a couple of seconds
      if (this.fleeT > 0 && d < 8) { this.fleeT = 0; this.scaredT = 2.5 }
      if (d < 4 && this.homing && !resting && !this.scared) this.homing = false
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
    this.glowOn = this.glowHeld && canGlow && !resting && !this.scared
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
        // Lured in, but wary: they circle just out of reach, so the shark has to
        // lunge its mouth onto one rather than wait for it to swim in.
        const ring = s * 0.8, v = (K.spd * this.diff.preySpeed) + 40 * this.gI, ux = dx / d, uy = dy / d
        const vr = Math.max(-v, Math.min(v, (d - ring) * 3)), vt = (K.spd * this.diff.preySpeed) * 0.7 * (p.variant ? 1 : -1)
        // and they dart away from an open mouth coming at them
        const mx = p.x - mouth.x, my = p.y - mouth.y, md = Math.hypot(mx, my) || 1, near = s * 0.75
        const dart = md < near ? (K.spd * this.diff.preySpeed) * 2.2 * (1 - md / near) : 0
        const f = Math.min(1, dt * 2.6)
        p.vx += (ux * vr - uy * vt + (mx / md) * dart - p.vx) * f
        p.vy += (uy * vr + ux * vt + (my / md) * dart - p.vy) * f
        p.lit = 1
      } else if (this.gI < 0.3 && d < R * 0.7 && !resting) {
        const away = Math.atan2(-dy, -dx), v = (K.spd * this.diff.preySpeed) + 130 * (1 - d / (R * 0.7)) + 40, f = Math.min(1, dt * 3.5)
        p.vx += (Math.cos(away) * v - p.vx) * f
        p.vy += (Math.sin(away) * v - p.vy) * f
        p.a = away
        p.lit = Math.max(0, p.lit - dt)
      } else {
        p.a += rnd(-1, 1) * dt * 1.5
        p.vx += (Math.cos(p.a) * (K.spd * this.diff.preySpeed) - p.vx) * Math.min(1, dt)
        p.vy += (Math.sin(p.a) * (K.spd * this.diff.preySpeed) - p.vy) * Math.min(1, dt)
        p.lit = Math.max(0, p.lit - dt)
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      // stay in the water the shark can reach: above the seabed, below the very top
      if (p.y > this.SH - 30) p.vy -= 40 * dt
      if (p.y > this.SH - 18) { p.y = this.SH - 18; p.vy = -Math.abs(p.vy) * 0.6 }
      if (p.y < 40) { p.y = 40; p.vy = Math.abs(p.vy) * 0.6 }
      // only the mouth catches: it has to actually reach the snack
      const dm = Math.hypot(mouth.x - p.x, mouth.y - p.y)
      if (!resting && !this.scared && dm < s * 0.14 + K.r) {
        p.eat = 0
        p.from = { x: p.x, y: p.y }
      }
      if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) p.dead = true
    }
    this.prey = this.prey.filter((p) => !p.dead)
    while (this.prey.length < this.preyTarget()) this.prey.push(this.spawn(true))

    // ---- research submarine ----
    this.updateSub(dt, home, resting)
    if (this.capture) return

    // ---- predators (none new while the sub is around) ----
    this.nextPred -= dt
    if (!this.pred && this.nextPred <= 0 && !resting && !this.sub && !this.calm) {
      const kind = pickPredator(this.hunters)
      this.pred = (kind === 'shark' || kind === 'squid') && Math.random() < 0.5 ? this.spawnFromBackground(kind) : this.spawnPredator(kind)
    }
    const pr = this.pred
    const pdt = dt * this.diff.predSpeed // predators move faster in harder places
    if (pr) {
      if (pr.deep) this.updateDeep(pr, pdt, home, resting, hooks)
      else {
        pr.ph += pdt * (pr.kind === 'squid' ? 3.2 : 4)
        const d = Math.hypot(pr.x - this.shark.x, pr.y - this.shark.y)
        pr.minD = Math.min(pr.minD, d)
        if (pr.kind === 'shark') {
          const ahead = pr.dir > 0 ? this.shark.x > pr.x : this.shark.x < pr.x
          if (!pr.done && !pr.hunt && ahead && this.gI > 0.35 && !home && d < pr.s * 0.8) {
            pr.hunt = true
          } else if (pr.hunt && (this.gI < 0.2 || !ahead || home)) pr.hunt = false
          const sc = pr.s / 230
          if (pr.hunt) pr.y += (this.shark.y - 10 * sc - pr.y) * Math.min(1, pdt * 2.4)
          pr.x += pr.dir * (W * 0.3 + 110) * (pr.hunt ? 1.4 : 1) * pdt
          const m = sharkMouth(pr), dm = Math.hypot(m.x - this.shark.x, m.y - this.shark.y)
          pr.open += ((pr.hunt && dm < pr.s * 0.45 ? 1 : 0) - pr.open) * Math.min(1, pdt * 8)
        } else if (pr.kind === 'squid') {
          this.updateSquid(pr, pdt, d, home, hooks)
        } else if (pr.kind === 'ray') {
          this.updateRay(pr, pdt, d, home)
        } else if (pr.kind === 'barracuda') {
          this.updateBarracuda(pr, pdt, d, home)
        } else if (pr.kind === 'eel') {
          this.updateEel(pr, pdt, home)
        } else {
          this.updateCrab(pr, pdt, home, hooks)
        }
        // any touch with any part of the predator is a catch (home is safe)
        if (!pr.done && !home && !resting && touches(hitCircles(pr), this.sharkCircles())) this.caught(pr, hooks)
        const inside = pr.x > -pr.s * 0.2 && pr.x < W + pr.s * 0.2 && pr.y > -pr.s * 0.2 && pr.y < H + pr.s * 0.2
        if (inside) pr.entered = true
        const gone = pr.gone || pr.entered && (pr.x < -pr.s * 0.7 || pr.x > W + pr.s * 0.7 || pr.y < -pr.s * 0.7 || pr.y > H + pr.s * 0.7)
        if (gone) {
          if (!pr.done && pr.minD < pr.s * 0.75) {
            hooks.onDodge()
            hooks.onToast(home ? 'Safe at home! +5' : 'Great dodging! +5', '#7dff9a')
          }
          this.pred = null
          this.nextPred = rnd(...this.diff.predGap)
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
  draw(ctx: Ctx2D, scenery: () => void, resting: boolean, backdrop?: () => void) {
    const { W, H, t } = this
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, this.look.water[0]); g.addColorStop(0.5, this.look.water[1]); g.addColorStop(1, this.look.water[2])
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
    // everything in the reef is drawn through the camera (zoomed in at home)
    ctx.save()
    this.applyCamera(ctx)
    // soft, misty depth far behind everything
    backdrop?.()
    // a predator far off in the background swims behind the reef
    if (this.pred && this.farAway(this.pred)) this.drawDeep(ctx, this.pred, t)
    // seabed below the scene (under the on-screen controls)
    ctx.fillStyle = '#030b16'
    ctx.fillRect(0, this.SH - 2, W, H - this.SH + 2)
    scenery()
    drawKelp(ctx, W, this.SH, t, this.look)
    if (this.eels.length) drawEels(ctx, this.eels, t)
    if (this.gI > 0.01) {
      const R = this.lureR() * (0.4 + 0.6 * this.gI), { x, y } = this.shark
      const h = ctx.createRadialGradient(x, y, 0, x, y, R)
      h.addColorStop(0, `rgba(125,255,154,${0.32 * this.gI})`); h.addColorStop(0.5, `rgba(125,255,154,${0.1 * this.gI})`); h.addColorStop(1, 'rgba(125,255,154,0)')
      ctx.fillStyle = h
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill()
    }
    if (this.sub) { drawSonar(ctx, this.sub); drawBeam(ctx, this.sub, this.SH) }
    // a crab walks on the seabed and an eel lives in the reef: both behind the swimmers
    if (this.pred && (this.pred.kind === 'crab' || this.pred.kind === 'eel')) drawPredator(ctx, this.pred, t)
    for (const p of this.prey) if (p.eat === undefined) this.drawPrey(ctx, p)
    ctx.save()
    if (this.atHome()) ctx.globalAlpha = 0.75
    this.drawFriend(ctx)
    this.drawShark(ctx, resting)
    ctx.restore()
    // snacks being gulped are drawn over the open mouth
    for (const p of this.prey) if (p.eat !== undefined) this.drawPrey(ctx, p)
    if (this.pred) {
      if (this.pred.kind !== 'crab' && this.pred.kind !== 'eel' && !this.farAway(this.pred)) this.drawDeep(ctx, this.pred, t)
    }
    if (this.sub) drawSub(ctx, this.sub, t)
    for (const q of this.parts) {
      ctx.globalAlpha = Math.max(0, q.l / 0.6); ctx.fillStyle = q.c
      ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, TAU); ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.font = '600 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.l)); ctx.fillStyle = f.c
      if (f.txt === '\u2665') drawHeart(ctx, f.x, f.y - 6, 7)
      else ctx.fillText(f.txt, f.x, f.y)
    }
    ctx.globalAlpha = 1
    ctx.restore()
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
    const shrink = this.capture ? 1 - 0.65 * Math.min(1, this.capture.t / 1.3) : 1 // pulled up into the sub
    const scared = (this.scared || !!this.capture) && !resting
    const happy = !!this.friend?.met
    drawPocketShark(ctx, PLAYER_LOOK, {
      x: this.shark.x, y: this.shark.y, dir: this.shark.dir, tilt: this.shark.tilt,
      scale: (this.size() / 80) * shrink, t: this.t, glow: this.gI, mouth: this.mouth,
      mood: resting ? 'resting' : scared ? 'scared' : happy ? 'happy' : 'normal',
    })
  }

  // ---------- friends ----------
  /**
   * The pocket shark has earned enough here: a friend (in its own color
   * pattern) swims in from the far side. No new predators or submarines come
   * while it does. When they meet, hearts burst and `onFriendMet` fires; the
   * friend then swims along beside the pocket shark.
   */
  summonFriend(look: SharkLook) {
    this.calm = true
    const fromRight = this.shark.x < this.W / 2
    this.friend = {
      x: fromRight ? this.W + 60 : -60, y: Math.max(this.SH * 0.2, Math.min(this.SH * 0.7, this.shark.y)),
      dir: fromRight ? -1 : 1, tilt: 0, look, met: false, t: 0,
    }
  }

  /** A friend who already lives here swims along beside the pocket shark (no greeting, predators as usual). */
  keepFriend(look: SharkLook) {
    const s = this.size()
    this.friend = { x: this.shark.x - s, y: this.shark.y - s * 0.35, dir: this.shark.dir, tilt: 0, look, met: true, t: 0 }
  }

  private updateFriend(dt: number, hooks: WorldHooks) {
    const f = this.friend
    if (!f) return
    f.t += dt
    const s = this.size()
    // swim to the pocket shark; once met, keep alongside it, just behind
    const tx = f.met ? this.shark.x - this.shark.dir * s * 1.05 : this.shark.x + (f.x > this.shark.x ? s * 0.9 : -s * 0.9)
    const ty = f.met ? this.shark.y - s * 0.35 + Math.sin(f.t * 2) * 4 : this.shark.y
    // a friend who already lives here and is far off (e.g. placed before the screen had its size) joins right away
    if (f.met && (Math.hypot(tx - f.x, ty - f.y) > s * 6 || f.x < -s || f.x > this.W + s)) { f.x = tx; f.y = ty }
    const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy)
    const sp = f.met ? Math.min(this.maxSpeed() * 1.1, d * 3) : Math.min(this.maxSpeed() * 0.75, 40 + d * 2)
    if (d > 1) { f.x += (dx / d) * sp * dt; f.y += (dy / d) * sp * dt }
    if (Math.abs(dx) > 4) f.dir = dx > 0 ? 1 : -1
    if (f.met && d < 6) f.dir = this.shark.dir
    f.tilt += (Math.max(-0.4, Math.min(0.4, (dy / Math.max(1, d)) * 0.5)) - f.tilt) * Math.min(1, dt * 5)
    if (!f.met && Math.hypot(f.x - this.shark.x, f.y - this.shark.y) < s * 1.15) {
      f.met = true
      // face each other, hearts all around
      this.shark.dir = f.x > this.shark.x ? 1 : -1
      for (let i = 0; i < 7; i++) {
        this.floats.push({ x: (f.x + this.shark.x) / 2 + rnd(-30, 30), y: (f.y + this.shark.y) / 2 - rnd(10, 40), txt: '\u2665', c: i % 2 ? '#ff8fb1' : '#ffd166', l: 1.4 + Math.random() * 0.8 })
      }
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * TAU, v = rnd(30, 110)
        this.parts.push({ x: (f.x + this.shark.x) / 2, y: (f.y + this.shark.y) / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 0.8, c: i % 2 ? '#ff8fb1' : '#7dff9a' })
      }
      hooks.onFriendMet?.()
    }
    // now and then a little heart while they swim together
    if (f.met && Math.random() < dt * 0.6) {
      this.floats.push({ x: (f.x + this.shark.x) / 2, y: Math.min(f.y, this.shark.y) - 16, txt: '\u2665', c: '#ff8fb1', l: 1.2 })
    }
  }

  private drawFriend(ctx: Ctx2D) {
    const f = this.friend
    if (!f) return
    drawPocketShark(ctx, f.look, {
      x: f.x, y: f.y, dir: f.dir, tilt: f.tilt, scale: (this.size() / 80) * 0.95, t: this.t + 1.3,
      glow: f.met ? 0.6 + 0.4 * Math.sin(f.t * 3) : 0.5, mouth: 0, mood: f.met ? 'happy' : 'normal',
    })
  }

  /** Switch to a place on the sea map: its difficulty and look, fresh timers, no friend yet. */
  setLevel(n: number) {
    const L = levelDef(n)
    this.diff = L.diff
    this.look = L.look ?? levelDef(1).look!
    this.hunters = L.hunters
    this.friend = null
    this.calm = false
    this.pred = null
    this.sub = null
    this.capture = null
    this.nextPred = 5
    this.nextSub = rnd(...this.diff.subFirst)
    this.placeEels()
  }

  private placeEels() {
    this.eels = this.look.eels && this.W > 1 ? makeEels(this.W, this.SH, caveBox(this.W, this.SH).w) : []
  }
}
