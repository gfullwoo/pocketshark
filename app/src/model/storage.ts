import AsyncStorage from '@react-native-async-storage/async-storage'
import { LEVEL_COUNT, playable } from '../game/levels'
import { migrate, newShark, swimOnIfReady, type CareState } from './care'

const KEY = 'pocketshark:care:v1'

export async function loadCare(now: number): Promise<CareState> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw) {
      const s = migrate(JSON.parse(raw), now)
      if (s) {
        // a friend kept the last place while the next one was still being built: swim on now
        if (swimOnIfReady(s, playable, LEVEL_COUNT)) await saveCare(s)
        return s
      }
    }
  } catch {
    /* fall through to a fresh shark */
  }
  return newShark(now)
}

export async function saveCare(s: CareState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* best effort; the next save will try again */
  }
}
