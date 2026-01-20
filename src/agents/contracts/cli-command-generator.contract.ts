/**
 * CLI Command Generator Agent Contract
 *
 * PROMPT 1 DELIVERABLE: Full Agent Contract & Boundary Definition
 *
 * Agent Name: CLI Command Generator Agent
 * Classification: GENERATION
 * decision_type: "cli_generation"
 *
 * @module agents/contracts/cli-command-generator.contract
 */

import { z } from 'zod';

// =============================================================================
// 1. AGENT PURPOSE STATEMENT (Precise, Non-Marketing)
// =============================================================================
/**
 * The CLI Command Generator Agent is a GENERATION-class agent responsible for
 * generating CLI command definitions and handlers from API contracts.
 *
 * It consumes agentics-contracts API schemas and produces deterministic CLI
 * artifacts including command specs, argument schemas, help text, and handlers
 * aligned with agentics-cli patterns.
 *
 * The agent does NOT:
 * - Execute generated CLI code
 * - Modify runtime behavior
 * - Orchestrate workflows
 * - Enforce policies
 * - Access SQL databases directly
 */
export const AGENT_PURPOSE = `
CLI Command Generator Agent: GENERATION-class agent for generating CLI command
definitions and handlers from API contracts with deterministic output.
` as const;

// =============================================================================
// 2. AGENT IDENTIFIER AND VERSION
// =============================================================================

export const CLI_AGENT_ID = 'cli-command-generator-agent' as const;
export const CLI_AGENT_VERSION = '1.0.0' as const;

// =============================================================================
// 3. INPUT SCHEMA REFERENCES (agentics-contracts)
// =============================================================================

/**
 * Supported CLI frameworks
 */
export const CLIFrameworkSchema = z.enum([
  'commander',
  'yargs',
  'clipanion',
  'oclif',
]);

export type SupportedCLIFramework = z.infer<typeof CLIFrameworkSchema>;

/**
 * CLI argument type schema
 */
export const CLIArgumentTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'array',
  'choice',
  'file',
  'directory',
]);

/**
 * API endpoint input schema (from canonical schema)
 */
export const APIEndpointSchema = z.object({
  operationId: z.string(),
  path: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  summary: z.string().optional(),
  description: z.string().optional(),
  parameters: z.array(z.object({
    name: z.string(),
    in: z.enum(['path', 'query', 'header', 'cookie']),
    type: z.object({
      typeId: z.string(),
      nullable: z.boolean().optional(),
    }),
    required: z.boolean(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    deprecated: z.boolean().optional(),
  })).optional(),
  requestBody: z.object({
    type: z.object({
      typeId: z.string(),
      nullable: z.boolean().optional(),
    }),
    required: z.boolean(),
    contentType: z.string(),
    description: z.string().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  deprecated: z.boolean().optional(),
});

/**
 * CLI generation request input schema
 */
export const CLIGenerationRequestSchema = z.object({
  /** Unique request identifier for tracing */
  requestId: z.string().uuid(),

  /** Source contract identifier */
  contractId: z.string(),

  /** Contract version */
  contractVersion: z.string(),

  /** API endpoints to generate commands for */
  endpoints: z.array(APIEndpointSchema),

  /** Type definitions for argument types */
  types: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['primitive', 'object', 'array', 'union', 'enum', 'reference']),
    description: z.string().optional(),
    properties: z.array(z.object({
      name: z.string(),
      type: z.object({
        typeId: z.string(),
        nullable: z.boolean().optional(),
      }),
      required: z.boolean(),
      description: z.string().optional(),
      default: z.unknown().optional(),
    })).optional(),
    values: z.array(z.object({
      value: z.union([z.string(), z.number()]),
      name: z.string(),
      description: z.string().optional(),
    })).optional(),
  })),

  /** Target CLI framework */
  framework: CLIFrameworkSchema.default('commander'),

  /** Package/program name */
  packageName: z.string().min(1).max(128),

  /** Package version */
  packageVersion: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/).default('0.1.0'),

  /** Provider ID */
  providerId: z.string(),

  /** Provider display name */
  providerName: z.string(),

  /** Generation options */
  options: z.object({
    /** Generate handler stubs */
    generateHandlers: z.boolean().default(true),
    /** Generate TypeScript types */
    generateTypes: z.boolean().default(true),
    /** Include usage examples */
    includeExamples: z.boolean().default(true),
    /** Command name prefix */
    commandPrefix: z.string().optional(),
    /** Additional global options */
    globalOptions: z.array(z.object({
      name: z.string(),
      alias: z.string().optional(),
      description: z.string(),
      type: CLIArgumentTypeSchema,
      default: z.unknown().optional(),
    })).optional(),
  }).default({}),

  /** Tracing context for observability */
  tracingContext: z.object({
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    parentSpanId: z.string().optional(),
  }).optional(),
});

export type CLIGenerationRequest = z.infer<typeof CLIGenerationRequestSchema>;

// =============================================================================
// 4. OUTPUT SCHEMA / ARTIFACT REFERENCES
// =============================================================================

