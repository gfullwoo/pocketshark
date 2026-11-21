#!/usr/bin/env bash
# One-time GCP setup for mypocketshark.com. Run in Cloud Shell as a project Owner:
#   bash infra/bootstrap.sh
# Safe to re-run: every step skips what already exists.
set -euo pipefail

# Project number from the console; the project ID is looked up from it.
PROJECT_NUMBER="${PROJECT_NUMBER:-166341647898}"
REGION="${REGION:-us-central1}"
GITHUB_REPO="${GITHUB_REPO:-gfullwoo/pocketshark}"
AR_REPO="pocketshark"
SERVICE="pocketshark-api"
RUNTIME_SA="pocketshark-run"
DEPLOY_SA="pocketshark-deployer"
POOL="github"
PROVIDER="pocketshark-repo"

PROJECT_ID="$(gcloud projects describe "$PROJECT_NUMBER" --format='value(projectId)')"
gcloud config set project "$PROJECT_ID" >/dev/null
echo "==> Project $PROJECT_ID ($PROJECT_NUMBER), region $REGION"

echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  firebase.googleapis.com firebasehosting.googleapis.com

echo "==> Artifact Registry repo"
gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$AR_REPO" --repository-format docker --location "$REGION" \
    --description "mypocketshark.com images"

echo "==> Service accounts"
for sa in "$RUNTIME_SA:Cloud Run runtime for pocketshark-api" "$DEPLOY_SA:GitHub Actions deployer"; do
  name="${sa%%:*}"; desc="${sa#*:}"
  gcloud iam service-accounts describe "$name@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "$name" --display-name "$desc"
done
RUNTIME="$RUNTIME_SA@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOYER="$DEPLOY_SA@$PROJECT_ID.iam.gserviceaccount.com"

echo "==> Secrets (you'll be prompted for values that don't exist yet)"
for secret in stripe-secret-key stripe-webhook-secret; do
  if ! gcloud secrets describe "$secret" >/dev/null 2>&1; then
    read -r -s -p "  Value for $secret (Enter to set later): " val; echo
    gcloud secrets create "$secret" --replication-policy automatic
    [ -n "$val" ] && printf '%s' "$val" | gcloud secrets versions add "$secret" --data-file=-
  fi
  gcloud secrets add-iam-policy-binding "$secret" --member "serviceAccount:$RUNTIME" \
    --role roles/secretmanager.secretAccessor --condition=None >/dev/null
done

echo "==> Deployer roles"
for role in roles/run.admin roles/artifactregistry.writer roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOYER" \
    --role "$role" --condition=None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --member "serviceAccount:$DEPLOYER" \
  --role roles/iam.serviceAccountUser >/dev/null

echo "==> Workload Identity Federation (keyless GitHub -> GCP, locked to $GITHUB_REPO)"
gcloud iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location global \
  --workload-identity-pool "$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location global \
    --workload-identity-pool "$POOL" --display-name "pocketshark repo" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository=='$GITHUB_REPO' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_REPO" >/dev/null
WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"

echo "==> Firebase"
if ! curl -sf -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    "https://firebase.googleapis.com/v1beta1/projects/$PROJECT_ID" >/dev/null; then
  npx --yes firebase-tools projects:addfirebase "$PROJECT_ID"
fi

cat <<OUT

Done. Set these GitHub repo variables (Settings → Secrets and variables → Actions → Variables),
or run them with the gh CLI:

  gh variable set GCP_PROJECT_ID   -R $GITHUB_REPO -b "$PROJECT_ID"
  gh variable set GCP_REGION       -R $GITHUB_REPO -b "$REGION"
  gh variable set GCP_WIF_PROVIDER -R $GITHUB_REPO -b "$WIF_PROVIDER"
  gh variable set GCP_DEPLOYER_SA  -R $GITHUB_REPO -b "$DEPLOYER"
  gh variable set GCP_RUNTIME_SA   -R $GITHUB_REPO -b "$RUNTIME"
  gh variable set DEPLOY_ENABLED   -R $GITHUB_REPO -b "true"

Then push to main (or re-run the CI workflow) to deploy.
OUT
