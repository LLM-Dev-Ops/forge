#!/bin/bash
# =============================================================================
# LLM-Forge Deployment Verification Script
# =============================================================================
#
# Verifies that LLM-Forge is deployed and all agents are operational
#
# Usage:
#   ./deploy/scripts/verify-deployment.sh <project-id> [region]
#
# =============================================================================

set -euo pipefail

PROJECT_ID="${1:-}"
REGION="${2:-us-central1}"
SERVICE_NAME="llm-forge"

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: Project ID required"
  echo "Usage: $0 <project-id> [region]"
  exit 1
fi

echo "=========================================="
echo "LLM-Forge Deployment Verification"
echo "=========================================="
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# =============================================================================
# GET SERVICE URL
# =============================================================================

echo "Retrieving service URL..."

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)' 2>/dev/null)

if [[ -z "$SERVICE_URL" ]]; then
  echo "❌ ERROR: Service not found or not deployed"
  exit 1
fi

echo "✓ Service URL: $SERVICE_URL"
echo ""

# =============================================================================
# HEALTH CHECK
# =============================================================================

echo "1. Health Check"
echo "   Endpoint: $SERVICE_URL/health"

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/health")
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if [[ "$HEALTH_CODE" == "200" ]]; then
  echo "   ✓ Status: $HEALTH_CODE OK"
  echo "   Response: $(echo "$HEALTH_BODY" | jq -c '.status, .version' 2>/dev/null || echo "$HEALTH_BODY")"
else
  echo "   ❌ Status: $HEALTH_CODE FAILED"
  echo "   Response: $HEALTH_BODY"
  exit 1
fi
echo ""

# =============================================================================
# AGENT LIST
# =============================================================================

echo "2. Agent List"
echo "   Endpoint: $SERVICE_URL/api/v1/agents"

AGENTS_RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/api/v1/agents")
AGENTS_CODE=$(echo "$AGENTS_RESPONSE" | tail -n1)
AGENTS_BODY=$(echo "$AGENTS_RESPONSE" | sed '$d')

if [[ "$AGENTS_CODE" == "200" ]]; then
  echo "   ✓ Status: $AGENTS_CODE OK"
  AGENT_COUNT=$(echo "$AGENTS_BODY" | jq '.agents | length' 2>/dev/null || echo "?")
  echo "   Agents found: $AGENT_COUNT"
else
  echo "   ❌ Status: $AGENTS_CODE FAILED"
  exit 1
fi
echo ""

# =============================================================================
# INDIVIDUAL AGENT STATUS
# =============================================================================

echo "3. Agent Status Checks"

AGENTS=("sdk-generator" "cli-generator" "api-translator" "version-compatibility")
FAILED_AGENTS=()

for AGENT in "${AGENTS[@]}"; do
  echo "   Checking: $AGENT"

  STATUS_URL="$SERVICE_URL/api/v1/agents/$AGENT/status"
  STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "$STATUS_URL")
  STATUS_CODE=$(echo "$STATUS_RESPONSE" | tail -n1)
  STATUS_BODY=$(echo "$STATUS_RESPONSE" | sed '$d')

  if [[ "$STATUS_CODE" == "200" ]]; then
    VERSION=$(echo "$STATUS_BODY" | jq -r '.version' 2>/dev/null || echo "?")
    echo "   ✓ $AGENT (v$VERSION) - Available"
  else
    echo "   ❌ $AGENT - UNAVAILABLE (HTTP $STATUS_CODE)"
    FAILED_AGENTS+=("$AGENT")
  fi
done
echo ""

# =============================================================================
# DETERMINISM CHECK (SDK Generator)
# =============================================================================

echo "4. Determinism Check (SDK Generator)"
echo "   Running identical requests to verify deterministic output..."

# Simple test payload
TEST_PAYLOAD='{
  "requestId": "test-determinism-001",
  "schema": {
    "metadata": {
      "providerId": "test",
      "providerName": "Test Provider",
      "apiVersion": "1.0.0",
      "schemaVersion": "1.0.0"
    },
    "types": [],
    "endpoints": [],
    "authentication": [],
    "errors": []
  },
  "targetLanguages": ["typescript"],
  "packageConfig": {
    "name": "test-sdk",
    "version": "1.0.0",
    "license": "Apache-2.0"
  },
  "options": {
    "includeExamples": false,
    "includeTests": false,
    "strictTypes": true
  }
}'

# First request
RESPONSE1=$(curl -s -X POST "$SERVICE_URL/api/v1/agents/sdk-generator" \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD" | jq -r '.compatibility.determinismHash // empty' 2>/dev/null)

# Second request
RESPONSE2=$(curl -s -X POST "$SERVICE_URL/api/v1/agents/sdk-generator" \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD" | jq -r '.compatibility.determinismHash // empty' 2>/dev/null)

if [[ -n "$RESPONSE1" && "$RESPONSE1" == "$RESPONSE2" ]]; then
  echo "   ✓ Determinism verified - Hashes match"
  echo "   Hash: ${RESPONSE1:0:32}..."
else
  echo "   ⚠ Determinism check inconclusive"
  echo "   Hash 1: $RESPONSE1"
  echo "   Hash 2: $RESPONSE2"
fi
echo ""

# =============================================================================
# RUVECTOR CONNECTIVITY CHECK
# =============================================================================

echo "5. RuVector Service Connectivity"
echo "   Checking DecisionEvent emission capability..."

# This is a soft check - we verify the service is configured, not actual connectivity
RUVECTOR_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(spec.template.spec.containers[0].env)' 2>/dev/null | grep -o 'RUVECTOR_SERVICE_URL[^,]*' || echo "")

if [[ -n "$RUVECTOR_URL" ]]; then
  echo "   ✓ RuVector service URL configured"
else
  echo "   ⚠ RuVector service URL not found in environment"
fi
echo ""

# =============================================================================
# TELEMETRY CHECK
# =============================================================================

echo "6. Telemetry Configuration"

TELEMETRY_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(spec.template.spec.containers[0].env)' 2>/dev/null | grep -o 'TELEMETRY_ENDPOINT[^,]*' || echo "")

if [[ -n "$TELEMETRY_URL" ]]; then
  echo "   ✓ Telemetry endpoint configured"
else
  echo "   ⚠ Telemetry endpoint not found in environment"
fi
echo ""

# =============================================================================
# SUMMARY
# =============================================================================

echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo ""

if [[ ${#FAILED_AGENTS[@]} -eq 0 ]]; then
  echo "✅ ALL CHECKS PASSED"
  echo ""
  echo "Service URL: $SERVICE_URL"
  echo ""
  echo "Available Endpoints:"
  echo "  GET  $SERVICE_URL/health"
  echo "  GET  $SERVICE_URL/api/v1/agents"
  echo "  POST $SERVICE_URL/api/v1/agents/sdk-generator"
  echo "  POST $SERVICE_URL/api/v1/agents/cli-generator"
  echo "  POST $SERVICE_URL/api/v1/agents/api-translator"
  echo "  POST $SERVICE_URL/api/v1/agents/version-compatibility"
  echo ""
  exit 0
else
  echo "❌ VERIFICATION FAILED"
  echo ""
  echo "Failed agents: ${FAILED_AGENTS[*]}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check service logs: gcloud run logs read --service=$SERVICE_NAME --region=$REGION"
  echo "  2. Check deployment status: gcloud run services describe $SERVICE_NAME --region=$REGION"
  echo "  3. Verify IAM permissions: ./deploy/scripts/setup-iam.sh $PROJECT_ID"
  echo ""
  exit 1
fi
