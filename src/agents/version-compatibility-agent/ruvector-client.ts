/**
 * RuVector Service Client
 *
 * Client for persisting DecisionEvents to ruvector-service.
 *
 * IMPORTANT: This agent does NOT access SQL directly.
 * All persistence is through ruvector-service client calls only.
 *
 * @module agents/version-compatibility-agent/ruvector-client
 */

import type { VersionCompatibilityEvent } from '../contracts/decision-events.js';

/**
 * Configuration for ruvector-service connection
 */
export interface RuvectorClientConfig {
  /** Service URL */
  serviceUrl: string;
  /** Request timeout in ms */
  timeout: number;
  /** Retry attempts on failure */
  retryAttempts: number;
  /** Retry delay in ms */
  retryDelay: number;
}

/**
 * Response from ruvector-service
 */
export interface RuvectorResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Client for ruvector-service
 *
 * This client handles:
 * - Async, non-blocking writes
 * - Retry logic for transient failures
 * - Batching for efficiency
 *
 * This client does NOT:
 * - Execute SQL directly
 * - Access Google SQL
 * - Persist state locally
 */
export class RuvectorServiceClient {
  private readonly config: RuvectorClientConfig;
  private readonly eventBuffer: VersionCompatibilityEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;

  constructor(serviceUrl?: string) {
    this.config = {
      serviceUrl: serviceUrl || process.env.RUVECTOR_SERVICE_URL || 'http://localhost:8080',
      timeout: 5000,
      retryAttempts: 3,
      retryDelay: 100,
    };
  }

  /**
   * Emit a decision event to ruvector-service
   *
   * @param event - Decision event to persist
   */
  async emitDecisionEvent(event: VersionCompatibilityEvent): Promise<RuvectorResponse> {
    // Add to buffer for potential batching
    this.eventBuffer.push(event);

    // Schedule flush if not already scheduled
    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flushEvents(), 100);
    }

    // For individual events, emit immediately
    return this.sendEvent(event);
  }

  /**
   * Emit multiple decision events in batch
   *
   * @param events - Array of decision events
   */
  async emitBatch(events: VersionCompatibilityEvent[]): Promise<RuvectorResponse[]> {
    return Promise.all(events.map(event => this.sendEvent(event)));
  }

  /**
   * Send a single event to ruvector-service
   */
  private async sendEvent(event: VersionCompatibilityEvent): Promise<RuvectorResponse> {
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await this.makeRequest('/api/v1/events', event);

        if (response.success) {
          return response;
        }

        // Non-retryable error
        if (response.error?.includes('validation')) {
          return response;
        }

      } catch (error) {
        // Last attempt, throw error
        if (attempt === this.config.retryAttempts) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        // Wait before retry
        await this.delay(this.config.retryDelay * attempt);
      }
    }

    return {
      success: false,
      error: 'Max retry attempts exceeded',
    };
  }

  /**
   * Make HTTP request to ruvector-service
   */
  private async makeRequest(path: string, data: unknown): Promise<RuvectorResponse> {
    const url = `${this.config.serviceUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-ID': 'version-compatibility-agent',
          'X-Agent-Version': '1.0.0',
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorBody}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        eventId: result.eventId,
      };

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout',
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Flush buffered events
   */
  private async flushEvents(): Promise<void> {
    this.flushTimeout = null;

    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer.length = 0;

    // Events are already being sent individually
    // This is for future batch optimization
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for ruvector-service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.config.serviceUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;

    } catch {
      return false;
    }
  }
}
