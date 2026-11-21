import { defineConfig } from 'vitest/config'

// Unit tests cover the pure TypeScript game model (no React Native).
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
