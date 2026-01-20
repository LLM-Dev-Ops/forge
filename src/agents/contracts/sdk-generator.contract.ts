/**
 * SDK Generator Agent Contract
 *
 * PROMPT 1 DELIVERABLE: Full Agent Contract & Boundary Definition
 *
 * Agent Name: SDK Generator Agent
 * Classification: GENERATION
 * decision_type: "sdk_generation"
 *
 * @module agents/contracts/sdk-generator.contract
 */

import { z } from 'zod';
import type { CanonicalSchema } from '../../types/canonical-schema.js';
import type { TargetLanguage } from '../../core/type-mapper.js';

// =============================================================================
// 1. AGENT PURPOSE STATEMENT (Precise, Non-Marketing)
// =============================================================================
/**
 * The SDK Generator Agent is a GENERATION-class agent responsible for
 * transforming canonical API contracts into language-specific SDK artifacts.
 *
 * It consumes agentics-contracts API schemas (CanonicalSchema) and produces
 * deterministic, type-safe SDK code for multiple target languages.
 *
 * The agent does NOT:
 * - Execute generated code
 * - Modify runtime behavior
 * - Orchestrate workflows
 * - Enforce policies
 * - Access SQL databases directly
 */
export const AGENT_PURPOSE = `
SDK Generator Agent: GENERATION-class agent for transforming canonical API
contracts into language-specific SDK artifacts with deterministic output.
` as const;

// =============================================================================
// 2. INPUT SCHEMA REFERENCES (agentics-contracts)
// =============================================================================

/**
 * Supported target languages for SDK generation
 */
export const TargetLanguageSchema = z.enum([
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'csharp',
  'javascript',
]);

export type SupportedLanguage = z.infer<typeof TargetLanguageSchema>;

/**
 * SDK generation request input schema
 */
export const SDKGenerationRequestSchema = z.object({
  /** Unique request identifier for tracing */
  requestId: z.string().uuid(),

  /** Canonical schema to generate SDK from */
  schema: z.custom<CanonicalSchema>((val) => {
    return (
      typeof val === 'object' &&
      val !== null &&
      'metadata' in val &&
      'types' in val &&
      'endpoints' in val
    );
  }, 'Invalid CanonicalSchema'),

  /** Target language(s) for generation */
  targetLanguages: z.array(TargetLanguageSchema).min(1).max(7),

  /** Package configuration */
  packageConfig: z.object({
    name: z.string().min(1).max(128),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/),
    description: z.string().optional(),
    author: z.string().optional(),
    license: z.string().default('Apache-2.0'),
  }),

  /** Generation options */
  options: z
    .object({
      /** Include usage examples */
      includeExamples: z.boolean().default(true),
      /** Include test scaffolding */
      includeTests: z.boolean().default(true),
      /** Custom template directory (optional) */
      templateDir: z.string().optional(),
      /** Enable strict type checking */
      strictTypes: z.boolean().default(true),
      /** Generate async/await variants */
      asyncVariants: z.boolean().default(true),
      /** Include streaming support */
      streamingSupport: z.boolean().default(true),
    })
    .default({}),

  /** Tracing context for observability */
  tracingContext: z
    .object({
      traceId: z.string().optional(),
      spanId: z.string().optional(),
      parentSpanId: z.string().optional(),
    })
    .optional(),
});

export type SDKGenerationRequest = z.infer<typeof SDKGenerationRequestSchema>;

// =============================================================================
// 3. OUTPUT SCHEMA / ARTIFACT REFERENCES
// =============================================================================

/**
 * Generated file artifact
 */
export const GeneratedFileArtifactSchema = z.object({
  /** Relative file path from SDK root */
  path: z.string(),
  /** File content (UTF-8) */
  content: z.string(),
  /** Content hash for verification (SHA-256) */
  contentHash: z.string(),
  /** File size in bytes */
  sizeBytes: z.number().int().positive(),
  /** Whether file is executable */
  executable: z.boolean().default(false),
  /** File generation timestamp */
  generatedAt: z.string().datetime(),
});

export type GeneratedFileArtifact = z.infer<typeof GeneratedFileArtifactSchema>;

