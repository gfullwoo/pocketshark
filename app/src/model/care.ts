// PocketShark care model: the four meters, mood, Glow Points and offline decay.
// Pure TypeScript (no React Native), so it is unit-tested in Node. See
// design/game-design.md §2 and §4 for the rules this implements.
//
// Tone rule: the shark never dies. The worst case is "resting" (health hit 0),
// where it sleeps at home until it has recovered.

export type Mood = 'happy' | 'content' | 'peckish' | 'uneasy' | 'resting'
export type Snack = 'krill' | 'shrimp' | 'gold' | 'plankton'

export interface CareState {
  v: 1
  fullness: number // 0–100
  glow: number // 0–100
  safety: number // 0–100
  health: number // 0–100
  gp: number // Glow Points
  resting: boolean
  lastSeen: number // epoch ms, when the state was last brought up to date
  lastCheckIn: string // local YYYY-MM-DD of the last daily check-in bonus
  happySeconds: number // time in the happy zone not yet paid out as GP
  stats: { eaten: number; dodges: number; scares: number }
}

export interface Ctx {
  /** In the home cave (resting, safe from predators). */
  atHome: boolean
  /** Glow is on this frame. */
  glowing: boolean
}

export const RULES = {
  happyAt: 60,
  contentAt: 35,
  dangerAt: 20,
  wakeAt: 40,
  happyGpPerHour: 5,
  checkInGp: 10,
  dodgeGp: 5,
  /** While the app is closed, meters drift but never below these floors. */
  offlineFloor: { fullness: 15, health: 30 },
  /** Offline catch-up stops after this long (a long trip away is like a short one). */
  offlineCapHours: 72,
  snacks: {
    krill: { fullness: 4, gp: 1, glow: 0 },
    shrimp: { fullness: 8, gp: 3, glow: 0 },
    gold: { fullness: 25, gp: 10, glow: 0 },
    plankton: { fullness: 0, gp: 0, glow: 30 },
  } satisfies Record<Snack, { fullness: number; gp: number; glow: number }>,
  scare: { safety: 30, health: 10 },
} as const

const clamp = (v: number) => Math.max(0, Math.min(100, v))
const H = 3600

export function newShark(now: number): CareState {
  return {
    v: 1, fullness: 70, glow: 100, safety: 80, health: 90, gp: 0, resting: false,
    lastSeen: now, lastCheckIn: '', happySeconds: 0, stats: { eaten: 0, dodges: 0, scares: 0 },
  }
}

export function mood(s: CareState): Mood {
  if (s.resting) return 'resting'
  if (s.fullness >= RULES.happyAt && s.safety >= RULES.happyAt) return 'happy'
  if (s.fullness < RULES.contentAt) return 'peckish'
  if (s.safety < RULES.contentAt || s.health < RULES.contentAt) return 'uneasy'
  return 'content'
}

/** What the shark would say it needs right now, in kid-friendly words. */
export function need(s: CareState): string {
  switch (mood(s)) {
    case 'resting': return 'Resting at home. Let it sleep a little.'
    case 'peckish': return 'Hungry! Hold Glow to call snacks.'
    case 'uneasy': return s.safety < RULES.contentAt ? 'Feeling exposed. Swim home to feel safe.' : 'Not feeling great. Eat and rest at home.'
    case 'happy': return 'Happy and safe!'
    default: return 'Doing okay.'
  }
}

