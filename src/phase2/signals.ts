/**
 * Phase 2 - Operational Intelligence: Signal Emission
 *
 * Agents MUST emit:
 * - Anomaly signals
 * - Drift signals
 * - Memory lineage signals
 * - Latency signals
 *
 * Signals MUST:
 * - Be atomic
 * - Include confidence
 * - Avoid conclusions (raw observations only)
 *
 * @module phase2/signals
 */

import { randomUUID } from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export type SignalType = 'anomaly' | 'drift' | 'memory_lineage' | 'latency';
export type SignalSeverity = 'info' | 'warning' | 'critical';

/**
 * Base signal structure - all signals must be atomic
 */
export interface BaseSignal {
  signalId: string;
  signalType: SignalType;
  timestamp: string;
  agentName: string;
  agentDomain: string;
  agentPhase: string;
  agentLayer: string;
  requestId?: string;
  confidence: number; // 0.0 - 1.0
  severity: SignalSeverity;
}

/**
 * Anomaly signal - unexpected behavior detected
 */
export interface AnomalySignal extends BaseSignal {
  signalType: 'anomaly';
  payload: {
    anomalyType: string;
    observed: unknown;
    expected?: unknown;
    deviation?: number;
    context?: Record<string, unknown>;
  };
}

/**
 * Drift signal - gradual change from baseline
 */
export interface DriftSignal extends BaseSignal {
  signalType: 'drift';
  payload: {
    driftType: 'schema' | 'behavior' | 'performance' | 'output';
    baseline: unknown;
    current: unknown;
    delta: number;
    direction: 'increasing' | 'decreasing' | 'oscillating';
    windowMs: number;
  };
}

/**
 * Memory lineage signal - tracks data provenance
 * For Memory Graph agents: emit deltas only, no synthesized conclusions
 */
export interface MemoryLineageSignal extends BaseSignal {
  signalType: 'memory_lineage';
  payload: {
    lineageType: 'read' | 'write' | 'transform' | 'derive';
    sourceKeys: string[];
    targetKey?: string;
    operation: string;
    transformHash?: string;
  };
}

/**
 * Latency signal - performance timing observation
 */
export interface LatencySignal extends BaseSignal {
  signalType: 'latency';
  payload: {
    operation: string;
    latencyMs: number;
    budgetMs: number;
    exceeded: boolean;
    percentOfBudget: number;
    breakdown?: Record<string, number>;
  };
}

export type Signal =
  | AnomalySignal
  | DriftSignal
  | MemoryLineageSignal
  | LatencySignal;

// =============================================================================
// SIGNAL EMITTER
// =============================================================================

/**
 * Signal Emitter for Phase 2 agents
 *
 * All signals are:
 * - Atomic (single observation)
 * - Include confidence scores
 * - Avoid conclusions (raw data only)
 */
