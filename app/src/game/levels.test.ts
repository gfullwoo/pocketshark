import { describe, expect, it } from 'vitest'
import { LEVELS, LEVEL_COUNT, difficultyFor, goalFor, level, playable } from './levels'

describe('levels', () => {
  it('has 20 places in one ocean, each with its own friend', () => {
    expect(LEVELS).toHaveLength(LEVEL_COUNT)
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(20)
    expect(new Set(LEVELS.map((l) => l.friend.name)).size).toBe(20)
  })

  it('level 1 needs 150 points and every level needs more than the last', () => {
    expect(goalFor(1)).toBe(150)
    expect(goalFor(2)).toBe(180)
    for (let n = 2; n <= 20; n++) expect(goalFor(n)).toBeGreaterThan(goalFor(n - 1))
  })

  it('gets harder every level', () => {
    for (let n = 2; n <= 20; n++) {
      const a = difficultyFor(n - 1), b = difficultyFor(n)
      expect(b.predGap[1]).toBeLessThanOrEqual(a.predGap[1])
      expect(b.predSpeed).toBeGreaterThanOrEqual(a.predSpeed)
      expect(b.preySpeed).toBeGreaterThanOrEqual(a.preySpeed)
      expect(b.subGap[1]).toBeLessThanOrEqual(a.subGap[1])
    }
    const l2 = difficultyFor(2)
    expect(l2.predSpeed).toBeGreaterThan(1)
    expect(l2.predGap[1]).toBeLessThan(12)
  })

  it('levels 1 to 4 are built; the rest are coming soon', () => {
    expect(playable(1)).toBe(true)
    expect(playable(2)).toBe(true)
    expect(playable(3)).toBe(true)
    expect(level(3).look!.eels).toBe(true)
    expect(playable(4)).toBe(true)
    expect(level(4).name).toBe('Coral Gardens')
    expect(playable(5)).toBe(false)
    expect(level(99).n).toBe(20)
  })
})
