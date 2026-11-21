import { Canvas, matchFont, Picture, type SkFont, type SkPicture } from '@shopify/react-native-skia'
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { record } from '../game/ctx2d'
import { paintScenery } from '../game/scenery'
import { World } from '../game/world'
import { catchUp, checkIn, dodge, eat, mood, need, scare, tick, type AwaySummary, type CareState, type Mood } from '../model/care'
import { loadCare, saveCare } from '../model/storage'
import { colors } from '../theme'

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' })
const fonts = new Map<number, SkFont>()
const makeFont = (size: number) => {
  let f = fonts.get(size)
  if (!f) { f = matchFont({ fontFamily, fontSize: size, fontWeight: 'bold' }); fonts.set(size, f) }
  return f
}

/** Show the "while you were away" card after this long. */
const AWAY_CARD_SECONDS = 10 * 60
/** Swim the shark a little above the finger so the finger doesn't hide it. */
const FINGER_OFFSET = 50
/** Space reserved at the bottom for the Home and Glow buttons. */
const CONTROLS_HEIGHT = 124

interface Hud {
  fullness: number; glow: number; safety: number; health: number; gp: number
  mood: Mood; need: string; glowOn: boolean; atHome: boolean
}

type Card = { kind: 'intro' } | { kind: 'away'; sum: AwaySummary; bonus: number }

const MOOD_LABEL: Record<Mood, string> = {
  happy: 'Happy', content: 'Content', peckish: 'Peckish', uneasy: 'Uneasy', resting: 'Resting',
}

