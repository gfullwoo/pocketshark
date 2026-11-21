// A simple, large-target volume slider built on React Native's touch
// responder (no native slider library). Drag or tap the track, or use the
// − / + buttons; VoiceOver can adjust it too.
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import { colors } from '../theme'

interface Props {
  label: string
  value: number // 0–1
  onChange: (v: number) => void
  onRelease?: (v: number) => void
}

const STEP = 0.1
const KNOB = 30

export function Slider({ label, value, onChange, onRelease }: Props) {
  const width = useRef(1)
  const [dragging, setDragging] = useState(false)
  const latest = useRef(value)
  latest.current = value

  const set = (v: number) => {
    const c = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100
    latest.current = c
    onChange(c)
  }
  const fromTouch = (e: GestureResponderEvent) => set((e.nativeEvent.locationX - KNOB / 2) / Math.max(1, width.current - KNOB))
  const nudge = (d: number) => {
    set(latest.current + d)
    onRelease?.(latest.current)
  }

  const pct = Math.round(value * 100)
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{pct === 0 ? 'Off' : `${pct}%`}</Text>
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => nudge(-STEP)} style={styles.step} accessibilityLabel={`${label} down`}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <View
          style={styles.track}
          onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => { setDragging(true); fromTouch(e) }}
          onResponderMove={fromTouch}
          onResponderRelease={() => { setDragging(false); onRelease?.(latest.current) }}
          onResponderTerminate={() => setDragging(false)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: 100, now: pct, text: pct === 0 ? 'off' : `${pct} percent` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? STEP : -STEP)}
        >
          <View pointerEvents="none" style={styles.rail}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <View
            pointerEvents="none"
            style={[styles.knob, dragging && styles.knobOn, { left: `${pct}%`, marginLeft: -KNOB * (value) }]}
          />
        </View>
        <Pressable onPress={() => nudge(STEP)} style={styles.step} accessibilityLabel={`${label} up`}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: colors.text, fontSize: 17, fontWeight: '600' },
  value: { color: colors.muted, fontSize: 15, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.line },
  stepText: { color: colors.text, fontSize: 22, fontWeight: '600', marginTop: -2 },
  track: { flex: 1, height: 44, justifyContent: 'center' },
  rail: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginHorizontal: KNOB / 2 },
  fill: { height: '100%', backgroundColor: colors.glow },
  knob: { position: 'absolute', top: 7, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#e6f2ff', borderWidth: 3, borderColor: colors.glow },
  knobOn: { transform: [{ scale: 1.15 }] },
})
