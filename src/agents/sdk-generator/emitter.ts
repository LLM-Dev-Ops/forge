/**
 * SDK Generator Agent - Decision Event Emitter
 *
 * Handles async, non-blocking emission of DecisionEvents to ruvector-service.
 * All event emissions are fire-and-forget to avoid blocking the main generation flow.
 *
 * @module agents/sdk-generator/emitter
 */

import {
  DecisionEventFactory,
  type SDKGenerationInitiatedEvent,
  type SDKGenerationCompletedEvent,
  type SDKGenerationFailedEvent,
  type TypeMappingDecisionEvent,
  type LanguageGenerationDecisionEvent,
  type TelemetryEvent,
  type SDKGeneratorEvent,
} from '../contracts/decision-events.js';

// =============================================================================
// RUVECTOR SERVICE CLIENT
// =============================================================================

/**
 * Minimal client for ruvector-service
 */
class RuVectorClient {
  private endpoint: string;
  private pendingEvents: SDKGeneratorEvent[] = [];
  private flushPromise: Promise<void> | null = null;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  /**
   * Queue an event for emission
   * Events are batched and sent asynchronously
   */
  queueEvent(event: SDKGeneratorEvent): void {
    this.pendingEvents.push(event);
    this.scheduleFlush();
  }

  /**
   * Schedule a flush of pending events
   */
  private scheduleFlush(): void {
    if (this.flushPromise) return;

    this.flushPromise = this.flush().finally(() => {
      this.flushPromise = null;
    });
  }

  /**
   * Flush pending events to ruvector-service
   */
  private async flush(): Promise<void> {
    // Use setImmediate to batch events in the same tick
    await new Promise((resolve) => setImmediate(resolve));

    const events = this.pendingEvents;
    this.pendingEvents = [];

    if (events.length === 0) return;

    try {
      // Fire-and-forget HTTP POST
      await this.sendEvents(events);
    } catch (error) {
      // Log error but don't propagate - event emission should not fail the main flow
      console.error('[RuVectorClient] Failed to emit events:', error);
    }
  }

  /**
   * Send events to ruvector-service
   */
  private async sendEvents(events: SDKGeneratorEvent[]): Promise<void> {
    if (!this.endpoint) {
      // No endpoint configured - log events locally
      for (const event of events) {
        console.log('[DecisionEvent]', JSON.stringify(event));
      }
      return;
    }

    const response = await fetch(`${this.endpoint}/api/v1/events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': 'sdk-generator-agent',
      },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      throw new Error(`RuVector service returned ${response.status}`);
    }
  }

  /**
   * Queue a telemetry event
   */
  queueTelemetry(event: TelemetryEvent): void {
    // Telemetry events use the same queue
    this.queueEvent(event as unknown as SDKGeneratorEvent);
  }
}

// =============================================================================
// DECISION EVENT EMITTER
// =============================================================================

/**
 * Decision Event Emitter for SDK Generator Agent
 *
 * Provides methods to emit various decision events asynchronously.
 * All methods are non-blocking and fire-and-forget.
 */
export class DecisionEventEmitter {
  private factory: DecisionEventFactory;
  private client: RuVectorClient;

  constructor(agentId: string, agentVersion: string, ruvectorEndpoint?: string) {
    this.factory = new DecisionEventFactory(agentId, agentVersion);
    this.client = new RuVectorClient(ruvectorEndpoint ?? '');
  }

  /**
   * Emit SDK generation initiated event
   */
  emitInitiatedEvent(
    requestId: string,
    inputHash: string,
    payload: SDKGenerationInitiatedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): void {
    const event = this.factory.createInitiatedEvent(
      requestId,
      inputHash,
      payload,
      tracingContext
    );
    this.client.queueEvent(event);
  }

  /**
   * Emit SDK generation completed event
   */
  emitCompletedEvent(
    requestId: string,
    inputHash: string,
    outputHash: string,
    payload: SDKGenerationCompletedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): void {
    const event = this.factory.createCompletedEvent(
      requestId,
      inputHash,
      outputHash,
      payload,
      tracingContext
    );
    this.client.queueEvent(event);
  }

  /**
   * Emit SDK generation failed event
   */
  emitFailedEvent(
    requestId: string,
    inputHash: string,
    payload: SDKGenerationFailedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): void {
    const event = this.factory.createFailedEvent(
      requestId,
      inputHash,
      payload,
      tracingContext
    );
    this.client.queueEvent(event);
  }

  /**
   * Emit type mapping decision event
   */
  emitTypeMappingEvent(
    requestId: string,
    inputHash: string,
    payload: TypeMappingDecisionEvent['payload'],
    confidenceScore: number,
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): void {
    const event = this.factory.createTypeMappingEvent(
      requestId,
      inputHash,
      payload,
      confidenceScore,
      tracingContext
    );
    this.client.queueEvent(event);
  }

  /**
   * Emit language generation decision event
   */
  emitLanguageGenerationEvent(
    requestId: string,
    inputHash: string,
    outputHash: string,
    payload: LanguageGenerationDecisionEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): void {
    const event = this.factory.createLanguageGenerationEvent(
      requestId,
      inputHash,
      outputHash,
      payload,
      tracingContext
    );
    this.client.queueEvent(event);
  }

  /**
   * Emit telemetry event
   */
  emitTelemetryEvent(
    requestId: string,
    metrics: TelemetryEvent['metrics'],
    resources?: TelemetryEvent['resources']
  ): void {
    const event = this.factory.createTelemetryEvent(requestId, metrics, resources);
    this.client.queueTelemetry(event);
  }
}

// =============================================================================
// MOCK EMITTER FOR TESTING
// =============================================================================

/**
 * Mock emitter that captures events for testing
 */
export class MockDecisionEventEmitter extends DecisionEventEmitter {
  public capturedEvents: SDKGeneratorEvent[] = [];
  public capturedTelemetry: TelemetryEvent[] = [];

  constructor() {
    super('sdk-generator-agent', '1.0.0-test', '');
  }

  override emitInitiatedEvent(
    requestId: string,
    inputHash: string,
    payload: SDKGenerationInitiatedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): void {
    const factory = new DecisionEventFactory('sdk-generator-agent', '1.0.0-test');
    this.capturedEvents.push(
      factory.createInitiatedEvent(requestId, inputHash, payload, tracingContext)
    );
  }

  override emitCompletedEvent(
    requestId: string,
    inputHash: string,
    outputHash: string,
    payload: SDKGenerationCompletedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): void {
    const factory = new DecisionEventFactory('sdk-generator-agent', '1.0.0-test');
    this.capturedEvents.push(
      factory.createCompletedEvent(requestId, inputHash, outputHash, payload, tracingContext)
    );
  }

  override emitFailedEvent(
    requestId: string,
    inputHash: string,
    payload: SDKGenerationFailedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): void {
    const factory = new DecisionEventFactory('sdk-generator-agent', '1.0.0-test');
    this.capturedEvents.push(
      factory.createFailedEvent(requestId, inputHash, payload, tracingContext)
    );
  }

  override emitTelemetryEvent(
    requestId: string,
    metrics: TelemetryEvent['metrics'],
    resources?: TelemetryEvent['resources']
  ): void {
    const factory = new DecisionEventFactory('sdk-generator-agent', '1.0.0-test');
    this.capturedTelemetry.push(factory.createTelemetryEvent(requestId, metrics, resources));
  }

  /**
   * Clear captured events
   */
  clear(): void {
    this.capturedEvents = [];
    this.capturedTelemetry = [];
  }
}
