import { describe, expect, it, vi } from 'vitest'
import { buildSessionParams, subtotalCents } from '../src/checkout.js'
import { createApp } from '../src/app.js'
import { unitPriceCents } from '../src/catalog.js'

describe('pricing', () => {
  it('prices each size', () => {
    expect(unitPriceCents('pocket')).toBe(1900)
    expect(unitPriceCents('jumbo')).toBe(6900)
  })
  it('totals a cart', () => {
    expect(subtotalCents({ items: [{ size: 'cuddle', qty: 2 }] })).toBe(7800)
  })
})

describe('session params', () => {
  it('charges flat shipping under the threshold and merges duplicate lines', () => {
    const p = buildSessionParams({ items: [{ size: 'pocket', qty: 1 }, { size: 'pocket', qty: 1 }] }, 'https://x.test')
    expect(p.line_items).toHaveLength(1)
    expect(p.line_items![0].quantity).toBe(2)
    expect(p.shipping_options![0].shipping_rate_data!.fixed_amount!.amount).toBe(595)
  })
  it('ships free at $50+', () => {
    const p = buildSessionParams({ items: [{ size: 'jumbo', qty: 1 }] }, 'https://x.test')
    expect(p.shipping_options![0].shipping_rate_data!.fixed_amount!.amount).toBe(0)
  })
})

describe('api', () => {
  const create = vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }))
  const app = createApp({ stripe: { checkout: { sessions: { create } } } as never, siteUrl: 'https://x.test' })

  it('rejects unknown sizes', async () => {
    const r = await app.request('/api/checkout', { method: 'POST', body: JSON.stringify({ items: [{ size: 'mega', qty: 1 }] }) })
    expect(r.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })
  it('ignores client-supplied prices and returns a Stripe URL', async () => {
    const r = await app.request('/api/checkout', { method: 'POST', body: JSON.stringify({ items: [{ size: 'cuddle', qty: 1, price: 1 }] }) })
    expect(r.status).toBe(200)
    expect((await r.json()).url).toContain('checkout.stripe.com')
    const args = (create.mock.calls[0] as unknown as [{ line_items: { price_data: { unit_amount: number } }[] }])[0]
    expect(args.line_items[0].price_data.unit_amount).toBe(3900)
  })
})
