import { Canvas, matchFont, Picture, type SkFont, type SkPicture } from '@shopify/react-native-skia'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { record } from '../game/ctx2d'
import { paintScenery } from '../game/scenery'
import { getSettings, loadSettings } from '../settings'
import { colors } from '../theme'
import { CAPTIONS, captionAt, STORY_SECONDS, Story } from './intro'
import { narrate, prepareNarrator, stopNarration } from './narrator'

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' })
const fonts = new Map<number, SkFont>()
const makeFont = (size: number) => {
  let f = fonts.get(size)
  if (!f) { f = matchFont({ fontFamily, fontSize: size, fontWeight: 'bold' }); fonts.set(size, f) }
  return f
}

/** Optional start time, used to preview a moment of the story (e.g. on the web). */
export function IntroStory({ onDone, startAt = 0 }: { onDone: () => void; startAt?: number }) {
  const insets = useSafeAreaInsets()
  const [picture, setPicture] = useState<SkPicture | null>(null)
  const story = useRef<Story | null>(null)
  const scenery = useRef<SkPicture | null>(null)
  const [caption, setCaption] = useState('')
  const [ended, setEnded] = useState(false)
  const [canSkip, setCanSkip] = useState(false)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  // The soundtrack is timed to the story (see tools/compose_story_music.py).
  const music = useAudioPlayer(require('../../assets/music/story.m4a'))
  const musicStatus = useAudioPlayerStatus(music)
  const [rolling, setRolling] = useState(false)
  /** Bumped by Restart: replays the story from the beginning. */
  const [run, setRun] = useState(0)

  // Start when the music is ready, so picture and sound begin together.
  // If audio can't load, start anyway after a moment: the story works silently.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
    void prepareNarrator()
    void loadSettings()
    const id = setTimeout(() => setRolling(true), 2000)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (musicStatus.isLoaded) setRolling(true)
  }, [musicStatus.isLoaded])

  const finish = () => {
    stopNarration()
    try { music.pause() } catch { /* already released */ }
    onDone()
  }

  // Lower the music while the narrator speaks, so the words come through.
  const duck = (on: boolean) => {
    try { music.volume = (on ? 0.4 : 1) * getSettings().music } catch { /* ignore */ }
  }
  useEffect(() => () => stopNarration(), [])

  const restart = () => {
    stopNarration()
    duck(false)
    setEnded(false)
    setCaption('')
    setRun((r) => r + 1)
  }

  const toggleMute = () => {
    setMuted((m) => {
      try { music.muted = !m } catch { /* ignore */ }
      mutedRef.current = !m
      if (!m) stopNarration()
      return !m
    })
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: W, height: H } = e.nativeEvent.layout
    if (story.current && story.current.W === W && story.current.H === H) return
    const s = new Story(W, H)
    story.current = s
    scenery.current = record(W, s.SH, makeFont, (ctx) => paintScenery(ctx, W, s.SH))
  }

  useEffect(() => {
    if (!rolling) return
    const from = run > 0 ? 0 : startAt
    let raf = 0
    let t0 = Date.now() - from * 1000
    let syncAt = Date.now()
    // narration cues still to speak (when previewing from the middle, skip the earlier ones)
    let cue = CAPTIONS.findIndex((c) => c.t >= from - 0.3)
    if (cue < 0) cue = CAPTIONS.length
    try {
      music.volume = getSettings().music
      music.play()
      if (from > 0 || run > 0) void music.seekTo(from)
    } catch { /* play silently */ }
    let lastCaption = '', endedSet = false
    const skipTimer = setTimeout(() => setCanSkip(true), 1500)
    const frame = () => {
      // Follow the music's clock so picture and sound never drift apart.
      if (Date.now() - syncAt > 1000) {
        syncAt = Date.now()
        try {
          const at = music.currentTime, now = (Date.now() - t0) / 1000
          const off = at - now
          if (music.playing && now < STORY_SECONDS + 4) {
            // Way off (a seek that didn't take, or a hiccup): move the music to the picture.
            if (Math.abs(off) > 1) void music.seekTo(now)
            // Slightly off: nudge the picture to the music, which is what the ear notices.
            else if (Math.abs(off) > 0.12) t0 = Date.now() - at * 1000
          }
        } catch { /* keep the wall clock */ }
      }
      const t = (Date.now() - t0) / 1000
      while (cue < CAPTIONS.length && t >= CAPTIONS[cue].t) {
        // Only speak a line that is still on time; a stale one (e.g. after a hiccup) is skipped.
        if (!mutedRef.current && t - CAPTIONS[cue].t < 1.5) narrate(CAPTIONS[cue].text, { onStart: () => duck(true), onEnd: () => duck(false) })
        cue++
      }
      const s = story.current, bg = scenery.current
      if (s && bg) {
        setPicture(record(s.W, s.H, makeFont, (ctx) => s.draw(ctx, t, () => ctx.drawPicture(bg))))
        const c = captionAt(t)
        if (c !== lastCaption) { lastCaption = c; setCaption(c) }
        if (!endedSet && t >= STORY_SECONDS) { endedSet = true; setEnded(true) }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); clearTimeout(skipTimer) }
  }, [rolling, startAt, music, run])

  return (
    <View style={styles.root} onLayout={onLayout}>
      <Canvas style={StyleSheet.absoluteFill}>
        {picture && <Picture picture={picture} />}
      </Canvas>

      {!ended && caption !== '' && (
        <View pointerEvents="none" style={[styles.captionWrap, { bottom: insets.bottom + 28 }]}>
          <Text key={caption} style={styles.caption}>{caption}</Text>
        </View>
      )}

      {!ended && canSkip && (
        <Pressable
          onPress={restart}
          style={({ pressed }) => [styles.skip, styles.restart, { top: insets.top + 10 }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Restart the story"
        >
          <Text style={styles.skipText}>Restart</Text>
        </Pressable>
      )}

      {!ended && canSkip && (
        <Pressable
          onPress={finish}
          style={({ pressed }) => [styles.skip, { top: insets.top + 10 }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Skip the story"
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      )}

      <Pressable
        onPress={toggleMute}
        style={({ pressed }) => [styles.sound, { top: insets.top + 10 }, pressed && { opacity: 0.7 }]}
        accessibilityRole="switch"
        accessibilityState={{ checked: !muted }}
        accessibilityLabel="Music and narration"
      >
        <Text style={styles.skipText}>{muted ? 'Sound off' : 'Sound on'}</Text>
      </Pressable>

      {ended && (
        <View style={styles.titleWrap}>
          <Text style={styles.title}>PocketShark</Text>
          <Text style={styles.tagline}>Help him glow, stay safe, and find friends, so pocket sharks aren’t so rare anymore.</Text>
          <Pressable onPress={finish} style={({ pressed }) => [styles.start, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <Text style={styles.startText}>Start</Text>
          </Pressable>
          <Pressable onPress={restart} style={styles.again} accessibilityRole="button">
            <Text style={styles.againText}>Watch again</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  captionWrap: { position: 'absolute', left: 18, right: 18, alignItems: 'center' },
  caption: {
    color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: '600', textAlign: 'center',
    paddingVertical: 12, paddingHorizontal: 18, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(3,10,20,0.72)',
  },
  skip: { position: 'absolute', right: 14, minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(3,10,20,0.6)', borderWidth: 1, borderColor: colors.line },
  sound: { position: 'absolute', left: 14, minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(3,10,20,0.6)', borderWidth: 1, borderColor: 'rgba(125,255,154,0.28)' },
  restart: { right: 92 },
  again: { minHeight: 44, justifyContent: 'center', marginTop: 10, paddingHorizontal: 16 },
  againText: { color: colors.glow, fontSize: 17, fontWeight: '600' },
  skipText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  titleWrap: { position: 'absolute', left: 24, right: 24, top: '30%', alignItems: 'center' },
  title: { color: colors.glow, fontSize: 46, fontWeight: '800', textShadowColor: 'rgba(125,255,154,0.6)', textShadowRadius: 18 },
  tagline: { color: colors.text, fontSize: 18, lineHeight: 26, textAlign: 'center', marginTop: 12, marginBottom: 28, maxWidth: 340 },
  start: { minHeight: 56, minWidth: 200, borderRadius: 999, backgroundColor: colors.glow, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  startText: { color: '#04130a', fontSize: 20, fontWeight: '800' },
})
