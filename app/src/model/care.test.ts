import { describe, expect, it } from 'vitest'
import { RULES, catchUp, checkIn, dodge, eat, mood, newShark, scare, tick } from './care'

const T0 = new Date(2026, 10, 21, 9, 0).getTime()
const HOUR = 3600_000

describe('mood', () => {
  it('is happy when fed and safe, peckish when hungry', () => {
    const s = newShark(T0)
    s.fullness = 80; s.safety = 80
    expect(mood(s)).toBe('happy')
    s.fullness = 20
    expect(mood(s)).toBe('peckish')
    s.fullness = 50; s.safety = 20
    expect(mood(s)).toBe('uneasy')
  })
})

describe('playing', () => {
  it('glowing drains glow; home recharges it and restores safety', () => {
    const s = newShark(T0)
    tick(s, 5, { atHome: false, glowing: true })
    expect(s.glow).toBe(50)
    const safetyOut = s.safety
    tick(s, 5, { atHome: true, glowing: false })
    expect(s.glow).toBe(70)
    expect(s.safety).toBeGreaterThan(safetyOut)
  })

  it('snacks fill the shark and pay Glow Points', () => {
    const s = newShark(T0)
    s.fullness = 50
    expect(eat(s, 'shrimp')).toBe(3)
    expect(s.fullness).toBe(58)
    s.glow = 10
    expect(eat(s, 'plankton')).toBe(0)
    expect(s.glow).toBe(40)
    expect(s.stats.eaten).toBe(1)
  })

  it('a scare never kills: the shark rests, then wakes after recovering', () => {
    const s = newShark(T0)
    s.health = 5
    scare(s)
    expect(s.health).toBe(0)
    expect(mood(s)).toBe('resting')
    for (let i = 0; i < 200; i++) tick(s, 1, { atHome: false, glowing: true })
    expect(s.resting).toBe(false)
    expect(s.health).toBeGreaterThanOrEqual(RULES.wakeAt)
  })

  it('pays 5 GP for each hour spent happy', () => {
    const s = newShark(T0)
    s.fullness = 100; s.safety = 100
    for (let i = 0; i < 3600; i++) tick(s, 1, { atHome: true, glowing: false })
    expect(s.gp).toBe(5)
  })

  it('rewards dodging a predator', () => {
    const s = newShark(T0)
    expect(dodge(s)).toBe(5)
    expect(s.stats.dodges).toBe(1)
  })
})

describe('away', () => {
  it('gets hungrier but never below the floor, and comes home safe and recharged', () => {
    const s = newShark(T0)
    s.fullness = 40; s.glow = 0; s.safety = 10
    const sum = catchUp(s, T0 + 20 * HOUR)
    expect(s.fullness).toBe(RULES.offlineFloor.fullness)
    expect(s.glow).toBe(100)
    expect(s.safety).toBe(100)
    expect(s.health).toBeGreaterThanOrEqual(RULES.offlineFloor.health)
    expect(sum.seconds).toBe(20 * 3600)
  })

  it('caps catch-up at 72 hours', () => {
    const s = newShark(T0)
    expect(catchUp(s, T0 + 30 * 24 * HOUR).seconds).toBe(72 * 3600)
  })

  it('does not push a meter that is already below the floor further down', () => {
    const s = newShark(T0)
    s.fullness = 5; s.health = 10
    catchUp(s, T0 + 10 * HOUR)
    expect(s.fullness).toBe(5)
    expect(s.health).toBe(10)
  })

  it('wakes a resting shark while away', () => {
    const s = newShark(T0)
    s.resting = true; s.health = 0; s.fullness = 80
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
