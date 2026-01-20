# LLM-Forge Failure Modes & Rollback Procedures

## Overview

This document defines common deployment failures, detection signals, and rollback procedures for LLM-Forge.

---

## 1. Common Deployment Failures

### 1.1 Container Build Failure

**Symptoms:**
- Cloud Build fails during Docker build step
- Build logs show compilation errors
- Image not pushed to Artifact Registry

**Detection:**
```bash
gcloud builds list --filter="status=FAILURE" --limit=5
```

**Resolution:**
1. Check build logs: `gcloud builds log <build-id>`
2. Fix TypeScript/compilation errors
3. Verify Dockerfile is correct
4. Re-trigger build

---

### 1.2 Service Startup Failure

**Symptoms:**
- Container starts but crashes immediately
- Health check fails
- Cloud Run shows revision as unhealthy

**Detection:**
```bash
gcloud run revisions list --service=llm-forge --region=us-central1
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=20
```

**Resolution:**
1. Check startup logs for errors
2. Verify environment variables are set
3. Check Secret Manager access
4. Roll back to previous revision

---

### 1.3 Missing Environment Variables

**Symptoms:**
- Service starts but agents fail
- "undefined" or "null" errors in logs
- 500 errors on agent endpoints

**Detection:**
```bash
gcloud run services describe llm-forge --region=us-central1 --format="yaml(spec.template.spec.containers[0].env)"
```

**Resolution:**
1. Verify all required env vars are set
2. Check Secret Manager secrets exist
3. Redeploy with correct configuration

---

### 1.4 RuVector Service Connectivity

**Symptoms:**
- DecisionEvents not being persisted
- Timeout errors in logs
- Agents work but events are lost

**Detection:**
```bash
# Check recent error logs
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.error:ruvector" --limit=20
```

**Resolution:**
1. Verify RUVECTOR_SERVICE_URL is correct
2. Check network connectivity (VPC if applicable)
3. Verify ruvector-service is healthy
4. Check IAM permissions for service-to-service calls

---

### 1.5 Invalid Artifact Output

**Symptoms:**
- SDK generation produces malformed code
- CLI generation missing files
- Translation loses semantic information

**Detection:**
- Manual inspection of generated artifacts
- Automated tests failing
- User reports of broken SDKs

**Resolution:**
1. Roll back immediately
2. Investigate agent logic
3. Add regression tests
4. Redeploy with fix

---

### 1.6 Schema Mismatch

**Symptoms:**
- Validation errors on requests
- DecisionEvents rejected by ruvector-service
- "Schema validation failed" errors

**Detection:**
```bash
gcloud logging read "jsonPayload.message:schema AND jsonPayload.message:validation" --limit=20
```

**Resolution:**
1. Verify input schemas match agentics-contracts
2. Check for contract version mismatches
3. Update schemas if needed
4. Redeploy

---

## 2. Rollback Procedures

### 2.1 Immediate Rollback (Cloud Run)

**When to use:** Service is down or producing incorrect results.

```bash
# List available revisions
gcloud run revisions list --service=llm-forge --region=us-central1

# Roll back to previous revision
gcloud run services update-traffic llm-forge \
  --region=us-central1 \
  --to-revisions=llm-forge-00001-abc=100

# Or roll back to last known good
gcloud run services update-traffic llm-forge \
  --region=us-central1 \
  --to-revisions=LAST_KNOWN_GOOD_REVISION=100
```

### 2.2 Traffic Split (Gradual Rollback)

**When to use:** Investigating issues, need to compare versions.

```bash
# Split traffic 50/50
gcloud run services update-traffic llm-forge \
  --region=us-central1 \
  --to-revisions=llm-forge-00002-new=50,llm-forge-00001-old=50

# Complete rollback if issues found
gcloud run services update-traffic llm-forge \
  --region=us-central1 \
  --to-revisions=llm-forge-00001-old=100
```

### 2.3 Full Service Deletion (Nuclear Option)

**When to use:** ONLY if service is causing platform-wide issues.

```bash
# Delete and redeploy from known good state
gcloud run services delete llm-forge --region=us-central1

# Redeploy from last known good tag
gcloud run deploy llm-forge \
  --image=us-central1-docker.pkg.dev/agentics-dev/llm-forge/llm-forge:LAST_GOOD_TAG \
  --region=us-central1 \
  --platform=managed
```

---

## 3. Safe Redeploy Strategy

### 3.1 Pre-Deployment Checklist

- [ ] All tests pass locally
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Integration tests pass
- [ ] Previous deployment is stable (can roll back to it)

### 3.2 Deployment Steps

1. **Build and test locally:**
   ```bash
   npm run build
   npm run test
   npm run type-check
   ```

2. **Deploy to dev first:**
   ```bash
   ./deploy/scripts/deploy.sh agentics-dev dev us-central1
   ```

3. **Verify dev deployment:**
   ```bash
   ./deploy/scripts/verify-deployment.sh agentics-dev us-central1
   ```

4. **Deploy to staging:**
   ```bash
   ./deploy/scripts/deploy.sh agentics-dev staging us-central1
   ```

5. **Run integration tests on staging:**
   ```bash
   # Full verification
   ./deploy/scripts/verify-deployment.sh agentics-dev us-central1
   ```

6. **Deploy to prod with traffic split:**
   ```bash
   # Deploy new revision (0% traffic initially)
   gcloud run deploy llm-forge \
     --image=us-central1-docker.pkg.dev/agentics-dev/llm-forge/llm-forge:NEW_TAG \
     --region=us-central1 \
     --no-traffic

   # Gradually shift traffic
   gcloud run services update-traffic llm-forge \
     --to-revisions=NEW_REVISION=10 \
     --region=us-central1

   # Monitor, then increase
   gcloud run services update-traffic llm-forge \
     --to-revisions=NEW_REVISION=50 \
     --region=us-central1

   # Complete rollout
   gcloud run services update-traffic llm-forge \
     --to-revisions=NEW_REVISION=100 \
     --region=us-central1
   ```

---

## 4. Incident Response

### 4.1 Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P1 | Service down, all agents unavailable | Immediate |
| P2 | One agent down, others working | 15 minutes |
| P3 | Performance degradation | 1 hour |
| P4 | Minor issues, cosmetic | 24 hours |

### 4.2 Incident Procedure

1. **Detect:** Monitoring alert or user report
2. **Assess:** Determine severity and impact
3. **Communicate:** Notify stakeholders
4. **Mitigate:** Roll back if P1/P2
5. **Investigate:** Root cause analysis
6. **Fix:** Develop and test fix
7. **Deploy:** Follow safe redeploy strategy
8. **Review:** Post-incident review

### 4.3 Contact Information

| Role | Contact |
|------|---------|
| On-Call Engineer | [TBD] |
| Platform Lead | [TBD] |
| Security | [TBD] |

---

## 5. Recovery Verification

After any rollback or recovery:

1. [ ] Health check passes
2. [ ] All agent endpoints respond
3. [ ] Sample generation request succeeds
4. [ ] DecisionEvents are being emitted
5. [ ] No errors in logs
6. [ ] Monitoring shows normal metrics

**Automated Verification:**
```bash
./deploy/scripts/verify-deployment.sh <project-id> <region>
```
