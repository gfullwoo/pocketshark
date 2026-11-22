import { describe, expect, it, vi } from 'vitest'
import { hitCircles, touches, type Pred, type PredKind } from './predators'
import { World } from './world'
import { subLamp } from './submarine'
import { PLAYER_LOOK } from './pocketShark'

const W = 390, H = 844

function makeWorld() {
  const w = new World()
  w.resize(W, H, 150)
  return w
}
const hooks = () => ({ onEat: vi.fn(), onScare: vi.fn(), onDodge: vi.fn(), onToast: vi.fn() })

function pred(kind: PredKind, x: number, y: number, extra: Partial<Pred> = {}): Pred {
  return { kind, x, y, dir: 1, ang: 0, s: kind === 'shark' ? 334 : kind === 'squid' ? 183 : 116, warn: 0, hunt: false, open: 0, minD: 1e9, done: false, ph: 0, entered: true, ...extra }
}

/** Put the pocket shark so that its body overlaps the given point. */
function placeShark(w: World, x: number, y: number) {
  w.shark.x = x
  w.shark.y = y
}

describe('predator hitboxes cover the whole body', () => {
  it('the big shark tail tip, dorsal fin and snout all count', () => {
    const p = pred('shark', 200, 300)
    const sc = p.s / 230
    for (const [lx, ly] of [[-118, -38], [-14, -40], [95, 3]]) {
      const pt = [{ x: 200 + lx * sc, y: 300 + ly * sc, r: 2 }]
      expect(touches(hitCircles(p), pt), `point ${lx},${ly}`).toBe(true)
    }
    expect(touches(hitCircles(p), [{ x: 200, y: 300 - 80 * sc, r: 2 }])).toBe(false) // above the body
  })

  it('a squid tentacle tip and a crab claw count, open water does not', () => {
    const sq = pred('squid', 200, 300)
    const sc = sq.s / 200
    expect(touches(hitCircles(sq), [{ x: 200 - 98 * sc, y: 300 + 16 * sc, r: 2 }])).toBe(true)
    const cr = pred('crab', 200, 600)
    const cs = cr.s / 120
    expect(touches(hitCircles(cr), [{ x: 200 + 60 * cs, y: 600 - 30 * cs, r: 2 }])).toBe(true)
    expect(touches(hitCircles(cr), [{ x: 200, y: 600 - 120 * cs, r: 2 }])).toBe(false)
  })

  it('squid hitboxes turn with the squid', () => {
    const sq = pred('squid', 200, 300, { ang: Math.PI / 2 }) // swimming straight down
    const tip = hitCircles(sq)[0]
    expect(Math.abs(tip.x - 200)).toBeLessThan(1)
    expect(tip.y).toBeGreaterThan(300)
  })
})

describe('touching a predator anywhere is a catch', () => {
  it.each(['shark', 'squid', 'crab'] as PredKind[])('%s: brushing its edge scares the shark home', (kind) => {
    const w = makeWorld(), h = hooks()
    const p = pred(kind, 250, kind === 'crab' ? 600 : 350)
    w.pred = p
    const edge = hitCircles(p).reduce((a, b) => (b.x < a.x ? b : a)) // its left-most part
    placeShark(w, edge.x - edge.r - w.size() * 0.15, edge.y)
    w.update(1 / 60, true, false, h)
    expect(h.onScare).toHaveBeenCalledTimes(1)
    expect(p.done).toBe(true)
    // one catch per pass, even if still touching
    w.update(1 / 60, true, false, h)
    expect(h.onScare).toHaveBeenCalledTimes(1)
  })

  it('a dark shark that never touches it is not caught', () => {
    const w = makeWorld(), h = hooks()
    w.pred = pred('shark', 250, 200)
    placeShark(w, 250, 520)
    w.update(1 / 60, true, false, h)
    expect(h.onScare).not.toHaveBeenCalled()
  })

  it('home is safe', () => {
    const w = makeWorld(), h = hooks()
    const home = w.home()
    placeShark(w, home.x, home.y)
    w.pred = pred('crab', home.x, home.y)
    w.update(1 / 60, true, false, h)
    expect(w.atHome()).toBe(true)
    expect(h.onScare).not.toHaveBeenCalled()
  })
})

describe('controls', () => {
  it('the joystick moves the shark and glow only shines while held', () => {
    const w = makeWorld(), h = hooks()
    placeShark(w, 200, 300)
    w.setStick(1, 0)
    for (let i = 0; i < 30; i++) w.update(1 / 60, true, false, h)
    expect(w.shark.x).toBeGreaterThan(260)
    expect(w.shark.dir).toBe(1)
    w.glowHeld = true
    w.update(1 / 60, true, false, h)
    expect(w.glowOn).toBe(true)
    w.glowHeld = false
    w.update(1 / 60, true, false, h)
    expect(w.glowOn).toBe(false)
  })
})

