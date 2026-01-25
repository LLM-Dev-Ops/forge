/**
 * Phase 2 - Operational Intelligence: Performance Budget Enforcement
 *
 * Performance Budgets:
 * - MAX_TOKENS=1000
 * - MAX_LATENCY_MS=2000
 * - MAX_CALLS_PER_RUN=3
 *
 * @module phase2/performance-budget
 */

import type { SignalEmitter } from './signals.js';

// =============================================================================
// CONSTANTS
// =============================================================================

export const PERFORMANCE_BUDGETS = {
  MAX_TOKENS: 1000,
  MAX_LATENCY_MS: 2000,
  MAX_CALLS_PER_RUN: 3,
} as const;

// =============================================================================
// TYPES
// =============================================================================

export interface PerformanceMetrics {
  tokensUsed: number;
  latencyMs: number;
  callsMade: number;
  startTime: number;
}

export interface BudgetViolation {
  budget: keyof typeof PERFORMANCE_BUDGETS;
  limit: number;
  actual: number;
  exceeded: boolean;
  percentOfBudget: number;
}

export interface BudgetCheckResult {
  withinBudget: boolean;
  violations: BudgetViolation[];
  metrics: PerformanceMetrics;
}

// =============================================================================
// PERFORMANCE TRACKER
// =============================================================================

/**
 * Tracks performance metrics for a single request/run
 * Enforces Phase 2 performance budgets
 */
export class PerformanceTracker {
  private metrics: PerformanceMetrics;
  private signalEmitter: SignalEmitter | null;
  private requestId: string;
  private operationBreakdown: Record<string, number> = {};

