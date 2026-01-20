# LLM-Forge Post-Deployment Verification Checklist

## Overview

This checklist verifies that LLM-Forge is correctly deployed and all agents are operational.

---

## 1. Service Health

- [ ] Service is responding to requests
- [ ] Health endpoint returns 200 OK
- [ ] All agent endpoints are registered
- [ ] Correct environment variables are set

**Verification Command:**
```bash
./deploy/scripts/verify-deployment.sh <project-id> <region>
```

---

## 2. Agent Availability

### SDK Generator Agent
- [ ] `/api/v1/agents/sdk-generator/status` returns 200
- [ ] Agent version matches expected (1.0.0)
- [ ] Generates SDKs for all supported languages
- [ ] Output is deterministic (same input = same output hash)

### CLI Command Generator Agent
- [ ] `/api/v1/agents/cli-generator/status` returns 200
- [ ] Agent version matches expected (1.0.0)
- [ ] Generates CLI commands from contracts
- [ ] Handlers and types are correctly generated

### API Translation Agent
- [ ] `/api/v1/agents/api-translator/status` returns 200
- [ ] Agent version matches expected (1.0.0)
- [ ] Translates between REST, SDK, and CLI formats
- [ ] Semantic equivalence is preserved

### Version Compatibility Agent
- [ ] `/api/v1/agents/version-compatibility/status` returns 200
- [ ] Agent version matches expected (1.0.0)
- [ ] Detects breaking vs non-breaking changes
- [ ] Provides correct version recommendations

---

## 3. Determinism Verification

- [ ] Identical requests produce identical outputs
- [ ] Determinism hash is stable across invocations
- [ ] No random or time-dependent behavior in outputs

**Test Command:**
```bash
# Run same request twice, compare hashes
curl -X POST $SERVICE_URL/api/v1/agents/sdk-generator \
  -H "Content-Type: application/json" \
  -d @test-payload.json | jq '.compatibility.determinismHash'
```

---

## 4. DecisionEvent Emission

- [ ] FEATURE_EMIT_EVENTS is enabled in environment
- [ ] RUVECTOR_SERVICE_URL is correctly configured
- [ ] DecisionEvents are reaching ruvector-service
- [ ] Event schema matches agentics-contracts

**Verification:**
```bash
# Check ruvector-service for recent events
curl $RUVECTOR_SERVICE_URL/api/v1/events?agent=sdk-generator-agent&limit=5
```

---

## 5. Telemetry & Observability

- [ ] TELEMETRY_ENDPOINT is configured
- [ ] Logs are appearing in Cloud Logging
- [ ] Request traces are in Cloud Trace
- [ ] No error spikes in monitoring

**Cloud Console Links:**
- Logs: `https://console.cloud.google.com/logs?project=<project-id>&query=resource.type%3D%22cloud_run_revision%22%20resource.labels.service_name%3D%22llm-forge%22`
- Traces: `https://console.cloud.google.com/traces?project=<project-id>`

---

## 6. CLI Integration

- [ ] `llm-forge generate` produces expected output
- [ ] `llm-forge generate-cli` produces CLI commands
- [ ] `llm-forge translate` works for all format pairs
- [ ] `llm-forge compatibility` analyzes versions correctly
- [ ] `llm-forge agent list` shows all registered agents

**CLI Test Commands:**
```bash
# SDK Generation
llm-forge generate tests/fixtures/simple-api.json -l typescript python

# CLI Generation
llm-forge generate-cli tests/fixtures/anthropic-messages-api.json -o ./test-cli

# API Translation
llm-forge translate tests/fixtures/simple-api.json --from rest --to sdk

# Version Compatibility
llm-forge compatibility tests/fixtures/v1-schema.json tests/fixtures/v2-schema.json

# Agent List
llm-forge agent list
```

---

## 7. Security & Compliance

- [ ] Service account has minimum required permissions
- [ ] No secrets in environment variables (using Secret Manager)
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] No direct SQL access from agents

**IAM Verification:**
```bash
gcloud projects get-iam-policy <project-id> \
  --flatten="bindings[].members" \
  --filter="bindings.members:llm-forge-sa@" \
  --format="table(bindings.role)"
```

---

## 8. Platform Integration

- [ ] agentics-cli can invoke Forge endpoints
- [ ] Generated SDKs align with agentics-contracts
- [ ] DecisionEvents can be consumed by governance views
- [ ] No direct invocation of Orchestrator/Shield/Sentinel

**Integration Test:**
```bash
# Using agentics-cli to invoke Forge
agentics forge generate --provider anthropic --languages typescript,python
agentics forge translate --from rest --to sdk --input api-spec.json
```

---

## 9. Performance Baseline

- [ ] Health check response < 100ms
- [ ] SDK generation for single language < 5s
- [ ] API translation < 2s
- [ ] Version compatibility analysis < 1s
- [ ] No memory leaks under sustained load

**Performance Test:**
```bash
# Basic latency check
time curl $SERVICE_URL/health

# Load test (requires hey or similar)
hey -n 100 -c 10 $SERVICE_URL/health
```

---

## 10. Rollback Readiness

- [ ] Previous revision is available in Cloud Run
- [ ] Rollback command documented
- [ ] Database migrations are backwards compatible (N/A - stateless)
- [ ] Feature flags allow gradual rollout

---

## Sign-Off

| Check | Status | Verified By | Date |
|-------|--------|-------------|------|
| Service Health | ☐ | | |
| Agent Availability | ☐ | | |
| Determinism | ☐ | | |
| DecisionEvents | ☐ | | |
| Telemetry | ☐ | | |
| CLI Integration | ☐ | | |
| Security | ☐ | | |
| Platform Integration | ☐ | | |
| Performance | ☐ | | |
| Rollback Ready | ☐ | | |

**Deployment Approved:** ☐ Yes / ☐ No

**Approver:** _________________

**Date:** _________________