describe('eating', () => {
  it('a snack slides into the mouth, then counts', () => {
    const w = makeWorld(), h = hooks()
    placeShark(w, 200, 300)
    const m = w.mouthPos()
    // drop a single shrimp right in front of the mouth
    ;(w as unknown as { prey: unknown[] }).prey = [{ k: 'shrimp', x: m.x + 6, y: m.y, a: 0, vx: 0, vy: 0, ph: 0, lit: 0, variant: 1 }]
    w.update(1 / 60, false, false, h)
    expect(h.onEat).not.toHaveBeenCalled() // still on its way in
    for (let i = 0; i < 20; i++) w.update(1 / 60, false, false, h)
    expect(h.onEat).toHaveBeenCalledWith('shrimp', expect.any(Number), expect.any(Number))
    const [, ex, ey] = h.onEat.mock.calls[0]
    expect(Math.hypot(ex - w.mouthPos().x, ey - w.mouthPos().y)).toBeLessThan(2) // eaten at the mouth
  })
})

describe('crab', () => {
  function crabUnder(w: World, x: number) {
    const p = w.spawnPredator('crab')
    p.warn = 0; p.entered = true; p.x = x; p.dir = 1
    w.pred = p
    return p
  }
  const run = (w: World, h: ReturnType<typeof hooks>, seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) w.update(1 / 60, true, false, h)
  }

  it('crouches, then leaps up and grabs a shark swimming low above it', () => {
    const w = makeWorld(), h = hooks()
    const crab = crabUnder(w, 230)
    const sharkY = crab.y - w.crabReach() * 0.6
    const states = new Set<string>()
    for (let i = 0; i < 120 && !h.onScare.mock.calls.length; i++) {
      placeShark(w, 240, sharkY) // the shark hovers in place
      w.update(1 / 60, true, false, h)
      states.add(crab.crab!.state)
    }
    expect(states.has('crouch')).toBe(true)
    expect(states.has('air')).toBe(true)
    expect(h.onScare).toHaveBeenCalledTimes(1)
    expect(h.onToast).not.toHaveBeenCalledWith('The crab is about to jump!', expect.any(String))
  })

  it('cannot reach a shark staying high in the water', () => {
    const w = makeWorld(), h = hooks()
    const crab = crabUnder(w, 230)
    placeShark(w, 240, crab.y - w.crabReach() - w.size())
    run(w, h, 2)
    expect(crab.crab!.state).toBe('walk')
    expect(h.onScare).not.toHaveBeenCalled()
  })

  it('lands back on the seabed and walks on after a miss', () => {
    const w = makeWorld(), h = hooks()
    const crab = crabUnder(w, 230)
    placeShark(w, 240, crab.y - w.crabReach() * 0.6)
    run(w, h, 0.45) // crouched, about to leap
    placeShark(w, 30, 120) // the shark darts away up and to the side
    run(w, h, 3)
    expect(h.onScare).not.toHaveBeenCalled()
    expect(['walk', 'cool']).toContain(crab.crab!.state)
  })
})

describe('squid', () => {
  function squidAt(w: World, x: number, y: number, ang = 0) {
    const p = w.spawnPredator('squid')
    p.warn = 0; p.entered = true; p.x = x; p.y = y; p.ang = ang
    w.pred = p
    return p
  }

  it('turns, winds up, and grabs with its tentacles from well beyond its body', () => {
    const w = makeWorld(), h = hooks()
    const sq = squidAt(w, 120, 300, 0) // swimming right; arms point left
    const far = w.squidReach(sq) * 0.8 // much further than the body or arms reach
    const sharkX = 120 + far
    const states = new Set<string>()
    for (let i = 0; i < 120 && !h.onScare.mock.calls.length; i++) {
      placeShark(w, sharkX, 300) // the shark hovers in place
      w.update(1 / 60, true, false, h)
      states.add(sq.squid!.state)
    }
    expect(states.has('aim')).toBe(true)
    expect(states.has('strike')).toBe(true)
    expect(h.onScare).toHaveBeenCalledTimes(1)
    expect(h.onToast).not.toHaveBeenCalledWith('The squid is striking!', expect.any(String))
  })

  it('misses a shark that darts out of reach during the wind-up', () => {
    const w = makeWorld(), h = hooks()
    const sq = squidAt(w, 120, 300, 0)
    placeShark(w, 120 + w.squidReach(sq) * 0.8, 300)
    for (let i = 0; i < 30 && sq.squid!.state !== 'aim'; i++) w.update(1 / 60, true, false, h)
    expect(sq.squid!.state).toBe('aim')
    for (let i = 0; i < 90; i++) {
      placeShark(w, Math.min(370, sq.x + w.squidReach(sq) * 1.5), 120) // well out of reach
      w.update(1 / 60, true, false, h)
    }
    expect(h.onScare).not.toHaveBeenCalled()
  })

  it('a relaxed tentacle is shorter than a thrown one', () => {
    const w = makeWorld()
    const sq = squidAt(w, 200, 300, 0)
    const tipX = () => Math.min(...hitCircles(sq).map((c) => c.x - c.r))
    sq.squid!.e = 0
    const relaxed = tipX()
    sq.squid!.e = 1
    expect(tipX()).toBeLessThan(relaxed - 100)
  })
})

