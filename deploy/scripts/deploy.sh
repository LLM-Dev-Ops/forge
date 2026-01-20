#!/bin/bash
# =============================================================================
# LLM-Forge Deployment Script
# =============================================================================
#
# Deploys LLM-Forge to Google Cloud Run
#
# Usage:
#   ./deploy/scripts/deploy.sh <project-id> <environment> [region]
#
# Example:
#   ./deploy/scripts/deploy.sh agentics-dev dev us-central1
#
# =============================================================================

set -euo pipefail

PROJECT_ID="${1:-}"
ENV="${2:-dev}"
REGION="${3:-us-central1}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: Project ID required"
  echo "Usage: $0 <project-id> <environment> [region]"
  exit 1
fi

# Validate environment
if [[ "$ENV" != "dev" && "$ENV" != "staging" && "$ENV" != "prod" ]]; then
  echo "ERROR: Invalid environment. Must be dev, staging, or prod"
  exit 1
fi

echo "=========================================="
echo "LLM-Forge Deployment"
echo "=========================================="
echo "Project:     $PROJECT_ID"
echo "Environment: $ENV"
echo "Region:      $REGION"
echo ""

# Set project
gcloud config set project "$PROJECT_ID"

# =============================================================================
# BUILD & DEPLOY
# =============================================================================

echo "Triggering Cloud Build..."
echo ""

gcloud builds submit \
  --config=deploy/cloudbuild.yaml \
  --substitutions="_ENV=$ENV,_REGION=$REGION" \
  --async

echo ""
echo "=========================================="
echo "Deployment Initiated"
echo "=========================================="
echo ""
echo "Monitor progress:"
echo "  gcloud builds list --limit=1"
echo ""
echo "View logs:"
echo "  gcloud builds log \$(gcloud builds list --limit=1 --format='value(id)')"
echo ""
echo "Check service:"
echo "  gcloud run services describe llm-forge --region=$REGION"
echo ""
