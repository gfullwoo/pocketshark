import { serve } from '@hono/node-server'
import Stripe from 'stripe'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 8787)
const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('Set STRIPE_SECRET_KEY (sk_test_... for testing) before starting.')
  process.exit(1)
}

const app = createApp({
  stripe: new Stripe(key),
  siteUrl: (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, ''),
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  staticDir: process.env.STATIC_DIR,
})

serve({ fetch: app.fetch, port }, () => {
  console.log(`mypocketshark API on http://localhost:${port}${process.env.STATIC_DIR ? ` (serving ${process.env.STATIC_DIR})` : ''}`)
})
