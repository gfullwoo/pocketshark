export interface RunRecord {
  id: string
  week: string
  nickname: string
  startedAt: number
  finishedAt?: number
  score?: number
  /** sha256 of the claim token handed to the device that played the run */
  claimHash?: string
}

export interface BoardEntry {
  nickname: string
  score: number
  /** when this score was set; earlier wins a tie */
  at: number
  runId: string
}

export interface Prize {
  week: string
  runId: string
  code: string
  expiresAt: number
}

export interface GameStore {
  createRun(run: RunRecord): Promise<void>
  getRun(id: string): Promise<RunRecord | null>
  /**
   * Record the result once. Returns false if the run is missing or already finished.
   * Also raises the nickname's best score for that week if this run beat it.
   */
  finishRun(id: string, result: { finishedAt: number; score: number; claimHash: string }): Promise<boolean>
  /** Best score per nickname for the week, highest first, earliest first on ties. */
  top(week: string, n: number): Promise<BoardEntry[]>
  getPrize(week: string): Promise<Prize | null>
  /** Save the prize unless one already exists; returns whichever is stored. */
  putPrizeIfAbsent(prize: Prize): Promise<Prize>
}

export function rankEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || a.at - b.at)
}

/** In-process store for local dev and tests. Data is lost on restart. */
export class MemoryGameStore implements GameStore {
  runs = new Map<string, RunRecord>()
  best = new Map<string, BoardEntry>() // key: week|nickname
  prizes = new Map<string, Prize>()

  async createRun(run: RunRecord) {
    this.runs.set(run.id, { ...run })
  }
  async getRun(id: string) {
    const r = this.runs.get(id)
    return r ? { ...r } : null
  }
  async finishRun(id: string, result: { finishedAt: number; score: number; claimHash: string }) {
    const r = this.runs.get(id)
    if (!r || r.finishedAt != null) return false
    Object.assign(r, result)
    const key = `${r.week}|${r.nickname}`
    const prev = this.best.get(key)
    if (!prev || result.score > prev.score) {
      this.best.set(key, { nickname: r.nickname, score: result.score, at: result.finishedAt, runId: r.id })
    }
    return true
  }
  async top(week: string, n: number) {
    const rows = [...this.best.entries()].filter(([k]) => k.startsWith(`${week}|`)).map(([, v]) => v)
    return rankEntries(rows).slice(0, n)
  }
  async getPrize(week: string) {
    return this.prizes.get(week) ?? null
  }
  async putPrizeIfAbsent(prize: Prize) {
    const existing = this.prizes.get(prize.week)
    if (existing) return existing
    this.prizes.set(prize.week, prize)
    return prize
  }
}
