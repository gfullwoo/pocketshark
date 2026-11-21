import { useCallback, useEffect, useRef, useState } from 'react'
import { randomNickname } from '../../../server/src/game/nicknames'
import { PRIZE_PERCENT_OFF, weekId } from '../../../server/src/game/rules'
import { createEngine, type Engine, type EngineResult } from '../game/engine'
import {
  claimPrize, finishRun, forgetClaim, getBoard, loadClaims, loadNickname, loadSound, rememberClaim, saveNickname, saveSound,
  startRun, type Board, type Prize, type StartRes,
} from '../game/api'

type Phase = 'ready' | 'playing' | 'over'
interface Outcome {
  r: EngineResult
  rank: number | null
  isTop: boolean
  status: 'counted' | 'offline' | 'rejected'
}

const LEGEND = [
  { c: '#ff8fb1', t: 'Krill 1' },
  { c: '#ffa877', t: 'Shrimp 3' },
  { c: '#ffd166', t: 'Gold fish 10', glow: true },
  { c: '#7dff9a', t: 'Sparkles refill glow', glow: true },
]

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

export function Play() {
  const tankRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const scoreRef = useRef<HTMLElement>(null)
  const timeRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLElement>(null)
  const engine = useRef<Engine | null>(null)
  const run = useRef<StartRes | null>(null)
  const nickRef = useRef('')

  const [phase, setPhase] = useState<Phase>('ready')
  const [sound, setSound] = useState(loadSound)
  const [nick, setNick] = useState(loadNickname)
  const [board, setBoard] = useState<Board | null>(null)
  const [online, setOnline] = useState(true)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [toast, setToast] = useState<{ m: string; c?: string; id: number } | null>(null)
  const [copied, setCopied] = useState('')
  const [glowOn, setGlowOn] = useState(false)
  const [touch] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
  useEffect(() => { nickRef.current = nick }, [nick])

  const onEnd = useCallback(async (r: EngineResult) => {
    const current = run.current
    run.current = null
    setPhase('over')
    if (!current) {
      setOutcome({ r, rank: null, isTop: false, status: 'offline' })
      return
    }
    try {
      const res = await finishRun(current.runId, r.score)
      if (!res.ok) {
        setOutcome({ r, rank: null, isTop: false, status: res.status === 422 ? 'rejected' : 'offline' })
        return
      }
      const d = res.data
      setBoard({ week: d.week, resetsAt: d.resetsAt, entries: d.entries })
      if (d.isTop) rememberClaim({ runId: current.runId, claimToken: d.claimToken, week: d.week, score: r.score })
      setOutcome({ r, rank: d.rank, isTop: d.isTop, status: 'counted' })
    } catch {
      setOutcome({ r, rank: null, isTop: false, status: 'offline' })
    }
  }, [])

  useEffect(() => {
    const e = createEngine(tankRef.current!, cvRef.current!, {
      onHud: ({ score, time, glow }) => {
        if (scoreRef.current && scoreRef.current.textContent !== String(score)) scoreRef.current.textContent = String(score)
        if (timeRef.current && timeRef.current.textContent !== String(time)) timeRef.current.textContent = String(time)
        if (barRef.current) {
          barRef.current.style.width = `${glow.toFixed(1)}%`
          barRef.current.classList.toggle('is-low', glow < 20)
        }
      },
      onToast: (m, c) => setToast({ m, c, id: Date.now() }),
      onGlowButton: (on) => setGlowOn(on),
      onEnd: (r) => void onEnd(r),
    })
    engine.current = e
    return () => e.destroy()
  }, [onEnd])

  useEffect(() => engine.current?.setSound(sound), [sound])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(id)
  }, [toast])

  // Load the board, then check whether this device won a past week.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const b = await getBoard()
        if (!alive) return
        if (!b.ok) { setOnline(false); return }
        setBoard(b.data)
      } catch {
        if (alive) setOnline(false)
        return
      }
      const thisWeek = weekId()
      const found: Prize[] = []
      for (const c of loadClaims()) {
        if (c.week >= thisWeek) continue
        try {
          const res = await claimPrize(c.runId, c.claimToken)
          if (res.ok && res.data.expiresAt > Date.now()) found.push(res.data)
          else if (res.ok || [400, 403, 410].includes(res.status)) forgetClaim(c.runId)
        } catch { /* try again next visit */ }
      }
      if (alive) setPrizes(found)
    })()
    return () => { alive = false }
  }, [])

  const start = async () => {
    setOutcome(null)
    run.current = null
    if (online) {
      try {
        const res = await startRun(nickRef.current)
        if (res.ok) {
          run.current = res.data
          if (res.data.nickname !== nickRef.current) { setNick(res.data.nickname); saveNickname(res.data.nickname) }
        }
      } catch { /* play without the board */ }
    }
    setGlowOn(false)
    setPhase('playing')
    engine.current?.start()
  }

  const toggleGlow = () => {
    const on = engine.current?.setGlowButton(!glowOn) ?? false
    setGlowOn(on)
  }

  const newName = () => {
    const n = randomNickname()
    setNick(n)
    saveNickname(n)
  }

  const toggleSound = () => {
    setSound((s) => {
      saveSound(!s)
      return !s
    })
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(''), 1600)
    } catch { /* the code is on screen to copy by hand */ }
  }

  const r = outcome?.r
  const stars = !r || r.caught ? 0 : r.score >= 100 ? 3 : r.score >= 60 ? 2 : r.score >= 25 ? 1 : 0

  return (
    <section className="play">
      <div className="play__head">
        <div>
          <h1>Glow &amp; Gulp</h1>
          <p className="muted">Help the pocket shark catch its snacks, and watch out for the big shark.</p>
        </div>
        <button className="chip" onClick={toggleSound} aria-pressed={sound}>{sound ? 'Sound on' : 'Sound off'}</button>
      </div>

      {prizes.map((p) => (
        <div className="prize" key={p.code} role="status">
          <div>
            <strong>You were the top shark of the week!</strong>
            <p>Grown-ups: use this code at checkout for {p.percentOff}% off. It works once and expires {fmtDate(p.expiresAt)}.</p>
          </div>
          <div className="prize__code">
            <code>{p.code}</code>
            <button className="btn btn--glow" onClick={() => void copy(p.code)}>{copied === p.code ? 'Copied' : 'Copy code'}</button>
            <a className="btn btn--ghost" href="#/shop">Shop</a>
          </div>
        </div>
      ))}

      <div className="play__grid">
        <div ref={tankRef} className="gg-tank" tabIndex={0} aria-label="Game area. Move to swim. Hold, or press space, to glow.">
          <canvas ref={cvRef} />
          <div className="gg-hud">
            <div className="gg-pill"><span>Score</span><b ref={scoreRef}>0</b></div>
            <div className="gg-pill"><span>Time</span><b ref={timeRef}>60</b></div>
            <div className="gg-meter"><span>Glow</span><div className="gg-track"><i ref={barRef} /></div></div>
          </div>
          {phase === 'playing' && (
            <button
              data-gg-ui
              className={`gg-glowbtn${glowOn ? ' is-on' : ''}`}
              onClick={toggleGlow}
              aria-pressed={glowOn}
            >
              {glowOn ? 'Glow on' : 'Glow'}
            </button>
          )}
          {toast && <div key={toast.id} className="gg-toast" role="status" style={{ color: toast.c }}>{toast.m}</div>}

          {phase !== 'playing' && (
            <div className="gg-overlay">
              <div className="gg-card">
                {phase === 'ready' || !outcome ? (
                  phase === 'over' ? <h2>Counting your snacks…</h2> : (
                    <>
                      <h2>The pocket shark is hungry!</h2>
                      {touch ? (
                        <p>Drag to swim. Tap <b>Glow</b> to light up, and snacks swim to your light. Without it, they swim away!</p>
                      ) : (
                        <p>Move to swim. Hold the mouse button (or space) to glow, and snacks swim to your light. Without it, they swim away!</p>
                      )}
                      <p>Watch out for the big shark! When it comes, turn your glow off so it can’t see you, or it will gobble you up.</p>
                      <ul className="gg-legend">
                        {LEGEND.map((l) => (
                          <li key={l.t}><span style={{ background: l.c, boxShadow: l.glow ? `0 0 8px ${l.c}` : undefined }} />{l.t}</li>
                        ))}
                      </ul>
                    </>
                  )
                ) : (
                  <>
                    <h2>{outcome.r.caught ? 'Gulp! The big shark got you.' : `${outcome.r.score} points!`}</h2>
                    {outcome.r.caught
                      ? <p><b>{outcome.r.score} points</b> before you were caught. Tip: when you see the yellow warning, turn your glow off.</p>
                      : <p className="gg-stars" aria-label={`${stars} of 3 stars`}>{'★'.repeat(stars)}<span>{'★'.repeat(3 - stars)}</span></p>}
                    <p className="gg-rank">
                      {outcome.status === 'offline' && 'The leaderboard is taking a nap, so this score wasn’t saved.'}
                      {outcome.status === 'rejected' && 'That score couldn’t be counted. Try another round!'}
                      {outcome.status === 'counted' && (outcome.isTop
                        ? `You’re #1 this week! If you’re still on top when the board resets Monday, come back here on this device for ${PRIZE_PERCENT_OFF}% off.`
                        : outcome.rank && outcome.rank <= 10 ? `You’re #${outcome.rank} on this week’s board!` : 'Keep going to reach the top 10!')}
                    </p>
                  </>
                )}
                <button className="btn btn--glow" onClick={() => void start()} disabled={phase === 'over' && !outcome}>
                  {phase === 'ready' ? 'Start' : outcome?.r.caught ? 'Try again' : 'Play again'}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="board" aria-labelledby="board-title">
          <h2 id="board-title">This week’s top sharks</h2>
          <p className="small muted">The #1 shark when the board resets (Monday, midnight Eastern) wins {PRIZE_PERCENT_OFF}% off a plush.</p>
          {!online ? (
            <p className="muted">The leaderboard is resting right now. You can still play!</p>
          ) : !board ? (
            <p className="muted">Loading…</p>
          ) : board.entries.length === 0 ? (
            <p className="muted">No scores yet this week. Be the first!</p>
          ) : (
            <ol className="board__list">
              {board.entries.map((e, i) => (
                <li key={e.nickname} className={e.nickname === nick ? 'is-me' : undefined}>
                  <span className="board__rank">{i + 1}</span>
                  <span className="board__name">{e.nickname}</span>
                  <span className="board__score">{e.score}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="board__me">
            <span className="small muted">Your shark name</span>
            <b>{nick}</b>
            <button className="link" onClick={newName} disabled={phase === 'playing'}>Pick a new name</button>
          </div>
        </aside>
      </div>

      <p className="small muted play__note">
        For grown-ups: we never ask players for names or emails. Shark names are picked at random, and the weekly winner’s
        discount code appears on the device the winning game was played on.
      </p>
    </section>
  )
}