export function HomeReef({ onWatchStory }: { onWatchStory?: () => void }) {
  const insets = useSafeAreaInsets()
  const [picture, setPicture] = useState<SkPicture | null>(null)
  const world = useRef(new World())
  const care = useRef<CareState | null>(null)
  const scenery = useRef<SkPicture | null>(null)
  const size = useRef({ W: 0, H: 0 })
  const [hud, setHud] = useState<Hud | null>(null)
  const [toast, setToast] = useState<{ m: string; c?: string; id: number } | null>(null)
  const [card, setCard] = useState<Card | null>(null)

  const showToast = useCallback((m: string, c?: string) => setToast({ m, c, id: Date.now() }), [])

  // Load the saved shark, catch up on time away, and pay the daily check-in.
  const wake = useCallback((s: CareState, fresh: boolean) => {
    const now = Date.now()
    const sum = catchUp(s, now)
    const bonus = checkIn(s, now)
    if (fresh) setCard({ kind: 'intro' })
    else if (sum.seconds >= AWAY_CARD_SECONDS || bonus > 0) setCard({ kind: 'away', sum, bonus })
    void saveCare(s)
  }, [])

  useEffect(() => {
    let alive = true
    void loadCare(Date.now()).then((s) => {
      if (!alive) return
      const fresh = s.stats.eaten === 0 && s.lastCheckIn === ''
      care.current = s
      wake(s, fresh)
    })
    const sub = AppState.addEventListener('change', (st) => {
      const s = care.current
      if (!s) return
      if (st === 'active') wake(s, false)
      else { s.lastSeen = Date.now(); void saveCare(s) }
    })
    return () => { alive = false; sub.remove() }
  }, [wake])

  // Game loop: simulate, apply care rules, record a frame for Skia.
  useEffect(() => {
    let raf = 0, last = Date.now(), hudAt = 0, saveAt = Date.now()
    const hooks = {
      onEat: (kind: Parameters<typeof eat>[1]) => {
        const s = care.current
        if (!s) return
        eat(s, kind)
        void Haptics.impactAsync(kind === 'gold' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
      },
      onScare: () => {
        if (care.current) scare(care.current)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      },
      onDodge: () => {
        if (care.current) dodge(care.current)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      },
      onToast: showToast,
    }
    const frame = () => {
      const now = Date.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = care.current, w = world.current, { W, H } = size.current
      if (s && W > 0 && scenery.current) {
        w.update(dt, s.glow > 1, s.resting, hooks)
        tick(s, dt, { atHome: w.atHome(), glowing: w.glowOn && w.gI > 0.3 })
        s.lastSeen = now
        const bg = scenery.current
        setPicture(record(W, H, makeFont, (ctx) => w.draw(ctx, () => ctx.drawPicture(bg), s.resting)))
        if (now - hudAt > 200) {
          hudAt = now
          setHud({
            fullness: s.fullness, glow: s.glow, safety: s.safety, health: s.health, gp: s.gp,
            mood: mood(s), need: need(s), glowOn: w.glowOn, atHome: w.atHome(),
          })
        }
        if (now - saveAt > 15_000) { saveAt = now; void saveCare(s) }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      if (care.current) void saveCare(care.current)
    }
  }, [showToast])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(id)
  }, [toast])

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: W, height: H } = e.nativeEvent.layout
    if (W === size.current.W && H === size.current.H) return
    size.current = { W, H }
    // Keep the seabed (and the home cave) above the Home and Glow buttons.
    const w = world.current
    w.resize(W, H, CONTROLS_HEIGHT + insets.bottom)
    scenery.current = record(W, w.SH, makeFont, (ctx) => paintScenery(ctx, W, w.SH))
  }

  const steer = (e: GestureResponderEvent) => {
    world.current.setTarget(e.nativeEvent.locationX, e.nativeEvent.locationY - FINGER_OFFSET)
  }

  const toggleGlow = () => {
    const s = care.current, w = world.current
    if (!s || s.resting) return
    if (!w.glowOn && s.glow <= 1) { showToast('Out of glow. Rest at home to recharge', colors.pink); return }
    w.glowOn = !w.glowOn
    void Haptics.selectionAsync()
    setHud((h) => (h ? { ...h, glowOn: w.glowOn } : h))
  }

  return (
    <View style={styles.root} onLayout={onLayout}>
      <Canvas style={StyleSheet.absoluteFill}>
        {picture && <Picture picture={picture} />}
      </Canvas>

      {/* Drag anywhere to swim. */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={steer}
        onResponderMove={steer}
      />

      {hud && (
        <View pointerEvents="box-none" style={[styles.hud, { paddingTop: insets.top + 8 }]}>
          <View style={styles.row}>
            <View style={styles.pill}><Text style={styles.pillLabel}>Glow Points</Text><Text style={styles.pillValue}>{hud.gp}</Text></View>
            <View style={styles.rowRight}>
              {onWatchStory && (
                <Pressable
                  onPress={onWatchStory}
                  style={({ pressed }) => [styles.pill, styles.storyPill, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Watch the story"
                >
                  <Text style={styles.storyPillText}>Story</Text>
                </Pressable>
              )}
              <View style={[styles.pill, styles.moodPill, moodStyle(hud.mood)]}><Text style={styles.moodText}>{MOOD_LABEL[hud.mood]}</Text></View>
            </View>
          </View>
          <View style={styles.meters}>
            <Meter label="Fullness" value={hud.fullness} color="#ffa877" />
            <Meter label="Glow" value={hud.glow} color={colors.glow} />
            <Meter label="Safety" value={hud.safety} color={colors.cyan} />
            <Meter label="Health" value={hud.health} color={colors.pink} />
          </View>
          <Text style={styles.need}>{hud.need}</Text>
        </View>
      )}

      {toast && (
        <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 168 }]}>
          <Text key={toast.id} style={[styles.toast, toast.c ? { color: toast.c } : null]}>{toast.m}</Text>
        </View>
      )}

      {hud && (
        <View pointerEvents="box-none" style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={() => world.current.goHome()}
            style={({ pressed }) => [styles.homeBtn, (hud.atHome || pressed) && styles.homeBtnOn]}
            accessibilityRole="button"
            accessibilityLabel="Swim home to the cave"
          >
            <Text style={styles.homeText}>{hud.atHome ? 'At home' : 'Home'}</Text>
          </Pressable>
          <Pressable
            onPress={toggleGlow}
            style={[styles.glowBtn, hud.glowOn && styles.glowBtnOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: hud.glowOn }}
            accessibilityLabel="Glow"
          >
            <Text style={[styles.glowText, hud.glowOn && styles.glowTextOn]}>{hud.glowOn ? 'Glow on' : 'Glow'}</Text>
          </Pressable>
        </View>
      )}

      {card && <CareCard card={card} onClose={() => setCard(null)} onWatchStory={onWatchStory} />}
    </View>
  )
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  const low = value < 20
  return (
    <View style={styles.meter} accessibilityLabel={`${label} ${Math.round(value)} percent`}>
      <Text style={styles.meterLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, value)}%`, backgroundColor: low ? colors.pink : color }]} />
      </View>
    </View>
  )
}

function moodStyle(m: Mood) {
  switch (m) {
    case 'happy': return { borderColor: colors.glow }
    case 'peckish': return { borderColor: '#ffa877' }
    case 'uneasy': return { borderColor: colors.pink }
    case 'resting': return { borderColor: colors.muted }
    default: return null
  }
}

function fmtAway(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60)
  return h >= 1 ? `${h} hr${h > 1 ? 's' : ''}${m ? ` ${m} min` : ''}` : `${m} min`
}

function CareCard({ card, onClose, onWatchStory }: { card: Card; onClose: () => void; onWatchStory?: () => void }) {
  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        {card.kind === 'intro' ? (
          <>
            <Text style={styles.cardTitle}>Meet your pocket shark</Text>
            <Text style={styles.cardText}>It’s one of the rarest sharks in the world, and it’s counting on you.</Text>
            <Text style={styles.cardText}>Drag to swim. Tap <Text style={styles.em}>Glow</Text> to light up the pockets behind its fins, and snacks swim to the light.</Text>
            <Text style={styles.cardText}>Glowing also catches a big shark’s eye. When you see the yellow warning, turn the glow off or swim <Text style={styles.em}>Home</Text> to the cave.</Text>
            <Text style={styles.cardText}>Keep it fed and safe, and it stays happy and earns Glow Points, even while you’re away.</Text>
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Welcome back!</Text>
            <Text style={styles.cardText}>Your shark rested at home for {fmtAway(card.sum.seconds)}.</Text>
            <View style={styles.changes}>
              <Change label="Fullness" a={card.sum.before.fullness} b={card.sum.after.fullness} />
              <Change label="Glow" a={card.sum.before.glow} b={card.sum.after.glow} />
              <Change label="Safety" a={card.sum.before.safety} b={card.sum.after.safety} />
              <Change label="Health" a={card.sum.before.health} b={card.sum.after.health} />
            </View>
            {card.sum.after.gp > card.sum.before.gp && (
              <Text style={styles.cardText}>It earned {Math.round(card.sum.after.gp - card.sum.before.gp)} Glow Points while happy.</Text>
            )}
            {card.bonus > 0 && <Text style={[styles.cardText, styles.em]}>Daily visit bonus: +{card.bonus} Glow Points</Text>}
          </>
        )}
        <Pressable onPress={onClose} style={({ pressed }) => [styles.cardBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={styles.cardBtnText}>{card.kind === 'intro' ? 'Let’s swim' : 'Back to the reef'}</Text>
        </Pressable>
        {onWatchStory && (
          <Pressable onPress={onWatchStory} style={styles.storyLink} accessibilityRole="button">
            <Text style={styles.storyLinkText}>Watch the story again</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

function Change({ label, a, b }: { label: string; a: number; b: number }) {
  const d = Math.round(b) - Math.round(a)
  return (
    <View style={styles.changeRow}>
      <Text style={styles.changeLabel}>{label}</Text>
      <Text style={styles.changeValue}>
        {Math.round(b)}
        <Text style={{ color: d > 0 ? colors.glow : d < 0 ? colors.pink : colors.muted }}>{d === 0 ? '' : `  ${d > 0 ? '+' : ''}${d}`}</Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  hud: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  pillLabel: { color: colors.muted, fontSize: 13 },
  pillValue: { color: colors.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  moodPill: { paddingVertical: 8 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storyPill: { paddingVertical: 8, minHeight: 40, alignItems: 'center' },
  storyPillText: { color: colors.glow, fontSize: 15, fontWeight: '600' },
  moodText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  meters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, padding: 10, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  meter: { width: '47%', flexGrow: 1 },
  meterLabel: { color: colors.muted, fontSize: 12, marginBottom: 3 },
  track: { height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8 },
  need: { color: colors.text, fontSize: 15, marginTop: 8, marginLeft: 4, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: { color: colors.text, fontSize: 16, fontWeight: '600', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(6,22,40,0.88)', borderWidth: 1, borderColor: colors.line },
  controls: { position: 'absolute', left: 16, right: 16, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  homeBtn: { minHeight: 52, paddingHorizontal: 22, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  homeBtnOn: { borderColor: colors.cyan },
  homeText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  glowBtn: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.line },
  glowBtnOn: { backgroundColor: colors.glow, borderColor: colors.glow, shadowColor: colors.glow, shadowOpacity: 0.9, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },
  glowText: { color: colors.glow, fontSize: 18, fontWeight: '700' },
  glowTextOn: { color: '#04130a' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,8,16,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, padding: 22, borderRadius: 24, backgroundColor: colors.panelSolid, borderWidth: 1, borderColor: colors.line },
  cardTitle: { color: colors.text, fontSize: 26, fontWeight: '700', marginBottom: 10 },
  cardText: { color: '#cfe1f1', fontSize: 16, lineHeight: 23, marginBottom: 10 },
  em: { color: colors.glow, fontWeight: '700' },
  changes: { marginVertical: 6, gap: 6 },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  changeLabel: { color: colors.muted, fontSize: 15 },
  changeValue: { color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cardBtn: { marginTop: 8, minHeight: 52, borderRadius: 999, backgroundColor: colors.glow, alignItems: 'center', justifyContent: 'center' },
  cardBtnText: { color: '#04130a', fontSize: 18, fontWeight: '700' },
  storyLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  storyLinkText: { color: colors.glow, fontSize: 15, fontWeight: '600' },
})
