/**
 * CLI Command Generator Agent - Decision Event Emitter
 *
 * Emits DecisionEvents to ruvector-service for persistence.
 * All persistence occurs via client calls only - no direct SQL access.
 *
 * @module agents/cli-command-generator/decision-emitter
 */

import { createHash } from 'crypto';
import {
  CLICommandGeneratorDecisionEvent,
  CLIGeneratorInput,
  CLIGenerationResult,
  CLI_COMMAND_GENERATOR_CONTRACT,
} from './types.js';

/**
 * RuVector service client interface
 * This would be implemented by the actual ruvector-service client
 */
export interface RuVectorClient {
  emitDecisionEvent(event: CLICommandGeneratorDecisionEvent): Promise<{ success: boolean; eventId: string }>;
}

/**
 * Mock ruvector client for development/testing
 * In production, this would be replaced with the actual client
 */
export class MockRuVectorClient implements RuVectorClient {
  private events: CLICommandGeneratorDecisionEvent[] = [];

  async emitDecisionEvent(
    event: CLICommandGeneratorDecisionEvent
  ): Promise<{ success: boolean; eventId: string }> {
    this.events.push(event);
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    return { success: true, eventId };
  }

  getEvents(): CLICommandGeneratorDecisionEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

/**
 * Decision Event Emitter
 *
 * Responsible for creating and emitting DecisionEvents to ruvector-service.
 * Each invocation of the CLI Command Generator Agent MUST emit exactly ONE
 * DecisionEvent as per the LLM-Forge constitution.
 */
export class DecisionEmitter {
  private client: RuVectorClient;

  constructor(client: RuVectorClient) {
    this.client = client;
  }

  /**
   * Create a hash of the input data for deduplication
   */
  private hashInputs(input: CLIGeneratorInput): string {
    const normalized = JSON.stringify({
      contractId: input.contractId,
      contractVersion: input.contractVersion,
      endpoints: input.endpoints.map((e) => e.operationId).sort(),
      framework: input.framework,
      packageName: input.packageName,
      providerId: input.providerId,
    });
    return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  }

  /**
   * Generate a unique execution reference
   */
  private generateExecutionRef(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 11);
    return `cli-gen-${timestamp}-${random}`;
  }

  /**
   * Calculate total lines of code in generated files
   */
  private countLinesOfCode(result: CLIGenerationResult): number {
    return result.files.reduce((total, file) => {
      return total + file.content.split('\n').length;
    }, 0);
  }

  /**
   * Extract constraint information from input
   */
  private extractConstraints(input: CLIGeneratorInput): CLICommandGeneratorDecisionEvent['constraints_applied'] {
    return {
      schema_constraints: [
        `contract:${input.contractId}@${input.contractVersion}`,
        `endpoints:${input.endpoints.length}`,
        `types:${input.types.length}`,
      ],
      language_constraints: [
        'target:typescript',
        'esm:true',
        'strict:true',
      ],
      version_constraints: [
        `package:${input.packageVersion}`,
        `agent:${CLI_COMMAND_GENERATOR_CONTRACT.version}`,
      ],
      framework_constraints: [
        `framework:${input.framework}`,
        `handlers:${input.options.generateHandlers ?? true}`,
        `types:${input.options.generateTypes ?? true}`,
      ],
    };
  }

  /**
   * Create and emit a DecisionEvent for a generation result
   *
   * @param input - The input that was processed
   * @param result - The generation result
   * @returns The emitted event ID
   */
  async emitGenerationEvent(
    input: CLIGeneratorInput,
    result: CLIGenerationResult
  ): Promise<string> {
    const event: CLICommandGeneratorDecisionEvent = {
      agent_id: 'cli-command-generator',
      agent_version: CLI_COMMAND_GENERATOR_CONTRACT.version,
      decision_type: 'cli_generation',
      inputs_hash: this.hashInputs(input),
      outputs: {
        commandCount: result.program.commands.length,
        fileCount: result.files.length,
        linesOfCode: this.countLinesOfCode(result),
        commandNames: result.program.commands.map((c) => c.name),
        framework: result.framework,
        packageName: result.program.name,
      },
      confidence: result.confidence,
      constraints_applied: this.extractConstraints(input),
      execution_ref: this.generateExecutionRef(),
      timestamp: new Date().toISOString(),
    };

    const response = await this.client.emitDecisionEvent(event);

    if (!response.success) {
      throw new Error('Failed to emit decision event to ruvector-service');
    }

    return response.eventId;
  }

  /**
   * Create and emit a DecisionEvent for a failed generation
   *
   * @param input - The input that was processed
   * @param errors - The errors that occurred
   * @returns The emitted event ID
   */
  async emitFailureEvent(
    input: CLIGeneratorInput,
    errors: string[]
  ): Promise<string> {
    const event: CLICommandGeneratorDecisionEvent = {
      agent_id: 'cli-command-generator',
      agent_version: CLI_COMMAND_GENERATOR_CONTRACT.version,
      decision_type: 'cli_generation',
      inputs_hash: this.hashInputs(input),
      outputs: {
        commandCount: 0,
        fileCount: 0,
        linesOfCode: 0,
        commandNames: [],
        framework: input.framework,
        packageName: input.packageName,
      },
      confidence: 0,
      constraints_applied: this.extractConstraints(input),
      execution_ref: this.generateExecutionRef(),
      timestamp: new Date().toISOString(),
    };

    const response = await this.client.emitDecisionEvent(event);

    if (!response.success) {
      throw new Error('Failed to emit decision event to ruvector-service');
    }

    return response.eventId;
  }
}

/**
 * Create a decision emitter with the provided client
 */
export function createDecisionEmitter(client: RuVectorClient): DecisionEmitter {
  return new DecisionEmitter(client);
}

/**
 * Create a decision emitter with a mock client (for testing)
 */
export function createMockDecisionEmitter(): {
  emitter: DecisionEmitter;
  client: MockRuVectorClient;
} {
  const client = new MockRuVectorClient();
  const emitter = new DecisionEmitter(client);
  return { emitter, client };
}