describe('harder snacks and more predators', () => {
  it('lured snacks circle out of reach: a shark sitting still with its glow on catches almost nothing', () => {
    const w = makeWorld(), h = hooks()
    w.glowHeld = true
    placeShark(w, W / 2, H * 0.3)
    for (let i = 0; i < 4 * 60; i++) { w.shark.x = W / 2; w.shark.y = H * 0.3; w.update(1 / 60, true, false, h) }
    expect(h.onEat.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it('the first predator shows up within about 5 seconds', () => {
    const w = makeWorld(), h = hooks()
    let t = 0
    while (!w.pred && t < 6) { w.update(1 / 30, true, false, h); t += 1 / 30 }
    expect(w.pred).toBeTruthy()
    expect(t).toBeLessThan(5.5)
  })
})

describe('predators from the background', () => {
  it.each(['shark', 'squid'] as const)('%s starts small, grows as it nears home, then leaves left or right', (kind) => {
    const w = makeWorld(), h = hooks()
    const p = w.spawnFromBackground(kind)
    w.pred = p
    const full = p.deep!.fullS
    expect(p.s).toBeLessThan(full * 0.2)
    // far away it passes right through the pocket shark without touching it
    placeShark(w, p.x, p.y)
    w.update(1 / 60, true, false, h)
    expect(h.onScare).not.toHaveBeenCalled()
    let t = 0
    while (w.pred?.deep && t < 6) { placeShark(w, W - 20, 40); w.update(1 / 30, true, false, h); t += 1 / 30 }
    expect(w.pred?.deep).toBeUndefined()
    expect(w.pred!.s).toBeCloseTo(full)
    const home = w.home()
    expect(Math.abs(w.pred!.x - home.x)).toBeLessThan(W * 0.6)
    while (w.pred && t < 20) { placeShark(w, W - 20, 40); w.update(1 / 30, true, false, h); t += 1 / 30 }
    expect(w.pred).toBeNull()
  })

  it('never shows a warning toast when a predator arrives', () => {
    const w = makeWorld(), h = hooks()
    for (let i = 0; i < 30 * 30; i++) w.update(1 / 30, false, false, h)
    for (const [msg] of h.onToast.mock.calls) expect(String(msg)).not.toMatch(/coming|sees|about to|striking|scuttling/i)
  })
})

describe('getting hurt', () => {
  it('runs back to the cave, stays sad and scared there for a couple of seconds, then the player has control again', () => {
    const w = makeWorld(), h = hooks()
    const p = pred('shark', W * 0.7, 300)
    w.pred = p
    const c = hitCircles(p)[0]
    placeShark(w, c.x, c.y)
    w.update(1 / 60, true, false, h)
    expect(h.onScare).toHaveBeenCalledTimes(1)
    expect(w.scared).toBe(true)
    w.pred = null
    // the joystick and glow don't work while it runs home
    w.setStick(1, 0)
    w.glowHeld = true
    let t = 0
    while (!w.atHome() && t < 6) { w.update(1 / 60, true, false, h); t += 1 / 60 }
    expect(w.atHome()).toBe(true)
    expect(w.glowOn).toBe(false)
    // hides in the cave, scared, for about 2.5 seconds
    let hid = 0
    while (w.scared && hid < 6) { w.setStick(1, 0); w.update(1 / 60, true, false, h); hid += 1 / 60 }
    expect(hid).toBeGreaterThan(2)
    expect(hid).toBeLessThan(3.5)
    expect(w.atHome()).toBe(true)
    // then it's the player's shark again
    w.setStick(1, 0)
    for (let i = 0; i < 60; i++) w.update(1 / 60, true, false, h)
    expect(w.atHome()).toBe(false)
  })
})

describe('research submarine', () => {
  const capHooks = () => ({ ...hooks(), onCaptured: vi.fn() })
  function withSub(w: World) {
    w.pred = null
    w.nextSub = 0
    w.update(1 / 60, true, false, capHooks())
    expect(w.sub).toBeTruthy()
    expect(w.danger).toBe(true)
    return w.sub!
  }

  it('catches a shark that stays in the spotlight, pulls it up, then ends the game', () => {
    const w = makeWorld(), h = capHooks()
    const sb = withSub(w)
    sb.x = W / 2
    sb.beam = Math.PI / 2 // straight down
    const lamp = subLamp(sb)
    let t = 0
    while (!w.capture && t < 2) { placeShark(w, lamp.x, lamp.y + 150); sb.x = W / 2; w.update(1 / 60, true, false, h); t += 1 / 60 }
    expect(w.capture).toBeTruthy()
    expect(t).toBeLessThan(0.8)
    for (let i = 0; i < 120; i++) w.update(1 / 60, true, false, h)
    expect(h.onCaptured).toHaveBeenCalledTimes(1)
    w.release()
    expect(w.capture).toBeNull()
    expect(w.sub).toBeNull()
    expect(w.atHome()).toBe(true)
  })

  it('a quick pass through the edge of the beam is not a catch', () => {
    const w = makeWorld(), h = capHooks()
    const sb = withSub(w)
    sb.x = W / 2; sb.beam = Math.PI / 2
    const lamp = subLamp(sb)
    for (let i = 0; i < 12; i++) { placeShark(w, lamp.x, lamp.y + 150); sb.x = W / 2; w.update(1 / 60, true, false, h) }
    for (let i = 0; i < 60; i++) { placeShark(w, 20, 20); w.update(1 / 60, true, false, h) }
    expect(w.capture).toBeNull()
  })

  it('the cave is always safe from the spotlight', () => {
    const w = makeWorld(), h = capHooks()
    const sb = withSub(w)
    const home = w.home()
    for (let i = 0; i < 180; i++) {
      placeShark(w, home.x, home.y)
      const l = subLamp(sb)
      sb.beam = Math.atan2(home.y - l.y, home.x - l.x)
      w.update(1 / 60, true, false, h)
    }
    expect(w.capture).toBeNull()
  })

  it('a glowing shark draws the beam toward it', () => {
    const w = makeWorld(), h = capHooks()
    const sb = withSub(w)
    sb.x = W / 2; sb.beam = Math.PI / 2 - 0.7
    w.glowHeld = true
    const target = { x: W * 0.75, y: w.SH * 0.6 }
    for (let i = 0; i < 40; i++) { placeShark(w, target.x, target.y); sb.x = W / 2; w.update(1 / 60, true, false, h) }
    expect(sb.hunt).toBe(true)
    const l = subLamp(sb)
    const want = Math.atan2(target.y - l.y, target.x - l.x)
    expect(Math.abs(sb.beam - want)).toBeLessThan(0.7)
  })

  it('crosses the screen and leaves, and no new predators come while it is here', () => {
    const w = makeWorld(), h = capHooks()
    withSub(w)
    let t = 0
    while (w.sub && t < 30) { placeShark(w, w.home().x, w.home().y); w.update(1 / 30, true, false, h); t += 1 / 30; if (w.sub) expect(w.pred).toBeNull() }
    expect(w.sub).toBeNull()
    expect(w.danger).toBe(false)
    expect(t).toBeGreaterThan(6)
  })
})

describe('levels and friends', () => {
  it('level 2 is harder: predators come sooner and swim faster', () => {
    const run = (n: number) => {
      const w = makeWorld(), h = hooks()
      w.setLevel(n)
      const p = w.spawnPredator('shark')
      w.pred = p
      const x0 = p.x
      placeShark(w, W / 2, 20)
      w.update(0.1, false, false, h)
      return Math.abs(w.pred!.x - x0)
    }
    expect(run(2)).toBeGreaterThan(run(1) * 1.05)
  })

  it('a friend swims in, they meet with hearts, and no predators come meanwhile', () => {
    const w = makeWorld(), h = { ...hooks(), onFriendMet: vi.fn() }
    w.pred = null
    placeShark(w, W * 0.3, w.SH * 0.5)
    w.summonFriend(PLAYER_LOOK)
    let t = 0
    while (!w.friend!.met && t < 8) { w.update(1 / 30, false, false, h); t += 1 / 30 }
    expect(w.friend!.met).toBe(true)
    expect(h.onFriendMet).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 30 * 20; i++) w.update(1 / 30, false, false, h)
    expect(w.pred).toBeNull()
    expect(w.sub).toBeNull()
    // the friend stays close by
    expect(Math.hypot(w.friend!.x - w.shark.x, w.friend!.y - w.shark.y)).toBeLessThan(w.size() * 2)
  })

  it('setting a level clears the friend and calm', () => {
    const w = makeWorld()
    w.summonFriend(PLAYER_LOOK)
    w.setLevel(2)
    expect(w.friend).toBeNull()
    expect(w.calm).toBe(false)
    expect(w.look.kelp.extra).toBeGreaterThan(0)
  })
})
