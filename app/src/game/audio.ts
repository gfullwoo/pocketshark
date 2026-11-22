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
  captured: require('../../assets/sfx/captured.wav'),
  friend: require('../../assets/sfx/friend.wav'),
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
  const danger = useRef<AudioPlayer | null>(null)
  /** 0 = the calm reef tune, 1 = the scary submarine music; moves gradually for a crossfade. */
  const mix = useRef(0)
  const dangerOn = useRef(false)
  const pools = useRef(new Map<Sfx, { players: AudioPlayer[]; next: number }>())
  const active = useRef(true) // app in the foreground

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
    try {
      const m = createAudioPlayer(require('../../assets/music/reef-loop.m4a'))
      m.loop = true
      music.current = m
      const d = createAudioPlayer(require('../../assets/music/danger-loop.m4a'))
      d.loop = true
      danger.current = d
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
        const k = mix.current
        const tracks: [AudioPlayer | null, number][] = [
          [music.current, MUSIC_VOLUME * s.music * (1 - k)],
          // the scary tune plays a bit louder than the calm one, so it's noticed
          [danger.current, Math.min(1, MUSIC_VOLUME * s.music * 1.8) * k],
        ]
        for (const [p, v] of tracks) {
          if (!p) continue
          p.volume = v
          if (v <= 0.001 || !active.current) { if (p.playing) p.pause() }
          else if (!p.playing) p.play()
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
        danger.current?.remove()
        for (const { players } of pools.current.values()) players.forEach((p) => p.remove())
      } catch { /* already released */ }
      music.current = null
      danger.current = null
      pools.current.clear()
    }
  }, [])

  // crossfade toward the scary music while the submarine is around (about a second each way)
  useEffect(() => {
    const id = setInterval(() => {
      const target = dangerOn.current ? 1 : 0
      if (mix.current === target) return
      const was = mix.current
      mix.current = target > was ? Math.min(1, was + 0.12) : Math.max(0, was - 0.08)
      // start the scary tune from the top each time the sub shows up
      if (was === 0 && danger.current) void danger.current.seekTo(0).catch(() => {})
      const s = getSettings()
      try {
        const m = music.current, d = danger.current
        if (m) { m.volume = MUSIC_VOLUME * s.music * (1 - mix.current); if (m.volume > 0.001 && active.current && !m.playing) m.play() }
        if (d) {
          d.volume = Math.min(1, MUSIC_VOLUME * s.music * 1.8) * mix.current
          if (d.volume > 0.001 && active.current) { if (!d.playing) d.play() } else if (d.playing) d.pause()
        }
      } catch { /* ignore */ }
    }, 100)
    return () => clearInterval(id)
  }, [])

  const setDanger = useCallback((on: boolean) => { dangerOn.current = on }, [])

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

  return { play, setDanger }
}
