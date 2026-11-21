import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { isValidNickname, randomNickname } from '../src/game/nicknames.js'
import { COUPON_ID, prizeCode } from '../src/game/routes.js'
import { maxScore, weekId, weekResetsAt } from '../src/game/rules.js'
import { MemoryGameStore } from '../src/game/store.js'

// Wed 2026-11-18 15:00 ET (20:00 UTC), in ISO week 47
const WED = Date.UTC(2026, 10, 18, 20)

function setup(start = WED) {
  let t = start
  const store = new MemoryGameStore()
  const coupons = {
    retrieve: vi.fn(async () => {
      throw Object.assign(new Error('missing'), { statusCode: 404 })
    }),
    create: vi.fn(async () => ({})),
  }
  const promotionCodes = { create: vi.fn(async () => ({})) }
  const app = createApp({
    stripe: {} as never,
    siteUrl: 'https://x.test',
    game: { store, stripe: { coupons, promotionCodes } as never, now: () => t },
  })
  const post = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  return {
    app, store, coupons, promotionCodes, post,
    advance: (ms: number) => { t += ms },
    async play(score: number, nickname?: string, seconds = 60) {
      const s = await (await post('/api/game/start', { nickname })).json()
      t += seconds * 1000
      const r = await post('/api/game/finish', { runId: s.runId, score })
      return { start: s, status: r.status, body: await r.json() }
    },
  }
}

describe('rules', () => {
  it('uses ISO weeks in Eastern time', () => {
    expect(weekId(new Date(WED))).toBe('2026-W47')
    // Sunday 23:30 ET is still the same week; Monday 00:30 ET is the next
    expect(weekId(new Date(Date.UTC(2026, 10, 23, 4, 30)))).toBe('2026-W47')
    expect(weekId(new Date(Date.UTC(2026, 10, 23, 5, 30)))).toBe('2026-W48')
    expect(weekId(new Date(Date.UTC(2027, 0, 1, 17)))).toBe('2026-W53')
  })
  it('resets Monday at midnight Eastern, in winter and summer', () => {
    expect(weekResetsAt(new Date(WED))).toBe(Date.UTC(2026, 10, 23, 5))
    expect(weekResetsAt(new Date(Date.UTC(2026, 6, 15, 16)))).toBe(Date.UTC(2026, 6, 20, 4))
  })
  it('caps scores by how long the run lasted', () => {
    expect(maxScore(60_000)).toBe(325)
    expect(maxScore(10_000)).toBe(75)
  })
})

describe('nicknames', () => {
  it('only accepts generated names', () => {
    for (let i = 0; i < 50; i++) expect(isValidNickname(randomNickname())).toBe(true)
    expect(isValidNickname('Emma Smith')).toBe(false)
    expect(isValidNickname('Glowy Krill 7')).toBe(false)
    expect(isValidNickname('Glowy Krill 42 ')).toBe(false)
  })
})

describe('game api', () => {
  it('replaces a typed-in name with a generated one', async () => {
    const g = setup()
    const s = await (await g.post('/api/game/start', { nickname: 'Emma, age 7, Dover' })).json()
    expect(isValidNickname(s.nickname)).toBe(true)
    expect(s.week).toBe('2026-W47')
  })

  it('ranks best score per nickname and ignores a lower repeat', async () => {
    const g = setup()
    await g.play(40, 'Glowy Krill 42')
    await g.play(90, 'Sleepy Squid 11')
    const again = await g.play(10, 'Glowy Krill 42')
    expect(again.body.rank).toBe(2)
    expect(again.body.entries).toEqual([
      { nickname: 'Sleepy Squid 11', score: 90 },
      { nickname: 'Glowy Krill 42', score: 40 },
    ])
  })

  it('rejects impossible scores, too-fast runs and replays', async () => {
    const g = setup()
    expect((await g.play(9999)).status).toBe(422)
    expect((await g.play(5, undefined, 1)).status).toBe(422)
    const ok = await g.play(50)
    expect(ok.status).toBe(200)
    const replay = await g.post('/api/game/finish', { runId: ok.start.runId, score: 60 })
    expect(replay.status).toBe(409)
  })

  it('pays the weekly winner once, only after the week ends', async () => {
    const g = setup()
    const win = await g.play(120, 'Brave Turtle 33')
    const lose = await g.play(80, 'Tiny Crab 50')
    expect(win.body.isTop).toBe(true)

    const early = await g.post('/api/game/claim', { runId: win.start.runId, claimToken: win.body.claimToken })
    expect(early.status).toBe(409)

    g.advance(6 * 864e5) // into next week
    const loser = await g.post('/api/game/claim', { runId: lose.start.runId, claimToken: lose.body.claimToken })
    expect(loser.status).toBe(403)
    const forged = await g.post('/api/game/claim', { runId: win.start.runId, claimToken: 'x'.repeat(32) })
    expect(forged.status).toBe(403)

    const claim = await g.post('/api/game/claim', { runId: win.start.runId, claimToken: win.body.claimToken })
    expect(claim.status).toBe(200)
    const prize = await claim.json()
    expect(prize).toMatchObject({ week: '2026-W47', percentOff: 20, code: prizeCode('2026-W47', win.start.runId) })
    expect(g.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ id: COUPON_ID, percent_off: 20, duration: 'once' }))
    expect(g.promotionCodes.create).toHaveBeenCalledWith(
      expect.objectContaining({ promotion: { type: 'coupon', coupon: COUPON_ID }, code: prize.code, max_redemptions: 1 }),
      expect.anything(),
    )

    // Claiming again shows the same code without making another
    const again = await (await g.post('/api/game/claim', { runId: win.start.runId, claimToken: win.body.claimToken })).json()
    expect(again.code).toBe(prize.code)
    expect(g.promotionCodes.create).toHaveBeenCalledTimes(1)
  })

  it('serves the board for the current week', async () => {
    const g = setup()
    await g.play(33, 'Jolly Eel 21')
    const b = await (await g.app.request('/api/game/board')).json()
    expect(b.entries).toEqual([{ nickname: 'Jolly Eel 21', score: 33 }])
    expect(b.resetsAt).toBe(Date.UTC(2026, 10, 23, 5))
  })
})
