# Hosting mypocketshark.com on GCP

```
mypocketshark.com ──► Firebase Hosting (CDN, free managed SSL)
                        ├─ /            static storefront (web/dist)
                        └─ /api/**  ──► Cloud Run "pocketshark-api" (us-central1)
                                          └─ Secret Manager: stripe-secret-key, stripe-webhook-secret
GitHub Actions (main) ──WIF, no keys──► Artifact Registry → Cloud Run → Firebase Hosting
```

**Why not the alternatives:**

- **Cloud Run domain mapping:** still Preview, and Google doesn't recommend it for production.
- **Global external load balancer:** works, but costs a fixed monthly fee before any traffic.
- **Firebase Hosting in front of Cloud Run (this setup):** free SSL, a CDN for the static site, and Cloud Run scales to zero.

## 1. One-time setup (about 5 minutes)

In [Cloud Shell](https://shell.cloud.google.com) as a project Owner:

```bash
git clone https://github.com/gfullwoo/pocketshark && cd pocketshark
bash infra/bootstrap.sh
```

The script does the following:

- Enables the APIs.
- Creates the Artifact Registry repo.
- Creates two service accounts: one for the Cloud Run runtime, one for GitHub deploys.
- Creates the Stripe secrets. It prompts for the values; press Enter to set them later.
- Sets up Workload Identity Federation, locked to `gfullwoo/pocketshark` on `main`.
- Adds Firebase to the project.

The deploy target is set in `.github/workflows/ci.yml` (`env:` block). Set repo variable `DEPLOY_DISABLED=true` to pause deploys.

## 2. Deploy

Push to `main`, or re-run the CI workflow. The `deploy` job runs after lint, tests and build pass:

- builds `server/Dockerfile` and pushes it to Artifact Registry
- runs `gcloud run deploy pocketshark-api`, with the Stripe keys pulled from Secret Manager
- runs `firebase deploy --only hosting`
- smoke-tests `https://<project-id>.web.app/api/health`

## 3. Connect the domain

Firebase console → Hosting → **Add custom domain** → `mypocketshark.com` (and `www.mypocketshark.com`, set to redirect to the apex).
Add the TXT and A records it shows at your registrar. SSL is issued automatically once DNS resolves, which can take up to a day.

## 4. Stripe

1. Set the real keys:
   ```bash
   printf '%s' 'sk_live_...' | gcloud secrets versions add stripe-secret-key --data-file=-
   ```
2. In the Stripe dashboard → Webhooks, add `https://mypocketshark.com/api/webhooks/stripe` for `checkout.session.completed`. Store its signing secret:
   ```bash
   printf '%s' 'whsec_...' | gcloud secrets versions add stripe-webhook-secret --data-file=-
   ```
3. Re-run the deploy, or `gcloud run services update pocketshark-api --region us-central1`, so the service picks up the new versions.

Use `sk_test_...` until you've placed a test order end to end on the live domain.

## Notes

- `SITE_URL` (used for Stripe redirects) is set to `https://mypocketshark.com` in the workflow.
- API responses send `Cache-Control: no-store`, so the CDN never caches them. Hashed `/assets/**` files are cached for a year.
- Cloud Run is set to min 0 / max 3 instances, 512 MiB of memory. Expect a cold start of about a second on the first API call after it's been idle.
