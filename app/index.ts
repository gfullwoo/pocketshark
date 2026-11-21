import { start } from './src/boot'

// iPhone/Android start the app directly; the web preview loads Skia's WebAssembly first.
// Metro picks src/boot.web.ts on web and src/boot.ts everywhere else.
start()
