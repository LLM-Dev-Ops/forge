/**
 * Phase 2 - Operational Intelligence (Layer 1)
 *
 * Core modules for Phase 2 agent infrastructure:
 * - Startup Hardening: Fail fast if Ruvector unavailable
 * - Signal Emission: Anomaly, drift, memory lineage, latency signals
 * - Performance Budget: MAX_TOKENS=1000, MAX_LATENCY_MS=2000, MAX_CALLS_PER_RUN=3
 * - Caching: Historical reads and lineage lookups (TTL 60-120s)
 *
 * @module phase2
 */

// Startup Hardening
export {
  validateStartup,
  enforceStartup,
  getStartupConfig,
  type StartupConfig,
  type StartupValidationResult,
  type RuvectorHealthResponse,
} from './startup-hardening.js';

// Signal Emission
export {
  SignalEmitter,
  initSignalEmitter,
  getSignalEmitter,
  type SignalType,
  type SignalSeverity,
  type BaseSignal,
  type AnomalySignal,
  type DriftSignal,
  type MemoryLineageSignal,
  type LatencySignal,
  type Signal,
} from './signals.js';

// Performance Budget
export {
  PERFORMANCE_BUDGETS,
  PerformanceTracker,
  withPerformanceTracking,
  withLatencyBudget,
  type PerformanceMetrics,
  type BudgetViolation,
  type BudgetCheckResult,
} from './performance-budget.js';

// Caching
export {
  CACHE_CONFIG,
  Phase2Cache,
  initCache,
  getCache,
  type CacheCategory,
} from './cache.js';

// =============================================================================
// PHASE 2 INITIALIZATION
// =============================================================================

import { enforceStartup, type StartupConfig } from './startup-hardening.js';
import { initSignalEmitter, type SignalEmitter } from './signals.js';
import { initCache, type Phase2Cache } from './cache.js';

export interface Phase2Context {
  config: StartupConfig;
  signalEmitter: SignalEmitter;
  cache: Phase2Cache;
}

/**
 * Initialize all Phase 2 infrastructure
 *
 * This function:
 * 1. Validates startup requirements (env vars)
 * 2. Verifies Ruvector is available (fails fast if not)
 * 3. Initializes signal emitter
 * 4. Initializes cache layer
 *
 * @throws Exits process if requirements not met
 */
export async function initPhase2(): Promise<Phase2Context> {
  console.log('[Phase2] Initializing Operational Intelligence - Layer 1');

  // Step 1: Enforce startup requirements (exits if failed)
  const config = await enforceStartup();

  // Step 2: Initialize signal emitter
  const signalEmitter = initSignalEmitter({
    ruvectorUrl: config.ruvectorServiceUrl,
    ruvectorApiKey: config.ruvectorApiKey,
    agentName: config.agentName,
    agentDomain: config.agentDomain,
  });

  // Step 3: Initialize cache with signal emitter
  const cache = initCache(signalEmitter);

  console.log('[Phase2] Initialization complete');

  return {
    config,
    signalEmitter,
    cache,
  };
}