  constructor(requestId: string, signalEmitter?: SignalEmitter) {
    this.requestId = requestId;
    this.signalEmitter = signalEmitter || null;
    this.metrics = {
      tokensUsed: 0,
      latencyMs: 0,
      callsMade: 0,
      startTime: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Token Tracking
  // ---------------------------------------------------------------------------

  /**
   * Record tokens used (input + output)
   * @returns true if within budget, false if exceeded
   */
  recordTokens(count: number): boolean {
    this.metrics.tokensUsed += count;
    const exceeded = this.metrics.tokensUsed > PERFORMANCE_BUDGETS.MAX_TOKENS;

    if (exceeded && this.signalEmitter) {
      this.signalEmitter.emitAnomaly({
        anomalyType: 'budget_exceeded',
        observed: this.metrics.tokensUsed,
        expected: PERFORMANCE_BUDGETS.MAX_TOKENS,
        deviation:
          this.metrics.tokensUsed - PERFORMANCE_BUDGETS.MAX_TOKENS,
        confidence: 1.0,
        severity: 'warning',
        requestId: this.requestId,
        context: { budget: 'MAX_TOKENS' },
      });
    }

    return !exceeded;
  }

  /**
   * Check if adding more tokens would exceed budget
   */
  canUseTokens(count: number): boolean {
    return this.metrics.tokensUsed + count <= PERFORMANCE_BUDGETS.MAX_TOKENS;
  }

  /**
   * Get remaining token budget
   */
  getRemainingTokens(): number {
    return Math.max(0, PERFORMANCE_BUDGETS.MAX_TOKENS - this.metrics.tokensUsed);
  }

  // ---------------------------------------------------------------------------
  // Call Tracking
  // ---------------------------------------------------------------------------

  /**
   * Record an external call (API, database, etc.)
   * @returns true if within budget, false if exceeded
   */
  recordCall(): boolean {
    this.metrics.callsMade += 1;
    const exceeded = this.metrics.callsMade > PERFORMANCE_BUDGETS.MAX_CALLS_PER_RUN;

    if (exceeded && this.signalEmitter) {
      this.signalEmitter.emitAnomaly({
        anomalyType: 'budget_exceeded',
        observed: this.metrics.callsMade,
        expected: PERFORMANCE_BUDGETS.MAX_CALLS_PER_RUN,
        deviation: this.metrics.callsMade - PERFORMANCE_BUDGETS.MAX_CALLS_PER_RUN,
        confidence: 1.0,
        severity: 'warning',
        requestId: this.requestId,
        context: { budget: 'MAX_CALLS_PER_RUN' },
      });
    }

    return !exceeded;
  }

  /**
   * Check if more calls can be made within budget
   */
  canMakeCall(): boolean {
    return this.metrics.callsMade < PERFORMANCE_BUDGETS.MAX_CALLS_PER_RUN;
  }

  /**
   * Get remaining calls allowed
   */
  getRemainingCalls(): number {
    return Math.max(
      0,
      PERFORMANCE_BUDGETS.MAX_CALLS_PER_RUN - this.metrics.callsMade
    );
  }

  // ---------------------------------------------------------------------------
  // Latency Tracking
  // ---------------------------------------------------------------------------

  /**
   * Record operation latency
   */
  recordOperation(operation: string, latencyMs: number): void {
    this.operationBreakdown[operation] =
      (this.operationBreakdown[operation] || 0) + latencyMs;
  }

  /**
   * Get current elapsed time
   */
  getElapsedMs(): number {
    return Date.now() - this.metrics.startTime;
  }

  /**
   * Check if latency budget is exceeded
   */
  isLatencyExceeded(): boolean {
    return this.getElapsedMs() > PERFORMANCE_BUDGETS.MAX_LATENCY_MS;
  }

  /**
   * Get remaining latency budget
   */
  getRemainingLatencyMs(): number {
    return Math.max(
      0,
      PERFORMANCE_BUDGETS.MAX_LATENCY_MS - this.getElapsedMs()
    );
  }

  // ---------------------------------------------------------------------------
  // Budget Checking
  // ---------------------------------------------------------------------------

  /**
   * Complete tracking and check all budgets
   */
  complete(): BudgetCheckResult {
    this.metrics.latencyMs = this.getElapsedMs();

    const violations: BudgetViolation[] = [];

    // Check tokens
    const tokenViolation: BudgetViolation = {
      budget: 'MAX_TOKENS',
      limit: PERFORMANCE_BUDGETS.MAX_TOKENS,
      actual: this.metrics.tokensUsed,
      exceeded: this.metrics.tokensUsed > PERFORMANCE_BUDGETS.MAX_TOKENS,
      percentOfBudget:
        (this.metrics.tokensUsed / PERFORMANCE_BUDGETS.MAX_TOKENS) * 100,
    };
    if (tokenViolation.exceeded) violations.push(tokenViolation);

    // Check latency
    const latencyViolation: BudgetViolation = {
      budget: 'MAX_LATENCY_MS',
      limit: PERFORMANCE_BUDGETS.MAX_LATENCY_MS,
      actual: this.metrics.latencyMs,
      exceeded: this.metrics.latencyMs > PERFORMANCE_BUDGETS.MAX_LATENCY_MS,
      percentOfBudget:
        (this.metrics.latencyMs / PERFORMANCE_BUDGETS.MAX_LATENCY_MS) * 100,
    };
    if (latencyViolation.exceeded) violations.push(latencyViolation);

    // Check calls
    const callsViolation: BudgetViolation = {
      budget: 'MAX_CALLS_PER_RUN',
      limit: PERFORMANCE_BUDGETS.MAX_CALLS_PER_RUN,
      actual: this.metrics.callsMade,
      exceeded: this.metrics.callsMade > PERFORMANCE_BUDGETS.MAX_CALLS_PER_RUN,
      percentOfBudget:
        (this.metrics.callsMade / PERFORMANCE_BUDGETS.MAX_CALLS_PER_RUN) * 100,
    };
    if (callsViolation.exceeded) violations.push(callsViolation);

    // Emit latency signal
    if (this.signalEmitter) {
      this.signalEmitter.emitLatency({
        operation: 'request_complete',
        latencyMs: this.metrics.latencyMs,
        budgetMs: PERFORMANCE_BUDGETS.MAX_LATENCY_MS,
        requestId: this.requestId,
        breakdown: this.operationBreakdown,
      });
    }

    return {
      withinBudget: violations.length === 0,
      violations,
      metrics: { ...this.metrics },
    };
  }

  /**
   * Get current metrics (without completing)
   */
  getMetrics(): PerformanceMetrics {
    return {
      ...this.metrics,
      latencyMs: this.getElapsedMs(),
    };
  }
}

// =============================================================================
// DECORATOR / MIDDLEWARE
// =============================================================================

/**
 * Create a performance-tracked operation wrapper
 */
export function withPerformanceTracking<T>(
  tracker: PerformanceTracker,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  return fn().finally(() => {
    tracker.recordOperation(operation, Date.now() - start);
  });
}

/**
 * Ensure operation completes within remaining latency budget
 */
export async function withLatencyBudget<T>(
  tracker: PerformanceTracker,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const remainingMs = tracker.getRemainingLatencyMs();

  if (remainingMs <= 0) {
    throw new Error(`Latency budget exhausted before ${operation}`);
  }

  const start = Date.now();

  const result = await Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation ${operation} exceeded latency budget`)),
        remainingMs
      )
    ),
  ]);

  tracker.recordOperation(operation, Date.now() - start);
  return result;
}
