// On-screen controls for the reef: a floating joystick for the left thumb and a
// hold-to-glow button for the right thumb. One full-screen layer reads every
// finger with React Native's raw multi-touch events, so both thumbs work at
// the same time without any native gesture library.
import { useRef, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent, type ViewProps } from 'react-native'
import { colors } from '../theme'

const STICK_R = 62 // how far the knob can travel
const KNOB_R = 28
const GLOW_R = 50
const MARGIN = 22
const DEADZONE = 0.12

interface Insets { top: number; bottom: number; left: number; right: number }
type Role = 'stick' | 'glow'

export function useControls({ insets, onStick, onGlow }: {
  insets: Insets
  onStick: (x: number, y: number) => void
  onGlow: (held: boolean) => void
}) {
  const { width: W, height: H } = useWindowDimensions()
  const OUTER = STICK_R + KNOB_R
  const rest = { x: insets.left + MARGIN + OUTER, y: H - insets.bottom - MARGIN - OUTER }
  const glow = { x: W - insets.right - MARGIN - GLOW_R, y: H - insets.bottom - MARGIN - GLOW_R }

  const roles = useRef(new Map<string, Role>())
  const base = useRef(rest)
  const [view, setView] = useState({ base: rest, knob: { x: 0, y: 0 }, active: false, glowHeld: false })

  const stickFrom = (px: number, py: number) => {
    const b = base.current
    let dx = px - b.x, dy = py - b.y
    const d = Math.hypot(dx, dy)
    if (d > STICK_R) { dx = (dx / d) * STICK_R; dy = (dy / d) * STICK_R }
    const mag = Math.min(1, d / STICK_R)
    // a small dead zone so a resting thumb doesn't drift the shark
    const k = mag < DEADZONE ? 0 : (mag - DEADZONE) / (1 - DEADZONE) / Math.max(mag, 1e-6)
    onStick((dx / STICK_R) * k, (dy / STICK_R) * k)
    setView((v) => ({ ...v, base: b, knob: { x: dx, y: dy }, active: true }))
  }

  const has = (role: Role) => [...roles.current.values()].includes(role)

  const onTouchStart = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier), { pageX: x, pageY: y } = t
      if (!has('glow') && Math.hypot(x - glow.x, y - glow.y) < GLOW_R + 30) {
        roles.current.set(id, 'glow')
        onGlow(true)
        setView((v) => ({ ...v, glowHeld: true }))
      } else if (!has('stick') && x < W * 0.6 && y > H * 0.28) {
        roles.current.set(id, 'stick')
        // the joystick appears under the thumb, kept fully on screen
        base.current = {
          x: Math.max(insets.left + OUTER + 4, Math.min(W * 0.6, x)),
          y: Math.max(H * 0.28 + OUTER, Math.min(H - insets.bottom - OUTER - 4, y)),
        }
        stickFrom(x, y)
      }
    }
  }

  const onTouchMove = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      if (roles.current.get(String(t.identifier)) === 'stick') stickFrom(t.pageX, t.pageY)
    }
  }

  const onTouchEnd = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier), role = roles.current.get(id)
      roles.current.delete(id)
      if (role === 'stick') {
        onStick(0, 0)
        base.current = rest
        setView((v) => ({ ...v, base: rest, knob: { x: 0, y: 0 }, active: false }))
      } else if (role === 'glow') {
        onGlow(false)
        setView((v) => ({ ...v, glowHeld: false }))
      }
    }
  }

  const touchProps: ViewProps = { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd }

  const render = (glowOn: boolean) => (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[styles.base, {
          left: view.base.x - STICK_R - KNOB_R, top: view.base.y - STICK_R - KNOB_R,
          opacity: view.active ? 0.95 : 0.6,
        }]}
      >
        <View style={[styles.knob, { transform: [{ translateX: view.knob.x }, { translateY: view.knob.y }] }]} />
      </View>
      <View style={[styles.glow, { left: glow.x - GLOW_R, top: glow.y - GLOW_R }, (view.glowHeld || glowOn) && styles.glowOn]}>
        <Text style={[styles.glowText, glowOn && styles.glowTextOn]}>{glowOn ? 'Glowing' : 'Hold to\nglow'}</Text>
      </View>
    </View>
  )

  const homeButtonPosition = { right: insets.right + MARGIN, bottom: insets.bottom + MARGIN + GLOW_R * 2 + 14 }

  return { touchProps, render, homeButtonPosition }
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute', width: (STICK_R + KNOB_R) * 2, height: (STICK_R + KNOB_R) * 2, borderRadius: STICK_R + KNOB_R,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,24,44,0.45)', borderWidth: 2, borderColor: 'rgba(125,255,154,0.3)',
  },
  knob: {
    width: KNOB_R * 2, height: KNOB_R * 2, borderRadius: KNOB_R,
    backgroundColor: 'rgba(230,242,255,0.85)', borderWidth: 2, borderColor: colors.glow,
  },
  glow: {
    position: 'absolute', width: GLOW_R * 2, height: GLOW_R * 2, borderRadius: GLOW_R,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.line,
  },
  glowOn: { backgroundColor: colors.glow, borderColor: colors.glow, shadowColor: colors.glow, shadowOpacity: 0.9, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },
  glowText: { color: colors.glow, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  glowTextOn: { color: '#04130a', fontSize: 17 },
})
