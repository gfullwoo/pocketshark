import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { updateSettings, useSettings } from '../settings'
import { colors } from '../theme'
import { Slider } from './Slider'

/** The pause menu: music and sound-effect volume, the story, and resume. */
/** A place on the sea map the player can jump to from the menu. */
export interface MenuPlace { n: number; name: string; note: string; here: boolean }

export function GameMenu({ onResume, onWatchStory, onOpenMap, onPreviewSound, places, onPickPlace }: {
  onResume: () => void
  onWatchStory?: () => void
  onOpenMap?: () => void
  /** Unlocked places (the current one and friends' homes), to jump straight to one. */
  places?: MenuPlace[]
  onPickPlace?: (n: number) => void
  onPreviewSound: () => void
}) {
  const settings = useSettings()
  return (
    <View style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onResume} accessibilityLabel="Close the menu" />
      <View style={styles.card} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Menu</Text>
        <Text style={styles.sub}>The game is paused.</Text>

        {places && onPickPlace && places.length > 0 && (
          <View style={styles.places}>
            <Text style={styles.section}>Places</Text>
            {places.map((p) => (
              <Pressable
                key={p.n}
                onPress={() => (p.here ? onResume() : onPickPlace(p.n))}
                style={({ pressed }) => [styles.place, p.here && styles.placeHere, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel={`Level ${p.n}, ${p.name}. ${p.note}`}
              >
                <Text style={[styles.placeNum, p.here && { color: '#04130a' }]}>{p.n}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.placeName, p.here && { color: '#04130a' }]}>{p.name}</Text>
                  <Text style={[styles.placeNote, p.here && { color: '#0b3a1d' }]}>{p.note}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <Slider label="Music" value={settings.music} onChange={(v) => updateSettings({ music: v })} />
        <Slider
          label="Sound effects"
          value={settings.sfx}
          onChange={(v) => updateSettings({ sfx: v })}
          onRelease={(v) => { if (v > 0) onPreviewSound() }}
        />

        {onOpenMap && (
          <Pressable onPress={onOpenMap} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]} accessibilityRole="button">
            <Text style={styles.secondaryText}>Sea map</Text>
          </Pressable>
        )}
        {onWatchStory && (
          <Pressable onPress={onWatchStory} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]} accessibilityRole="button">
            <Text style={styles.secondaryText}>Watch the story</Text>
          </Pressable>
        )}
        <Pressable onPress={onResume} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={styles.primaryText}>Resume</Text>
        </Pressable>
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,8,16,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, maxHeight: '100%', padding: 22, borderRadius: 24, backgroundColor: colors.panelSolid, borderWidth: 1, borderColor: colors.line },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 15, marginBottom: 18 },
  section: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  places: { marginBottom: 14, gap: 6 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.line },
  placeHere: { backgroundColor: colors.glow, borderColor: colors.glow },
  placeNum: { color: colors.glow, fontSize: 20, fontWeight: '800', width: 26, textAlign: 'center' },
  placeName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  placeNote: { color: colors.muted, fontSize: 13 },
  secondary: { minHeight: 50, borderRadius: 999, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryText: { color: colors.glow, fontSize: 17, fontWeight: '600' },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: colors.glow, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: '#04130a', fontSize: 19, fontWeight: '700' },
})
