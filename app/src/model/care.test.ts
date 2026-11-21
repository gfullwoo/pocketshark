import { describe, expect, it } from 'vitest'
import { RULES, catchUp, checkIn, dodge, eat, migrate, mood, newShark, scare, tick } from './care'

const T0 = new Date(2026, 10, 21, 9, 0).getTime()
const HOUR = 3600_000

describe('mood', () => {
  it('follows health', () => {
    const s = newShark(T0)
    s.health = 80
    expect(mood(s)).toBe('happy')
    s.health = 50
    expect(mood(s)).toBe('content')
    s.health = 20
    expect(mood(s)).toBe('hungry')
  })
})

describe('glow', () => {
  it('drains 50% faster than before (15/s) and refills 75% slower', () => {
    const s = newShark(T0)
    tick(s, 2, { atHome: false, glowing: true })
    expect(s.glow).toBe(70)
    tick(s, 4, { atHome: true, glowing: false })
    expect(s.glow).toBe(74) // 1/s at home (was 4)
    tick(s, 4, { atHome: false, glowing: false })
    expect(s.glow).toBeCloseTo(75.5) // 0.375/s out (was 1.5)
    s.glow = 10
    eat(s, 'plankton')
    expect(s.glow).toBe(17.5) // +7.5 (was +30)
  })
})

describe('health', () => {
  it('wears down out in the reef and only comes back from resting in the cave (or eating)', () => {
    const a = newShark(T0), b = newShark(T0)
    a.health = b.health = 50
    tick(a, 10, { atHome: false, glowing: false })
    tick(b, 10, { atHome: true, glowing: false })
    expect(a.health).toBeCloseTo(47.5)
    expect(b.health).toBeCloseTo(56)
  })

  it('snacks restore health and pay Glow Points', () => {
    const s = newShark(T0)
    s.health = 50
    expect(eat(s, 'shrimp')).toBe(3)
    expect(s.health).toBe(58)
    expect(eat(s, 'gold')).toBe(10)
    expect(s.health).toBe(78)
    expect(s.stats.eaten).toBe(2)
  })

  it('a predator catch takes a big bite, but never kills: the shark rests, then wakes', () => {
    const s = newShark(T0)
    s.health = 15
    scare(s)
    expect(s.health).toBe(0)
    expect(mood(s)).toBe('resting')
    let t = 0
    while (s.resting && t < 500) { tick(s, 1, { atHome: false, glowing: true }); t++ }
    expect(s.resting).toBe(false)
    expect(s.health).toBeGreaterThanOrEqual(RULES.wakeAt)
    expect(t).toBeLessThanOrEqual(101) // under two minutes of rest
  })

  it('pays 5 GP for each hour spent happy', () => {
    const s = newShark(T0)
    for (let i = 0; i < 3600; i++) {
      s.health = 100
      tick(s, 1, { atHome: true, glowing: false })
    }
    expect(s.gp).toBe(5)
  })

  it('rewards dodging a predator', () => {
    const s = newShark(T0)
    expect(dodge(s)).toBe(5)
    expect(s.stats.dodges).toBe(1)
  })
})

describe('away', () => {
  it('health wears down but never below the floor, and glow refills', () => {
    const s = newShark(T0)
    s.health = 60; s.glow = 0
    const sum = catchUp(s, T0 + 20 * HOUR)
    expect(s.health).toBe(RULES.offline.healthFloor)
    expect(s.glow).toBe(100)
    expect(sum.seconds).toBe(20 * 3600)
  })

  it('caps catch-up at 72 hours', () => {
    const s = newShark(T0)
    expect(catchUp(s, T0 + 30 * 24 * HOUR).seconds).toBe(72 * 3600)
  })

  it('does not push health that is already below the floor further down', () => {
    const s = newShark(T0)
    s.health = 10
    catchUp(s, T0 + 10 * HOUR)
    expect(s.health).toBe(10)
  })

  it('wakes a resting shark while away', () => {
    const s = newShark(T0)
    s.resting = true; s.health = 0
    catchUp(s, T0 + 3 * HOUR)
    expect(s.resting).toBe(false)
  })

  it('gives the daily check-in bonus once per day', () => {
    const s = newShark(T0)
    expect(checkIn(s, T0)).toBe(10)
    expect(checkIn(s, T0 + HOUR)).toBe(0)
    expect(checkIn(s, T0 + 24 * HOUR)).toBe(10)
  })
})

describe('saved games from the earlier version', () => {
  it('drops fullness and safety and keeps health, glow and points', () => {
    const old = { v: 1, fullness: 30, glow: 55, safety: 80, health: 90, gp: 42, resting: false, lastSeen: T0, lastCheckIn: '2026-11-21', happySeconds: 10, stats: { eaten: 3, dodges: 1, scares: 0 } }
    const s = migrate(old, T0)!
    expect(s.v).toBe(2)
    expect(s.gp).toBe(42)
    expect(s.glow).toBe(55)
    expect(s.health).toBe(40) // a hungry old shark starts lower, not at full health
    expect('fullness' in s).toBe(false)
    expect(migrate({ nope: true }, T0)).toBeNull()
  })
})
