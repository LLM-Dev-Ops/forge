#!/bin/bash
# =============================================================================
# LLM-Forge IAM Setup Script
# =============================================================================
#
# Creates service accounts and assigns minimal required permissions
# following least-privilege principle.
#
# Usage:
#   ./deploy/scripts/setup-iam.sh <project-id> [environment]
#
# Example:
#   ./deploy/scripts/setup-iam.sh agentics-dev dev
#
# =============================================================================

set -euo pipefail

PROJECT_ID="${1:-}"
ENV="${2:-dev}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: Project ID required"
  echo "Usage: $0 <project-id> [environment]"
  exit 1
fi

echo "=========================================="
echo "LLM-Forge IAM Setup"
echo "=========================================="
echo "Project: $PROJECT_ID"
echo "Environment: $ENV"
echo ""

# =============================================================================
# SERVICE ACCOUNT CREATION
# =============================================================================

SA_NAME="llm-forge-sa"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "Creating service account: $SA_NAME..."

gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" 2>/dev/null || \
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT_ID" \
    --display-name="LLM-Forge Service Account" \
    --description="Service account for LLM-Forge code generation service"

echo "✓ Service account created: $SA_EMAIL"

# =============================================================================
# ROLE ASSIGNMENTS
# =============================================================================

echo ""
echo "Assigning IAM roles..."

# Cloud Run invoker (for calling other services like ruvector-service)
echo "  - Adding Cloud Run Invoker role..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/run.invoker" \
  --condition=None \
  --quiet 2>/dev/null || true

# Secret Manager accessor (for reading secrets)
echo "  - Adding Secret Manager Accessor role..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None \
  --quiet 2>/dev/null || true

# Cloud Trace agent (for telemetry)
echo "  - Adding Cloud Trace Agent role..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudtrace.agent" \
  --condition=None \
  --quiet 2>/dev/null || true

# Cloud Logging writer (for structured logs)
echo "  - Adding Logging Writer role..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/logging.logWriter" \
  --condition=None \
  --quiet 2>/dev/null || true

# Monitoring metric writer (for custom metrics)
echo "  - Adding Monitoring Metric Writer role..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/monitoring.metricWriter" \
  --condition=None \
  --quiet 2>/dev/null || true

echo "✓ IAM roles assigned"

# =============================================================================
# ARTIFACT REGISTRY SETUP
# =============================================================================

echo ""
echo "Setting up Artifact Registry..."

REGION="us-central1"
REPO_NAME="llm-forge"

# Create repository if it doesn't exist
gcloud artifacts repositories describe "$REPO_NAME" \
  --project="$PROJECT_ID" \
  --location="$REGION" 2>/dev/null || \
  gcloud artifacts repositories create "$REPO_NAME" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --repository-format=docker \
    --description="LLM-Forge container images"

echo "✓ Artifact Registry repository: $REPO_NAME"

# =============================================================================
# SECRET MANAGER SETUP
# =============================================================================

echo ""
echo "Setting up Secret Manager secrets..."

# Create secrets (placeholders - actual values should be set manually)
SECRETS=(
  "ruvector-service-url:https://ruvector-service-${ENV}.agentics-dev.run.app"
  "ruvector-api-key:__PLACEHOLDER__"
  "telemetry-endpoint:https://llm-observatory-${ENV}.agentics-dev.run.app"
)

for SECRET_PAIR in "${SECRETS[@]}"; do
  SECRET_NAME="${SECRET_PAIR%%:*}"
  DEFAULT_VALUE="${SECRET_PAIR#*:}"

  # Check if secret exists
  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" 2>/dev/null; then
    echo "  - Secret exists: $SECRET_NAME"
  else
    echo "  - Creating secret: $SECRET_NAME..."
    echo -n "$DEFAULT_VALUE" | gcloud secrets create "$SECRET_NAME" \
      --project="$PROJECT_ID" \
      --data-file=- \
      --labels="app=llm-forge,env=$ENV"
  fi
done

echo "✓ Secret Manager secrets configured"

# =============================================================================
# CLOUD BUILD PERMISSIONS
# =============================================================================

echo ""
echo "Setting up Cloud Build permissions..."

# Get Cloud Build service account
BUILD_SA="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"

# Grant Cloud Run Admin to Cloud Build
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/run.admin" \
  --condition=None \
  --quiet 2>/dev/null || true

# Grant service account user to Cloud Build (to deploy with the llm-forge SA)
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/iam.serviceAccountUser" \
  --quiet 2>/dev/null || true

echo "✓ Cloud Build permissions configured"

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "=========================================="
echo "IAM Setup Complete"
echo "=========================================="
echo ""
echo "Service Account: $SA_EMAIL"
echo ""
echo "Assigned Roles:"
echo "  - roles/run.invoker"
echo "  - roles/secretmanager.secretAccessor"
echo "  - roles/cloudtrace.agent"
echo "  - roles/logging.logWriter"
echo "  - roles/monitoring.metricWriter"
echo ""
echo "Secrets (update manually if needed):"
for SECRET_PAIR in "${SECRETS[@]}"; do
  SECRET_NAME="${SECRET_PAIR%%:*}"
  echo "  - $SECRET_NAME"
done
echo ""
echo "Next steps:"
echo "  1. Update secret values in Secret Manager"
echo "  2. Run: ./deploy/scripts/deploy.sh $PROJECT_ID $ENV"
echo ""
