import type { Firestore } from '@google-cloud/firestore'
import { rankEntries, type BoardEntry, type GameStore, type Prize, type RunRecord } from './store.js'

// Layout:
//   glowgulp_runs/{runId}                      RunRecord
//   glowgulp_weeks/{week}/best/{nickname}      BoardEntry (best score per nickname)
//   glowgulp_weeks/{week}/prize/winner         Prize
// Every query is single-field, so no composite indexes are needed.

const nickKey = (n: string) => n.replace(/\s+/g, '_')

export class FirestoreGameStore implements GameStore {
  constructor(private db: Firestore) {}

  private run(id: string) {
    return this.db.collection('glowgulp_runs').doc(id)
  }
  private week(week: string) {
    return this.db.collection('glowgulp_weeks').doc(week)
  }

  async createRun(run: RunRecord) {
    await this.run(run.id).create(run)
  }

  async getRun(id: string) {
    const snap = await this.run(id).get()
    return snap.exists ? (snap.data() as RunRecord) : null
  }

  async finishRun(id: string, result: { finishedAt: number; score: number; claimHash: string }) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.run(id)
      const snap = await tx.get(ref)
      if (!snap.exists) return false
      const r = snap.data() as RunRecord
      if (r.finishedAt != null) return false
      const bestRef = this.week(r.week).collection('best').doc(nickKey(r.nickname))
      const bestSnap = await tx.get(bestRef)
      tx.update(ref, result)
      const prev = bestSnap.exists ? (bestSnap.data() as BoardEntry) : null
      if (!prev || result.score > prev.score) {
        const entry: BoardEntry = { nickname: r.nickname, score: result.score, at: result.finishedAt, runId: id }
        tx.set(bestRef, entry)
      }
      return true
    })
  }

  async top(week: string, n: number) {
    // Over-fetch a little so ties at the cut-off are broken by time, not by Firestore order.
    const snap = await this.week(week).collection('best').orderBy('score', 'desc').limit(n + 10).get()
    return rankEntries(snap.docs.map((d) => d.data() as BoardEntry)).slice(0, n)
  }

  async getPrize(week: string) {
    const snap = await this.week(week).collection('prize').doc('winner').get()
    return snap.exists ? (snap.data() as Prize) : null
  }

  async putPrizeIfAbsent(prize: Prize) {
    const ref = this.week(prize.week).collection('prize').doc('winner')
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (snap.exists) return snap.data() as Prize
      tx.create(ref, prize)
      return prize
    })
  }
}
