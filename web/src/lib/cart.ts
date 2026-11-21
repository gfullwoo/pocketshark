import { useCallback, useEffect, useState } from 'react'
import { MAX_QTY_PER_LINE, sizeById, unitPriceCents, type SizeId } from '../../../server/src/catalog'

export interface CartLine {
  size: SizeId
  qty: number
}

const KEY = 'mypocketshark:cart:v2'

function load(): CartLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter((l) => sizeById(l?.size) && Number.isInteger(l?.qty) && l.qty > 0) : []
  } catch {
    return []
  }
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines))
    } catch {
      /* storage unavailable: cart lives in memory */
    }
  }, [lines])

  const add = useCallback((size: SizeId, qty = 1) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.size === size)
      if (i === -1) return [...ls, { size, qty: Math.min(qty, MAX_QTY_PER_LINE) }]
      return ls.map((l, j) => (j === i ? { ...l, qty: Math.min(l.qty + qty, MAX_QTY_PER_LINE) } : l))
    })
  }, [])

  const setQty = useCallback((size: SizeId, qty: number) => {
    setLines((ls) =>
      qty <= 0 ? ls.filter((l) => l.size !== size) : ls.map((l) => (l.size === size ? { ...l, qty: Math.min(qty, MAX_QTY_PER_LINE) } : l)),
    )
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const count = lines.reduce((n, l) => n + l.qty, 0)
  const subtotal = lines.reduce((n, l) => n + unitPriceCents(l.size) * l.qty, 0)

  return { lines, add, setQty, clear, count, subtotal }
}

export type Cart = ReturnType<typeof useCart>

export async function startCheckout(lines: CartLine[]): Promise<string> {
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: lines }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) throw new Error(data.error || `checkout_${res.status}`)
  return data.url as string
}
