// In-game audio for the home reef: a quiet looping background tune and short
// sound effects. Rendered by tools/compose_game_audio.py.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import type { Snack } from '../model/care'
import { getSettings, loadSettings, onSettings, type Settings } from '../settings'

const SOURCES = {
  'eat-krill': require('../../assets/sfx/eat-krill.wav'),
  'eat-krill-2': require('../../assets/sfx/eat-krill-2.wav'),
  'eat-krill-3': require('../../assets/sfx/eat-krill-3.wav'),
  'eat-shrimp': require('../../assets/sfx/eat-shrimp.wav'),
  'eat-gold': require('../../assets/sfx/eat-gold.wav'),
  'eat-glow': require('../../assets/sfx/eat-glow.wav'),
  hurt: require('../../assets/sfx/hurt.wav'),
} as const
type Sfx = keyof typeof SOURCES

const BITES: Sfx[] = ['eat-krill', 'eat-krill-2', 'eat-krill-3']
let bite = 0
/** The sound for eating a snack. Small prey cycle through three pitches so a run of bites isn't samey. */
export function eatSound(kind: Snack): Sfx {
  if (kind === 'krill') return BITES[bite++ % BITES.length]
  return kind === 'shrimp' ? 'eat-shrimp' : kind === 'gold' ? 'eat-gold' : 'eat-glow'
}

// The menu's percentage is the playback volume (defaults: music 25%, effects 50%).
const MUSIC_VOLUME = 1
const SFX_VOLUME = 1
/** Copies of each effect, so quick bites can overlap instead of cutting each other off. */
const VOICES = 3
export type { Sfx }

export function useReefAudio() {
  const music = useRef<AudioPlayer | null>(null)
  const pools = useRef(new Map<Sfx, { players: AudioPlayer[]; next: number }>())
  const active = useRef(true) // app in the foreground

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
    try {
      const m = createAudioPlayer(require('../../assets/music/reef-loop.m4a'))
      m.loop = true
      music.current = m
      for (const name of Object.keys(SOURCES) as Sfx[]) {
        const players = Array.from({ length: VOICES }, () => createAudioPlayer(SOURCES[name]))
        pools.current.set(name, { players, next: 0 })
      }
    } catch {
      /* no audio on this device: the game plays silently */
    }

    // follow the menu's volume levels, live
    const apply = (s: Settings) => {
      try {
        const m = music.current
        if (m) {
          m.volume = MUSIC_VOLUME * s.music
          if (s.music <= 0 || !active.current) m.pause()
          else if (!m.playing) m.play()
        }
        for (const { players } of pools.current.values()) players.forEach((p) => { p.volume = SFX_VOLUME * s.sfx })
      } catch { /* ignore */ }
    }
    const off = onSettings(apply)
    void loadSettings().then(apply)

    // pause the tune while the app is in the background, pick it back up after
    const sub = AppState.addEventListener('change', (st) => {
      active.current = st === 'active'
      apply(getSettings())
    })
    return () => {
      off()
      sub.remove()
      try {
        music.current?.remove()
        for (const { players } of pools.current.values()) players.forEach((p) => p.remove())
      } catch { /* already released */ }
      music.current = null
      pools.current.clear()
    }
  }, [])

  const play = useCallback((name: Sfx) => {
    if (getSettings().sfx <= 0) return
    const pool = pools.current.get(name)
    if (!pool) return
    const p = pool.players[pool.next]
    pool.next = (pool.next + 1) % pool.players.length
    try {
      // rewind first, then play: a player that already finished won't restart otherwise
      p.seekTo(0).then(() => p.play(), () => p.play())
    } catch { /* ignore a sound that can't play */ }
  }, [])

  return { play }
}
