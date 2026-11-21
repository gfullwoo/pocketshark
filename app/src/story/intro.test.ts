import { describe, expect, it } from 'vitest'
import { CAPTIONS, STORY_SECONDS, storyGlow } from './intro'

// Rough length of a spoken line at the narrator's pace (rate 0.9): about
// 2.3 words a second, plus a short pause at commas, full stops and ellipses.
const spoken = (text: string) => {
  const words = text.split(/\s+/).filter(Boolean).length
  const pauses = (text.match(/[,.!?…]/g) ?? []).length
  return words / 2.3 + pauses * 0.18 + 0.3
}
const CALLS = [35, 37.6, 40.2] // the shark's own "Hello?" moments

describe('narration timing', () => {
  it('each line finishes before the next one starts', () => {
    for (let i = 0; i < CAPTIONS.length - 1; i++) {
      const end = CAPTIONS[i].t + spoken(CAPTIONS[i].text)
      expect(end, `"${CAPTIONS[i].text}" runs into the next line`).toBeLessThanOrEqual(CAPTIONS[i + 1].t + 0.2)
    }
  })

  it('never talks over the shark calling "Hello?"', () => {
    for (const c of CAPTIONS) {
      const end = c.t + spoken(c.text)
      for (const call of CALLS) {
        const overlap = Math.min(end, call + 0.8) - Math.max(c.t, call)
        expect(overlap, `"${c.text}" overlaps the call at ${call}s`).toBeLessThan(0.3)
      }
    }
  })

  it('is all spoken before the title card', () => {
    const last = CAPTIONS[CAPTIONS.length - 1]
    expect(last.t + spoken(last.text)).toBeLessThan(STORY_SECONDS)
  })
})

describe('glow', () => {
  it('flickers before it settles on', () => {
    expect(storyGlow(56)).toBe(0)
    expect(storyGlow(57)).toBeGreaterThan(0)
    expect(storyGlow(57.5)).toBe(0)
    expect(storyGlow(63)).toBe(1)
  })
})
