import { useEffect, useState } from 'react'
import { FREE_SHIPPING_THRESHOLD_CENTS, PRODUCT, formatUsd, sizeById, unitPriceCents } from '../../../server/src/catalog'
import { startCheckout, type Cart } from '../lib/cart'
import { HERO } from '../lib/photos'

interface Props {
  open: boolean
  onClose: () => void
  cart: Cart
}

export function CartDrawer({ open, onClose, cart }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  const toFree = FREE_SHIPPING_THRESHOLD_CENTS - cart.subtotal

  async function checkout() {
    setBusy(true)
    setErr('')
    try {
      window.location.href = await startCheckout(cart.lines)
    } catch {
      setErr('Checkout isn’t available right now. Please try again in a moment.')
      setBusy(false)
    }
  }

  return (
    <>
      <div className={`scrim ${open ? 'is-open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'is-open' : ''}`} aria-hidden={!open} aria-label="Cart">
        <div className="drawer__head">
          <h2>Your school</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close cart">✕</button>
        </div>

        {cart.lines.length === 0 ? (
          <div className="drawer__empty">
            <img className="photo photo--band" src={HERO.src} alt="" />
            <p>No sharks yet. A school of sharks is called a shiver.</p>
            <a className="btn" href="#/shop" onClick={onClose}>Find your shark</a>
          </div>
        ) : (
          <>
            <ul className="lines">
              {cart.lines.map((l) => {
                const s = sizeById(l.size)!
                return (
                  <li key={l.size} className="line">
                    <div className="line__pic">
                      <img className="photo" src={HERO.src} alt="" />
                    </div>
                    <div className="line__info">
                      <strong>{PRODUCT.name}</strong>
                      <span className="muted">{s.inches}" {s.name}</span>
                      <div className="stepper stepper--sm">
                        <button onClick={() => cart.setQty(l.size, l.qty - 1)} aria-label="One fewer">−</button>
                        <span>{l.qty}</span>
                        <button onClick={() => cart.setQty(l.size, l.qty + 1)} aria-label="One more">+</button>
                      </div>
                    </div>
                    <div className="line__price">{formatUsd(unitPriceCents(l.size) * l.qty)}</div>
                  </li>
                )
              })}
            </ul>
            <div className="drawer__foot">
              <div className="ship-meter">
                <div className="ship-meter__bar" style={{ width: `${Math.min(100, (cart.subtotal / FREE_SHIPPING_THRESHOLD_CENTS) * 100)}%` }} />
              </div>
              <p className="muted small">
                {toFree > 0 ? `${formatUsd(toFree)} away from free shipping` : 'You’ve unlocked free shipping'}
              </p>
              <div className="total">
                <span>Subtotal</span>
                <strong>{formatUsd(cart.subtotal)}</strong>
              </div>
              {err && <p className="error">{err}</p>}
              <button className="btn btn--glow btn--block" onClick={checkout} disabled={busy}>
                {busy ? 'Opening checkout…' : 'Checkout'}
              </button>
              <p className="muted small center">Shipping and tax calculated at checkout.</p>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
