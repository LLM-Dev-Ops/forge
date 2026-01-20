/**
 * Agentics Contracts Tests
 *
 * Tests for the agent contract definitions and schemas.
 *
 * @module tests/agents/contracts
 */

import { describe, it, expect } from 'vitest';
import {
  SDKGenerationRequestSchema,
  SDKGenerationResponseSchema,
  GeneratedFileArtifactSchema,
  SDKArtifactSchema,
  TargetLanguageSchema,
  AGENT_CLASSIFICATION,
  NON_RESPONSIBILITIES,
  VERSIONING_RULES,
  PERSISTED_DATA,
  NON_PERSISTED_DATA,
  DOWNSTREAM_CONSUMERS,
  FailureMode,
  FailureModeHandling,
  CLIContract,
} from '../../src/agents/contracts/sdk-generator.contract.js';
import {
  BaseDecisionEventSchema,
  SDKGenerationInitiatedEventSchema,
  SDKGenerationCompletedEventSchema,
  SDKGenerationFailedEventSchema,
  TypeMappingDecisionEventSchema,
  LanguageGenerationDecisionEventSchema,
  TelemetryEventSchema,
  DecisionEventFactory,
  hashObject,
} from '../../src/agents/contracts/decision-events.js';
import { randomUUID } from 'crypto';

// =============================================================================
// SCHEMA VALIDATION TESTS
// =============================================================================

