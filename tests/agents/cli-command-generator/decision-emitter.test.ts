/**
 * CLI Command Generator - Decision Emitter Tests
 *
 * Tests for DecisionEvent emission to ruvector-service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DecisionEmitter,
  MockRuVectorClient,
  createDecisionEmitter,
  createMockDecisionEmitter,
  CLIFramework,
  CLI_COMMAND_GENERATOR_CONTRACT,
  type CLIGeneratorInput,
  type CLIGenerationResult,
} from '../../../src/agents/cli-command-generator/index.js';

describe('Decision Emitter', () => {
  let mockClient: MockRuVectorClient;
  let emitter: DecisionEmitter;

  const baseInput: CLIGeneratorInput = {
    contractId: 'test-contract',
    contractVersion: '1.0.0',
    endpoints: [
      {
        operationId: 'testOperation',
        path: '/test',
        method: 'GET',
        summary: 'Test operation',
      },
    ],
    types: [],
    framework: CLIFramework.Commander,
    packageName: 'test-cli',
    packageVersion: '1.0.0',
    providerId: 'test',
    providerName: 'Test Provider',
    options: {},
  };

  const successResult: CLIGenerationResult = {
    success: true,
    files: [
      { path: 'src/index.ts', content: '// test', type: 'index' },
      { path: 'src/commands/test.ts', content: '// test command', type: 'command' },
    ],
    program: {
      name: 'test-cli',
      version: '1.0.0',
      description: 'Test CLI',
      commands: [
        {
          name: 'test-operation',
          summary: 'Test operation',
          description: 'Test operation',
          arguments: [],
          options: [],
          handlerRef: 'handlers/test-operation.js',
        },
      ],
    },
    framework: CLIFramework.Commander,
    warnings: [],
    errors: [],
    duration: 100,
    confidence: 0.95,
  };

  beforeEach(() => {
    const result = createMockDecisionEmitter();
    mockClient = result.client;
    emitter = result.emitter;
  });

  describe('emitGenerationEvent', () => {
    it('should emit a valid decision event', async () => {
      const eventId = await emitter.emitGenerationEvent(baseInput, successResult);

      expect(eventId).toBeDefined();
      expect(eventId).toMatch(/^evt_/);

      const events = mockClient.getEvents();
      expect(events.length).toBe(1);
    });

    it('should include correct agent_id', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.agent_id).toBe('cli-command-generator');
    });

    it('should include correct agent_version', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.agent_version).toBe(CLI_COMMAND_GENERATOR_CONTRACT.version);
    });

    it('should include correct decision_type', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.decision_type).toBe('cli_generation');
    });

    it('should include inputs_hash', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.inputs_hash).toBeDefined();
      expect(events[0]!.inputs_hash.length).toBe(32);
    });

    it('should produce same hash for same input', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.inputs_hash).toBe(events[1]!.inputs_hash);
    });

    it('should produce different hash for different input', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const differentInput = { ...baseInput, contractId: 'different-contract' };
      await emitter.emitGenerationEvent(differentInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.inputs_hash).not.toBe(events[1]!.inputs_hash);
    });

    it('should include output metrics', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      const outputs = events[0]!.outputs;

      expect(outputs.commandCount).toBe(1);
      expect(outputs.fileCount).toBe(2);
      expect(outputs.linesOfCode).toBeGreaterThan(0);
      expect(outputs.commandNames).toEqual(['test-operation']);
      expect(outputs.framework).toBe(CLIFramework.Commander);
      expect(outputs.packageName).toBe('test-cli');
    });

    it('should include confidence score', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.confidence).toBe(0.95);
    });

    it('should include constraints_applied', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      const constraints = events[0]!.constraints_applied;

      expect(constraints.schema_constraints).toBeDefined();
      expect(constraints.language_constraints).toBeDefined();
      expect(constraints.version_constraints).toBeDefined();
      expect(constraints.framework_constraints).toBeDefined();
    });

    it('should include execution_ref', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.execution_ref).toBeDefined();
      expect(events[0]!.execution_ref).toMatch(/^cli-gen-/);
    });

    it('should include timestamp in ISO format', async () => {
      await emitter.emitGenerationEvent(baseInput, successResult);

      const events = mockClient.getEvents();
      expect(events[0]!.timestamp).toBeDefined();
      expect(new Date(events[0]!.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('emitFailureEvent', () => {
    it('should emit failure event with zero confidence', async () => {
      const eventId = await emitter.emitFailureEvent(baseInput, ['Error 1', 'Error 2']);

      expect(eventId).toBeDefined();

      const events = mockClient.getEvents();
      expect(events[0]!.confidence).toBe(0);
    });

    it('should emit failure event with zero outputs', async () => {
      await emitter.emitFailureEvent(baseInput, ['Error']);

      const events = mockClient.getEvents();
      expect(events[0]!.outputs.commandCount).toBe(0);
      expect(events[0]!.outputs.fileCount).toBe(0);
      expect(events[0]!.outputs.linesOfCode).toBe(0);
    });
  });

  describe('createDecisionEmitter', () => {
    it('should create emitter with provided client', () => {
      const client = new MockRuVectorClient();
      const emitter = createDecisionEmitter(client);

      expect(emitter).toBeInstanceOf(DecisionEmitter);
    });
  });

  describe('createMockDecisionEmitter', () => {
    it('should create emitter with mock client', () => {
      const { emitter, client } = createMockDecisionEmitter();

      expect(emitter).toBeInstanceOf(DecisionEmitter);
      expect(client).toBeInstanceOf(MockRuVectorClient);
    });
  });

  describe('MockRuVectorClient', () => {
    it('should store emitted events', async () => {
      const client = new MockRuVectorClient();
      const emitter = createDecisionEmitter(client);

      await emitter.emitGenerationEvent(baseInput, successResult);

      expect(client.getEvents().length).toBe(1);
    });

    it('should clear events', async () => {
      const client = new MockRuVectorClient();
      const emitter = createDecisionEmitter(client);

      await emitter.emitGenerationEvent(baseInput, successResult);
      client.clear();

      expect(client.getEvents().length).toBe(0);
    });

    it('should return event IDs', async () => {
      const client = new MockRuVectorClient();

      const result = await client.emitDecisionEvent({
        agent_id: 'cli-command-generator',
        agent_version: '1.0.0',
        decision_type: 'cli_generation',
        inputs_hash: 'test',
        outputs: {
          commandCount: 0,
          fileCount: 0,
          linesOfCode: 0,
          commandNames: [],
          framework: CLIFramework.Commander,
          packageName: 'test',
        },
        confidence: 1,
        constraints_applied: {
          schema_constraints: [],
          language_constraints: [],
          version_constraints: [],
          framework_constraints: [],
        },
        execution_ref: 'test',
        timestamp: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.eventId).toMatch(/^evt_/);
    });
  });
});