/**
 * SDK artifact per language
 */
export const SDKArtifactSchema = z.object({
  /** Target language */
  language: TargetLanguageSchema,
  /** Generated files */
  files: z.array(GeneratedFileArtifactSchema),
  /** Build command for this language */
  buildCommand: z.string().optional(),
  /** Test command for this language */
  testCommand: z.string().optional(),
  /** Publish command for this language */
  publishCommand: z.string().optional(),
  /** Package registry URL */
  registryUrl: z.string().url().optional(),
  /** Generation metrics */
  metrics: z.object({
    totalFiles: z.number().int().nonnegative(),
    totalSizeBytes: z.number().int().nonnegative(),
    generationDurationMs: z.number().nonnegative(),
    typeCount: z.number().int().nonnegative(),
    endpointCount: z.number().int().nonnegative(),
  }),
});

export type SDKArtifact = z.infer<typeof SDKArtifactSchema>;

/**
 * Complete SDK generation response
 */
export const SDKGenerationResponseSchema = z.object({
  /** Original request ID */
  requestId: z.string().uuid(),
  /** Generation success status */
  success: z.boolean(),
  /** Generated SDK artifacts per language */
  artifacts: z.array(SDKArtifactSchema),
  /** Compatibility metadata */
  compatibility: z.object({
    /** Schema version used */
    schemaVersion: z.string(),
    /** Agent version */
    agentVersion: z.string(),
    /** Generation timestamp */
    generatedAt: z.string().datetime(),
    /** Determinism hash (same input = same hash) */
    determinismHash: z.string(),
  }),
  /** Warnings (non-fatal issues) */
  warnings: z.array(z.string()),
  /** Errors (if success=false) */
  errors: z.array(z.string()),
});

export type SDKGenerationResponse = z.infer<typeof SDKGenerationResponseSchema>;

// =============================================================================
// 4. DECISION EVENT MAPPING
// =============================================================================

/**
 * Decision types for SDK Generator Agent
 */
export enum SDKGeneratorDecisionType {
  /** Primary decision: SDK generation from schema */
  SDK_GENERATION = 'sdk_generation',
  /** Language selection decision */
  LANGUAGE_SELECTION = 'language_selection',
  /** Type mapping decision */
  TYPE_MAPPING = 'type_mapping',
  /** Template selection decision */
  TEMPLATE_SELECTION = 'template_selection',
}

/**
 * Confidence semantics for SDK generation
 * - DETERMINISTIC: Same input always produces same output (hash-verifiable)
 * - HEURISTIC: Best-effort mapping with confidence score
 * - CONSTRAINT_BASED: Output satisfies defined constraints
 */
export enum ConfidenceSemantics {
  /** Output is deterministic and reproducible */
  DETERMINISTIC = 'deterministic',
  /** Output uses heuristic mapping */
  HEURISTIC = 'heuristic',
  /** Output satisfies defined constraints */
  CONSTRAINT_BASED = 'constraint_based',
}

/**
 * Decision event for SDK generation
 */