describe('Agentics Contracts - Schema Validation', () => {
  describe('TargetLanguageSchema', () => {
    it('should accept valid languages', () => {
      const validLanguages = ['typescript', 'python', 'rust', 'go', 'java', 'csharp', 'javascript'];
      for (const lang of validLanguages) {
        expect(TargetLanguageSchema.safeParse(lang).success).toBe(true);
      }
    });

    it('should reject invalid languages', () => {
      expect(TargetLanguageSchema.safeParse('invalid').success).toBe(false);
      expect(TargetLanguageSchema.safeParse('ruby').success).toBe(false);
    });
  });

  describe('GeneratedFileArtifactSchema', () => {
    it('should accept valid file artifact', () => {
      const artifact = {
        path: 'src/client.ts',
        content: 'export class Client {}',
        contentHash: 'abc123'.repeat(10) + 'abcd',
        sizeBytes: 100,
        executable: false,
        generatedAt: new Date().toISOString(),
      };
      expect(GeneratedFileArtifactSchema.safeParse(artifact).success).toBe(true);
    });

    it('should reject artifact with negative size', () => {
      const artifact = {
        path: 'src/client.ts',
        content: 'export class Client {}',
        contentHash: 'abc123',
        sizeBytes: -1,
        executable: false,
        generatedAt: new Date().toISOString(),
      };
      expect(GeneratedFileArtifactSchema.safeParse(artifact).success).toBe(false);
    });
  });

  describe('SDKArtifactSchema', () => {
    it('should accept valid SDK artifact', () => {
      const artifact = {
        language: 'typescript',
        files: [],
        buildCommand: 'npm run build',
        testCommand: 'npm test',
        publishCommand: 'npm publish',
        registryUrl: 'https://registry.npmjs.org',
        metrics: {
          totalFiles: 10,
          totalSizeBytes: 50000,
          generationDurationMs: 1000,
          typeCount: 20,
          endpointCount: 15,
        },
      };
      expect(SDKArtifactSchema.safeParse(artifact).success).toBe(true);
    });
  });

  describe('SDKGenerationRequestSchema', () => {
    const validRequest = {
      requestId: randomUUID(),
      schema: {
        metadata: { version: '1.0.0', providerId: 'test', providerName: 'Test', apiVersion: '1.0', generatedAt: new Date().toISOString() },
        types: [],
        endpoints: [],
        authentication: [],
        errors: [],
      },
      targetLanguages: ['typescript'],
      packageConfig: {
        name: 'test-sdk',
        version: '1.0.0',
      },
    };

    it('should accept valid request', () => {
      expect(SDKGenerationRequestSchema.safeParse(validRequest).success).toBe(true);
    });

    it('should reject request without requestId', () => {
      const { requestId, ...rest } = validRequest;
      expect(SDKGenerationRequestSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject request with empty languages', () => {
      const request = { ...validRequest, targetLanguages: [] };
      expect(SDKGenerationRequestSchema.safeParse(request).success).toBe(false);
    });

    it('should accept semver with prerelease', () => {
      const request = {
        ...validRequest,
        packageConfig: { name: 'test', version: '1.0.0-alpha.1' },
      };
      expect(SDKGenerationRequestSchema.safeParse(request).success).toBe(true);
    });

    it('should accept tracing context', () => {
      const request = {
        ...validRequest,
        tracingContext: {
          traceId: 'trace-123',
          spanId: 'span-456',
        },
      };
      expect(SDKGenerationRequestSchema.safeParse(request).success).toBe(true);
    });
  });

  describe('SDKGenerationResponseSchema', () => {
    it('should accept valid response', () => {
      const response = {
        requestId: randomUUID(),
        success: true,
        artifacts: [],
        compatibility: {
          schemaVersion: '1.0.0',
          agentVersion: '1.0.0',
          generatedAt: new Date().toISOString(),
          determinismHash: 'a'.repeat(64),
        },
        warnings: [],
        errors: [],
      };
      expect(SDKGenerationResponseSchema.safeParse(response).success).toBe(true);
    });
  });
});

// =============================================================================
// DECISION EVENT SCHEMA TESTS
// =============================================================================

describe('Agentics Contracts - Decision Event Schemas', () => {
  const baseEvent = {
    eventId: randomUUID(),
    agentId: 'sdk-generator-agent',
    agentVersion: '1.0.0',
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
    confidenceScore: 1.0,
    confidenceSemantics: 'deterministic' as const,
    inputHash: 'input-hash',
    outputHash: 'output-hash',
    rationale: 'Test rationale',
  };

  describe('SDKGenerationInitiatedEventSchema', () => {
    it('should accept valid initiated event', () => {
      const event = {
        ...baseEvent,
        eventType: 'sdk_generation.initiated',
        payload: {
          targetLanguages: ['typescript'],
          schemaVersion: '1.0.0',
          packageName: 'test',
          packageVersion: '1.0.0',
          typeCount: 10,
          endpointCount: 5,
        },
      };
      expect(SDKGenerationInitiatedEventSchema.safeParse(event).success).toBe(true);
    });
  });

  describe('SDKGenerationCompletedEventSchema', () => {
    it('should accept valid completed event', () => {
      const event = {
        ...baseEvent,
        eventType: 'sdk_generation.completed',
        payload: {
          success: true,
          targetLanguages: ['typescript'],
          totalFiles: 20,
          totalSizeBytes: 100000,
          durationMs: 2000,
          warningCount: 0,
          errorCount: 0,
          determinismHash: 'hash',
        },
      };
      expect(SDKGenerationCompletedEventSchema.safeParse(event).success).toBe(true);
    });
  });

  describe('SDKGenerationFailedEventSchema', () => {
    it('should accept valid failed event', () => {
      const event = {
        ...baseEvent,
        eventType: 'sdk_generation.failed',
        payload: {
          failureMode: FailureMode.INVALID_SCHEMA,
          errorMessage: 'Validation failed',
          recoverable: false,
          partialResults: false,
        },
      };
      expect(SDKGenerationFailedEventSchema.safeParse(event).success).toBe(true);
    });
  });

  describe('TypeMappingDecisionEventSchema', () => {
    it('should accept valid type mapping event', () => {
      const event = {
        ...baseEvent,
        eventType: 'sdk_generation.type_mapping',
        payload: {
          sourceType: 'string',
          targetLanguage: 'typescript',
          targetType: 'string',
          mappingStrategy: 'exact' as const,
          imports: [],
        },
      };
      expect(TypeMappingDecisionEventSchema.safeParse(event).success).toBe(true);
    });
  });

  describe('TelemetryEventSchema', () => {
    it('should accept valid telemetry event', () => {
      const event = {
        eventId: randomUUID(),
        agentId: 'sdk-generator-agent',
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'telemetry',
        metrics: {
          totalDurationMs: 5000,
          validationDurationMs: 500,
          generationDurationMs: 4500,
        },
        resources: {
          templateRenderCount: 100,
          typeMappingCount: 50,
        },
      };
      expect(TelemetryEventSchema.safeParse(event).success).toBe(true);
    });
  });
});

// =============================================================================
// DECISION EVENT FACTORY TESTS
// =============================================================================

describe('Agentics Contracts - DecisionEventFactory', () => {
  const factory = new DecisionEventFactory('sdk-generator-agent', '1.0.0');

  it('should create initiated event with correct structure', () => {
    const event = factory.createInitiatedEvent(
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

    expect(event.eventType).toBe('sdk_generation.initiated');
    expect(event.agentId).toBe('sdk-generator-agent');
    expect(event.agentVersion).toBe('1.0.0');
    expect(event.inputHash).toBe('input-hash');
    expect(event.eventId).toBeDefined();
    expect(event.timestamp).toBeDefined();
  });

  it('should create completed event with deterministic confidence', () => {
    const event = factory.createCompletedEvent(
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

    expect(event.eventType).toBe('sdk_generation.completed');
    expect(event.confidenceScore).toBe(1.0);
    expect(event.confidenceSemantics).toBe('deterministic');
  });

  it('should create failed event with zero confidence', () => {
    const event = factory.createFailedEvent(
      randomUUID(),
      'input-hash',
      {
        failureMode: FailureMode.INVALID_SCHEMA,
        errorMessage: 'Test error',
        recoverable: false,
        partialResults: false,
      }
    );

    expect(event.eventType).toBe('sdk_generation.failed');
    expect(event.confidenceScore).toBe(0.0);
  });

  it('should include tracing context when provided', () => {
    const event = factory.createInitiatedEvent(
      randomUUID(),
      'input-hash',
      {
        targetLanguages: ['typescript'],
        schemaVersion: '1.0.0',
        packageName: 'test',
        packageVersion: '1.0.0',
        typeCount: 5,
        endpointCount: 3,
      },
      {
        traceId: 'trace-123',
        spanId: 'span-456',
      }
    );

    expect(event.tracing?.traceId).toBe('trace-123');
    expect(event.tracing?.spanId).toBe('span-456');
  });
});

// =============================================================================
// HASH FUNCTION TESTS
// =============================================================================

describe('Agentics Contracts - Hash Function', () => {
  it('should produce consistent hash for same object', () => {
    const obj = { a: 1, b: 'test' };
    const hash1 = hashObject(obj);
    const hash2 = hashObject(obj);
    expect(hash1).toBe(hash2);
  });

  it('should produce same hash regardless of key order', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { c: 3, a: 1, b: 2 };
    expect(hashObject(obj1)).toBe(hashObject(obj2));
  });

  it('should produce different hash for different values', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };
    expect(hashObject(obj1)).not.toBe(hashObject(obj2));
  });

  it('should produce 64-character hex string (SHA-256)', () => {
    const hash = hashObject({ test: true });
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// =============================================================================
// CONTRACT CONSTANTS TESTS
// =============================================================================

describe('Agentics Contracts - Constants', () => {
  describe('AGENT_CLASSIFICATION', () => {
    it('should have GENERATION type', () => {
      expect(AGENT_CLASSIFICATION.type).toBe('GENERATION');
    });

    it('should have all required properties', () => {
      expect(AGENT_CLASSIFICATION.deterministic).toBeDefined();
      expect(AGENT_CLASSIFICATION.stateless).toBeDefined();
      expect(AGENT_CLASSIFICATION.idempotent).toBeDefined();
      expect(AGENT_CLASSIFICATION.characteristics).toBeDefined();
    });
  });

  describe('NON_RESPONSIBILITIES', () => {
    it('should have multiple entries', () => {
      expect(NON_RESPONSIBILITIES.length).toBeGreaterThan(10);
    });

    it('should all start with MUST NEVER', () => {
      for (const resp of NON_RESPONSIBILITIES) {
        expect(resp.startsWith('MUST NEVER')).toBe(true);
      }
    });
  });

  describe('VERSIONING_RULES', () => {
    it('should specify semver format', () => {
      expect(VERSIONING_RULES.agentVersionFormat).toBe('semver');
    });

    it('should have breaking change policies', () => {
      expect(VERSIONING_RULES.breakingChangePolicies.length).toBeGreaterThan(0);
    });
  });

  describe('PERSISTED_DATA', () => {
    it('should include DecisionEvents', () => {
      expect(PERSISTED_DATA.some((d) => d.includes('DecisionEvent'))).toBe(true);
    });

    it('should include metrics', () => {
      expect(PERSISTED_DATA.some((d) => d.includes('metrics'))).toBe(true);
    });
  });

  describe('NON_PERSISTED_DATA', () => {
    it('should include generated code content', () => {
      expect(NON_PERSISTED_DATA.some((d) => d.includes('Generated code'))).toBe(true);
    });

    it('should include credentials', () => {
      expect(NON_PERSISTED_DATA.some((d) => d.includes('credentials'))).toBe(true);
    });
  });

  describe('DOWNSTREAM_CONSUMERS', () => {
    it('should include LLM-Observatory', () => {
      expect(DOWNSTREAM_CONSUMERS.some((c) => c.system === 'LLM-Observatory')).toBe(true);
    });

    it('should include Package Registry', () => {
      expect(DOWNSTREAM_CONSUMERS.some((c) => c.system === 'Package Registry')).toBe(true);
    });
  });

  describe('FailureModeHandling', () => {
    it('should have handling for all failure modes', () => {
      for (const mode of Object.values(FailureMode)) {
        expect(FailureModeHandling[mode]).toBeDefined();
        expect(FailureModeHandling[mode].recoverable).toBeDefined();
        expect(FailureModeHandling[mode].action).toBeDefined();
      }
    });
  });

  describe('CLIContract', () => {
    it('should have generate command', () => {
      expect(CLIContract.command).toBe('generate');
    });

    it('should have required arguments', () => {
      expect(CLIContract.arguments.length).toBeGreaterThan(0);
      expect(CLIContract.arguments[0].name).toBe('input');
    });

    it('should have options', () => {
      expect(CLIContract.options.length).toBeGreaterThan(0);
    });
  });
});
