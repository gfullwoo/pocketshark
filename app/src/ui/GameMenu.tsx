import { Pressable, StyleSheet, Text, View } from 'react-native'
import { updateSettings, useSettings } from '../settings'
import { colors } from '../theme'
import { Slider } from './Slider'

/** The pause menu: music and sound-effect volume, the story, and resume. */
export function GameMenu({ onResume, onWatchStory, onPreviewSound }: {
  onResume: () => void
  onWatchStory?: () => void
  onPreviewSound: () => void
}) {
  const settings = useSettings()
  return (
    <View style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onResume} accessibilityLabel="Close the menu" />
      <View style={styles.card} accessibilityViewIsModal>
        <Text style={styles.title}>Menu</Text>
        <Text style={styles.sub}>The game is paused.</Text>

        <Slider label="Music" value={settings.music} onChange={(v) => updateSettings({ music: v })} />
        <Slider
          label="Sound effects"
          value={settings.sfx}
          onChange={(v) => updateSettings({ sfx: v })}
          onRelease={(v) => { if (v > 0) onPreviewSound() }}
        />

        {onWatchStory && (
          <Pressable onPress={onWatchStory} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]} accessibilityRole="button">
            <Text style={styles.secondaryText}>Watch the story</Text>
          </Pressable>
        )}
        <Pressable onPress={onResume} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={styles.primaryText}>Resume</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,8,16,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, padding: 22, borderRadius: 24, backgroundColor: colors.panelSolid, borderWidth: 1, borderColor: colors.line },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 15, marginBottom: 18 },
  secondary: { minHeight: 50, borderRadius: 999, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { color: colors.glow, fontSize: 17, fontWeight: '600' },
  primary: { minHeight: 54, borderRadius: 999, backgroundColor: colors.glow, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: '#04130a', fontSize: 19, fontWeight: '700' },
})
