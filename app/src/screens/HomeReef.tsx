import { Canvas, matchFont, Picture, type SkFont, type SkPicture } from '@shopify/react-native-skia'
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { eatSound, useReefAudio } from '../game/audio'
import { GameMenu } from '../ui/GameMenu'
import { useControls } from '../game/controls'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { record } from '../game/ctx2d'
import { paintBackdrop, paintScenery } from '../game/scenery'
import { World } from '../game/world'
import { befriend, captured, catchUp, checkIn, continueAfterCapture, dodge, eat, friendDue, mood, moveOn, need, newShark, scare, tick, type AwaySummary, type CareState, type Mood } from '../model/care'
import { level, LEVEL_COUNT, playable } from '../game/levels'
import { friendLook } from '../game/pocketShark'
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
/** Space reserved at the bottom for the joystick and Glow button. */
const CONTROLS_HEIGHT = 170

interface Hud {
  glow: number; health: number; gp: number; levelGp: number
  /** The place on the sea map, and whether its friend has been found. */
  n: number; found: boolean; visiting: boolean
  mood: Mood | 'scared'; need: string; glowOn: boolean; atHome: boolean
}

type Card = { kind: 'intro' } | { kind: 'away'; sum: AwaySummary; bonus: number } | { kind: 'caught' } | { kind: 'friend' }

const MOOD_LABEL: Record<Mood | 'scared', string> = {
  scared: 'Scared', happy: 'Happy', content: 'Content', hungry: 'Hungry', resting: 'Resting',
}

/** The level the shark swims in: its saved place, or the highest place that's built so far. */
function builtLevel(n: number) {
  let k = n
  while (k > 1 && !playable(k)) k--
  return k
}