/**
 * Generated CLI file artifact
 */
export const GeneratedCLIFileSchema = z.object({
  /** Relative file path */
  path: z.string(),
  /** File content (UTF-8) */
  content: z.string(),
  /** File type */
  type: z.enum(['command', 'handler', 'types', 'index', 'manifest', 'readme']),
  /** Whether file is executable */
  executable: z.boolean().default(false),
  /** Content hash for verification */
  contentHash: z.string().optional(),
  /** File size in bytes */
  sizeBytes: z.number().int().positive().optional(),
});

export type GeneratedCLIFile = z.infer<typeof GeneratedCLIFileSchema>;

/**
 * CLI generation response
 */
export const CLIGenerationResponseSchema = z.object({
  /** Original request ID */
  requestId: z.string().uuid(),
  /** Generation success status */
  success: z.boolean(),
  /** Generated files */
  files: z.array(GeneratedCLIFileSchema),
  /** Program definition */
  program: z.object({
    name: z.string(),
    version: z.string(),
    description: z.string(),
    commandCount: z.number().int().nonnegative(),
  }),
  /** Target framework */
  framework: CLIFrameworkSchema,
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Generation duration in milliseconds */
  duration: z.number().nonnegative(),
  /** Warnings (non-fatal issues) */
  warnings: z.array(z.string()),
  /** Errors (if success=false) */
  errors: z.array(z.string()),
  /** Compatibility metadata */
  compatibility: z.object({
    schemaVersion: z.string(),
    agentVersion: z.string(),
    generatedAt: z.string().datetime(),
    determinismHash: z.string(),
  }).optional(),
});

export type CLIGenerationResponse = z.infer<typeof CLIGenerationResponseSchema>;

// =============================================================================
// 5. DECISION EVENT MAPPING
// =============================================================================

/**
 * Decision types for CLI Command Generator Agent
 */
export enum CLIGeneratorDecisionType {
  /** Primary decision: CLI generation from endpoints */
  CLI_GENERATION = 'cli_generation',
  /** Command mapping decision */
  COMMAND_MAPPING = 'command_mapping',
  /** Argument type mapping decision */
  ARGUMENT_TYPE_MAPPING = 'argument_type_mapping',
}

/**
 * Confidence semantics for CLI generation
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
 * Decision event for CLI generation
 */
