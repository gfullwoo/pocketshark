import { describe, expect, it } from 'vitest'
import { CAPTIONS, NARRATION, STORY_SECONDS, storyGlow } from './intro'

// Measured length of each recorded line (see tools/make_narration.py).
const spoken = (text: string) => {
  const i = CAPTIONS.findIndex((c) => c.text === text)
  return NARRATION[i][0] - CAPTIONS[i].t + NARRATION[i][1]
}
const CALLS = [35, 37.6, 40.2] // the shark's own "Hello?" moments

describe('narration timing', () => {
  it('has a recording for every caption, starting on its cue', () => {
    expect(NARRATION.length).toBe(CAPTIONS.length)
    NARRATION.forEach(([a], i) => expect(Math.abs(a - CAPTIONS[i].t)).toBeLessThan(0.3))
  })

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