export class SignalEmitter {
  private ruvectorUrl: string;
  private ruvectorApiKey: string;
  private agentName: string;
  private agentDomain: string;
  private agentPhase: string;
  private agentLayer: string;
  private pendingSignals: Signal[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;

  constructor(config: {
    ruvectorUrl: string;
    ruvectorApiKey: string;
    agentName: string;
    agentDomain: string;
    agentPhase?: string;
    agentLayer?: string;
  }) {
    this.ruvectorUrl = config.ruvectorUrl;
    this.ruvectorApiKey = config.ruvectorApiKey;
    this.agentName = config.agentName;
    this.agentDomain = config.agentDomain;
    this.agentPhase = config.agentPhase || 'phase2';
    this.agentLayer = config.agentLayer || 'layer1';
  }

  // ---------------------------------------------------------------------------
  // Base Signal Creation
  // ---------------------------------------------------------------------------

  private createBaseSignal(
    type: SignalType,
    confidence: number,
    severity: SignalSeverity,
    requestId?: string
  ): BaseSignal {
    return {
      signalId: randomUUID(),
      signalType: type,
      timestamp: new Date().toISOString(),
      agentName: this.agentName,
      agentDomain: this.agentDomain,
      agentPhase: this.agentPhase,
      agentLayer: this.agentLayer,
      requestId,
      confidence: Math.max(0, Math.min(1, confidence)),
      severity,
    };
  }

  // ---------------------------------------------------------------------------
  // Anomaly Signals
  // ---------------------------------------------------------------------------

  /**
   * Emit an anomaly signal
   * Use when unexpected behavior is detected
   */
  emitAnomaly(params: {
    anomalyType: string;
    observed: unknown;
    expected?: unknown;
    deviation?: number;
    confidence: number;
    severity?: SignalSeverity;
    requestId?: string;
    context?: Record<string, unknown>;
  }): void {
    const signal: AnomalySignal = {
      ...this.createBaseSignal(
        'anomaly',
        params.confidence,
        params.severity || 'warning',
        params.requestId
      ),
      signalType: 'anomaly',
      payload: {
        anomalyType: params.anomalyType,
        observed: params.observed,
        expected: params.expected,
        deviation: params.deviation,
        context: params.context,
      },
    };
    this.queueSignal(signal);
  }

  // ---------------------------------------------------------------------------
  // Drift Signals
  // ---------------------------------------------------------------------------

  /**
   * Emit a drift signal
   * Use when gradual change from baseline is detected
   */
  emitDrift(params: {
    driftType: 'schema' | 'behavior' | 'performance' | 'output';
    baseline: unknown;
    current: unknown;
    delta: number;
    direction: 'increasing' | 'decreasing' | 'oscillating';
    windowMs: number;
    confidence: number;
    severity?: SignalSeverity;
    requestId?: string;
  }): void {
    const signal: DriftSignal = {
      ...this.createBaseSignal(
        'drift',
        params.confidence,
        params.severity || 'info',
        params.requestId
      ),
      signalType: 'drift',
      payload: {
        driftType: params.driftType,
        baseline: params.baseline,
        current: params.current,
        delta: params.delta,
        direction: params.direction,
        windowMs: params.windowMs,
      },
    };
    this.queueSignal(signal);
  }

  // ---------------------------------------------------------------------------
  // Memory Lineage Signals
  // ---------------------------------------------------------------------------

  /**
   * Emit a memory lineage signal
   * For Memory Graph agents: emit deltas only, NOT synthesized conclusions
   */
  emitMemoryLineage(params: {
    lineageType: 'read' | 'write' | 'transform' | 'derive';
    sourceKeys: string[];
    targetKey?: string;
    operation: string;
    transformHash?: string;
    confidence: number;
    requestId?: string;
  }): void {
    const signal: MemoryLineageSignal = {
      ...this.createBaseSignal(
        'memory_lineage',
        params.confidence,
        'info',
        params.requestId
      ),
      signalType: 'memory_lineage',
      payload: {
        lineageType: params.lineageType,
        sourceKeys: params.sourceKeys,
        targetKey: params.targetKey,
        operation: params.operation,
        transformHash: params.transformHash,
      },
    };
    this.queueSignal(signal);
  }

  // ---------------------------------------------------------------------------
  // Latency Signals
  // ---------------------------------------------------------------------------

  /**
   * Emit a latency signal
   * Use to track operation timing against budget
   */
  emitLatency(params: {
    operation: string;
    latencyMs: number;
    budgetMs: number;
    requestId?: string;
    breakdown?: Record<string, number>;
  }): void {
    const exceeded = params.latencyMs > params.budgetMs;
    const percentOfBudget = (params.latencyMs / params.budgetMs) * 100;

    const signal: LatencySignal = {
      ...this.createBaseSignal(
        'latency',
        1.0, // Latency measurements are deterministic
        exceeded ? 'warning' : 'info',
        params.requestId
      ),
      signalType: 'latency',
      payload: {
        operation: params.operation,
        latencyMs: params.latencyMs,
        budgetMs: params.budgetMs,
        exceeded,
        percentOfBudget: Math.round(percentOfBudget * 100) / 100,
        breakdown: params.breakdown,
      },
    };
    this.queueSignal(signal);
  }

  // ---------------------------------------------------------------------------
  // Queue Management
  // ---------------------------------------------------------------------------

  private queueSignal(signal: Signal): void {
    this.pendingSignals.push(signal);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimeout) return;

    // Use setImmediate for batching signals in same tick
    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      this.flush().catch((error) => {
        console.error('[SignalEmitter] Flush failed:', error);
      });
    }, 0);
  }

  /**
   * Flush pending signals to Ruvector
   */
  async flush(): Promise<void> {
    const signals = this.pendingSignals;
    this.pendingSignals = [];

    if (signals.length === 0) return;

    try {
      const response = await fetch(
        `${this.ruvectorUrl}/api/v1/signals/batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.ruvectorApiKey}`,
            'X-Agent-Name': this.agentName,
            'X-Agent-Domain': this.agentDomain,
            'X-Agent-Phase': this.agentPhase,
          },
          body: JSON.stringify({ signals }),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        throw new Error(`Ruvector returned HTTP ${response.status}`);
      }
    } catch (error) {
      // Log locally but don't fail - signals are fire-and-forget
      console.error(
        '[SignalEmitter] Failed to emit signals:',
        error instanceof Error ? error.message : error
      );
      // Also log signals locally for debugging
      for (const signal of signals) {
        console.log('[Signal]', JSON.stringify(signal));
      }
    }
  }

  /**
   * Force immediate flush (for shutdown)
   */
  async forceFlush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    await this.flush();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let globalEmitter: SignalEmitter | null = null;

/**
 * Initialize global signal emitter
 */
export function initSignalEmitter(config: {
  ruvectorUrl: string;
  ruvectorApiKey: string;
  agentName: string;
  agentDomain: string;
}): SignalEmitter {
  globalEmitter = new SignalEmitter(config);
  return globalEmitter;
}

/**
 * Get global signal emitter
 */
export function getSignalEmitter(): SignalEmitter | null {
  return globalEmitter;
}
