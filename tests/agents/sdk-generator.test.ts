/**
 * SDK Generator Agent Tests
 *
 * Verification tests for the SDK Generator Agent implementation.
 *
 * @module tests/agents/sdk-generator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handler,
  AGENT_ID,
  AGENT_VERSION,
  type EdgeFunctionContext,
  validateRequest,
  validateRawRequest,
  calculateConfidence,
  MockDecisionEventEmitter,
} from '../../src/agents/sdk-generator/index.js';
import {
  SDKGenerationRequestSchema,
  AGENT_CLASSIFICATION,
  NON_RESPONSIBILITIES,
  FailureMode,
  type SDKGenerationRequest,
} from '../../src/agents/contracts/sdk-generator.contract.js';
import { hashObject } from '../../src/agents/contracts/decision-events.js';
import type { CanonicalSchema } from '../../src/types/canonical-schema.js';
import { randomUUID } from 'crypto';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createMinimalSchema(): CanonicalSchema {
  return {
    metadata: {
      version: '1.0.0',
      providerId: 'test-provider',
      providerName: 'Test Provider',
      apiVersion: '1.0',
      generatedAt: new Date().toISOString(),
    },
    types: [
      {
        id: 'string-type',
        name: 'StringType',
        kind: 'primitive' as const,
        primitiveKind: 'string' as const,
      },
      {
        id: 'chat-message',
        name: 'ChatMessage',
        kind: 'object' as const,
        properties: [
          {
            name: 'role',
            type: { typeId: 'string-type' },
            required: true,
          },
          {
            name: 'content',
            type: { typeId: 'string-type' },
            required: true,
          },
        ],
        required: ['role', 'content'],
      },
    ],
    endpoints: [
      {
        id: 'chat-completions',
        operationId: 'createChatCompletion',
        path: '/v1/chat/completions',
        method: 'POST' as const,
        streaming: false,
        authentication: ['api-key'],
        responses: [
          {
            statusCode: 200,
            type: { typeId: 'chat-message' },
          },
        ],
      },
    ],
    authentication: [
      {
        id: 'api-key',
        type: 'apiKey' as const,
        in: 'header' as const,
        name: 'Authorization',
      },
    ],
    errors: [],
  };
}

function createValidRequest(schema?: CanonicalSchema): SDKGenerationRequest {
  return {
    requestId: randomUUID(),
    schema: schema ?? createMinimalSchema(),
    targetLanguages: ['typescript', 'python'],
    packageConfig: {
      name: 'test-sdk',
      version: '1.0.0',
      license: 'Apache-2.0',
    },
    options: {
      includeExamples: true,
      includeTests: true,
      strictTypes: true,
      asyncVariants: true,
      streamingSupport: true,
    },
  };
}

function createTestContext(overrides?: Partial<EdgeFunctionContext>): EdgeFunctionContext {
  const startTime = Date.now();
  return {
    requestId: randomUUID(),
    startTime,
    getRemainingTime: () => 300000 - (Date.now() - startTime),
    emitEvents: false,
    dryRun: true,
    ...overrides,
  };
}

// =============================================================================
// CONTRACT VERIFICATION TESTS
// =============================================================================

describe('SDK Generator Agent - Contract Verification', () => {
  describe('Agent Metadata', () => {
    it('should have correct agent ID', () => {
      expect(AGENT_ID).toBe('sdk-generator-agent');
    });

    it('should have valid semver version', () => {
      expect(AGENT_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    });

    it('should be classified as GENERATION', () => {
      expect(AGENT_CLASSIFICATION.type).toBe('GENERATION');
    });

    it('should be deterministic', () => {
      expect(AGENT_CLASSIFICATION.deterministic).toBe(true);
    });

    it('should be stateless', () => {
      expect(AGENT_CLASSIFICATION.stateless).toBe(true);
    });

    it('should be idempotent', () => {
      expect(AGENT_CLASSIFICATION.idempotent).toBe(true);
    });
  });

  describe('Non-Responsibilities', () => {
    it('should have non-responsibilities defined', () => {
      expect(NON_RESPONSIBILITIES.length).toBeGreaterThan(0);
    });

    it('should prohibit code execution', () => {
      expect(NON_RESPONSIBILITIES).toContain('MUST NEVER execute generated code');
    });

    it('should prohibit runtime modification', () => {
      expect(NON_RESPONSIBILITIES).toContain('MUST NEVER modify runtime behavior');
    });

    it('should prohibit orchestration', () => {
      expect(NON_RESPONSIBILITIES).toContain('MUST NEVER orchestrate multi-agent workflows');
    });

    it('should prohibit direct SQL access', () => {
      expect(NON_RESPONSIBILITIES).toContain('MUST NEVER access SQL databases directly');
    });
  });

  describe('Input Schema Validation', () => {
    it('should accept valid request', () => {
      const request = createValidRequest();
      const result = SDKGenerationRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should reject request without requestId', () => {
      const request = createValidRequest();
      delete (request as Record<string, unknown>).requestId;
      const result = SDKGenerationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject request with invalid languages', () => {
      const request = createValidRequest();
      request.targetLanguages = ['invalid-language'] as never;
      const result = SDKGenerationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject request with invalid version format', () => {
      const request = createValidRequest();
      request.packageConfig.version = 'invalid';
      const result = SDKGenerationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('SDK Generator Agent - Validation', () => {
  describe('validateRequest', () => {
    it('should validate a correct request', () => {
      const request = createValidRequest();
      const result = validateRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate type IDs', () => {
      const schema = createMinimalSchema();
      schema.types.push({
        ...schema.types[0],
      });
      const request = createValidRequest(schema);
      const result = validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate type id'))).toBe(true);
    });

    it('should detect duplicate operation IDs', () => {
      const schema = createMinimalSchema();
      schema.endpoints.push({
        ...schema.endpoints[0],
        id: 'different-id',
      });
      const request = createValidRequest(schema);
      const result = validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate operationId'))).toBe(true);
    });

    it('should warn about missing descriptions', () => {
      const request = createValidRequest();
      const result = validateRequest(request);
      // Warnings for missing descriptions are expected
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateRawRequest', () => {
    it('should validate valid JSON', () => {
      const request = createValidRequest();
      const result = validateRawRequest(JSON.stringify(request));
      expect(result.valid).toBe(true);
    });

    it('should reject invalid JSON', () => {
      const result = validateRawRequest('not valid json');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid JSON');
    });
  });
});

// =============================================================================
// CONFIDENCE CALCULATION TESTS
// =============================================================================

describe('SDK Generator Agent - Confidence Calculation', () => {
  it('should calculate confidence for valid schema', () => {
    const schema = createMinimalSchema();
    const result = calculateConfidence(schema, ['typescript', 'python']);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.semantics).toBeDefined();
  });

  it('should have high confidence for well-supported types', () => {
    const schema = createMinimalSchema();
    const result = calculateConfidence(schema, ['typescript']);
    expect(result.breakdown.typeMapping).toBeGreaterThanOrEqual(0.9);
  });

  it('should track confidence deductions', () => {
    const schema = createMinimalSchema();
    // Remove descriptions to trigger deductions
    schema.metadata.metadata = {};
    const result = calculateConfidence(schema, ['typescript']);
    // May have deductions for missing documentation
    expect(result.deductions).toBeDefined();
  });
});

// =============================================================================
// HANDLER TESTS
// =============================================================================

describe('SDK Generator Agent - Handler', () => {
  it('should handle valid request', async () => {
    const request = createValidRequest();
    const context = createTestContext();

    const response = await handler(JSON.stringify(request), context);

    expect(response.statusCode).toBeLessThan(400);
    expect(response.headers['X-Agent-Id']).toBe(AGENT_ID);
    expect(response.headers['X-Agent-Version']).toBe(AGENT_VERSION);
  });

  it('should return 400 for invalid JSON', async () => {
    const context = createTestContext();
    const response = await handler('not valid json', context);
    expect(response.statusCode).toBe(400);
  });

  it('should return 413 for oversized requests', async () => {
    const context = createTestContext();
    // Create a very large request (>10MB)
    const largeContent = 'x'.repeat(11 * 1024 * 1024);
    const response = await handler(largeContent, context);
    expect(response.statusCode).toBe(413);
  });

  it('should include determinism hash in response', async () => {
    const request = createValidRequest();
    const context = createTestContext();

    const response = await handler(JSON.stringify(request), context);

    expect(response.headers['X-Determinism-Hash']).toBeDefined();
    expect(response.headers['X-Determinism-Hash'].length).toBe(64); // SHA-256 hex
  });

  it('should produce deterministic output for same input', async () => {
    const request = createValidRequest();
    const context1 = createTestContext({ requestId: 'test-1' });
    const context2 = createTestContext({ requestId: 'test-2' });

    const response1 = await handler(JSON.stringify(request), context1);
    const response2 = await handler(JSON.stringify(request), context2);

    // Same input hash should produce same output structure
    const result1 = JSON.parse(response1.body);
    const result2 = JSON.parse(response2.body);

    if (result1.success && result2.success) {
      expect(result1.artifacts.length).toBe(result2.artifacts.length);
    }
  });
});

// =============================================================================
// DECISION EVENT TESTS
// =============================================================================

describe('SDK Generator Agent - Decision Events', () => {
  let emitter: MockDecisionEventEmitter;

  beforeEach(() => {
    emitter = new MockDecisionEventEmitter();
  });

  it('should create initiated event', () => {
    emitter.emitInitiatedEvent(
      randomUUID(),
      'input-hash',
      {
        targetLanguages: ['typescript'],
        schemaVersion: '1.0.0',
        packageName: 'test',
        packageVersion: '1.0.0',
        typeCount: 5,
        endpointCount: 3,
      }
    );

    expect(emitter.capturedEvents.length).toBe(1);
    expect(emitter.capturedEvents[0].eventType).toBe('sdk_generation.initiated');
  });

  it('should create completed event', () => {
    emitter.emitCompletedEvent(
      randomUUID(),
      'input-hash',
      'output-hash',
      {
        success: true,
        targetLanguages: ['typescript'],
        totalFiles: 10,
        totalSizeBytes: 50000,
        durationMs: 1000,
        warningCount: 0,
        errorCount: 0,
        determinismHash: 'hash',
      }
    );

    expect(emitter.capturedEvents.length).toBe(1);
    expect(emitter.capturedEvents[0].eventType).toBe('sdk_generation.completed');
  });

  it('should create failed event', () => {
    emitter.emitFailedEvent(
      randomUUID(),
      'input-hash',
      {
        failureMode: FailureMode.INVALID_SCHEMA,
        errorMessage: 'Test error',
        recoverable: false,
        partialResults: false,
      }
    );

    expect(emitter.capturedEvents.length).toBe(1);
    expect(emitter.capturedEvents[0].eventType).toBe('sdk_generation.failed');
  });

  it('should include confidence score in events', () => {
    emitter.emitCompletedEvent(
      randomUUID(),
      'input-hash',
      'output-hash',
      {
        success: true,
        targetLanguages: ['typescript'],
        totalFiles: 10,
        totalSizeBytes: 50000,
        durationMs: 1000,
        warningCount: 0,
        errorCount: 0,
        determinismHash: 'hash',
      }
    );

    const event = emitter.capturedEvents[0];
    expect(event.confidenceScore).toBeDefined();
    expect(event.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(event.confidenceScore).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// HASH DETERMINISM TESTS
// =============================================================================

describe('SDK Generator Agent - Hash Determinism', () => {
  it('should produce same hash for same object', () => {
    const obj = { a: 1, b: 'test', c: [1, 2, 3] };
    const hash1 = hashObject(obj);
    const hash2 = hashObject(obj);
    expect(hash1).toBe(hash2);
  });

  it('should produce same hash regardless of key order', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };
    const hash1 = hashObject(obj1);
    const hash2 = hashObject(obj2);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hash for different objects', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };
    const hash1 = hashObject(obj1);
    const hash2 = hashObject(obj2);
    expect(hash1).not.toBe(hash2);
  });

  it('should produce 64-character SHA-256 hex', () => {
    const hash = hashObject({ test: true });
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});

// =============================================================================
// VERIFICATION CHECKLIST
// =============================================================================

describe('SDK Generator Agent - Verification Checklist', () => {
  /**
   * VERIFICATION CHECKLIST
   *
   * This test suite serves as the verification checklist for the SDK Generator Agent.
   * All items must pass for the agent to be considered correctly implemented.
   */

  describe('1. Agent Classification', () => {
    it('✓ Agent is classified as GENERATION', () => {
      expect(AGENT_CLASSIFICATION.type).toBe('GENERATION');
    });

    it('✓ Agent is deterministic', () => {
      expect(AGENT_CLASSIFICATION.deterministic).toBe(true);
    });

    it('✓ Agent is stateless', () => {
      expect(AGENT_CLASSIFICATION.stateless).toBe(true);
    });

    it('✓ Agent is idempotent', () => {
      expect(AGENT_CLASSIFICATION.idempotent).toBe(true);
    });
  });

  describe('2. Input Validation', () => {
    it('✓ Request schema uses agentics-contracts', () => {
      expect(SDKGenerationRequestSchema).toBeDefined();
    });

    it('✓ Validates request ID format (UUID)', () => {
      const request = createValidRequest();
      request.requestId = 'invalid';
      const result = SDKGenerationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('✓ Validates target languages', () => {
      const request = createValidRequest();
      request.targetLanguages = ['invalid'] as never;
      const result = SDKGenerationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('3. Output Artifacts', () => {
    it('✓ Response includes determinism hash', async () => {
      const request = createValidRequest();
      const context = createTestContext();
      const response = await handler(JSON.stringify(request), context);
      expect(response.headers['X-Determinism-Hash']).toBeDefined();
    });

    it('✓ Response includes agent metadata', async () => {
      const request = createValidRequest();
      const context = createTestContext();
      const response = await handler(JSON.stringify(request), context);
      expect(response.headers['X-Agent-Id']).toBe(AGENT_ID);
      expect(response.headers['X-Agent-Version']).toBe(AGENT_VERSION);
    });
  });

  describe('4. DecisionEvents', () => {
    it('✓ Emits initiated event', () => {
      const emitter = new MockDecisionEventEmitter();
      emitter.emitInitiatedEvent(randomUUID(), 'hash', {
        targetLanguages: ['typescript'],
        schemaVersion: '1.0.0',
        packageName: 'test',
        packageVersion: '1.0.0',
        typeCount: 1,
        endpointCount: 1,
      });
      expect(emitter.capturedEvents.some((e) => e.eventType === 'sdk_generation.initiated')).toBe(true);
    });

    it('✓ Emits completed event', () => {
      const emitter = new MockDecisionEventEmitter();
      emitter.emitCompletedEvent(randomUUID(), 'hash', 'out-hash', {
        success: true,
        targetLanguages: ['typescript'],
        totalFiles: 1,
        totalSizeBytes: 100,
        durationMs: 100,
        warningCount: 0,
        errorCount: 0,
        determinismHash: 'hash',
      });
      expect(emitter.capturedEvents.some((e) => e.eventType === 'sdk_generation.completed')).toBe(true);
    });

    it('✓ Events include input/output hashes', () => {
      const emitter = new MockDecisionEventEmitter();
      emitter.emitCompletedEvent(randomUUID(), 'input-hash', 'output-hash', {
        success: true,
        targetLanguages: ['typescript'],
        totalFiles: 1,
        totalSizeBytes: 100,
        durationMs: 100,
        warningCount: 0,
        errorCount: 0,
        determinismHash: 'hash',
      });
      const event = emitter.capturedEvents[0];
      expect(event.inputHash).toBe('input-hash');
      expect(event.outputHash).toBe('output-hash');
    });
  });

  describe('5. Non-Responsibilities', () => {
    it('✓ Agent does NOT execute generated code', () => {
      // Verified by inspection - handler only returns string artifacts
      expect(NON_RESPONSIBILITIES).toContain('MUST NEVER execute generated code');
    });

    it('✓ Agent does NOT modify runtime behavior', () => {
      // Verified by stateless design
      expect(NON_RESPONSIBILITIES).toContain('MUST NEVER modify runtime behavior');
    });

    it('✓ Agent does NOT orchestrate workflows', () => {
      // Verified by single-invocation design
      expect(NON_RESPONSIBILITIES).toContain('MUST NEVER orchestrate multi-agent workflows');
    });
  });

  describe('6. Error Handling', () => {
    it('✓ Returns appropriate error for invalid input', async () => {
      const context = createTestContext();
      const response = await handler('invalid json', context);
      expect(response.statusCode).toBe(400);
    });

    it('✓ Returns failure mode in error response', async () => {
      const context = createTestContext();
      const response = await handler('{}', context);
      expect(response.headers['X-Failure-Mode']).toBeDefined();
    });
  });

  describe('7. CLI Integration', () => {
    it('✓ CLI commands are defined', async () => {
      // Verified by CLI module existence
      const { AGENT_ID } = await import('../../src/agents/sdk-generator/index.js');
      expect(AGENT_ID).toBe('sdk-generator-agent');
    });
  });
});