/** Advance the shark by `dt` seconds while the app is open. Mutates and returns `s`. */
export function tick(s: CareState, dt: number, ctx: Ctx): CareState {
  const home = ctx.atHome || s.resting
  const glowing = ctx.glowing && !s.resting && s.glow > 0

  // Fullness: about 6/hour at home, faster while out swimming.
  s.fullness = clamp(s.fullness - (dt * (home ? 6 : 12)) / H)

  // Glow: drains while lit, recharges fastest at home.
  s.glow = clamp(s.glow + dt * (glowing ? -10 : home ? 4 : 1.5))

  // Safety: home is cozy; open water is a little scary, more so while glowing.
  s.safety = clamp(s.safety + dt * (home ? 3 : glowing ? -0.3 : -0.15))

  // Health follows how well the shark is cared for.
  const struggling = s.fullness < RULES.dangerAt || s.safety < RULES.dangerAt
  let dh = 0
  if (s.resting) dh = 0.4
  else if (struggling) dh = -0.1
  else if (mood(s) === 'happy') dh = 0.05
  else if (home) dh = 0.02
  s.health = clamp(s.health + dh * dt)

  if (!s.resting && s.health <= 0) s.resting = true
  else if (s.resting && s.health >= RULES.wakeAt) s.resting = false

  payHappy(s, mood(s) === 'happy' ? dt : 0)
  return s
}

function payHappy(s: CareState, dt: number) {
  s.happySeconds += dt
  while (s.happySeconds >= H) {
    s.happySeconds -= H
    s.gp += RULES.happyGpPerHour
  }
}

/** Eat a snack: returns the Glow Points earned. */
export function eat(s: CareState, kind: Snack): number {
  const k = RULES.snacks[kind]
  s.fullness = clamp(s.fullness + k.fullness)
  s.glow = clamp(s.glow + k.glow)
  s.gp += k.gp
  if (k.fullness > 0) s.stats.eaten++
  return k.gp
}

/** A predator spotted the glowing shark. It isn't hurt badly, just scared home. */
export function scare(s: CareState) {
  s.safety = clamp(s.safety - RULES.scare.safety)
  s.health = clamp(s.health - RULES.scare.health)
  s.stats.scares++
  if (s.health <= 0) s.resting = true
}

/** Stayed dim while a predator passed: a small reward. */
export function dodge(s: CareState): number {
  s.gp += RULES.dodgeGp
  s.stats.dodges++
  return RULES.dodgeGp
}

export function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Daily check-in bonus, once per local calendar day. Returns GP earned (0 if already claimed). */
export function checkIn(s: CareState, now: number): number {
  const day = localDay(now)
  if (s.lastCheckIn === day) return 0
  s.lastCheckIn = day
  s.gp += RULES.checkInGp
  return RULES.checkInGp
}

export interface AwaySummary {
  seconds: number
  before: Pick<CareState, 'fullness' | 'glow' | 'safety' | 'health' | 'gp'>
  after: Pick<CareState, 'fullness' | 'glow' | 'safety' | 'health' | 'gp'>
}

/**
 * Catch up on time spent with the app closed. The shark is assumed to be at
 * home: it gets hungrier, but recharges and feels safe. Meters never fall below
 * the offline floors, so coming back is never a disaster.
 */
export function catchUp(s: CareState, now: number): AwaySummary {
  const pick = () => ({ fullness: s.fullness, glow: s.glow, safety: s.safety, health: s.health, gp: s.gp })
  const before = pick()
  const elapsed = Math.max(0, Math.min(now - s.lastSeen, RULES.offlineCapHours * H * 1000)) / 1000
  const step = 60
  for (let t = 0; t < elapsed; t += step) {
    const dt = Math.min(step, elapsed - t)
    s.fullness = Math.max(Math.min(s.fullness, RULES.offlineFloor.fullness), s.fullness - (6 * dt) / H)
    s.glow = clamp(s.glow + 4 * dt)
    s.safety = clamp(s.safety + 3 * dt)
    let dh: number
    if (s.resting) dh = 20
    else if (s.fullness < RULES.dangerAt) dh = -2
    else if (mood(s) === 'happy') dh = 5
    else dh = 2
    const next = s.health + (dh * dt) / H
    s.health = clamp(dh < 0 ? Math.max(Math.min(s.health, RULES.offlineFloor.health), next) : next)
    if (s.resting && s.health >= RULES.wakeAt) s.resting = false
    payHappy(s, mood(s) === 'happy' ? dt : 0)
  }
  s.lastSeen = now
  return { seconds: elapsed, before, after: pick() }
}
