import AsyncStorage from '@react-native-async-storage/async-storage'
import { newShark, type CareState } from './care'

const KEY = 'pocketshark:care:v1'

export async function loadCare(now: number): Promise<CareState> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as CareState
      if (s && s.v === 1 && typeof s.fullness === 'number') return s
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
