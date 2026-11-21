// Story narration with the phone's own text-to-speech voices (expo-speech):
// works offline, in Expo Go, with no audio files. A warm, slightly slow
// storyteller pace. Swap in a recorded voice-over later by replacing speak().
import * as Speech from 'expo-speech'

/** Preferred iOS storyteller voices, best first. Enhanced versions win if installed. */
const PREFERRED = ['Ava', 'Samantha', 'Allison', 'Susan', 'Zoe', 'Karen', 'Moira']

let chosen: string | undefined
let picking: Promise<void> | null = null

/** Pick the nicest English voice on this device (runs once). */
export function prepareNarrator(): Promise<void> {
  if (!picking) {
    picking = Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const english = voices.filter((v) => v.language?.toLowerCase().startsWith('en'))
        const score = (v: Speech.Voice) => {
          const i = PREFERRED.findIndex((n) => v.name?.includes(n))
          return (v.quality === Speech.VoiceQuality.Enhanced ? 0 : 100) + (i < 0 ? 50 : i) + (v.language === 'en-US' ? 0 : 10)
        }
        chosen = english.sort((a, b) => score(a) - score(b))[0]?.identifier
      })
      .catch(() => { chosen = undefined })
  }
  return picking
}

export interface NarrateHooks {
  onStart?: () => void
  onEnd?: () => void
}

export function narrate(text: string, hooks: NarrateHooks = {}) {
  try {
    Speech.speak(text.replace(/…/g, '...'), {
      language: 'en-US',
      voice: chosen,
      rate: 0.9,
      pitch: 1.05,
      onStart: hooks.onStart,
      onDone: hooks.onEnd,
      onStopped: hooks.onEnd,
      onError: hooks.onEnd,
    })
  } catch {
    hooks.onEnd?.()
  }
}

export function stopNarration() {
  void Speech.stop().catch(() => {})
}
