// PocketShark care model: health, glow, mood, Glow Points and offline decay.
// Pure TypeScript (no React Native), so it is unit-tested in Node. See
// design/game-design.md §2 and §4 for the rules this implements.
//
// Two meters only: HEALTH (food keeps it up, predators knock it down, it slowly
// wears down over time) and GLOW (the lure: drains fast, refills slowly).
//
// Tone rule: the shark never dies. The worst case is "resting" (health hit 0),
// where it sleeps at home until it has recovered.

export type Mood = 'happy' | 'content' | 'hungry' | 'resting'
export type Snack = 'krill' | 'shrimp' | 'gold' | 'plankton'

export interface CareState {
  v: 2
  health: number // 0–100
  glow: number // 0–100
  gp: number // Glow Points
  resting: boolean
  lastSeen: number // epoch ms, when the state was last brought up to date
  lastCheckIn: string // local YYYY-MM-DD of the last daily check-in bonus
  happySeconds: number // time in the happy zone not yet paid out as GP
  stats: { eaten: number; dodges: number; scares: number; captures?: number; continues?: number }
  /** Sea map progress: the place the shark is in now (1–20). */
  level: number
  /** Glow Points earned since arriving in this place (all of them count) toward finding a friend. */
  levelGp: number
  /** Friends found, each living in the place where they met. */
  friends: { level: number; name: string }[]
}

export interface Ctx {
  /** In the home cave (resting, safe from predators). */
  atHome: boolean
  /** Glow is on this frame. */
  glowing: boolean
  /** How hard it's swimming, 0 (still) to 1 (full speed). Swimming wears health down faster. */
  moving?: number
}

export const RULES = {
  happyAt: 70,
  contentAt: 40,
  wakeAt: 40,
  happyGpPerHour: 5,
  checkInGp: 10,
  dodgeGp: 5,
  /**
   * Health only comes back from eating and from resting in the cave. Out in the
   * reef it wears down (per second): a little when still, much more when swimming
   * (idle + swim × effort). In the cave it slowly recovers.
   */
  healthDrain: { idle: 0.12, swim: 0.5 },
  caveHeal: 0.6,
  /** While resting (health hit 0), it recovers at home. */
  restRecover: 0.4,
  /** Glow per second: drains while lit; refills slowly at home, very slowly elsewhere. */
  glow: { drain: 15, home: 1, out: 0.375 },
  /** While the app is closed: health drops per hour but never below the floor; glow refills per second. */
  offline: { healthPerHour: 6, healthFloor: 30, glowPerSecond: 1, restRecoverPerHour: 20 },
  /** Offline catch-up stops after this long (a long trip away is like a short one). */
  offlineCapHours: 72,
  snacks: {
    krill: { health: 4, gp: 1, glow: 0 },
    shrimp: { health: 8, gp: 3, glow: 0 },
    gold: { health: 20, gp: 10, glow: 0 },
    plankton: { health: 0, gp: 0, glow: 7.5 },
  } satisfies Record<Snack, { health: number; gp: number; glow: number }>,
  /** A predator catch. */
  scareHealth: 20,
} as const

const clamp = (v: number) => Math.max(0, Math.min(100, v))
const H = 3600

export function newShark(now: number): CareState {
  return {
    v: 2, health: 90, glow: 100, gp: 0, resting: false,
    lastSeen: now, lastCheckIn: '', happySeconds: 0, stats: { eaten: 0, dodges: 0, scares: 0 },
    level: 1, levelGp: 0, friends: [],
  }
}

/** Bring a saved shark from an older version forward (v1 had fullness and safety meters). */
export function migrate(raw: unknown, now: number): CareState | null {
  const s = raw as Omit<Partial<CareState>, 'v'> & { v?: number; fullness?: number }
  if (!s || typeof s.health !== 'number' || typeof s.glow !== 'number') return null
  const base = newShark(now)
  return {
    ...base,
    health: clamp(s.v === 1 && typeof s.fullness === 'number' ? Math.min(s.health, Math.max(s.fullness, 40)) : s.health),
    glow: clamp(s.glow),
    gp: typeof s.gp === 'number' ? s.gp : 0,
    resting: !!s.resting,
    lastSeen: typeof s.lastSeen === 'number' ? s.lastSeen : now,
    lastCheckIn: typeof s.lastCheckIn === 'string' ? s.lastCheckIn : '',
    happySeconds: typeof s.happySeconds === 'number' ? s.happySeconds : 0,
    stats: s.stats ?? base.stats,
    level: typeof s.level === 'number' && s.level >= 1 ? Math.floor(s.level) : 1,
    levelGp: typeof s.levelGp === 'number' ? s.levelGp : 0,
    friends: Array.isArray(s.friends) ? s.friends : [],
  }
}

export function mood(s: CareState): Mood {
  if (s.resting) return 'resting'
  if (s.health >= RULES.happyAt) return 'happy'
  if (s.health >= RULES.contentAt) return 'content'
  return 'hungry'
}

