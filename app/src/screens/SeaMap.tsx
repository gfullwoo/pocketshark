// The sea map: 20 places in one ocean, from the sunny shelf at the top down to
// the Midnight Trench. A winding path links them. Places where a friend now
// lives show that friend; the pocket shark waits at the current place; places
// further on are locked (or still being explored: "coming soon").
import { Canvas, matchFont, Picture, type SkFont, type SkPicture } from '@shopify/react-native-skia'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { record, type Ctx2D } from '../game/ctx2d'
import { LEVELS, playable } from '../game/levels'
import { drawPocketShark, friendLook, PLAYER_LOOK } from '../game/pocketShark'
import type { CareState } from '../model/care'
import { loadCare } from '../model/storage'
import { colors } from '../theme'

const TOP = 190 // space for the header
const STEP = 132 // vertical distance between places
const NODE = 64

let font: SkFont | null = null
const makeFont = () => (font ??= matchFont({ fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }), fontSize: 14, fontWeight: 'bold' }))

function nodeAt(i: number, W: number) {
  return { x: W * (0.5 + 0.27 * Math.sin(i * 1.25 + 0.4)), y: TOP + i * STEP }
}

/** The ocean behind the map: lighter near the top, darker the deeper you go, with the path. */
function paintMap(c: Ctx2D, W: number, H: number, s: CareState | null, t: number) {
  const g = c.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#1d5a86'); g.addColorStop(0.12, '#0f3a60'); g.addColorStop(0.45, '#08213d'); g.addColorStop(0.8, '#040f20'); g.addColorStop(1, '#010409')
  c.fillStyle = g
  c.fillRect(0, 0, W, H)
  // sunlight near the surface
  const ray = c.createLinearGradient(0, 0, 0, 700)
  ray.addColorStop(0, 'rgba(191,227,255,.12)'); ray.addColorStop(1, 'rgba(191,227,255,0)')
  c.fillStyle = ray
  for (let i = 0; i < 4; i++) {
    const x = W * (0.1 + i * 0.27) + Math.sin(t * 0.3 + i) * 12
    c.beginPath(); c.moveTo(x - 18, 0); c.lineTo(x + 18, 0); c.lineTo(x + 90, 700); c.lineTo(x - 10, 700); c.closePath(); c.fill()
  }
  // soft rock walls down both sides, darker with depth
  for (const side of [-1, 1]) {
    c.fillStyle = 'rgba(3,10,20,.55)'
    c.beginPath()
    const x0 = side < 0 ? 0 : W
    c.moveTo(x0, 0)
    for (let y = 0; y <= H; y += 40) {
      const w = 18 + 26 * (0.5 + 0.5 * Math.sin(y * 0.013 + (side > 0 ? 2 : 0))) + 18 * (0.5 + 0.5 * Math.sin(y * 0.0041 + side)) + (y / H) * 30
      c.lineTo(x0 - side * w, y)
    }
    c.lineTo(x0, H); c.closePath(); c.fill()
  }
  // drifting specks
  for (let i = 0; i < 90; i++) {
    const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * W, y = ((Math.sin(i * 37.3) * 0.5 + 0.5) * H + t * 6 * ((i % 3) + 1)) % H
    c.fillStyle = `rgba(200,225,255,${0.08 + (i % 4) * 0.04})`
    c.beginPath(); c.arc(x, y, 1 + (i % 3) * 0.5, 0, Math.PI * 2); c.fill()
  }
  // the path, dotted; lit up to where the pocket shark is
  const cur = s?.level ?? 1
  for (let i = 0; i < LEVELS.length - 1; i++) {
    const a = nodeAt(i, W), b = nodeAt(i + 1, W)
    const done = i + 1 < cur
    for (let k = 1; k < 10; k++) {
      const f = k / 10
      const x = a.x + (b.x - a.x) * f + Math.sin(f * Math.PI) * (i % 2 ? 26 : -26), y = a.y + (b.y - a.y) * f
      c.fillStyle = done ? 'rgba(255,209,102,.85)' : 'rgba(160,190,220,.28)'
      c.beginPath(); c.arc(x, y, done ? 2.6 : 2, 0, Math.PI * 2); c.fill()
    }
  }
  // friends at home in the places they keep, and the pocket shark at the current place
  for (const f of s?.friends ?? []) {
    const L = LEVELS[f.level - 1]
    if (!L) continue
    const p = nodeAt(f.level - 1, W)
    drawPocketShark(c, friendLook(L.friend.pattern), { x: p.x - 58, y: p.y + 2 + Math.sin(t * 2 + f.level) * 2, dir: 1, tilt: 0, scale: 0.42, t, glow: 0.7, mouth: 0, mood: 'happy' })
  }
  const p = nodeAt(cur - 1, W)
  drawPocketShark(c, PLAYER_LOOK, { x: p.x + 60, y: p.y + Math.sin(t * 2.4) * 3, dir: -1, tilt: 0, scale: 0.5, t, glow: 0.5 + 0.5 * Math.sin(t * 3), mouth: 0, mood: 'normal' })
}

