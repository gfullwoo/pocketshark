// Glow & Gulp: canvas engine. Framework-free; the Play view owns the UI around it.
import { GAME_SECONDS } from '../../../server/src/game/rules'

export interface EngineResult {
  score: number
  eaten: number
  caught: boolean
}

export interface EngineHooks {
  onHud(h: { score: number; time: number; glow: number }): void
  onToast(msg: string, color?: string): void
  /** The glow button's on/off state changed inside the engine (ran out of glow, round ended). */
  onGlowButton?(on: boolean): void
  onEnd(r: EngineResult): void
}

export interface Engine {
  start(): void
  setSound(on: boolean): void
  /** On-screen Glow button (touch screens): turn the glow on or off. */
  setGlowButton(on: boolean): boolean
  destroy(): void
}

type Kind = 'krill' | 'shrimp' | 'gold' | 'plankton'
interface Prey { k: Kind; x: number; y: number; a: number; vx: number; vy: number; ph: number; lit: number; dead?: boolean }
interface Part { x: number; y: number; vx: number; vy: number; l: number; c: string }
interface Float { x: number; y: number; txt: string; c: string; l: number }
interface Pred { spd: number; dir: 1 | -1; x: number; y: number; s: number; warn: number; hunt: boolean; escaped: boolean; minD: number; open: number }

const KINDS: Record<Kind, { pts: number; r: number; col: string; spd: number; w: number }> = {
  krill: { pts: 1, r: 5, col: '#ff8fb1', spd: 28, w: 6 },
  shrimp: { pts: 3, r: 8, col: '#ffa877', spd: 38, w: 3 },
  gold: { pts: 10, r: 9, col: '#ffd166', spd: 62, w: 0.5 },
  plankton: { pts: 0, r: 6, col: '#7dff9a', spd: 18, w: 1.3 },
}
const KLIST = Object.keys(KINDS) as Kind[]
const KW = KLIST.reduce((s, k) => s + KINDS[k].w, 0)
const TAU = Math.PI * 2
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
function pickKind(): Kind {
  let r = Math.random() * KW
  for (const k of KLIST) {
    r -= KINDS[k].w
    if (r <= 0) return k
  }
  return 'krill'
}

