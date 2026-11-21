import { registerRootComponent } from 'expo'
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web'

export function start() {
  void LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' }).then(async () => {
    const { default: App } = await import('../App')
    registerRootComponent(App)
  })
}
