// The sea map: 20 places in the same ocean, from the sunny shelf down to the
// Midnight Trench. In each one the pocket shark earns points (eating, dodging)
// until a friend finds it; the friend makes that place its home and the pocket
// shark swims on to the next, harder place. Pure TypeScript (unit-tested).

/** How a place looks. Only the first levels have hand-made looks so far. */
export interface Look {
  /** Water gradient: top, middle, bottom. */
  water: [string, string, string]
  /** Cave rock: lit top, middle, shadow. */
  rock: { light: string; mid: string; dark: string }
  /** Seabed sand: top, bottom. */
  sand: [string, string]
  /** Coral colors and how far apart (px, before scaling) the coral grows. */
  coral: string[]
  coralGap: [number, number]
  /** Kelp: colors, how many extra stalks across the reef, and how tall (fraction of the scene). */
  kelp: { stalk: string; leaf: string; extra: number; tall: number; bulbs: boolean }
  /** Short sea grass along the seabed. */
  seagrass: boolean
  /** Soft distant terrain colors, far to near ("r,g,b"). */
  backdrop: [string, string, string]
}

/** How hard a place is. Level 1 is the baseline. */
export interface Difficulty {
  /** Seconds between one predator leaving and the next arriving. */
  predGap: [number, number]
  /** Predator swim speed multiplier. */
  predSpeed: number
  /** Prey swim speed multiplier (harder to catch). */
  preySpeed: number
  /** Prey count multiplier (fewer snacks around). */
  preyCount: number
  /** First submarine, and the gap between submarines, in seconds. */
  subFirst: [number, number]
  subGap: [number, number]
  /** Seconds in the spotlight before getting caught. */
  spotSeconds: number
}

export interface Level {
  n: number
  name: string
  /** One line for the map. */
  blurb: string
  /** Points to earn here (eating and dodging) before a friend finds you. */
  goal: number
  diff: Difficulty
  /** Undefined = this place isn't built yet ("coming soon" on the map). */
  look?: Look
  /** The friend who comes to live here. */
  friend: { name: string; pattern: number }
}

export const LEVEL_COUNT = 20

const PLACES: [string, string][] = [
  ['Twilight Shelf', 'Where your story began.'],
  ['Kelp Forest', 'Tall swaying kelp. More hunters hide here.'],
  ['Sandy Flats', 'Wide open sand with nowhere to hide.'],
  ['Coral Gardens', 'Bright coral and quick little fish.'],
  ['Sea Grass Meadow', 'Soft grass and sneaky crabs.'],
  ['Rocky Shoals', 'Jagged rocks and strong currents.'],
  ['Sponge Field', 'A strange forest of sponges.'],
  ['Wreck Reef', 'A reef grown over an old ship.'],
  ['Volcanic Vents', 'Warm water and bubbling rock.'],
  ['The Seamount', 'An underwater mountain, full of food and danger.'],
  ['Blue Hole', 'A deep, round, dark hole in the reef.'],
  ['Glass Sponge Reef', 'Delicate, glowing glass sponges.'],
  ['Whale Fall', 'A feast for everyone, hunters too.'],
  ['Cold Shelf', 'Icy water at the edge of the deep.'],
  ['Glowing Bay', 'Everything here glows, even the hunters.'],
  ['Canyon Edge', 'A cliff over the endless dark.'],
  ['Brine Pools', 'Lakes at the bottom of the sea.'],
  ['Abyssal Plain', 'Flat, dark and very quiet.'],
  ['Hydrothermal Field', 'Black smokers and hot springs.'],
  ['Midnight Trench', 'The deepest, darkest place of all.'],
]

const FRIENDS = ['Pip', 'Coral', 'Nori', 'Marlo', 'Kiki', 'Finn', 'Luma', 'Mochi', 'Tango', 'Opal',
  'Ripple', 'Pebble', 'Echo', 'Zuzu', 'Wink', 'Sunny', 'Indigo', 'Squish', 'Dot', 'Bubbles']

const round10 = (v: number) => Math.round(v / 10) * 10

/** Points goal for a level: 150 at level 1, growing about 22% per level. */
export function goalFor(n: number) {
  return round10(150 * Math.pow(1.22, n - 1))
}

/** Difficulty for a level: level 1 is the baseline, each level a step harder (with floors and caps). */
export function difficultyFor(n: number): Difficulty {
  const k = n - 1
  const gap = Math.pow(0.85, k)
  return {
    predGap: [Math.max(2, 6 * gap), Math.max(4, 12 * gap)],
    predSpeed: Math.min(1.8, 1 + 0.12 * k),
    preySpeed: Math.min(1.6, 1 + 0.08 * k),
    preyCount: Math.max(0.55, 1 - 0.06 * k),
    subFirst: [Math.max(12, 25 - 3 * k), Math.max(20, 40 - 4 * k)],
    subGap: [Math.max(30, 60 - 6 * k), Math.max(45, 100 - 8 * k)],
    spotSeconds: Math.max(0.3, 0.45 - 0.01 * k),
  }
}

const REEF: Look = {
  water: ['#0b2742', '#06172b', '#020812'],
  rock: { light: '#2b4258', mid: '#172a3d', dark: '#0a1522' },
  sand: ['#0a1a2c', '#030b16'],
  coral: ['#7d3f68', '#8c5638', '#4f5e95', '#2f7a6c', '#9a4a5a'],
  coralGap: [48, 92],
  kelp: { stalk: 'rgba(38,92,72,.75)', leaf: 'rgba(46,110,84,.6)', extra: 0, tall: 0, bulbs: false },
  seagrass: false,
  backdrop: ['24,60,92', '16,44,72', '9,28,48'],
}

const KELP_FOREST: Look = {
  water: ['#0c3236', '#061b20', '#02090c'],
  rock: { light: '#34493f', mid: '#1b2c27', dark: '#0b1513' },
  sand: ['#14261f', '#050e0b'],
  coral: ['#8a6a2c', '#5d7a3a', '#7a4a3a'],
  coralGap: [90, 150],
  kelp: { stalk: 'rgba(96,92,46,.7)', leaf: 'rgba(112,108,52,.5)', extra: 4, tall: 0.7, bulbs: true },
  seagrass: true,
  backdrop: ['22,64,58', '14,46,42', '8,28,26'],
}

const LOOKS: Record<number, Look> = { 1: REEF, 2: KELP_FOREST }

export const LEVELS: Level[] = PLACES.map(([name, blurb], i) => ({
  n: i + 1,
  name,
  blurb,
  goal: goalFor(i + 1),
  diff: difficultyFor(i + 1),
  look: LOOKS[i + 1],
  friend: { name: FRIENDS[i], pattern: i },
}))

export function level(n: number): Level {
  return LEVELS[Math.max(0, Math.min(LEVEL_COUNT - 1, n - 1))]
}

/** A level the player can actually swim in (its landscape is built). */
export function playable(n: number) {
  return !!level(n).look
}