export function createEngine(tank: HTMLElement, cv: HTMLCanvasElement, hooks: EngineHooks): Engine {
  const ctx = cv.getContext('2d')!
  let W = 1, H = 1
  const resize = () => {
    const d = Math.min(2, window.devicePixelRatio || 1)
    W = tank.clientWidth
    H = tank.clientHeight
    cv.width = Math.round(W * d)
    cv.height = Math.round(H * d)
    ctx.setTransform(d, 0, 0, d, 0, 0)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(tank)
  resize()

  type State = 'ready' | 'play' | 'caught' | 'over'
  let state: State = 'ready'
  let score = 0, eaten = 0, timeLeft = GAME_SECONDS, glow = 100, gI = 0, flash = 0, mouth = 0, t = 0
  let emptyWarned = false, caughtT = 0, sharkScale = 1
  const shark = { x: W / 2, y: H / 2, dir: 1, tilt: 0 }
  const ptr = { x: W / 2, y: H / 2, down: false, key: false, btn: false }
  const keys: Record<string, boolean> = {}
  let prey: Prey[] = [], parts: Part[] = [], floats: Float[] = [], pred: Pred | null = null, nextPred = 10
  const snow = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.5, 1.8), s: rnd(0.006, 0.02), a: rnd(0.15, 0.45) }))
  const size = () => Math.max(56, Math.min(100, Math.min(W, H) * 0.17))
  const lureR = () => Math.min(W, H) * 0.42
  const target = () => Math.round(8 + (W * H) / 55000)

  function spawn(edge: boolean): Prey {
    const k = pickKind(), K = KINDS[k]
    let x: number, y: number
    if (edge) {
      const side = Math.floor(Math.random() * 4)
      x = side === 0 ? -20 : side === 1 ? W + 20 : rnd(0, W)
      y = side === 2 ? -20 : side === 3 ? H + 20 : rnd(40, H - 30)
    } else {
      x = rnd(20, W - 20)
      y = rnd(60, H - 30)
    }
    const a = Math.atan2(H / 2 - y, W / 2 - x) + rnd(-0.8, 0.8)
    return { k, x, y, a, vx: Math.cos(a) * K.spd, vy: Math.sin(a) * K.spd, ph: Math.random() * 6, lit: 0 }
  }
  prey = Array.from({ length: target() }, () => spawn(false))

  // ---- sound ----
  let ac: AudioContext | null = null, soundOn = true
  function blip(f: number, d = 0.09, type: OscillatorType = 'sine', v = 0.07) {
    if (!soundOn || !ac) return
    try {
      const n = ac.currentTime, o = ac.createOscillator(), g = ac.createGain()
      o.type = type
      o.frequency.setValueAtTime(f, n)
      o.frequency.exponentialRampToValueAtTime(f * 1.5, n + d)
      g.gain.setValueAtTime(v, n)
      g.gain.exponentialRampToValueAtTime(0.0001, n + d)
      o.connect(g)
      g.connect(ac.destination)
      o.start(n)
      o.stop(n + d + 0.03)
    } catch { /* audio is optional */ }
  }

  const mouthPos = (p: Pred) => {
    const sc = p.s / 230
    return { x: p.x + p.dir * 80 * sc, y: p.y + 12 * sc }
  }

  function eat(p: Prey) {
    const K = KINDS[p.k]
    mouth = 1
    if (p.k === 'plankton') {
      glow = Math.min(100, glow + 30)
      floats.push({ x: p.x, y: p.y, txt: '+glow', c: K.col, l: 1 })
      blip(880, 0.12, 'triangle', 0.06)
    } else {
      score += K.pts
      eaten++
      floats.push({ x: p.x, y: p.y, txt: `+${K.pts}`, c: K.col, l: 1 })
      blip(p.k === 'gold' ? 990 : 500 + K.pts * 70)
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU, s = rnd(30, 110)
      parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 0.6, c: K.col })
    }
    if (p.k === 'gold') hooks.onToast('Golden snack! +10', '#ffd166')
  }

  /** 0 at the start, 1 at 120+ points: the big shark gets faster and visits more often. */
  const danger = () => Math.min(1, score / 120)
  const predGap = () => rnd(8, 13) * (1 - 0.6 * danger())

  function releaseButton() {
    if (ptr.btn) { ptr.btn = false; hooks.onGlowButton?.(false) }
  }

  function caught() {
    state = 'caught'
    caughtT = 0
    ptr.down = ptr.key = false
    releaseButton()
    flash = 1
    hooks.onToast('Gulp!', '#ff8fb1')
    blip(110, 0.5, 'square', 0.05)
    setTimeout(() => blip(80, 0.4, 'sawtooth', 0.04), 180)
  }

  function finish(wasCaught: boolean) {
    state = 'over'
    ptr.down = ptr.key = false
    releaseButton()
    pred = null
    sharkScale = 1
    blip(wasCaught ? 200 : 520, 0.15)
    if (!wasCaught) setTimeout(() => blip(780, 0.2), 160)
    hooks.onEnd({ score, eaten, caught: wasCaught })
  }

  function update(dt: number) {
    t += dt
    const playing = state === 'play'
    if (playing) {
      const ks = 300 * dt
      if (keys.ArrowLeft) ptr.x -= ks
      if (keys.ArrowRight) ptr.x += ks
      if (keys.ArrowUp) ptr.y -= ks
      if (keys.ArrowDown) ptr.y += ks
      ptr.x = Math.max(0, Math.min(W, ptr.x))
      ptr.y = Math.max(0, Math.min(H, ptr.y))
    }
    let tx = ptr.x, ty = ptr.y
    if (!playing) {
      tx = W / 2 + Math.cos(t * 0.5) * W * 0.28
      ty = H * 0.58 + Math.sin(t * 0.9) * H * 0.14
    }
    if (state === 'caught' && pred) ({ x: tx, y: ty } = mouthPos(pred))
    const k = Math.min(1, dt * (state === 'caught' ? 9 : 3.2)), ox = shark.x, oy = shark.y
    shark.x += (tx - shark.x) * k
    shark.y += (ty - shark.y) * k
    const vx = (shark.x - ox) / Math.max(dt, 1e-3), vy = (shark.y - oy) / Math.max(dt, 1e-3)
    if (Math.abs(vx) > 10) shark.dir = vx > 0 ? 1 : -1
    shark.tilt += (Math.max(-0.5, Math.min(0.5, vy / 420)) * shark.dir - shark.tilt) * Math.min(1, dt * 5)

    const wantGlow = playing ? ptr.down || ptr.key || ptr.btn : state === 'caught' ? false : Math.sin(t * 0.8) > 0.2
    const glowing = wantGlow && glow > 1
    if (playing) glow = glowing ? Math.max(0, glow - 16 * dt) : Math.min(100, glow + 9 * dt)
    if (playing && wantGlow && glow <= 1 && !emptyWarned) {
      hooks.onToast(ptr.btn ? 'Out of glow! Resting to recharge' : 'Out of glow! Let go to recharge', '#ff8fb1')
      emptyWarned = true
      releaseButton()
    }
    if (!wantGlow) emptyWarned = false
    gI += ((glowing ? 1 : 0) - gI) * Math.min(1, dt * 6)

    const R = lureR(), eatR = size() * 0.42
    for (const p of prey) {
      const K = KINDS[p.k]
      p.ph += dt * 4
      const dx = shark.x - p.x, dy = shark.y - p.y, d = Math.hypot(dx, dy) || 1
      const f = Math.min(1, dt * 2.2)
      if (gI > 0.3 && d < R) {
        const sp = K.spd + 70 * gI, ta = Math.atan2(dy, dx)
        p.vx += (Math.cos(ta) * sp - p.vx) * f
        p.vy += (Math.sin(ta) * sp - p.vy) * f
        p.lit = 1
      } else if (playing && gI < 0.3 && d < R * 0.6) {
        // Without the glow, snacks see the shark coming and dart away.
        const away = Math.atan2(-dy, -dx), sp = K.spd + 120 * (1 - d / (R * 0.6)) + 40
        p.vx += (Math.cos(away) * sp - p.vx) * Math.min(1, dt * 3.5)
        p.vy += (Math.sin(away) * sp - p.vy) * Math.min(1, dt * 3.5)
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
      if (playing && d < eatR + K.r) {
        p.dead = true
        eat(p)
      }
      if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) p.dead = true
    }
    prey = prey.filter((p) => !p.dead)
    while (prey.length < target()) prey.push(spawn(true))

    if (playing) {
      nextPred -= dt
      if (!pred && nextPred <= 0) {
        const fromLeft = Math.random() < 0.5, ps = Math.min(W, H) * 0.6 + 100
        const lvl = danger()
        pred = {
          spd: 1 + 0.9 * lvl, dir: fromLeft ? 1 : -1, y: Math.max(ps * 0.2, Math.min(H - ps * 0.2, shark.y + rnd(-60, 60))),
          x: fromLeft ? -ps * 0.6 : W + ps * 0.6, s: ps, warn: 2 - 0.6 * lvl, hunt: false, escaped: false, minD: 1e9, open: 0,
        }
        hooks.onToast('A big shark is coming! Glow off to hide', '#ffd166')
        blip(180, 0.3, 'sawtooth', 0.035)
      }
      if (pred) {
        if (pred.warn > 0) pred.warn -= dt
        else {
          const ahead = pred.dir > 0 ? shark.x > pred.x : shark.x < pred.x
          const d = Math.hypot(pred.x - shark.x, pred.y - shark.y)
          pred.minD = Math.min(pred.minD, d)
          if (!pred.hunt && ahead && gI > 0.35 && d < pred.s * 0.8) {
            pred.hunt = true
            hooks.onToast('It sees your glow! Glow off!', '#ff8fb1')
            blip(150, 0.35, 'square', 0.04)
          } else if (pred.hunt && (gI < 0.2 || !ahead)) {
            pred.hunt = false
            if (gI < 0.2) {
              pred.escaped = true
              hooks.onToast('Phew! It lost you', '#7dff9a')
            }
          }
          const sc = pred.s / 230
          if (pred.hunt) pred.y += (shark.y - 10 * sc - pred.y) * Math.min(1, dt * 2.6 * pred.spd)
          pred.x += pred.dir * (W * 0.33 + 120) * pred.spd * (pred.hunt ? 1.5 : 1) * dt
          const m = mouthPos(pred), dm = Math.hypot(m.x - shark.x, m.y - shark.y)
          pred.open += ((pred.hunt && dm < pred.s * 0.45 ? 1 : 0) - pred.open) * Math.min(1, dt * 8)
          if (pred.hunt && dm < size() * 0.55) caught()
          else if ((pred.dir > 0 && pred.x > W + pred.s * 0.6) || (pred.dir < 0 && pred.x < -pred.s * 0.6)) {
            if (pred.minD < pred.s * 0.6) {
              score += 5
              hooks.onToast(`${pred.escaped ? 'Nice escape' : 'Great hiding'}! +5`, '#7dff9a')
              blip(660, 0.2, 'triangle', 0.06)
            }
            pred = null
            nextPred = predGap()
          }
        }
      }
      if (state === 'play') {
        timeLeft -= dt
        if (timeLeft <= 0) {
          timeLeft = 0
          finish(false)
        }
      }
    }
    if (state === 'caught') {
      caughtT += dt
      if (pred) {
        pred.x += pred.dir * (W * 0.2 + 60) * dt
        pred.open = caughtT < 0.35 ? 1 : Math.max(0, 1 - (caughtT - 0.35) * 5)
      }
      sharkScale = Math.max(0, 1 - caughtT / 0.4)
      if (caughtT > 1.5) finish(true)
    }

    for (const q of parts) {
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vx *= 0.92
      q.vy *= 0.92
      q.l -= dt
    }
    parts = parts.filter((q) => q.l > 0)
    for (const fl of floats) {
      fl.y -= 40 * dt
      fl.l -= dt
    }
    floats = floats.filter((fl) => fl.l > 0)
    mouth = Math.max(0, mouth - dt * 4)
    flash = Math.max(0, flash - dt * 1.5)
    for (const s of snow) {
      s.y += s.s * dt
      if (s.y > 1) s.y = 0
    }
  }

  // ---- drawing ----
  function drawPrey(p: Prey) {
    const K = KINDS[p.k], r = K.r
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.globalAlpha = Math.min(1, 0.6 + p.lit * 0.4)
    if (p.k === 'plankton') {
      const rr = r * (1 + Math.sin(p.ph) * 0.2)
      ctx.shadowColor = K.col
      ctx.shadowBlur = 14
      ctx.fillStyle = K.col
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.6, 0, TAU); ctx.fill()
      ctx.globalAlpha *= 0.35
      ctx.beginPath(); ctx.arc(0, 0, rr * 1.4, 0, TAU); ctx.fill()
    } else {
      ctx.rotate(Math.atan2(p.vy, p.vx))
      if (p.k === 'gold') { ctx.shadowColor = K.col; ctx.shadowBlur = 16 }
      ctx.fillStyle = K.col
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, TAU); ctx.fill()
      const w = Math.sin(p.ph * 2) * r * 0.2
      ctx.beginPath(); ctx.moveTo(-r * 1.1, 0); ctx.lineTo(-r * 2, -r * 0.7 + w); ctx.lineTo(-r * 2, r * 0.7 + w); ctx.closePath(); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#0a1420'
      ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.15, Math.max(1.2, r * 0.16), 0, TAU); ctx.fill()
      if (p.k !== 'gold') {
        ctx.strokeStyle = K.col; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 2, -r * 0.8); ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 2, r * 0.6); ctx.stroke()
      }
    }
    ctx.restore()
  }

  function drawPred(p: Pred) {
    if (p.warn > 0) {
      const x = p.dir > 0 ? 28 : W - 28
      ctx.save()
      ctx.globalAlpha = 0.6 + Math.sin(t * 12) * 0.4
      ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 16
      ctx.beginPath(); ctx.arc(x, p.y, 18, 0, TAU); ctx.fill()
      ctx.shadowBlur = 0; ctx.fillStyle = '#1a1200'
      ctx.font = '700 24px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('!', x, p.y + 1)
      ctx.restore()
      return
    }
    const s = p.s / 230, wag = Math.sin(t * (p.hunt ? 9 : 5)) * 7, rim = 'rgba(150,190,225,.28)', fin = '#1a2632'
    ctx.save()
    ctx.translate(p.x, p.y); ctx.scale(p.dir * s, s)
    ctx.lineWidth = 1.5 / s; ctx.strokeStyle = rim; ctx.lineJoin = 'round'
    // far-side pectoral fin
    ctx.fillStyle = '#121b24'
    ctx.beginPath(); ctx.moveTo(34, 14); ctx.lineTo(16, 38); ctx.quadraticCurveTo(22, 26, 26, 15); ctx.closePath(); ctx.fill()
    // tail, upper lobe taller
    ctx.fillStyle = fin
    ctx.beginPath(); ctx.moveTo(-86, -5); ctx.lineTo(-128, -48 + wag); ctx.quadraticCurveTo(-112, -14 + wag * 0.5, -104, 0)
    ctx.lineTo(-121, 26 + wag); ctx.quadraticCurveTo(-103, 12, -86, 5); ctx.closePath(); ctx.fill(); ctx.stroke()
    // dorsal fins
    ctx.beginPath(); ctx.moveTo(12, -22); ctx.quadraticCurveTo(-4, -36, -16, -60); ctx.quadraticCurveTo(-20, -42, -32, -21); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-60, -13); ctx.lineTo(-71, -25); ctx.lineTo(-74, -10); ctx.closePath(); ctx.fill()
    // pelvic and anal fins
    ctx.beginPath(); ctx.moveTo(-36, 17); ctx.lineTo(-50, 30); ctx.lineTo(-52, 15); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(-64, 11); ctx.lineTo(-72, 20); ctx.lineTo(-75, 9); ctx.closePath(); ctx.fill()
    // body with countershading
    const g = ctx.createLinearGradient(0, -25, 0, 21)
    g.addColorStop(0, '#16212c'); g.addColorStop(0.55, '#24323f'); g.addColorStop(1, '#56677a')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(101, 3); ctx.bezierCurveTo(94, -12, 62, -23, 20, -24); ctx.bezierCurveTo(-20, -25, -60, -16, -88, -5)
    ctx.lineTo(-88, 5); ctx.bezierCurveTo(-60, 14, -20, 21, 20, 21); ctx.bezierCurveTo(56, 21, 86, 15, 101, 3); ctx.closePath(); ctx.fill(); ctx.stroke()
    // keel and gill slits
    ctx.strokeStyle = 'rgba(10,16,22,.55)'; ctx.lineWidth = 1.6 / s
    ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-88, 0); ctx.stroke()
    for (let i = 0; i < 5; i++) {
      const x = 56 - i * 4.5
      ctx.beginPath(); ctx.moveTo(x, -8 + i * 0.6); ctx.quadraticCurveTo(x - 3, 2, x - 1, 10); ctx.stroke()
    }
    // underslung mouth, opens on the lunge
    const o = p.open
    if (o > 0.05) {
      ctx.fillStyle = '#07090d'
      ctx.beginPath(); ctx.moveTo(96, 6); ctx.quadraticCurveTo(80, 6 + o * 4, 62, 12); ctx.quadraticCurveTo(80, 12 + o * 20, 94, 9 + o * 14); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(230,235,240,.75)'
      for (let i = 0; i < 5; i++) {
        const x = 90 - i * 5.5, y = 6.5 + i * 0.9 + o * 1.5
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1.6, y + 3 * o); ctx.lineTo(x - 3.2, y); ctx.fill()
      }
    } else {
      ctx.beginPath(); ctx.moveTo(94, 7); ctx.quadraticCurveTo(80, 10, 64, 12); ctx.stroke()
    }
    // near-side pectoral fin
    ctx.fillStyle = fin; ctx.strokeStyle = rim; ctx.lineWidth = 1.5 / s
    ctx.beginPath(); ctx.moveTo(42, 13); ctx.lineTo(12, 46); ctx.quadraticCurveTo(22, 30, 26, 16); ctx.closePath(); ctx.fill(); ctx.stroke()
    // eye
    ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.ellipse(76, -7, 3.4, 2.8, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = 'rgba(210,230,255,.85)'; ctx.beginPath(); ctx.arc(77, -8, 1, 0, TAU); ctx.fill()
    ctx.restore()
  }

  function drawShark() {
    if (sharkScale <= 0.01) return
    const sc = (size() / 80) * sharkScale
    ctx.save()
    ctx.translate(shark.x, shark.y); ctx.rotate(shark.tilt); ctx.scale(shark.dir * sc, sc); ctx.translate(0, Math.sin(t * 3) * 2)
    const wag = Math.sin(t * 8) * 3
    ctx.fillStyle = '#6f7b88'
    ctx.beginPath(); ctx.moveTo(-36, -3); ctx.lineTo(-56, -17 + wag); ctx.quadraticCurveTo(-50, -2, -55, 9 + wag); ctx.lineTo(-36, 4); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(-2, -13); ctx.quadraticCurveTo(-8, -25, -15, -11); ctx.fill()
    ctx.beginPath(); ctx.moveTo(-20, -9); ctx.quadraticCurveTo(-25, -19, -30, -6); ctx.fill()
    const bg = ctx.createLinearGradient(0, -16, 0, 16)
    bg.addColorStop(0, '#aeb9c4'); bg.addColorStop(1, '#64707d')
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.moveTo(33, 1); ctx.bezierCurveTo(33, -14, 16, -17, -2, -14); ctx.bezierCurveTo(-18, -11, -30, -6, -40, -3)
    ctx.lineTo(-40, 4); ctx.bezierCurveTo(-30, 8, -16, 14, 0, 15); ctx.bezierCurveTo(18, 16, 33, 14, 33, 1); ctx.fill()
    ctx.fillStyle = 'rgba(228,238,248,.55)'
    for (const [x, y] of [[6, -11], [-6, -10], [-17, -7], [-27, -4], [0, -6], [-12, -4]]) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill() }
    ctx.strokeStyle = 'rgba(40,50,60,.6)'; ctx.lineWidth = 1.2
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(11 - i * 3.5, -3); ctx.lineTo(10 - i * 3.5, 5); ctx.stroke() }
    ctx.save()
    ctx.shadowColor = '#7dff9a'; ctx.shadowBlur = 6 + gI * 26; ctx.fillStyle = `rgba(125,255,154,${0.35 + gI * 0.65})`
    ctx.beginPath(); ctx.ellipse(1, 8, 4.5, 2.4, -0.2, 0, TAU); ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#7a8693'
    ctx.beginPath(); ctx.moveTo(8, 10); ctx.quadraticCurveTo(4, 24, -4, 17); ctx.quadraticCurveTo(-1, 12, 8, 10); ctx.fill()
    ctx.fillStyle = '#0b1118'; ctx.beginPath(); ctx.arc(21, -4, 3.4, 0, TAU); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(22.2, -5.2, 1.1, 0, TAU); ctx.fill()
    if (mouth > 0.05) { ctx.fillStyle = '#2a1a22'; ctx.beginPath(); ctx.ellipse(27, 6, 3, 1 + mouth * 3, 0, 0, TAU); ctx.fill() }
    else { ctx.strokeStyle = '#2a333d'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(26, 4, 3.5, 0.3, 1.6); ctx.stroke() }
    ctx.restore()
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#0b2742'); g.addColorStop(0.5, '#06172b'); g.addColorStop(1, '#020812')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = '#bfe3ff'
    for (let i = 0; i < 4; i++) {
      const x = W * (0.12 + i * 0.26) + Math.sin(t * 0.3 + i) * 20
      ctx.beginPath(); ctx.moveTo(x - 20, 0); ctx.lineTo(x + 20, 0); ctx.lineTo(x + 100, H * 0.75); ctx.lineTo(x - 10, H * 0.75); ctx.fill()
    }
    ctx.restore()
    for (const s of snow) { ctx.fillStyle = `rgba(200,225,255,${s.a})`; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TAU); ctx.fill() }
    ctx.fillStyle = '#030d1a'; ctx.beginPath(); ctx.moveTo(0, H)
    for (let x = 0; x <= W + 40; x += 40) ctx.lineTo(x, H - 20 - Math.sin(x * 0.02) * 10 - Math.sin(x * 0.007) * 14)
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill()
    if (gI > 0.01) {
      const R = lureR() * (0.4 + 0.6 * gI), h = ctx.createRadialGradient(shark.x, shark.y, 0, shark.x, shark.y, R)
      h.addColorStop(0, `rgba(125,255,154,${0.32 * gI})`); h.addColorStop(0.5, `rgba(125,255,154,${0.1 * gI})`); h.addColorStop(1, 'rgba(125,255,154,0)')
      ctx.fillStyle = h; ctx.beginPath(); ctx.arc(shark.x, shark.y, R, 0, TAU); ctx.fill()
    }
    for (const p of prey) drawPrey(p)
    drawShark()
    if (pred) drawPred(pred)
    for (const q of parts) { ctx.globalAlpha = Math.max(0, q.l / 0.6); ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, TAU); ctx.fill() }
    ctx.globalAlpha = 1
    ctx.font = '700 18px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const fl of floats) { ctx.globalAlpha = Math.max(0, fl.l); ctx.fillStyle = fl.c; ctx.fillText(fl.txt, fl.x, fl.y) }
    ctx.globalAlpha = 1
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,4,10,.5)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    if (flash > 0) { ctx.fillStyle = `rgba(255,80,120,${flash * 0.22})`; ctx.fillRect(0, 0, W, H) }
  }

  // ---- input ----
  const setPtr = (e: PointerEvent) => {
    const r = tank.getBoundingClientRect()
    ptr.x = Math.max(0, Math.min(W, e.clientX - r.left))
    ptr.y = Math.max(0, Math.min(H, e.clientY - r.top + (e.pointerType === 'touch' ? -50 : 0)))
  }
  const onUi = (e: Event) => (e.target as Element | null)?.closest?.('[data-gg-ui]') != null
  const onDown = (e: PointerEvent) => {
    if (state !== 'play' || onUi(e)) return
    e.preventDefault()
    setPtr(e)
    // Mouse: hold to glow. Touch/pen: dragging only swims; the Glow button lights up.
    ptr.down = e.pointerType === 'mouse'
    try { tank.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  const onMove = (e: PointerEvent) => { if (state === 'play' && !onUi(e)) setPtr(e) }
  const onUp = () => { ptr.down = false }
  const onCtx = (e: Event) => e.preventDefault()
  const onKeyDown = (e: KeyboardEvent) => {
    if (state !== 'play') return
    if (e.code === 'Space') { ptr.key = true; e.preventDefault() }
    if (e.code.startsWith('Arrow')) { keys[e.code] = true; e.preventDefault() }
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') ptr.key = false
    keys[e.code] = false
  }
  const onVis = () => { ptr.down = ptr.key = false; releaseButton() }
  tank.addEventListener('pointerdown', onDown)
  tank.addEventListener('pointermove', onMove)
  tank.addEventListener('pointerup', onUp)
  tank.addEventListener('pointercancel', onUp)
  tank.addEventListener('lostpointercapture', onUp)
  tank.addEventListener('contextmenu', onCtx)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', onVis)

  let raf = 0, last = performance.now()
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    update(dt)
    draw()
    hooks.onHud({ score, time: Math.ceil(timeLeft), glow })
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  return {
    start() {
      try {
        ac = ac || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        if (ac.state === 'suspended') void ac.resume()
      } catch { ac = null }
      score = 0; eaten = 0; timeLeft = GAME_SECONDS; glow = 100; pred = null; nextPred = rnd(7, 10); parts = []; floats = []
      prey = Array.from({ length: target() }, () => spawn(false)).filter((p) => Math.hypot(p.x - W / 2, p.y - H / 2) > 120)
      shark.x = W / 2; shark.y = H / 2; ptr.x = W / 2; ptr.y = H / 2; ptr.down = ptr.key = ptr.btn = false
      sharkScale = 1; caughtT = 0
      state = 'play'
      tank.focus({ preventScroll: true })
    },
    setSound(on) { soundOn = on },
    setGlowButton(on) {
      ptr.btn = on && state === 'play' && glow > 1
      return ptr.btn
    },
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      tank.removeEventListener('pointerdown', onDown)
      tank.removeEventListener('pointermove', onMove)
      tank.removeEventListener('pointerup', onUp)
      tank.removeEventListener('pointercancel', onUp)
      tank.removeEventListener('lostpointercapture', onUp)
      tank.removeEventListener('contextmenu', onCtx)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onVis)
      void ac?.close().catch(() => {})
    },
  }
}