export function SeaMap({ onPlay, onBack }: { onPlay: () => void; onBack?: () => void }) {
  const insets = useSafeAreaInsets()
  const [care, setCare] = useState<CareState | null>(null)
  const [W, setW] = useState(0)
  const [pic, setPic] = useState<SkPicture | null>(null)
  const scroll = useRef<ScrollViewInstance>(null)
  const H = TOP + (LEVELS.length - 1) * STEP + 330 // room at the bottom for the dock

  useEffect(() => {
    let alive = true
    void loadCare(Date.now()).then((s) => { if (alive) setCare(s) })
    return () => { alive = false }
  }, [])

  // gently animated ocean (about 15 fps is plenty for the map)
  useEffect(() => {
    if (W <= 0) return
    let raf = 0, last = 0
    const t0 = Date.now()
    const frame = () => {
      const now = Date.now()
      if (now - last > 66) {
        last = now
        const t = (now - t0) / 1000
        setPic(record(W, H, makeFont, (c) => paintMap(c, W, H, care, t)))
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [W, H, care])

  // start with the current place in view
  useEffect(() => {
    if (!care || W <= 0) return
    const y = nodeAt(care.level - 1, W).y - 220
    const id = setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y), animated: true }), 250)
    return () => clearTimeout(id)
  }, [care, W])

  const cur = care?.level ?? 1
  const friendsFound = care?.friends.length ?? 0
  const nodes = useMemo(() => LEVELS.map((L, i) => ({ L, ...nodeAt(i, W) })), [W])

  return (
    <View style={styles.root} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      <ScrollView ref={scroll} contentContainerStyle={{ height: H }} showsVerticalScrollIndicator={false}>
        <Canvas style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
          {pic && <Picture picture={pic} />}
        </Canvas>

        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>Sea Map</Text>
          <Text style={styles.sub}>Earn points in each place until a friend finds you. Then your friend keeps that home, and you swim deeper.</Text>
          <View style={styles.friendsPill}><Text style={styles.friendsText}>Friends found: {friendsFound} / {LEVELS.length}</Text></View>
        </View>

        {W > 0 && nodes.map(({ L, x, y }) => {
          const done = !!care?.friends.some((f) => f.level === L.n)
          const here = L.n === cur
          const built = playable(L.n)
          const locked = L.n > cur
          const label = done ? `${L.friend.name} lives here` : here ? (built ? 'You are here' : 'Coming soon') : locked ? (built ? 'Locked' : 'Coming soon') : ''
          return (
            <View key={L.n} style={[styles.nodeWrap, { left: x - 90, top: y - NODE / 2 }]} pointerEvents="box-none">
              <Pressable
                disabled={!here || !built}
                onPress={onPlay}
                accessibilityRole="button"
                accessibilityLabel={`Level ${L.n}, ${L.name}. ${label}`}
                style={({ pressed }) => [
                  styles.node,
                  done && styles.nodeDone,
                  here && styles.nodeHere,
                  locked && styles.nodeLocked,
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <Text style={[styles.nodeNum, locked && styles.lockedText, done && { color: '#2a1d00' }]}>{L.n}</Text>
              </Pressable>
              <Text style={[styles.nodeName, locked && styles.lockedText]} numberOfLines={1}>{L.name}</Text>
              {!!label && <Text style={[styles.nodeLabel, done && { color: colors.gold }, here && { color: colors.glow }]}>{label}</Text>}
            </View>
          )
        })}
      </ScrollView>
      {/* where you are now, and the button to swim there */}
      {care && (
        <View style={[styles.dock, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={styles.dockLevel}>Level {cur}</Text>
          <Text style={styles.dockName}>{LEVELS[cur - 1].name}</Text>
          <Text style={styles.dockBlurb}>{LEVELS[cur - 1].blurb}</Text>
          {playable(cur) ? (
            <Pressable onPress={onPlay} style={({ pressed }) => [styles.swim, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <Text style={styles.swimText}>Swim here</Text>
            </Pressable>
          ) : (
            <Text style={styles.dockSoon}>This part of the ocean is still being explored. Coming soon!</Text>
          )}
        </View>
      )}
      {onBack && (
        <Pressable onPress={onBack} style={[styles.back, { top: insets.top + 10 }]} accessibilityRole="button" accessibilityLabel="Back to the game">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  header: { paddingHorizontal: 22 },
  title: { color: colors.text, fontSize: 32, fontWeight: '800' },
  sub: { color: '#c7dcf0', fontSize: 15, lineHeight: 21, marginTop: 6, maxWidth: 420 },
  friendsPill: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,209,102,.14)', borderWidth: 1, borderColor: 'rgba(255,209,102,.4)' },
  friendsText: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  nodeWrap: { position: 'absolute', width: 180, alignItems: 'center' },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#123355', borderWidth: 2, borderColor: 'rgba(160,190,220,.45)' },
  nodeDone: { backgroundColor: colors.gold, borderColor: '#fff2c7' },
  nodeHere: { backgroundColor: '#0e3b2a', borderColor: colors.glow, borderWidth: 3, shadowColor: colors.glow, shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  nodeLocked: { backgroundColor: 'rgba(10,24,44,.85)', borderColor: 'rgba(120,150,180,.25)' },
  nodeNum: { color: colors.text, fontSize: 24, fontWeight: '800' },
  lockedText: { color: 'rgba(170,190,215,.5)' },
  nodeName: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 6 },
  nodeLabel: { color: colors.muted, fontSize: 13, marginTop: 1 },
  swim: { marginTop: 12, minHeight: 54, borderRadius: 999, backgroundColor: colors.glow, alignItems: 'center', justifyContent: 'center' },
  swimText: { color: '#04130a', fontSize: 19, fontWeight: '800' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14, backgroundColor: 'rgba(6,16,30,.94)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.line },
  dockLevel: { color: colors.glow, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  dockName: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 2 },
  dockBlurb: { color: '#c7dcf0', fontSize: 15, marginTop: 2 },
  dockSoon: { color: colors.gold, fontSize: 15, marginTop: 10 },
  back: { position: 'absolute', right: 16, minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  backText: { color: colors.glow, fontSize: 16, fontWeight: '700' },
})
