import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build` → dist/ for hosting (the API can serve it with STATIC_DIR=../dist).
// `npm run build:single` → one self-contained index.html (preview artifact).
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100000000 } : {},
  server: { proxy: { '/api': 'http://localhost:8787' } },
}))
