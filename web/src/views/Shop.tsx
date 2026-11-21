import { useState } from 'react'
import { PRODUCT, SIZES, formatUsd, sizeById, type SizeId } from '../../../server/src/catalog'
import { PHOTOS } from '../lib/photos'
import type { Cart } from '../lib/cart'

interface Props {
  cart: Cart
  query: URLSearchParams
  onAdded: () => void
}

export function Shop({ cart, query, onAdded }: Props) {
  const [size, setSize] = useState<SizeId>(() => sizeById(query.get('size') ?? '')?.id ?? 'cuddle')
  const [qty, setQty] = useState(1)
  const [shot, setShot] = useState(0)

  const s = sizeById(size)!
  const photo = PHOTOS[shot]

  return (
    <section className="shop">
      <div className="shop__stage">
        <img className="photo photo--stage" src={photo.src} alt={photo.alt} />
        <div className="thumbs">
          {PHOTOS.map((p, i) => (
            <button key={p.id} className={`thumb ${i === shot ? 'is-sel' : ''}`} onClick={() => setShot(i)} aria-label={p.alt} aria-pressed={i === shot}>
              <img src={p.src} alt="" />
            </button>
          ))}
        </div>
        <p className="muted small">{photo.caption}</p>
      </div>

      <div className="shop__panel">
        <p className="eyebrow">Plush · glow-in-the-dark accents</p>
        <h1>{PRODUCT.name}</h1>
        <p className="muted">{PRODUCT.tagline} Real pockets behind the front fins, just like the real shark.</p>
        <div className="price price--big">{formatUsd(s.priceCents)}</div>

        <fieldset className="opt">
          <legend>Size</legend>
          <div className="sizes-pick">
            {SIZES.map((sz) => (
              <button key={sz.id} className={`pill ${sz.id === size ? 'is-sel' : ''}`} onClick={() => setSize(sz.id)} aria-pressed={sz.id === size}>
                <strong>{sz.inches}"</strong>
                <span>{sz.name}</span>
                <small>{formatUsd(sz.priceCents)}</small>
              </button>
            ))}
          </div>
          <p className="muted small">{s.blurb}</p>
        </fieldset>

        <div className="buy">
          <div className="stepper">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="One fewer">−</button>
            <span>{qty}</span>
            <button onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="One more">+</button>
          </div>
          <button
            className="btn btn--glow btn--grow"
            onClick={() => {
              cart.add(size, qty)
              setQty(1)
              onAdded()
            }}
          >
            Add to cart · {formatUsd(s.priceCents * qty)}
          </button>
        </div>

        <ul className="specs">
          <li>Ultra-soft gray minky plush, polyester fiberfill</li>
          <li>Working pocket behind each front fin, lined in glow-in-the-dark fabric</li>
          <li>Glow accents charge in light, with no batteries</li>
          <li>Locking safety eyes, embroidered smile and gills</li>
          <li>Ages 3+ · Free US shipping over $50</li>
        </ul>
      </div>
    </section>
  )
}
