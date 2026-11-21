// In-game audio for the home reef: a quiet looping background tune and short
// sound effects. Rendered by tools/compose_game_audio.py.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Snack } from '../model/care'

const SOURCES = {
  'eat-krill': require('../../assets/sfx/eat-krill.wav'),
  'eat-shrimp': require('../../assets/sfx/eat-shrimp.wav'),
  'eat-gold': require('../../assets/sfx/eat-gold.wav'),
  'eat-glow': require('../../assets/sfx/eat-glow.wav'),
  hurt: require('../../assets/sfx/hurt.wav'),
} as const
type Sfx = keyof typeof SOURCES

export const EAT_SOUND: Record<Snack, Sfx> = { krill: 'eat-krill', shrimp: 'eat-shrimp', gold: 'eat-gold', plankton: 'eat-glow' }

/** Background music level: quiet, so it sits under the sound effects. */
const MUSIC_VOLUME = 0.3
const SFX_VOLUME = 0.85
/** Copies of each effect, so quick bites can overlap instead of cutting each other off. */
const VOICES = 3
const MUTE_KEY = 'pocketshark:sound-muted:v1'

export function useReefAudio() {
  const music = useRef<AudioPlayer | null>(null)
  const pools = useRef(new Map<Sfx, { players: AudioPlayer[]; next: number }>())
  const mutedRef = useRef(false)
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
    try {
      const m = createAudioPlayer(require('../../assets/music/reef-loop.m4a'))
      m.loop = true
      m.volume = MUSIC_VOLUME
      music.current = m
      for (const name of Object.keys(SOURCES) as Sfx[]) {
        const players = Array.from({ length: VOICES }, () => {
          const p = createAudioPlayer(SOURCES[name])
          p.volume = SFX_VOLUME
          return p
        })
        pools.current.set(name, { players, next: 0 })
      }
    } catch {
      /* no audio on this device: the game plays silently */
    }
    void AsyncStorage.getItem(MUTE_KEY).then((v) => {
      const m = v === '1'
      mutedRef.current = m
      setMutedState(m)
      if (!m) music.current?.play()
    }).catch(() => music.current?.play())

    // pause the tune while the app is in the background, pick it back up after
    const sub = AppState.addEventListener('change', (st) => {
      if (!music.current) return
      if (st === 'active' && !mutedRef.current) music.current.play()
      else if (st !== 'active') music.current.pause()
    })
    return () => {
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
    if (mutedRef.current) return
    const pool = pools.current.get(name)
    if (!pool) return
    const p = pool.players[pool.next]
    pool.next = (pool.next + 1) % pool.players.length
    try {
      void p.seekTo(0)
      p.play()
    } catch { /* ignore a sound that can't play */ }
  }, [])

  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m
    setMutedState(m)
    void AsyncStorage.setItem(MUTE_KEY, m ? '1' : '0').catch(() => {})
    try {
      if (m) music.current?.pause()
      else music.current?.play()
    } catch { /* ignore */ }
  }, [])

  return { play, muted, setMuted }
}
