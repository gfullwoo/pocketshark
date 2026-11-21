import { z } from 'zod'
import type Stripe from 'stripe'
import {
  FLAT_SHIPPING_CENTS, FREE_SHIPPING_THRESHOLD_CENTS, MAX_QTY_PER_LINE, PRODUCT, SIZES,
  sizeById, sku, unitPriceCents, type SizeId,
} from './catalog.js'

export const CartSchema = z.object({
  items: z
    .array(
      z.object({
        size: z.enum(SIZES.map((s) => s.id) as [SizeId, ...SizeId[]]),
        qty: z.number().int().min(1).max(MAX_QTY_PER_LINE),
      }),
    )
    .min(1)
    .max(30),
})
export type Cart = z.infer<typeof CartSchema>

export function subtotalCents(cart: Cart): number {
  return cart.items.reduce((sum, i) => sum + unitPriceCents(i.size) * i.qty, 0)
}

/** Build Stripe Checkout params from a validated cart. Prices come from the catalog only. */
export function buildSessionParams(cart: Cart, siteUrl: string): Stripe.Checkout.SessionCreateParams {
  // merge duplicate lines
  const merged = new Map<string, Cart['items'][number]>()
  for (const i of cart.items) {
    const key = i.size
    const prev = merged.get(key)
    merged.set(key, { ...i, qty: Math.min(MAX_QTY_PER_LINE, (prev?.qty ?? 0) + i.qty) })
  }
  const items = [...merged.values()]
  const subtotal = subtotalCents({ items })
  const freeShip = subtotal >= FREE_SHIPPING_THRESHOLD_CENTS

  return {
    mode: 'payment',
    success_url: `${siteUrl}/#/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/#/shop`,
    line_items: items.map((i) => {
      const s = sizeById(i.size)!
      return {
        quantity: i.qty,
        price_data: {
          currency: 'usd',
          unit_amount: unitPriceCents(i.size),
          product_data: {
            name: `${PRODUCT.name} — ${s.inches}" ${s.name}`,
            description: PRODUCT.tagline,
            metadata: { sku: sku(i.size), size: i.size },
          },
        },
      }
    }),
    shipping_address_collection: { allowed_countries: ['US'] },
    shipping_options: [
      {
        shipping_rate_data: {
          display_name: freeShip ? 'Free standard shipping' : 'Standard shipping',
          type: 'fixed_amount',
          fixed_amount: { amount: freeShip ? 0 : FLAT_SHIPPING_CENTS, currency: 'usd' },
          delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } },
        },
      },
    ],
    phone_number_collection: { enabled: false },
    allow_promotion_codes: true,
    metadata: { cart: items.map((i) => `${sku(i.size)}x${i.qty}`).join(',').slice(0, 500) },
  }
}
