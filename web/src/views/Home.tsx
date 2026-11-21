import { PRODUCT, SIZES, formatUsd } from '../../../server/src/catalog'
import { HERO, PHOTOS, SIZE_PHOTOS } from '../lib/photos'
import { scrollToId } from '../lib/nav'

const FACTS = [
  { k: '5.5"', t: 'Total length of the only known American pocket shark, a juvenile male. Our 5" Pocket is basically life-size.' },
  { k: '2010', t: 'Caught by NOAA scientists about 190 miles off Louisiana while sampling what sperm whales eat.' },
  { k: '2013', t: 'The year a NOAA biologist spotted it among the frozen specimens, three years after it was caught.' },
  { k: '2019', t: 'Formally named Mollisquama mississippiensis after study by NOAA, Tulane and partner researchers.' },
]

const FAQ = [
  {
    q: 'How does the glow work?',
    a: 'The glow-in-the-dark accents are made with phosphorescent fabric. Give your shark a few minutes under a lamp or in sunlight, then turn the lights off. The accents glow brightest at first and fade gently. No batteries, no electronics.',
  },
  {
    q: 'Do the pockets actually work?',
    a: 'Yes. There’s a real little pocket behind each front fin, just like the real shark’s pocket glands, and each one is lined in glow fabric.',
  },
  {
    q: 'Are they safe for kids?',
    a: 'They have locking safety eyes and embroidered details. Recommended for ages 3 and up.',
  },
  {
    q: 'How do I clean one?',
    a: 'Surface-wash with a damp cloth and mild soap, then air dry. Skip the dryer: heat flattens the plush and weakens the glow fabric.',
  },
  {
    q: 'Shipping and returns?',
    a: 'Ships within the US. Orders over $50 ship free, everything else is a flat $5.95. Unopened sharks can be returned within 30 days.',
  },
]

export function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">The world’s tiniest shark</p>
          <h1>
            A shark that fits <span className="glow-text">in your pocket.</span>
          </h1>
          <p className="lede">
            A soft, plush American pocket shark with glow-in-the-dark accents, including real pockets behind its fins. Comes in three sizes, from
            life-size to jumbo, plus a keychain.
          </p>
          <div className="hero__cta">
            <a className="btn btn--glow" href="#/shop">Shop the {PRODUCT.name}</a>
            <button className="btn btn--ghost" onClick={() => scrollToId('details')}>See the details</button>
            <a className="btn btn--ghost" href="#/play">Play Glow &amp; Gulp</a>
          </div>
          <p className="muted small">From {formatUsd(Math.min(...SIZES.map((s) => s.priceCents)))} · Free shipping over $50</p>
        </div>
        <div className="hero__art">
          <div className="halo" />
          <img className="photo photo--hero" src={HERO.src} alt={HERO.alt} />
          <span className="tag tag--a">Real working pockets</span>
          <span className="tag tag--b">Glow-in-the-dark accents</span>
        </div>
      </section>

      <section className="section" id="details">
        <div className="section__head">
          <h2>Made like the real one</h2>
          <p className="muted">The details that make a pocket shark a pocket shark.</p>
        </div>
        <div className="gallery">
          {PHOTOS.map((p) => (
            <figure key={p.id} className="gallery__item">
              <img className="photo" src={p.src} alt={p.alt} loading="lazy" />
              <figcaption>{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="section" id="sizes">
        <div className="section__head">
          <h2>Pick your shark</h2>
          <p className="muted">Three sizes and a keychain. Same shark, same glow.</p>
        </div>
        <div className="sizes">
          {SIZES.map((s) => (
            <a key={s.id} href={`#/shop?size=${s.id}`} className="size">
              <div className="size__pic">
                <img className="photo" src={SIZE_PHOTOS[s.id].src} alt={SIZE_PHOTOS[s.id].alt} loading="lazy" />
                <span className="size__in">{s.inches}"</span>
              </div>
              <div className="size__body">
                <div className="ruler" style={{ width: `${(s.inches / 18) * 100}%` }} />
                <div className="size__row">
                  <h3>{s.name}</h3>
                  <span className="price">{formatUsd(s.priceCents)}</span>
                </div>
                <p className="muted small">{s.blurb}</p>
                <span className="size__cta">Shop the {s.name} →</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="section real" id="real-shark">
        <div className="real__copy">
          <p className="eyebrow">Meet the original</p>
          <h2>
            <i>Mollisquama mississippiensis</i>
          </h2>
          <p>
            The American pocket shark is a kitefin shark from the deep Gulf of Mexico. It’s named for a pair of pocket-like glands behind its front
            fins. Scientists think they release a glowing fluid, and small light-producing organs called photophores dot its body. Only one specimen
            has ever been found.
          </p>
          <p className="muted">That’s why our plush has real pockets lined in glow fabric.</p>
        </div>
        <div className="facts">
          {FACTS.map((f) => (
            <div key={f.k} className="fact">
              <span className="fact__k">{f.k}</span>
              <p>{f.t}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="faq">
        <div className="section__head">
          <h2>Questions</h2>
        </div>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section cta-band">
        <img className="photo photo--band" src={PHOTOS[1].src} alt={PHOTOS[1].alt} loading="lazy" />
        <div>
          <h2>Take one home.</h2>
          <a className="btn btn--glow" href="#/shop">Shop now</a>
        </div>
      </section>
    </>
  )
}
