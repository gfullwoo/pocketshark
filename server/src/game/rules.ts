// Rules shared by the API and the storefront game.

export const GAME_SECONDS = 60
export const PRIZE_PERCENT_OFF = 20
/** How long after a week ends the winner can still claim the code. */
export const CLAIM_WINDOW_DAYS = 28
/** How long a claimed code stays valid at checkout. */
export const CODE_VALID_DAYS = 30
export const BOARD_SIZE = 10
export const TIME_ZONE = 'America/New_York'

/**
 * Highest score the server accepts for a run of this length. A strong player
 * makes roughly 2 points a second; the cap leaves room for gold fish and
 * hiding bonuses while rejecting obviously faked numbers.
 */
export function maxScore(elapsedMs: number): number {
  return Math.floor((elapsedMs / 1000) * 5) + 25
}
/** A run must end at least this long after it starts... */
export const MIN_RUN_MS = 3_000
/** ...and no later than this (a full round plus slack for slow networks). */
export const MAX_RUN_MS = (GAME_SECONDS + 30) * 1000

function etParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(d)
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return { y: n('year'), m: n('month'), d: n('day'), h: n('hour') }
}

/** ISO week (Monday start) in Eastern time, e.g. "2026-W47". Sorts as a string. */
export function weekId(now: Date = new Date()): string {
  const { y, m, d } = etParts(now)
  const t = new Date(Date.UTC(y, m - 1, d))
  const dow = (t.getUTCDay() + 6) % 7 // Monday = 0
  t.setUTCDate(t.getUTCDate() - dow + 3) // the Thursday of this week decides the year
  const isoYear = t.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3)
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 864e5))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/** When the current week's board resets: next Monday 00:00 Eastern, as epoch ms. */
export function weekResetsAt(now: Date = new Date()): number {
  const { y, m, d } = etParts(now)
  const t = new Date(Date.UTC(y, m - 1, d))
  const dow = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() + (7 - dow))
  // Midnight Eastern is 05:00 UTC in winter and 04:00 UTC in summer.
  for (const offset of [5, 4]) {
    const c = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), offset)
    if (etParts(new Date(c)).h === 0) return c
  }
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 5)
}
