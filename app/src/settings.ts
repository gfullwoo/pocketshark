// Player settings (volume levels), saved on the device and shared by the game
// and the story. Levels are 0–1, where 1 is the game's normal mix.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'

export interface Settings {
  music: number
  sfx: number
}

const KEY = 'pocketshark:settings:v1'
const LEGACY_MUTE_KEY = 'pocketshark:sound-muted:v1'
const DEFAULTS: Settings = { music: 1, sfx: 1 }

let current: Settings = { ...DEFAULTS }
let loaded: Promise<Settings> | null = null
const listeners = new Set<(s: Settings) => void>()

const clamp = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d)

export function loadSettings(): Promise<Settings> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY)
        if (raw) {
          const v = JSON.parse(raw) as Partial<Settings>
          current = { music: clamp(v.music, DEFAULTS.music), sfx: clamp(v.sfx, DEFAULTS.sfx) }
        } else if ((await AsyncStorage.getItem(LEGACY_MUTE_KEY)) === '1') {
          current = { music: 0, sfx: 0 } // carry over the old Sound off button
        }
      } catch { /* defaults */ }
      listeners.forEach((l) => l(current))
      return current
    })()
  }
  return loaded
}

export function getSettings(): Settings {
  return current
}

export function updateSettings(patch: Partial<Settings>) {
  current = { music: clamp(patch.music ?? current.music, 1), sfx: clamp(patch.sfx ?? current.sfx, 1) }
  listeners.forEach((l) => l(current))
  void AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {})
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function useSettings(): Settings {
  const [s, set] = useState(current)
  useEffect(() => {
    const off = onSettings(set)
    void loadSettings().then(set)
    return off
  }, [])
  return s
}