export const SDKGeneratorDecisionEventSchema = z.object({
  /** Event unique identifier */
  eventId: z.string().uuid(),
  /** Decision type */
  decisionType: z.nativeEnum(SDKGeneratorDecisionType),
  /** Agent identifier */
  agentId: z.literal('sdk-generator-agent'),
  /** Agent version */
  agentVersion: z.string(),
  /** Request ID this decision relates to */
  requestId: z.string().uuid(),
  /** Timestamp of decision */
  timestamp: z.string().datetime(),
  /** Confidence semantics */
  confidenceSemantics: z.nativeEnum(ConfidenceSemantics),
  /** Confidence score (0.0-1.0) */
  confidenceScore: z.number().min(0).max(1),
  /** Input hash for reproducibility */
  inputHash: z.string(),
  /** Output hash for verification */
  outputHash: z.string(),
  /** Decision rationale */
  rationale: z.string(),
  /** Decision metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type SDKGeneratorDecisionEvent = z.infer<typeof SDKGeneratorDecisionEventSchema>;

// =============================================================================
// 5. CLI CONTRACT
// =============================================================================

/**
 * CLI invocation shape for SDK Generator Agent
 *
 * Primary command: generate
 *
 * Usage:
 *   llm-forge generate <input> [options]
 *
 * Arguments:
 *   input                    Canonical schema (JSON) or OpenAPI spec
 *
 * Options:
 *   -l, --lang <languages...>  Target languages (typescript, python, rust, go, java, csharp)
 *   -o, --output <dir>         Output directory (default: ./generated)
 *   -n, --name <name>          Package name
 *   --pkg-version <version>    Package version (default: 0.1.0)
 *   --no-examples              Disable example generation
 *   --no-tests                 Disable test generation
 *   --emit-events              Emit DecisionEvents to ruvector-service
 *   --dry-run                  Validate without generating files
 *   -v, --verbose              Verbose output
 */
export const CLIContract = {
  command: 'generate',
  arguments: [
    {
      name: 'input',
      description: 'Canonical schema (JSON) or OpenAPI spec',
      required: true,
    },
  ],
  options: [
    {
      flag: '-l, --lang <languages...>',
      description: 'Target languages',
      default: ['typescript', 'python'],
    },
    {
      flag: '-o, --output <dir>',
      description: 'Output directory',
      default: './generated',
    },
    {
      flag: '-n, --name <name>',
      description: 'Package name',
      default: 'my-llm-sdk',
    },
    {
      flag: '--pkg-version <version>',
      description: 'Package version',
      default: '0.1.0',
    },
    {
      flag: '--no-examples',
      description: 'Disable example generation',
    },
    {
      flag: '--no-tests',
      description: 'Disable test generation',
    },
    {
      flag: '--emit-events',
      description: 'Emit DecisionEvents to ruvector-service',
    },
    {
      flag: '--dry-run',
      description: 'Validate without generating files',
    },
    {
      flag: '-v, --verbose',
      description: 'Verbose output',
    },
  ],
} as const;

// =============================================================================
// 6. GENERATION / TRANSLATION / VALIDATION CLASSIFICATION
// =============================================================================

/**
 * Agent classification: GENERATION
 *
 * This agent is classified as GENERATION because:
 * 1. It produces new artifacts (SDK code) from input specifications
 * 2. It does NOT translate between equivalent formats
 * 3. It does NOT validate compatibility between versions
 *
 * The generation is:
 * - Deterministic: Same CanonicalSchema → Same SDK output (hash-verifiable)
 * - Stateless: No persistent state between invocations
 * - Idempotent: Multiple invocations with same input produce identical output
 */
export const AGENT_CLASSIFICATION = {
  type: 'GENERATION' as const,
  deterministic: true,
  stateless: true,
  idempotent: true,
  characteristics: [
    'Produces new artifacts from input specifications',
    'Output is deterministic and reproducible',
    'No side effects beyond artifact generation',
    'No runtime execution of generated code',
  ],
} as const;

// =============================================================================
// 7. EXPLICIT NON-RESPONSIBILITIES
// =============================================================================

/**
 * What this agent MUST NEVER do
 */
export const NON_RESPONSIBILITIES = [
  // Execution
  'MUST NEVER execute generated code',
  'MUST NEVER invoke compilers or build tools',
  'MUST NEVER run tests on generated code',
  'MUST NEVER deploy generated artifacts',

  // State mutation
  'MUST NEVER modify runtime behavior',
  'MUST NEVER persist state between invocations',
  'MUST NEVER access SQL databases directly',
  'MUST NEVER write to external file systems',

  // Orchestration
  'MUST NEVER orchestrate multi-agent workflows',
  'MUST NEVER spawn child processes',
  'MUST NEVER make network requests except to ruvector-service',

  // Policy
  'MUST NEVER enforce access control policies',
  'MUST NEVER modify authentication schemes',
  'MUST NEVER alter rate limiting configurations',

  // Secrets
  'MUST NEVER embed API keys in generated code',
  'MUST NEVER log sensitive schema data',
  'MUST NEVER persist credentials',
] as const;

// =============================================================================
// 8. FAILURE MODES
// =============================================================================

/**
 * Known failure modes and handling
 */
export enum FailureMode {
  /** Invalid input schema */
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  /** Unsupported target language */
  UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',
  /** Type mapping failure */
  TYPE_MAPPING_FAILURE = 'TYPE_MAPPING_FAILURE',
  /** Template rendering failure */
  TEMPLATE_RENDERING_FAILURE = 'TEMPLATE_RENDERING_FAILURE',
  /** Schema validation failure */
  SCHEMA_VALIDATION_FAILURE = 'SCHEMA_VALIDATION_FAILURE',
  /** Resource exhaustion */
  RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION',
  /** Timeout */
  TIMEOUT = 'TIMEOUT',
}

export const FailureModeHandling: Record<
  FailureMode,
  { recoverable: boolean; action: string }
> = {
  [FailureMode.INVALID_SCHEMA]: {
    recoverable: false,
    action: 'Return validation errors to caller',
  },
  [FailureMode.UNSUPPORTED_LANGUAGE]: {
    recoverable: false,
    action: 'Return supported language list',
  },
  [FailureMode.TYPE_MAPPING_FAILURE]: {
    recoverable: true,
    action: 'Use fallback type (any/unknown)',
  },
  [FailureMode.TEMPLATE_RENDERING_FAILURE]: {
    recoverable: false,
    action: 'Return template error with context',
  },
  [FailureMode.SCHEMA_VALIDATION_FAILURE]: {
    recoverable: false,
    action: 'Return validation errors',
  },
  [FailureMode.RESOURCE_EXHAUSTION]: {
    recoverable: false,
    action: 'Return resource limit error',
  },
  [FailureMode.TIMEOUT]: {
    recoverable: false,
    action: 'Return timeout error with partial results if available',
  },
};

// =============================================================================
// 9. VERSIONING RULES
// =============================================================================

/**
 * Versioning rules for generated artifacts
 */
export const VERSIONING_RULES = {
  /** Agent version follows semver */
  agentVersionFormat: 'semver',
  /** Generated SDK version from packageConfig */
  sdkVersionSource: 'packageConfig.version',
  /** Schema version from CanonicalSchema.metadata.version */
  schemaVersionSource: 'schema.metadata.version',
  /** Breaking changes require major version bump */
  breakingChangePolicies: [
    'Removal of public types requires major version bump',
    'Removal of endpoints requires major version bump',
    'Type signature changes require major version bump',
  ],
  /** Determinism hash format */
  determinismHashFormat: 'SHA-256 of normalized input',
} as const;

// =============================================================================
// 10. PERSISTENCE RULES (ruvector-service)
// =============================================================================

/**
 * Data that MUST be persisted to ruvector-service
 */
export const PERSISTED_DATA = [
  'DecisionEvent (all decisions)',
  'Generation metrics (duration, file counts)',
  'Confidence scores',
  'Input/output hashes for reproducibility',
  'Error events with stack traces',
  'Telemetry data (latency, resource usage)',
] as const;

/**
 * Data that MUST NOT be persisted
 */
export const NON_PERSISTED_DATA = [
  'Generated code content (too large, not needed)',
  'Full CanonicalSchema (reference by hash only)',
  'API keys or credentials',
  'File system paths',
  'Internal processing state',
] as const;

// =============================================================================
// 11. DOWNSTREAM CONSUMERS
// =============================================================================

/**
 * Systems that MAY consume this agent's output
 */
export const DOWNSTREAM_CONSUMERS = [
  {
    system: 'LLM-Observatory',
    consumedData: ['DecisionEvents', 'Metrics', 'Telemetry'],
    purpose: 'Observability and monitoring',
  },
  {
    system: 'CI/CD Pipeline',
    consumedData: ['Generated SDK artifacts', 'Build commands'],
    purpose: 'Automated build and publish',
  },
  {
    system: 'Package Registry',
    consumedData: ['Generated SDK packages'],
    purpose: 'Distribution',
  },
  {
    system: 'Schema Registry',
    consumedData: ['Compatibility metadata', 'Version info'],
    purpose: 'Version tracking',
  },
] as const;
