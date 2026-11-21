import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import type Stripe from 'stripe'
import { CartSchema, buildSessionParams } from './checkout.js'

export interface AppOptions {
  stripe: Pick<Stripe, 'checkout' | 'webhooks'>
  siteUrl: string
  webhookSecret?: string
  corsOrigins?: string[]
  /** Serve the built storefront (../dist) from the same process. */
  staticDir?: string
  onOrder?: (session: Stripe.Checkout.Session) => void | Promise<void>
}

export function createApp(opts: AppOptions) {
  const app = new Hono()

  if (opts.corsOrigins?.length) app.use('/api/*', cors({ origin: opts.corsOrigins }))

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.post('/api/checkout', async (c) => {
    const parsed = CartSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_cart', detail: parsed.error.issues }, 400)
    try {
      const session = await opts.stripe.checkout.sessions.create(buildSessionParams(parsed.data, opts.siteUrl))
      return c.json({ url: session.url })
    } catch (err) {
      console.error('stripe checkout failed', err)
      return c.json({ error: 'checkout_failed' }, 502)
    }
  })

  app.get('/api/order/:id', async (c) => {
    const id = c.req.param('id')
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return c.json({ error: 'bad_id' }, 400)
    try {
      const s = await opts.stripe.checkout.sessions.retrieve(id)
      return c.json({ status: s.payment_status, email: s.customer_details?.email ?? null, total: s.amount_total })
    } catch {
      return c.json({ error: 'not_found' }, 404)
    }
  })

  app.post('/api/webhooks/stripe', async (c) => {
    if (!opts.webhookSecret) return c.json({ error: 'webhook_not_configured' }, 404)
    const raw = await c.req.text()
    let event: Stripe.Event
    try {
      event = await opts.stripe.webhooks.constructEventAsync(raw, c.req.header('stripe-signature') ?? '', opts.webhookSecret)
    } catch {
      return c.json({ error: 'bad_signature' }, 400)
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      console.log(`order paid ${session.id} ${session.amount_total} ${session.metadata?.cart ?? ''}`)
      await opts.onOrder?.(session)
    }
    return c.json({ received: true })
  })

  if (opts.staticDir) {
    app.use('/*', serveStatic({ root: opts.staticDir }))
    app.get('*', serveStatic({ path: `${opts.staticDir}/index.html` }))
  }

  return app
}
