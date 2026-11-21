// Kid-safe nicknames for the Glow & Gulp leaderboard.
// Players never type a name: the server only accepts names built from these lists,
// so no personal info (or anything rude) can reach the public board.
// The storefront imports this file to offer a "new name" button.

export const ADJECTIVES = [
  'Glowy', 'Sparkly', 'Sleepy', 'Zippy', 'Bubbly', 'Snappy', 'Twinkly', 'Wiggly', 'Speedy', 'Sneaky',
  'Happy', 'Brave', 'Tiny', 'Shiny', 'Giggly', 'Swishy', 'Bouncy', 'Jolly', 'Clever', 'Comet',
  'Cosmic', 'Minty', 'Lucky', 'Frosty', 'Sunny', 'Misty', 'Dizzy', 'Plucky', 'Mighty', 'Starry',
] as const

export const CREATURES = [
  'Krill', 'Shrimp', 'Squid', 'Octopus', 'Jelly', 'Seahorse', 'Starfish', 'Lanternfish', 'Pufferfish', 'Ray',
  'Turtle', 'Otter', 'Narwhal', 'Dolphin', 'Crab', 'Clam', 'Urchin', 'Minnow', 'Eel', 'Anglerfish',
  'Plankton', 'Manatee', 'Walrus', 'Penguin', 'Snail', 'Lobster', 'Guppy', 'Barnacle', 'Pocket Shark', 'Coral',
] as const

const PATTERN = new RegExp(`^(${ADJECTIVES.join('|')}) (${CREATURES.join('|')}) ([1-9][0-9])$`)

export function isValidNickname(name: unknown): name is string {
  return typeof name === 'string' && PATTERN.test(name)
}

export function randomNickname(rand: () => number = Math.random): string {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  return `${pick(ADJECTIVES)} ${pick(CREATURES)} ${10 + Math.floor(rand() * 90)}`
}
