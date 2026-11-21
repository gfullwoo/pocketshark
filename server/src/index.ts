import { serve } from '@hono/node-server'
import Stripe from 'stripe'
import { createApp } from './app.js'
import { FirestoreGameStore } from './game/firestoreStore.js'
import { MemoryGameStore, type GameStore } from './game/store.js'

const port = Number(process.env.PORT || 8787)
const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('Set STRIPE_SECRET_KEY (sk_test_... for testing) before starting.')
  process.exit(1)
}

const stripe = new Stripe(key)

// LEADERBOARD=firestore|memory|off. Defaults to Firestore on Cloud Run, memory locally.
const mode = process.env.LEADERBOARD || (process.env.K_SERVICE ? 'firestore' : 'memory')
let store: GameStore | undefined
if (mode === 'firestore') {
  const { Firestore } = await import('@google-cloud/firestore')
  store = new FirestoreGameStore(new Firestore({ ignoreUndefinedProperties: true }))
} else if (mode === 'memory') {
  store = new MemoryGameStore()
}

const app = createApp({
  stripe,
  game: store ? { store, stripe } : undefined,
  siteUrl: (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, ''),
  // 'unset' is the bootstrap placeholder until a Stripe webhook exists
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET !== 'unset' ? process.env.STRIPE_WEBHOOK_SECRET : undefined,
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  staticDir: process.env.STATIC_DIR,
})

serve({ fetch: app.fetch, port }, () => {
  console.log(`mypocketshark API on http://localhost:${port}${process.env.STATIC_DIR ? ` (serving ${process.env.STATIC_DIR})` : ''}`)
})