/** What the shark would say it needs right now, in kid-friendly words. */
export function need(s: CareState): string {
  switch (mood(s)) {
    case 'resting': return 'Resting at home. Let it sleep a little.'
    case 'hungry': return 'Hurt and hungry! Eat snacks or rest in the cave.'
    case 'happy': return 'Happy and healthy!'
    default: return s.glow < 20 ? 'Glow is low. Rest at home to recharge.' : 'Doing okay. Snacks and cave rest keep it healthy.'
  }
}

/** Advance the shark by `dt` seconds while the app is open. Mutates and returns `s`. */
export function tick(s: CareState, dt: number, ctx: Ctx): CareState {
  const home = ctx.atHome || s.resting
  const glowing = ctx.glowing && !s.resting && s.glow > 0

  s.glow = clamp(s.glow + dt * (glowing ? -RULES.glow.drain : home ? RULES.glow.home : RULES.glow.out))

  if (s.resting) s.health = clamp(s.health + RULES.restRecover * dt)
  else {
    const drain = RULES.healthDrain.idle + RULES.healthDrain.swim * Math.max(0, Math.min(1, ctx.moving ?? 0))
    s.health = clamp(s.health + dt * (home ? RULES.caveHeal : -drain))
  }

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
    s.levelGp += RULES.happyGpPerHour
  }
}

/** Eat a snack: returns the Glow Points earned. */
export function eat(s: CareState, kind: Snack): number {
  const k = RULES.snacks[kind]
  s.health = clamp(s.health + k.health)
  s.glow = clamp(s.glow + k.glow)
  s.gp += k.gp
  s.levelGp += k.gp
  if (k.health > 0) s.stats.eaten++
  return k.gp
}

/** A predator caught the shark. It isn't killed, just hurt and scared home. */
export function scare(s: CareState) {
  s.health = clamp(s.health - RULES.scareHealth)
  s.stats.scares++
  if (s.health <= 0) s.resting = true
}

/** Caught in the research submarine's spotlight: game over (see `continueAfterCapture`). */
export function captured(s: CareState) {
  s.stats.captures = (s.stats.captures ?? 0) + 1
}

/**
 * Continue after a capture: the shark wriggles free and swims home, keeping its
 * Glow Points. Free for now; this is where a paid or rewarded continue can go later.
 */
export function continueAfterCapture(s: CareState) {
  s.health = Math.max(s.health, 30)
  s.resting = false
  s.stats.continues = (s.stats.continues ?? 0) + 1
}

/** Got past a predator without being touched: a small reward. */
export function dodge(s: CareState): number {
  s.gp += RULES.dodgeGp
  s.levelGp += RULES.dodgeGp
  s.stats.dodges++
  return RULES.dodgeGp
}

/** Has the shark earned enough in this place for a friend to find it? */
export function friendDue(s: CareState, goal: number) {
  return s.levelGp >= goal && !s.friends.some((f) => f.level === s.level)
}

/**
 * The friend makes this place its home and the pocket shark swims on to the
 * next place on the sea map (points for the new place start at 0).
 */
export function moveOn(s: CareState, friendName: string, lastLevel: number) {
  if (!s.friends.some((f) => f.level === s.level)) s.friends.push({ level: s.level, name: friendName })
  s.level = Math.min(lastLevel, s.level + 1)
  s.levelGp = 0
}

/** The friend stays here, but the next place isn't built yet: keep playing here. */
export function befriend(s: CareState, friendName: string) {
  if (!s.friends.some((f) => f.level === s.level)) s.friends.push({ level: s.level, name: friendName })
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
  s.levelGp += RULES.checkInGp
  return RULES.checkInGp
}

export interface AwaySummary {
  seconds: number
  before: Pick<CareState, 'health' | 'glow' | 'gp'>
  after: Pick<CareState, 'health' | 'glow' | 'gp'>
}

/**
 * Catch up on time spent with the app closed. The shark is assumed to be at
 * home: health slowly wears down (never below the floor) and glow refills.
 */
export function catchUp(s: CareState, now: number): AwaySummary {
  const pick = () => ({ health: s.health, glow: s.glow, gp: s.gp })
  const before = pick()
  const elapsed = Math.max(0, Math.min(now - s.lastSeen, RULES.offlineCapHours * H * 1000)) / 1000
  const step = 60
  const o = RULES.offline
  for (let t = 0; t < elapsed; t += step) {
    const dt = Math.min(step, elapsed - t)
    s.glow = clamp(s.glow + o.glowPerSecond * dt)
    if (s.resting) {
      s.health = clamp(s.health + (o.restRecoverPerHour * dt) / H)
      if (s.health >= RULES.wakeAt) s.resting = false
    } else {
      s.health = Math.max(Math.min(s.health, o.healthFloor), s.health - (o.healthPerHour * dt) / H)
    }
    payHappy(s, mood(s) === 'happy' ? dt : 0)
  }
  s.lastSeen = now
  return { seconds: elapsed, before, after: pick() }
}
