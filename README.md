# pocketshark

Storefront and checkout for **[mypocketshark.com](https://mypocketshark.com)**: a plush American pocket shark (*Mollisquama mississippiensis*) with glow-in-the-dark accents, in 5", 12" and 18".

```
web/       storefront: Vite + React 19 + TypeScript (glow theme, product gallery, cart)
server/    API: Hono + Stripe Checkout + zod; also serves web/dist in production
docs/      product spec, GCP deploy guide
infra/     one-time GCP bootstrap script
```

`server/src/catalog.ts` is the single source of truth for sizes and prices. The storefront imports it for display, and the API uses it to build Stripe line items, so the browser never sets a price.

## Develop

```bash
npm run install:all

# terminal 1: API on :8787 (test key from dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_... npm run dev:api

# terminal 2: storefront on :5173, proxies /api to :8787
npm run dev:web

npm test        # pricing, Stripe params, API validation
npm run lint
```

Test card: `4242 4242 4242 4242`, any future date, any CVC.

## Deploy

Production runs on GCP: Firebase Hosting serves the storefront, and Cloud Run runs the API. Every push to `main` deploys through GitHub Actions. Setup steps are in **[docs/deploy-gcp.md](docs/deploy-gcp.md)**.

To self-host, one process serves both the site and the API:

```bash
npm run build
STRIPE_SECRET_KEY=sk_live_... SITE_URL=https://mypocketshark.com PORT=8080 npm start
```

The root `Dockerfile` builds the same all-in-one image.

| Env | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | required |
| `SITE_URL` | used for the Stripe success and cancel redirects |
| `STRIPE_WEBHOOK_SECRET` | optional; enables `POST /api/webhooks/stripe` (`checkout.session.completed`) |
| `STATIC_DIR` | where the built storefront lives (`npm start` sets it to `../web/dist`) |
| `CORS_ORIGINS` | only needed if the storefront is hosted on a different origin |

## Editing

| What | Where |
|---|---|
| Prices, sizes, shipping threshold | `server/src/catalog.ts` |
| Product photos and captions | `web/src/assets/photos/`, `web/src/lib/photos.ts` |
| Page copy (hero, FAQ, facts) | `web/src/views/Home.tsx` |
| Theme colors | `web/src/index.css` (`:root` variables) |
| Background swimming sharks | `web/src/components/SwimmingSharks.tsx` |

## Before launch

- Confirm the FAQ claims against production samples: glow behavior, return window, ship times.
- Children's products need CPSIA third-party testing and a Children's Product Certificate before sale. See `docs/product-spec.md`.