export function HomeReef({ visit, onWatchStory, onOpenMap }: { visit?: number; onWatchStory?: () => void; onOpenMap?: () => void }) {
  const insets = useSafeAreaInsets()
  const [picture, setPicture] = useState<SkPicture | null>(null)
  const world = useRef(new World())
  const audio = useReefAudio()
  const playSound = audio.play
  const setDanger = audio.setDanger
  // Web preview only: expose the world so a moment can be set up for checking.
  if (Platform.OS === 'web') (globalThis as { __reef?: World }).__reef = world.current
  const care = useRef<CareState | null>(null)
  const scenery = useRef<SkPicture | null>(null)
  const backdrop = useRef<SkPicture | null>(null)
  const size = useRef({ W: 0, H: 0 })
  const [hud, setHud] = useState<Hud | null>(null)
  const [toast, setToast] = useState<{ m: string; c?: string; id: number } | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const paused = useRef(false)
  /** Visiting a friend at a finished place (no new friend comes while visiting). */
  const visiting = useRef<number | undefined>(undefined)
  useEffect(() => { visiting.current = visit && visit > 0 ? visit : undefined }, [visit])
  const isPaused = menuOpen || card?.kind === 'caught' || card?.kind === 'friend'
  useEffect(() => { paused.current = isPaused }, [isPaused])

  const showToast = useCallback((m: string, c?: string) => setToast({ m, c, id: Date.now() }), [])

  /** Paint this place's landscape (rock, coral, kelp colors) for the current size. */
  const paintPlace = useCallback(() => {
    const w = world.current, { W } = size.current
    if (W <= 0) return
    scenery.current = record(W, w.SH, makeFont, (ctx) => paintScenery(ctx, W, w.SH, w.look))
    backdrop.current = record(W, w.SH, makeFont, (ctx) => paintBackdrop(ctx, W, w.SH, w.look))
  }, [])

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
      // swim in the saved place on the sea map
      const n = visiting.current ?? builtLevel(s.level), w = world.current
      w.setLevel(n)
      const here = s.friends.find((f) => f.level === n)
      if (here) w.keepFriend(friendLook(level(n).friend.pattern))
      paintPlace()
      wake(s, fresh)
    })
    const sub = AppState.addEventListener('change', (st) => {
      const s = care.current
      if (!s) return
      if (st === 'active') wake(s, false)
      else { s.lastSeen = Date.now(); void saveCare(s) }
    })
    return () => { alive = false; sub.remove() }
  }, [wake, paintPlace])

  // Game loop: simulate, apply care rules, record a frame for Skia.
  useEffect(() => {
    let raf = 0, last = Date.now(), hudAt = 0, saveAt = Date.now()
    const hooks = {
      onEat: (kind: Parameters<typeof eat>[1]) => {
        const s = care.current
        if (!s) return
        eat(s, kind)
        playSound(eatSound(kind))
        void Haptics.impactAsync(kind === 'gold' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
      },
      onScare: () => {
        if (care.current) scare(care.current)
        playSound('hurt')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      },
      onDodge: () => {
        if (care.current) dodge(care.current)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      },
      onToast: showToast,
      onCaptured: () => {
        if (care.current) { captured(care.current); void saveCare(care.current) }
        playSound('captured')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setCard({ kind: 'caught' })
      },
      onFriendMet: () => {
        playSound('friend')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        // a moment to see them meet before the card
        setTimeout(() => setCard({ kind: 'friend' }), 1400)
      },
    }
    const frame = () => {
      const now = Date.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = care.current, w = world.current, { W, H } = size.current
      if (s && W > 0 && scenery.current) {
        if (!paused.current) {
          w.update(dt, s.glow > 1, s.resting, hooks)
          tick(s, dt, { atHome: w.atHome(), glowing: w.glowOn && w.gI > 0.3, moving: w.effort })
          // enough points here: a friend comes looking for the pocket shark
          const L = level(builtLevel(s.level))
          if (visiting.current === undefined && !w.friend && !w.capture && !s.resting && friendDue(s, L.goal)) {
            w.summonFriend(friendLook(L.friend.pattern))
            showToast('Someone is swimming over to you…', '#ffd166')
          }
        }
        s.lastSeen = now
        const bg = scenery.current, far = backdrop.current
        setPicture(record(W, H, makeFont, (ctx) => w.draw(ctx, () => ctx.drawPicture(bg), s.resting, far ? () => ctx.drawPicture(far) : undefined)))
        if (now - hudAt > 200) {
          hudAt = now
          setDanger(w.danger && !paused.current)
          setHud({
            glow: s.glow, health: s.health, gp: s.gp, levelGp: s.levelGp,
            visiting: visiting.current !== undefined, n: visiting.current ?? builtLevel(s.level), found: s.friends.some((f) => f.level === (visiting.current ?? builtLevel(s.level))),
            mood: w.scared && !s.resting ? 'scared' : mood(s),
            need: w.scared && !s.resting ? 'Ouch! Hiding in the cave until it feels safe.' : need(s),
            glowOn: w.glowOn, atHome: w.atHome(),
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
  }, [showToast, playSound, setDanger])

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
    world.current.resize(W, H, CONTROLS_HEIGHT + insets.bottom)
    paintPlace()
  }

  const openMenu = () => {
    // let go of the controls so nothing keeps moving behind the menu
    world.current.setStick(0, 0)
    world.current.glowHeld = false
    setMenuOpen(true)
  }

  // Left thumb: joystick. Right thumb: hold to glow. Both at once (multi-touch).
  const controls = useControls({
    insets,
    onStick: (x, y) => world.current.setStick(x, y),
    onGlow: (held) => {
      world.current.glowHeld = held
      if (held) void Haptics.selectionAsync()
    },
  })

  return (
    <View style={styles.root} onLayout={onLayout}>
      <Canvas style={StyleSheet.absoluteFill}>
        {picture && <Picture picture={picture} />}
      </Canvas>

      {/* One layer reads every finger: joystick on the left, glow button on the right. */}
      <View style={StyleSheet.absoluteFill} {...controls.touchProps} />
      {hud && controls.render(hud.glowOn)}

      {hud && (
        <View pointerEvents="box-none" style={[styles.hud, { paddingTop: insets.top + 8 }]}>
          <View style={styles.row}>
            <View style={styles.pill}><Text style={styles.pillLabel}>Glow Points</Text><Text style={styles.pillValue}>{hud.gp}</Text></View>
            <View style={styles.rowRight}>
              <Pressable
                onPress={openMenu}
                style={({ pressed }) => [styles.pill, styles.storyPill, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Open the menu"
              >
                <Text style={styles.storyPillText}>Menu</Text>
              </Pressable>
              <View style={[styles.pill, styles.moodPill, moodStyle(hud.mood)]}><Text style={styles.moodText}>{MOOD_LABEL[hud.mood]}</Text></View>
            </View>
          </View>
          <View style={styles.meters}>
            <Meter label="Health" value={hud.health} color={colors.pink} />
            <Meter label="Glow" value={hud.glow} color={colors.glow} />
          </View>
          <FriendMeter levelGp={hud.levelGp} n={hud.n} found={hud.found} visiting={hud.visiting} />
          <Text style={styles.need}>{hud.need}</Text>
        </View>
      )}

      {toast && (
        <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 168 }]}>
          <Text key={toast.id} style={[styles.toast, toast.c ? { color: toast.c } : null]}>{toast.m}</Text>
        </View>
      )}



      {menuOpen && (
        <GameMenu
          onResume={() => setMenuOpen(false)}
          onWatchStory={onWatchStory ? () => { setMenuOpen(false); onWatchStory() } : undefined}
          onOpenMap={onOpenMap ? () => { setMenuOpen(false); if (care.current) void saveCare(care.current); onOpenMap() } : undefined}
          onPreviewSound={() => playSound('eat-shrimp')}
        />
      )}

      {card?.kind === 'caught' ? (
        <CaughtCard
          onContinue={() => {
            // Monetization hook: a paid or rewarded-ad continue can be required here later.
            const s = care.current
            if (s) { continueAfterCapture(s); void saveCare(s) }
            world.current.release()
            setCard(null)
          }}
          onStartOver={() => {
            const s = newShark(Date.now())
            care.current = s
            void saveCare(s)
            world.current.release()
            setCard({ kind: 'intro' })
          }}
        />
      ) : card?.kind === 'friend' ? (
        <FriendCard
          n={hud?.n ?? 1}
          onDone={(swimOn) => {
            const s = care.current
            const n = builtLevel(s?.level ?? 1), L = level(n)
            if (s) {
              if (swimOn) moveOn(s, L.friend.name, LEVEL_COUNT)
              else befriend(s, L.friend.name)
              void saveCare(s)
            }
            setCard(null)
            if (swimOn && onOpenMap) onOpenMap()
            else world.current.calm = false
          }}
        />
      ) : card ? (
        <CareCard card={card} onClose={() => setCard(null)} onWatchStory={onWatchStory} />
      ) : null}
    </View>
  )
}

/** Progress toward finding a friend in this place. */
function FriendMeter({ levelGp, n, found, visiting }: { levelGp: number; n: number; found: boolean; visiting: boolean }) {
  const L = level(n)
  const v = Math.min(1, levelGp / L.goal)
  return (
    <View style={styles.friendMeter} accessibilityLabel={`Level ${n}, ${L.name}. ${found ? 'Friend found' : `${Math.min(levelGp, L.goal)} of ${L.goal} points to find a friend`}`}>
      <View style={styles.friendRow}>
        <Text style={styles.levelName} numberOfLines={1}>Level {n} · {L.name}</Text>
        <Text style={styles.friendCount}>{found ? (visiting ? `Visiting ${L.friend.name}` : `${L.friend.name} lives here`) : `${Math.min(levelGp, L.goal)} / ${L.goal}`}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, (found ? 1 : v) * 100)}%`, backgroundColor: colors.gold }]} />
      </View>
      {!found && <Text style={styles.friendHint}>Earn points to find a friend</Text>}
    </View>
  )
}

/** A friend found the pocket shark: it makes this place its home, and you swim on. */
function FriendCard({ n, onDone }: { n: number; onDone: (swimOn: boolean) => void }) {
  const L = level(n), next = n < LEVEL_COUNT ? level(n + 1) : null
  const canSwimOn = !!next && playable(next.n)
  const name = L.friend.name
  return (
    <View style={styles.scrim}>
      <View style={[styles.card, styles.friendCard]}>
        <Text style={[styles.cardTitle, { color: colors.gold }]}>You found a friend!</Text>
        <Text style={styles.cardText}>Meet <Text style={styles.em}>{name}</Text>. {name} was lonely too, and followed your glow all the way here.</Text>
        {canSwimOn ? (
          <>
            <Text style={styles.cardText}>{name} will make <Text style={styles.em}>{L.name}</Text> their home and look after it. Now you can swim on to <Text style={styles.em}>Level {next!.n}: {next!.name}</Text>. It’s harder there!</Text>
            <Pressable onPress={() => onDone(true)} style={({ pressed }) => [styles.cardBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <Text style={styles.cardBtnText}>Give {name} this home and swim on</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.cardText}>{name} will make <Text style={styles.em}>{L.name}</Text> their home. The next part of the ocean is still being explored. Coming soon!</Text>
            <Pressable onPress={() => onDone(false)} style={({ pressed }) => [styles.cardBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <Text style={styles.cardBtnText}>Swim with {name}</Text>
            </Pressable>
          </>
        )}
      </View>
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

function moodStyle(m: Mood | 'scared') {
  switch (m) {
    case 'scared': return { borderColor: colors.pink }
    case 'happy': return { borderColor: colors.glow }
    case 'hungry': return { borderColor: '#ffa877' }
    case 'resting': return { borderColor: colors.muted }
    default: return null
  }
}

function fmtAway(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60)
  return h >= 1 ? `${h} hr${h > 1 ? 's' : ''}${m ? ` ${m} min` : ''}` : `${m} min`
}

/** Game over: the research submarine caught the shark in its spotlight. */
function CaughtCard({ onContinue, onStartOver }: { onContinue: () => void; onStartOver: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <View style={styles.scrim}>
      <View style={[styles.card, styles.caughtCard]}>
        <Text style={[styles.cardTitle, styles.caughtTitle]}>Caught!</Text>
        <Text style={styles.cardText}>The research submarine spotted your pocket shark in its light and scooped it up to study.</Text>
        <Text style={styles.cardText}>Keep out of the spotlight next time, and hide in your cave while the sub goes by.</Text>
        <Pressable onPress={onContinue} style={({ pressed }) => [styles.cardBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={styles.cardBtnText}>Continue</Text>
        </Pressable>
        <Text style={[styles.cardText, styles.caughtNote]}>Your shark wriggles free and swims home. You keep your Glow Points.</Text>
        <Pressable
          onPress={() => (confirm ? onStartOver() : setConfirm(true))}
          style={styles.storyLink}
          accessibilityRole="button"
        >
          <Text style={[styles.storyLinkText, confirm && { color: colors.pink }]}>
            {confirm ? 'Tap again to start over (Glow Points reset to 0)' : 'Start over with a new shark'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function CareCard({ card, onClose, onWatchStory }: { card: Exclude<Card, { kind: 'caught' } | { kind: 'friend' }>; onClose: () => void; onWatchStory?: () => void }) {
  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        {card.kind === 'intro' ? (
          <>
            <Text style={styles.cardTitle}>Meet your pocket shark</Text>
            <Text style={styles.cardText}>It’s one of the rarest sharks in the world, and it’s counting on you.</Text>
            <Text style={styles.cardText}>Use the joystick on the left to swim. Hold <Text style={styles.em}>Glow</Text> on the right to light up the pockets behind its fins, and snacks swim to the light.</Text>
            <Text style={styles.cardText}>Glowing also catches a predator’s eye. Big sharks, squid and crabs are dangerous: don’t touch them! Watch the water, even far off in the distance. When one comes, let go of Glow and swim back to your cave.</Text>
            <Text style={styles.cardText}>Watch out for the research submarine and its spotlight. If it catches you in the light, the game is over! Hide in the cave until it’s gone.</Text>
            <Text style={styles.cardText}>Keep it fed and safe, and it stays happy and earns Glow Points, even while you’re away.</Text>
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Welcome back!</Text>
            <Text style={styles.cardText}>Your shark rested at home for {fmtAway(card.sum.seconds)}.</Text>
            <View style={styles.changes}>
              <Change label="Health" a={card.sum.before.health} b={card.sum.after.health} />
              <Change label="Glow" a={card.sum.before.glow} b={card.sum.after.glow} />
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
  caughtCard: { borderColor: colors.pink },
  friendCard: { borderColor: colors.gold },
  friendMeter: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  friendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, gap: 8 },
  levelName: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  friendCount: { color: colors.gold, fontSize: 13, fontWeight: '600' },
  friendHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  caughtTitle: { color: colors.pink },
  caughtNote: { fontSize: 14, color: colors.muted, marginTop: 8, textAlign: 'center' },
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
