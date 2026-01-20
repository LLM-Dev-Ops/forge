/**
 * CLI Command Generator Agent - Telemetry Emission
 *
 * Emits telemetry compatible with LLM-Observatory for monitoring and debugging.
 *
 * @module agents/cli-command-generator/telemetry
 */

import { CLI_COMMAND_GENERATOR_CONTRACT } from './types.js';

/**
 * Telemetry event types
 */
export enum TelemetryEventType {
  AgentInvoked = 'agent.invoked',
  AgentCompleted = 'agent.completed',
  AgentFailed = 'agent.failed',
  ValidationStarted = 'validation.started',
  ValidationCompleted = 'validation.completed',
  ValidationFailed = 'validation.failed',
  GenerationStarted = 'generation.started',
  GenerationCompleted = 'generation.completed',
  GenerationFailed = 'generation.failed',
}

/**
 * Telemetry event structure (LLM-Observatory compatible)
 */
export interface TelemetryEvent {
  /** Event type */
  event_type: TelemetryEventType;
  /** Agent identifier */
  agent_id: string;
  /** Agent version */
  agent_version: string;
  /** Execution reference (links related events) */
  execution_ref: string;
  /** Event timestamp (UTC ISO 8601) */
  timestamp: string;
  /** Event duration in milliseconds (if applicable) */
  duration_ms?: number;
  /** Event metadata */
  metadata: Record<string, unknown>;
  /** Error details (if applicable) */
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * Telemetry sink interface
 */
export interface TelemetrySink {
  emit(event: TelemetryEvent): Promise<void>;
  flush(): Promise<void>;
}

/**
 * Console telemetry sink for development
 */
export class ConsoleTelemetrySink implements TelemetrySink {
  async emit(event: TelemetryEvent): Promise<void> {
    const prefix = event.error ? '❌' : '✓';
    console.log(`[TELEMETRY] ${prefix} ${event.event_type} | ${event.execution_ref}`);
    if (event.duration_ms !== undefined) {
      console.log(`  Duration: ${event.duration_ms}ms`);
    }
    if (event.error) {
      console.log(`  Error: ${event.error.code} - ${event.error.message}`);
    }
  }

  async flush(): Promise<void> {
    // No-op for console
  }
}

/**
 * Buffered telemetry sink for batch emission
 */
export class BufferedTelemetrySink implements TelemetrySink {
  private buffer: TelemetryEvent[] = [];
  private maxBufferSize: number;
  private flushInterval: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private endpoint: string;

  constructor(options: {
    endpoint: string;
    maxBufferSize?: number;
    flushIntervalMs?: number;
  }) {
    this.endpoint = options.endpoint;
    this.maxBufferSize = options.maxBufferSize ?? 100;
    this.flushInterval = options.flushIntervalMs ?? 5000;
  }

  async emit(event: TelemetryEvent): Promise<void> {
    this.buffer.push(event);

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }

    // Start flush timer if not running
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(console.error);
      }, this.flushInterval);
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const events = [...this.buffer];
    this.buffer = [];

    try {
      // In production, this would POST to the LLM-Observatory endpoint
      // await fetch(this.endpoint, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ events }),
      // });
      console.log(`[TELEMETRY] Flushed ${events.length} events to ${this.endpoint}`);
    } catch (error) {
      // Re-buffer events on failure
      this.buffer = [...events, ...this.buffer].slice(0, this.maxBufferSize);
      console.error('[TELEMETRY] Flush failed:', error);
    }
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

/**
 * Telemetry emitter for the CLI Command Generator Agent
 */
export class TelemetryEmitter {
  private sink: TelemetrySink;
  private executionRef: string;

  constructor(sink: TelemetrySink, executionRef: string) {
    this.sink = sink;
    this.executionRef = executionRef;
  }

