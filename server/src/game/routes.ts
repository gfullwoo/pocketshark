import { createHash, randomBytes } from 'node:crypto'
import type { Hono } from 'hono'
import type Stripe from 'stripe'
import { z } from 'zod'
import { isValidNickname, randomNickname } from './nicknames.js'
import {
  BOARD_SIZE, CLAIM_WINDOW_DAYS, CODE_VALID_DAYS, GAME_SECONDS, MAX_RUN_MS, MIN_RUN_MS, PRIZE_PERCENT_OFF,
  maxScore, weekId, weekResetsAt,
} from './rules.js'
import type { GameStore, Prize } from './store.js'

export const COUPON_ID = 'glowgulp-weekly-20'

export interface GameDeps {
  store: GameStore
  stripe: Pick<Stripe, 'coupons' | 'promotionCodes'>
  now?: () => number
  /** Max new runs per IP per 10 minutes (per server instance). */
  startsPer10Min?: number
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const token = (bytes: number) => randomBytes(bytes).toString('base64url')

const StartSchema = z.object({ nickname: z.string().optional() }).optional()
const FinishSchema = z.object({ runId: z.string().min(10).max(64), score: z.number().int().min(0).max(100_000) })
const ClaimSchema = z.object({ runId: z.string().min(10).max(64), claimToken: z.string().min(10).max(128) })

/** Deterministic per winning run, and unguessable because run ids are random. */
export function prizeCode(week: string, runId: string) {
  return `SHARK20-${sha256(`${week}:${runId}`).slice(0, 8).toUpperCase()}`
}

export function registerGameRoutes(app: Hono, deps: GameDeps) {
  const now = deps.now ?? Date.now
  const limit = deps.startsPer10Min ?? 40
  const recent = new Map<string, number[]>()

  const rateLimited = (ip: string) => {
    const t = now()
    const hits = (recent.get(ip) ?? []).filter((x) => t - x < 600_000)
    hits.push(t)
    recent.set(ip, hits)
    if (recent.size > 5000) recent.clear()
    return hits.length > limit
  }

  const board = async (week: string) => (await deps.store.top(week, BOARD_SIZE)).map(({ nickname, score }) => ({ nickname, score }))

  app.get('/api/game/board', async (c) => {
    const at = new Date(now())
    const week = weekId(at)
    return c.json({ week, resetsAt: weekResetsAt(at), entries: await board(week) })
  })

  app.post('/api/game/start', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    if (rateLimited(ip)) return c.json({ error: 'slow_down' }, 429)
    const body = StartSchema.safeParse(await c.req.json().catch(() => undefined))
    const asked = body.success ? body.data?.nickname : undefined
    const nickname = isValidNickname(asked) ? asked : randomNickname()
    const at = new Date(now())
    const run = { id: token(18), week: weekId(at), nickname, startedAt: at.getTime() }
    await deps.store.createRun(run)
    return c.json({ runId: run.id, nickname, week: run.week, resetsAt: weekResetsAt(at), seconds: GAME_SECONDS })
  })

  app.post('/api/game/finish', async (c) => {
    const parsed = FinishSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const { runId, score } = parsed.data
    const run = await deps.store.getRun(runId)
    if (!run) return c.json({ error: 'unknown_run' }, 404)
    if (run.finishedAt != null) return c.json({ error: 'already_finished' }, 409)
    const t = now()
    const elapsed = t - run.startedAt
    if (elapsed < MIN_RUN_MS || elapsed > MAX_RUN_MS || score > maxScore(elapsed)) {
      return c.json({ error: 'not_accepted' }, 422)
    }
    const claimToken = token(24)
    const ok = await deps.store.finishRun(runId, { finishedAt: t, score, claimHash: sha256(claimToken) })
    if (!ok) return c.json({ error: 'already_finished' }, 409)
    const top = await deps.store.top(run.week, 50)
    const idx = top.findIndex((e) => e.nickname === run.nickname)
    const rank = idx >= 0 ? idx + 1 : null
    return c.json({
      week: run.week,
      resetsAt: weekResetsAt(new Date(t)),
      rank,
      isTop: rank === 1 && top[0].runId === runId,
      claimToken,
      entries: top.slice(0, BOARD_SIZE).map(({ nickname, score }) => ({ nickname, score })),
    })
  })

  app.post('/api/game/claim', async (c) => {
    const parsed = ClaimSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const { runId, claimToken } = parsed.data
    const run = await deps.store.getRun(runId)
    if (!run || !run.claimHash || run.claimHash !== sha256(claimToken)) return c.json({ error: 'bad_claim' }, 403)
    const t = new Date(now())
    if (run.week >= weekId(t)) return c.json({ error: 'week_not_over', resetsAt: weekResetsAt(t) }, 409)
    if (t.getTime() - run.startedAt > (CLAIM_WINDOW_DAYS + 7) * 864e5) return c.json({ error: 'expired' }, 410)

    const winner = (await deps.store.top(run.week, 1))[0]
    if (!winner || winner.runId !== runId) return c.json({ error: 'not_winner' }, 403)

    let prize = await deps.store.getPrize(run.week)
    if (!prize) {
      try {
        await ensureCoupon(deps.stripe)
        const code = prizeCode(run.week, runId)
        const expiresAt = Math.floor(t.getTime() / 1000) + CODE_VALID_DAYS * 86_400
        await deps.stripe.promotionCodes.create(
          {
            promotion: { type: 'coupon', coupon: COUPON_ID },
            code,
            max_redemptions: 1,
            expires_at: expiresAt,
            metadata: { source: 'glow-and-gulp', week: run.week, run: runId },
          },
          { idempotencyKey: `glowgulp-prize-${run.week}-${runId}` },
        )
        const fresh: Prize = { week: run.week, runId, code, expiresAt: expiresAt * 1000 }
        prize = await deps.store.putPrizeIfAbsent(fresh)
      } catch (err) {
        console.error('glowgulp prize failed', err)
        return c.json({ error: 'prize_failed' }, 502)
      }
    }
    return c.json({ week: prize.week, code: prize.code, percentOff: PRIZE_PERCENT_OFF, expiresAt: prize.expiresAt })
  })
}

async function ensureCoupon(stripe: GameDeps['stripe']) {
  try {
    await stripe.coupons.retrieve(COUPON_ID)
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err
    try {
      await stripe.coupons.create({
        id: COUPON_ID,
        percent_off: PRIZE_PERCENT_OFF,
        duration: 'once',
        name: 'Glow & Gulp weekly winner',
      })
    } catch (e) {
      // Another instance may have created it at the same moment.
      if ((e as { code?: string }).code !== 'resource_already_exists') throw e
    }
  }
}
