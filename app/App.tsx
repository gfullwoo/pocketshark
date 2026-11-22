import AsyncStorage from '@react-native-async-storage/async-storage'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeReef } from './src/screens/HomeReef'
import { SeaMap } from './src/screens/SeaMap'
import { loadCare } from './src/model/storage'
import { IntroStory } from './src/story/IntroStory'
import { colors } from './src/theme'

const STORY_SEEN = 'pocketshark:story-seen:v1'

/** Web preview only: `?story=34` plays the story from 34 seconds. */
function previewStart(): number | null {
  if (Platform.OS !== 'web') return null
  const v = new URLSearchParams(globalThis.location?.search ?? '').get('story')
  return v == null ? null : Number(v) || 0
}

export default function App() {
  const [screen, setScreen] = useState<'loading' | 'story' | 'map' | 'reef'>('loading')
  const [startAt] = useState(previewStart)
  /** Visiting a friend at a finished place (undefined = the current place). */
  const [visit, setVisit] = useState<number | undefined>(undefined)
  /** Bumped to restart the game screen in another place. */
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (startAt != null) { setScreen('story'); return }
    AsyncStorage.getItem(STORY_SEEN)
      .then((v) => setScreen(v ? 'map' : 'story'))
      .catch(() => setScreen('story'))
  }, [startAt])

  const finishStory = () => {
    void AsyncStorage.setItem(STORY_SEEN, '1').catch(() => {})
    // the game starts on the sea map, at level 1
    setScreen('map')
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen === 'loading' && <View style={{ flex: 1, backgroundColor: colors.abyss }} />}
      {screen === 'story' && <IntroStory onDone={finishStory} startAt={startAt ?? 0} />}
      {screen === 'map' && <SeaMap onPlay={(n) => { setVisit(n); setScreen('reef') }} />}
      {screen === 'reef' && <HomeReef
          key={run}
          visit={visit}
          onWatchStory={() => setScreen('story')}
          onOpenMap={() => setScreen('map')}
          onPickPlace={(n) => {
            // the current place plays normally; a friend's home is a visit
            void loadCare(Date.now()).then((s) => {
              setVisit(n !== s.level && s.friends.some((f) => f.level === n) ? n : undefined)
              setRun((r) => r + 1)
            })
          }}
        />}
    </SafeAreaProvider>
  )
}