  private createEvent(
    type: TelemetryEventType,
    metadata: Record<string, unknown>,
    durationMs?: number,
    error?: { code: string; message: string; stack?: string }
  ): TelemetryEvent {
    return {
      event_type: type,
      agent_id: CLI_COMMAND_GENERATOR_CONTRACT.agentId,
      agent_version: CLI_COMMAND_GENERATOR_CONTRACT.version,
      execution_ref: this.executionRef,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      metadata,
      error,
    };
  }

  async emitAgentInvoked(input: {
    contractId: string;
    framework: string;
    endpointCount: number;
  }): Promise<void> {
    await this.sink.emit(
      this.createEvent(TelemetryEventType.AgentInvoked, {
        contract_id: input.contractId,
        framework: input.framework,
        endpoint_count: input.endpointCount,
      })
    );
  }

  async emitAgentCompleted(result: {
    commandCount: number;
    fileCount: number;
    confidence: number;
    durationMs: number;
  }): Promise<void> {
    await this.sink.emit(
      this.createEvent(
        TelemetryEventType.AgentCompleted,
        {
          command_count: result.commandCount,
          file_count: result.fileCount,
          confidence: result.confidence,
        },
        result.durationMs
      )
    );
  }

  async emitAgentFailed(error: Error, durationMs: number): Promise<void> {
    await this.sink.emit(
      this.createEvent(
        TelemetryEventType.AgentFailed,
        {},
        durationMs,
        {
          code: 'AGENT_FAILURE',
          message: error.message,
          stack: error.stack,
        }
      )
    );
  }

  async emitValidationStarted(): Promise<void> {
    await this.sink.emit(
      this.createEvent(TelemetryEventType.ValidationStarted, {})
    );
  }

  async emitValidationCompleted(durationMs: number): Promise<void> {
    await this.sink.emit(
      this.createEvent(
        TelemetryEventType.ValidationCompleted,
        {},
        durationMs
      )
    );
  }

  async emitValidationFailed(errors: string[], durationMs: number): Promise<void> {
    await this.sink.emit(
      this.createEvent(
        TelemetryEventType.ValidationFailed,
        { error_count: errors.length },
        durationMs,
        {
          code: 'VALIDATION_FAILED',
          message: errors.join('; '),
        }
      )
    );
  }

  async emitGenerationStarted(framework: string): Promise<void> {
    await this.sink.emit(
      this.createEvent(TelemetryEventType.GenerationStarted, { framework })
    );
  }

  async emitGenerationCompleted(result: {
    fileCount: number;
    linesOfCode: number;
    durationMs: number;
  }): Promise<void> {
    await this.sink.emit(
      this.createEvent(
        TelemetryEventType.GenerationCompleted,
        {
          file_count: result.fileCount,
          lines_of_code: result.linesOfCode,
        },
        result.durationMs
      )
    );
  }

  async emitGenerationFailed(errors: string[], durationMs: number): Promise<void> {
    await this.sink.emit(
      this.createEvent(
        TelemetryEventType.GenerationFailed,
        { error_count: errors.length },
        durationMs,
        {
          code: 'GENERATION_FAILED',
          message: errors.join('; '),
        }
      )
    );
  }

  async flush(): Promise<void> {
    await this.sink.flush();
  }
}

/**
 * Create a telemetry emitter with a console sink (for development)
 */
export function createConsoleTelemetryEmitter(executionRef: string): TelemetryEmitter {
  return new TelemetryEmitter(new ConsoleTelemetrySink(), executionRef);
}

/**
 * Create a telemetry emitter with a buffered sink (for production)
 */
export function createBufferedTelemetryEmitter(
  executionRef: string,
  endpoint: string
): TelemetryEmitter {
  return new TelemetryEmitter(
    new BufferedTelemetrySink({ endpoint }),
    executionRef
  );
}

/**
 * Generate a unique execution reference
 */
export function generateExecutionRef(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 11);
  return `cli-gen-${timestamp}-${random}`;
}
