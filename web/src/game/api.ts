// Client for the Glow & Gulp leaderboard API, plus what this device remembers.
import { isValidNickname, randomNickname } from '../../../server/src/game/nicknames'

export interface BoardRow { nickname: string; score: number }
export interface Board { week: string; resetsAt: number; entries: BoardRow[] }
export interface StartRes { runId: string; nickname: string; week: string; resetsAt: number; seconds: number }
export interface FinishRes extends Board { rank: number | null; isTop: boolean; claimToken: string }
export interface Prize { week: string; code: string; percentOff: number; expiresAt: number }

async function call<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = (await r.json().catch(() => ({}))) as T
  return { ok: r.ok, status: r.status, data }
}

export const getBoard = () => call<Board>('/api/game/board')
export const startRun = (nickname: string) => call<StartRes>('/api/game/start', { nickname })
export const finishRun = (runId: string, score: number) => call<FinishRes>('/api/game/finish', { runId, score })
export const claimPrize = (runId: string, claimToken: string) => call<Prize>('/api/game/claim', { runId, claimToken })

// ---- device storage (nothing personal: a generated nickname and claim tokens) ----
const NICK_KEY = 'mypocketshark:glowgulp:nick'
const CLAIMS_KEY = 'mypocketshark:glowgulp:claims'
const SOUND_KEY = 'mypocketshark:glowgulp:sound'

export interface Claim { runId: string; claimToken: string; week: string; score: number }

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* storage unavailable */ }
}

export function loadNickname(): string {
  const n = read<string>(NICK_KEY, '')
  if (isValidNickname(n)) return n
  const fresh = randomNickname()
  write(NICK_KEY, fresh)
  return fresh
}
export function saveNickname(n: string) { write(NICK_KEY, n) }

export function loadClaims(): Claim[] {
  const v = read<Claim[]>(CLAIMS_KEY, [])
  return Array.isArray(v) ? v.filter((c) => c && typeof c.runId === 'string' && typeof c.claimToken === 'string') : []
}
/** Keep this run if it was #1 when it finished; one per week, the best one. */
export function rememberClaim(c: Claim) {
  const others = loadClaims().filter((x) => x.week !== c.week || x.score > c.score)
  if (others.some((x) => x.week === c.week)) return
  write(CLAIMS_KEY, [...others, c].slice(-6))
}
export function forgetClaim(runId: string) {
  write(CLAIMS_KEY, loadClaims().filter((c) => c.runId !== runId))
}

export const loadSound = () => read<boolean>(SOUND_KEY, true) !== false
export const saveSound = (on: boolean) => write(SOUND_KEY, on)
