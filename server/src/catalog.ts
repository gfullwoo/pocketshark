// Single source of truth for the product and prices.
// The storefront imports this file for display; the API imports it to build
// Stripe Checkout line items, so the browser never decides what anything costs.

export type SizeId = 'keychain' | 'pocket' | 'cuddle' | 'jumbo'

export interface Size {
  id: SizeId
  name: string
  inches: number
  blurb: string
  priceCents: number
}

export const PRODUCT = {
  name: 'Pocket Shark',
  tagline: 'Soft gray plush with glow-in-the-dark accents.',
}

export const SIZES: Size[] = [
  { id: 'keychain', name: 'Keychain', inches: 5, blurb: 'The Pocket on a chain and split ring. Clip it to keys, bags and backpacks.', priceCents: 1700 },
  { id: 'pocket', name: 'Pocket', inches: 5, blurb: 'Life-size. The only known specimen is 5.5".', priceCents: 1900 },
  { id: 'cuddle', name: 'Cuddle', inches: 12, blurb: 'Pillow-friendly, desk-guardian sized.', priceCents: 3900 },
  { id: 'jumbo', name: 'Jumbo', inches: 18, blurb: 'Deep-sea giant. Still the world’s cutest shark.', priceCents: 6900 },
]

export const FREE_SHIPPING_THRESHOLD_CENTS = 5000
export const FLAT_SHIPPING_CENTS = 595
export const MAX_QTY_PER_LINE = 20

export function sizeById(id: string): Size | undefined {
  return SIZES.find((s) => s.id === id)
}

export function unitPriceCents(size: SizeId): number {
  const s = sizeById(size)
  if (!s) throw new Error(`Unknown size ${size}`)
  return s.priceCents
}

export function sku(size: SizeId): string {
  return `PS-${size.toUpperCase()}`
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}