export const CLIGeneratorDecisionEventSchema = z.object({
  /** Event unique identifier */
  eventId: z.string().uuid(),
  /** Decision type */
  decisionType: z.nativeEnum(CLIGeneratorDecisionType),
  /** Agent identifier */
  agentId: z.literal('cli-command-generator-agent'),
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

export type CLIGeneratorDecisionEvent = z.infer<typeof CLIGeneratorDecisionEventSchema>;

// =============================================================================
// 6. CLI CONTRACT
// =============================================================================

/**
 * CLI invocation shape for CLI Command Generator Agent
 *
 * Primary command: generate cli
 *
 * Usage:
 *   llm-forge generate cli <contract-file> [options]
 *
 * Arguments:
 *   contract-file           API contract file (JSON)
 *
 * Options:
 *   -f, --framework <fw>    Target framework (commander, yargs, clipanion, oclif)
 *   -o, --output <dir>      Output directory (default: ./cli-generated)
 *   -n, --name <name>       Package name
 *   --pkg-version <version> Package version (default: 0.1.0)
 *   -p, --provider <id>     Provider ID
 *   --no-handlers           Don't generate handler stubs
 *   --no-types              Don't generate TypeScript types
 *   --emit-events           Emit DecisionEvents to ruvector-service
 *   --dry-run               Validate without generating files
 *   -v, --verbose           Verbose output
 */
export const CLIContract = {
  command: 'generate cli',
  arguments: [
    {
      name: 'contract-file',
      description: 'API contract file (JSON)',
      required: true,
    },
  ],
  options: [
    {
      flag: '-f, --framework <framework>',
      description: 'Target CLI framework',
      default: 'commander',
      choices: ['commander', 'yargs', 'clipanion', 'oclif'],
    },
    {
      flag: '-o, --output <dir>',
      description: 'Output directory',
      default: './cli-generated',
    },
    {
      flag: '-n, --name <name>',
      description: 'Package name',
      required: true,
    },
    {
      flag: '--pkg-version <version>',
      description: 'Package version',
      default: '0.1.0',
    },
    {
      flag: '-p, --provider <id>',
      description: 'Provider ID (e.g., openai, anthropic)',
      required: true,
    },
    {
      flag: '--provider-name <name>',
      description: 'Provider display name',
    },
    {
      flag: '--no-handlers',
      description: 'Disable handler stub generation',
    },
    {
      flag: '--no-types',
      description: 'Disable TypeScript type generation',
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
// 7. GENERATION / TRANSLATION / VALIDATION CLASSIFICATION
// =============================================================================

/**
 * Agent classification: GENERATION
 *
 * This agent is classified as GENERATION because:
 * 1. It produces new artifacts (CLI code) from API specifications
 * 2. It does NOT translate between equivalent formats
 * 3. It does NOT validate compatibility between versions
 *
 * The generation is:
 * - Deterministic: Same endpoints → Same CLI output (hash-verifiable)
 * - Stateless: No persistent state between invocations
 * - Idempotent: Multiple invocations with same input produce identical output
 */
export const AGENT_CLASSIFICATION = {
  type: 'GENERATION' as const,
  deterministic: true,
  stateless: true,
  idempotent: true,
  characteristics: [
    'Produces CLI command artifacts from API specifications',
    'Output is deterministic and reproducible',
    'No side effects beyond artifact generation',
    'No runtime execution of generated code',
    'Generates Commander.js compatible CLI code',
  ],
} as const;

// =============================================================================
// 8. EXPLICIT NON-RESPONSIBILITIES
// =============================================================================

/**
 * What this agent MUST NEVER do
 */
export const NON_RESPONSIBILITIES = [
  // Execution
  'MUST NEVER execute generated CLI code',
  'MUST NEVER invoke the generated CLI commands',
  'MUST NEVER run the CLI against APIs',
  'MUST NEVER deploy generated CLI packages',

  // State mutation
  'MUST NEVER modify runtime behavior',
  'MUST NEVER persist state between invocations',
  'MUST NEVER access SQL databases directly',
  'MUST NEVER write to external file systems',

  // Orchestration
  'MUST NEVER orchestrate multi-agent workflows',
  'MUST NEVER spawn child processes',
  'MUST NEVER make network requests except to ruvector-service',
  'MUST NEVER invoke other agents directly',

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
// 9. FAILURE MODES
// =============================================================================

/**
 * Known failure modes and handling
 */
export enum FailureMode {
  /** Invalid input schema */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Unsupported framework */
  UNSUPPORTED_FRAMEWORK = 'UNSUPPORTED_FRAMEWORK',
  /** Endpoint parsing failure */
  ENDPOINT_PARSING_FAILURE = 'ENDPOINT_PARSING_FAILURE',
  /** Type mapping failure */
  TYPE_MAPPING_FAILURE = 'TYPE_MAPPING_FAILURE',
  /** Contract mismatch */
  CONTRACT_MISMATCH = 'CONTRACT_MISMATCH',
  /** Resource exhaustion */
  RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION',
  /** Timeout */
  TIMEOUT = 'TIMEOUT',
}

export const FailureModeHandling: Record<
  FailureMode,
  { recoverable: boolean; action: string }
> = {
  [FailureMode.INVALID_INPUT]: {
    recoverable: false,
    action: 'Return validation errors to caller',
  },
  [FailureMode.UNSUPPORTED_FRAMEWORK]: {
    recoverable: true,
    action: 'Fall back to Commander.js framework',
  },
  [FailureMode.ENDPOINT_PARSING_FAILURE]: {
    recoverable: true,
    action: 'Skip endpoint with warning',
  },
  [FailureMode.TYPE_MAPPING_FAILURE]: {
    recoverable: true,
    action: 'Use fallback type (string)',
  },
  [FailureMode.CONTRACT_MISMATCH]: {
    recoverable: false,
    action: 'Return version incompatibility error',
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
// 10. VERSIONING RULES
// =============================================================================

/**
 * Versioning rules for generated CLI artifacts
 */
export const VERSIONING_RULES = {
  /** Agent version follows semver */
  agentVersionFormat: 'semver',
  /** Generated CLI version from packageConfig */
  cliVersionSource: 'packageVersion',
  /** Contract version from contractVersion field */
  contractVersionSource: 'contractVersion',
  /** Breaking changes require major version bump */
  breakingChangePolicies: [
    'Removal of commands requires major version bump',
    'Removal of options requires major version bump',
    'Option type changes require major version bump',
  ],
  /** Determinism hash format */
  determinismHashFormat: 'SHA-256 of normalized input',
} as const;

// =============================================================================
// 11. PERSISTENCE RULES (ruvector-service)
// =============================================================================

/**
 * Data that MUST be persisted to ruvector-service
 */
export const PERSISTED_DATA = [
  'DecisionEvent (all decisions)',
  'Generation metrics (duration, command counts)',
  'Confidence scores',
  'Input/output hashes for reproducibility',
  'Error events with context',
  'Telemetry data (latency, resource usage)',
] as const;

/**
 * Data that MUST NOT be persisted
 */
export const NON_PERSISTED_DATA = [
  'Generated code content (too large)',
  'Full endpoint definitions (reference by hash only)',
  'API keys or credentials',
  'File system paths',
  'Internal processing state',
] as const;

// =============================================================================
// 12. DOWNSTREAM CONSUMERS
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
    system: 'agentics-cli',
    consumedData: ['Generated CLI artifacts', 'Command specs'],
    purpose: 'Developer tooling integration',
  },
  {
    system: 'CI/CD Pipeline',
    consumedData: ['Generated CLI packages', 'Build commands'],
    purpose: 'Automated build and publish',
  },
  {
    system: 'Package Registry (npm)',
    consumedData: ['Generated CLI packages'],
    purpose: 'Distribution',
  },
] as const;
