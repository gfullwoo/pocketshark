import { describe, expect, it, vi } from 'vitest'
import { hitCircles, touches, type Pred, type PredKind } from './predators'
import { World } from './world'

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
    expect(h.onToast).toHaveBeenCalledWith('The crab is about to jump!', expect.any(String))
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
