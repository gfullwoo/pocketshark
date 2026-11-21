import AsyncStorage from '@react-native-async-storage/async-storage'
import { migrate, newShark, type CareState } from './care'

const KEY = 'pocketshark:care:v1'

export async function loadCare(now: number): Promise<CareState> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw) {
      const s = migrate(JSON.parse(raw), now)
      if (s) return s
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
