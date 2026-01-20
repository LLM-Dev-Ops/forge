/**
 * API Translation Agent Contract
 *
 * PROMPT 1 DELIVERABLE: Full Agent Contract & Boundary Definition
 *
 * Agent Name: API Translation Agent
 * Classification: TRANSLATION
 * decision_type: "api_translation"
 *
 * @module agents/contracts/api-translation.contract
 */

import { z } from 'zod';
import type {
  CanonicalSchema,
  EndpointDefinition,
  TypeDefinition,
  ParameterDefinition,
} from '../../types/canonical-schema.js';

// =============================================================================
// 1. AGENT PURPOSE STATEMENT (Precise, Non-Marketing)
// =============================================================================
/**
 * The API Translation Agent is a TRANSLATION-class agent responsible for
 * converting API schemas across different interface representations while
 * preserving semantic equivalence.
 *
 * It translates between:
 * - REST (OpenAPI/HTTP endpoint representations)
 * - SDK (Language-specific client library structures)
 * - CLI (Command-line interface definitions)
 *
 * The agent ensures:
 * - Lossless or documented-lossy translation between formats
 * - Semantic equivalence verification
 * - Compatibility detection for incompatible translations
 * - Translation mapping metadata for traceability
 *
 * The agent does NOT:
 * - Execute generated code
 * - Modify runtime behavior
 * - Orchestrate workflows
 * - Enforce policies
 * - Access SQL databases directly
 * - Generate actual implementation code (that's SDK Generator's job)
 */
export const AGENT_PURPOSE = `
API Translation Agent: TRANSLATION-class agent for converting API schemas
across REST, SDK, and CLI representations with semantic equivalence preservation.
` as const;

/**
 * Agent identifier
 */
export const AGENT_ID = 'api-translation-agent' as const;

/**
 * Agent version
 */
export const AGENT_VERSION = '1.0.0' as const;

// =============================================================================
// 2. INPUT SCHEMA REFERENCES (agentics-contracts)
// =============================================================================

/**
 * Supported interface representation formats
 */
export enum InterfaceFormat {
  /** REST/HTTP endpoint representation (OpenAPI-style) */
  REST = 'rest',
  /** SDK client library structure */
  SDK = 'sdk',
  /** Command-line interface definition */
  CLI = 'cli',
}

export const InterfaceFormatSchema = z.nativeEnum(InterfaceFormat);

/**
 * Translation direction specifier
 */
export const TranslationDirectionSchema = z.object({
  /** Source format */
  from: InterfaceFormatSchema,
  /** Target format */
  to: InterfaceFormatSchema,
});

export type TranslationDirection = z.infer<typeof TranslationDirectionSchema>;

/**
 * REST endpoint representation
 */
export const RESTEndpointSchema = z.object({
  /** HTTP method */
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  /** URL path template */
  path: z.string(),
  /** Operation identifier */
  operationId: z.string(),
  /** Path parameters */
  pathParams: z.array(z.string()).default([]),
  /** Query parameters */
  queryParams: z.array(z.string()).default([]),
  /** Header parameters */
  headerParams: z.array(z.string()).default([]),
  /** Request body type reference */
  requestBody: z.string().optional(),
  /** Response type reference */
  responseType: z.string().optional(),
  /** Content type */
  contentType: z.string().default('application/json'),
  /** Supports streaming */
  streaming: z.boolean().default(false),
  /** Tags for grouping */
  tags: z.array(z.string()).default([]),
});

export type RESTEndpoint = z.infer<typeof RESTEndpointSchema>;

/**
 * SDK method representation
 */
export const SDKMethodSchema = z.object({
  /** Method name (camelCase) */
  name: z.string(),
  /** Class/module this method belongs to */
  className: z.string(),
  /** Method parameters */
  parameters: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      default: z.unknown().optional(),
    })
  ),
  /** Return type */
  returnType: z.string(),
  /** Async method */
  async: z.boolean().default(true),
  /** Streaming return type */
  streaming: z.boolean().default(false),
  /** JSDoc/docstring description */
  description: z.string().optional(),
  /** Throws/raises */
  throws: z.array(z.string()).default([]),
});

export type SDKMethod = z.infer<typeof SDKMethodSchema>;

/**
 * CLI command representation
 */
export const CLICommandSchema = z.object({
  /** Command name (kebab-case) */
  command: z.string(),
  /** Parent command (for subcommands) */
  parent: z.string().optional(),
  /** Positional arguments */
  arguments: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      required: z.boolean(),
      variadic: z.boolean().default(false),
    })
  ),
  /** Flag options */
  options: z.array(
    z.object({
      flag: z.string(), // e.g., '-v, --verbose'
      description: z.string(),
      type: z.enum(['boolean', 'string', 'number', 'array']),
      required: z.boolean().default(false),
      default: z.unknown().optional(),
    })
  ),
  /** Command description */
  description: z.string(),
  /** Usage examples */
  examples: z.array(z.string()).default([]),
});

export type CLICommand = z.infer<typeof CLICommandSchema>;

/**
 * Translation request input schema
 */
export const APITranslationRequestSchema = z.object({
  /** Unique request identifier for tracing */
  requestId: z.string().uuid(),

  /** Translation direction */
  direction: TranslationDirectionSchema,

  /** Source canonical schema (required for REST/SDK inputs) */
  sourceSchema: z
    .custom<CanonicalSchema>(
      (val: unknown) =>
        typeof val === 'object' &&
        val !== null &&
        'metadata' in val &&
        'types' in val &&
        'endpoints' in val,
      'Invalid CanonicalSchema'
    )
    .optional(),

  /** Source REST endpoints (for REST → SDK/CLI) */
  restEndpoints: z.array(RESTEndpointSchema).optional(),

  /** Source SDK methods (for SDK → REST/CLI) */
  sdkMethods: z.array(SDKMethodSchema).optional(),

  /** Source CLI commands (for CLI → REST/SDK) */
  cliCommands: z.array(CLICommandSchema).optional(),

  /** Translation options */
  options: z
    .object({
      /** Strict mode (fail on any semantic loss) */
      strict: z.boolean().default(false),
      /** Include translation mappings in output */
      includeMappings: z.boolean().default(true),
      /** Preserve original identifiers where possible */
      preserveIdentifiers: z.boolean().default(true),
      /** Naming convention for target format */
      namingConvention: z.enum(['camelCase', 'snake_case', 'kebab-case', 'PascalCase']).optional(),
      /** Group commands/methods by tag */
      groupByTag: z.boolean().default(true),
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

export type APITranslationRequest = z.infer<typeof APITranslationRequestSchema>;

// =============================================================================
// 3. OUTPUT SCHEMA / ARTIFACT REFERENCES
// =============================================================================

/**
 * Translation mapping entry (traces source to target)
 */
export const TranslationMappingSchema = z.object({
  /** Source identifier */
  sourceId: z.string(),
  /** Source format */
  sourceFormat: InterfaceFormatSchema,
  /** Target identifier */
  targetId: z.string(),
  /** Target format */
  targetFormat: InterfaceFormatSchema,
  /** Mapping confidence (1.0 = exact, <1.0 = semantic loss) */
  confidence: z.number().min(0).max(1),
  /** Semantic loss description (if any) */
  semanticLoss: z.string().optional(),
  /** Transformation applied */
  transformation: z.string(),
});

export type TranslationMapping = z.infer<typeof TranslationMappingSchema>;

/**
 * Compatibility issue detected during translation
 */
export const CompatibilityIssueSchema = z.object({
  /** Issue severity */
  severity: z.enum(['error', 'warning', 'info']),
  /** Issue code */
  code: z.string(),
  /** Human-readable message */
  message: z.string(),
  /** Source element that caused the issue */
  sourceElement: z.string(),
  /** Suggested resolution */
  resolution: z.string().optional(),
});

export type CompatibilityIssue = z.infer<typeof CompatibilityIssueSchema>;

/**
 * Translation result for a single direction
 */
export const TranslationResultSchema = z.object({
  /** Translation direction */
  direction: TranslationDirectionSchema,
  /** Translated REST endpoints */
  restEndpoints: z.array(RESTEndpointSchema).optional(),
  /** Translated SDK methods */
  sdkMethods: z.array(SDKMethodSchema).optional(),
  /** Translated CLI commands */
  cliCommands: z.array(CLICommandSchema).optional(),
  /** Translation mappings */
  mappings: z.array(TranslationMappingSchema),
  /** Compatibility issues */
  issues: z.array(CompatibilityIssueSchema),
  /** Overall translation confidence */
  overallConfidence: z.number().min(0).max(1),
});

export type TranslationResult = z.infer<typeof TranslationResultSchema>;

/**
 * Complete API translation response
 */
export const APITranslationResponseSchema = z.object({
  /** Original request ID */
  requestId: z.string().uuid(),
  /** Translation success status */
  success: z.boolean(),
  /** Translation result */
  result: TranslationResultSchema.optional(),
  /** Compatibility metadata */
  compatibility: z.object({
    /** Schema version used */
    schemaVersion: z.string(),
    /** Agent version */
    agentVersion: z.string(),
    /** Translation timestamp */
    translatedAt: z.string().datetime(),
    /** Determinism hash (same input = same hash) */
    determinismHash: z.string(),
  }),
  /** Warnings (non-fatal issues) */
  warnings: z.array(z.string()),
  /** Errors (if success=false) */
  errors: z.array(z.string()),
});

export type APITranslationResponse = z.infer<typeof APITranslationResponseSchema>;

// =============================================================================
// 4. DECISION EVENT MAPPING
// =============================================================================

/**
 * Decision types for API Translation Agent
 */
export enum APITranslationDecisionType {
  /** Primary decision: API translation */
  API_TRANSLATION = 'api_translation',
  /** Format conversion decision */
  FORMAT_CONVERSION = 'format_conversion',
  /** Identifier mapping decision */
  IDENTIFIER_MAPPING = 'identifier_mapping',
  /** Compatibility detection decision */
  COMPATIBILITY_DETECTION = 'compatibility_detection',
  /** Semantic equivalence decision */
  SEMANTIC_EQUIVALENCE = 'semantic_equivalence',
}

/**
 * Confidence semantics for API translation
 * - DETERMINISTIC: Same input always produces same output (hash-verifiable)
 * - HEURISTIC: Best-effort mapping with confidence score
 * - CONSTRAINT_BASED: Output satisfies defined constraints
 */
export enum TranslationConfidenceSemantics {
  /** Output is deterministic and reproducible */
  DETERMINISTIC = 'deterministic',
  /** Output uses heuristic mapping */
  HEURISTIC = 'heuristic',
  /** Output satisfies defined constraints */
  CONSTRAINT_BASED = 'constraint_based',
}

/**
 * Decision event for API translation
 */
export const APITranslationDecisionEventSchema = z.object({
  /** Event unique identifier */
  eventId: z.string().uuid(),
  /** Decision type */
  decisionType: z.nativeEnum(APITranslationDecisionType),
  /** Agent identifier */
  agentId: z.literal('api-translation-agent'),
  /** Agent version */
  agentVersion: z.string(),
  /** Request ID this decision relates to */
  requestId: z.string().uuid(),
  /** Timestamp of decision */
  timestamp: z.string().datetime(),
  /** Confidence semantics */
  confidenceSemantics: z.nativeEnum(TranslationConfidenceSemantics),
  /** Confidence score (0.0-1.0) */
  confidenceScore: z.number().min(0).max(1),
  /** Input hash for reproducibility */
  inputHash: z.string(),
  /** Output hash for verification */
  outputHash: z.string(),
  /** Decision rationale */
  rationale: z.string(),
  /** Constraints applied */
  constraintsApplied: z.array(z.string()).optional(),
  /** Decision metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type APITranslationDecisionEvent = z.infer<typeof APITranslationDecisionEventSchema>;

// =============================================================================
// 5. CLI CONTRACT
// =============================================================================

/**
 * CLI invocation shape for API Translation Agent
 *
 * Primary command: translate
 *
 * Usage:
 *   llm-forge translate <input> [options]
 *
 * Arguments:
 *   input                    Canonical schema (JSON) or API specification
 *
 * Options:
 *   --from <format>          Source format (rest, sdk, cli)
 *   --to <format>            Target format (rest, sdk, cli)
 *   -o, --output <file>      Output file
 *   --strict                 Strict mode (fail on semantic loss)
 *   --include-mappings       Include translation mappings
 *   --naming <convention>    Naming convention (camelCase, snake_case, kebab-case)
 *   --emit-events            Emit DecisionEvents to ruvector-service
 *   --dry-run                Validate without producing output
 *   -v, --verbose            Verbose output
 */
export const CLIContract = {
  command: 'translate',
  arguments: [
    {
      name: 'input',
      description: 'Canonical schema (JSON) or API specification',
      required: true,
    },
  ],
  options: [
    {
      flag: '--from <format>',
      description: 'Source format (rest, sdk, cli)',
      default: 'rest',
    },
    {
      flag: '--to <format>',
      description: 'Target format (rest, sdk, cli)',
      default: 'sdk',
    },
    {
      flag: '-o, --output <file>',
      description: 'Output file',
    },
    {
      flag: '--strict',
      description: 'Strict mode (fail on semantic loss)',
    },
    {
      flag: '--include-mappings',
      description: 'Include translation mappings in output',
      default: true,
    },
    {
      flag: '--naming <convention>',
      description: 'Naming convention (camelCase, snake_case, kebab-case, PascalCase)',
    },
    {
      flag: '--emit-events',
      description: 'Emit DecisionEvents to ruvector-service',
    },
    {
      flag: '--dry-run',
      description: 'Validate without producing output',
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
 * Agent classification: TRANSLATION
 *
 * This agent is classified as TRANSLATION because:
 * 1. It converts between equivalent interface representations
 * 2. It preserves semantic meaning across formats
 * 3. It detects and reports semantic loss
 * 4. It does NOT generate new artifacts (that's SDK Generator's job)
 *
 * The translation is:
 * - Deterministic: Same input → Same output (hash-verifiable)
 * - Stateless: No persistent state between invocations
 * - Idempotent: Multiple invocations with same input produce identical output
 * - Lossless/Documented-Lossy: Semantic loss is detected and reported
 */
export const AGENT_CLASSIFICATION = {
  type: 'TRANSLATION' as const,
  deterministic: true,
  stateless: true,
  idempotent: true,
  characteristics: [
    'Converts between REST, SDK, and CLI representations',
    'Preserves semantic equivalence where possible',
    'Detects and reports semantic loss',
    'Produces translation mappings for traceability',
    'Does NOT generate implementation code',
    'Does NOT execute translations',
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
  'MUST NEVER execute translated code or commands',
  'MUST NEVER invoke HTTP endpoints',
  'MUST NEVER run CLI commands',
  'MUST NEVER deploy translated artifacts',

  // Code Generation
  'MUST NEVER generate implementation code (use SDK Generator)',
  'MUST NEVER produce executable binaries',
  'MUST NEVER create build artifacts',

  // State mutation
  'MUST NEVER modify runtime behavior',
  'MUST NEVER persist state between invocations',
  'MUST NEVER access SQL databases directly',
  'MUST NEVER write to external file systems without explicit request',

  // Orchestration
  'MUST NEVER orchestrate multi-agent workflows',
  'MUST NEVER spawn child processes',
  'MUST NEVER make network requests except to ruvector-service',

  // Policy
  'MUST NEVER enforce access control policies',
  'MUST NEVER modify authentication schemes',
  'MUST NEVER alter rate limiting configurations',

  // Secrets
  'MUST NEVER embed API keys in translations',
  'MUST NEVER log sensitive schema data',
  'MUST NEVER persist credentials',
] as const;

// =============================================================================
// 8. FAILURE MODES
// =============================================================================

/**
 * Known failure modes and handling
 */
export enum TranslationFailureMode {
  /** Invalid input format */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Unsupported translation direction */
  UNSUPPORTED_DIRECTION = 'UNSUPPORTED_DIRECTION',
  /** Incompatible schema structure */
  INCOMPATIBLE_SCHEMA = 'INCOMPATIBLE_SCHEMA',
  /** Semantic loss exceeds threshold (strict mode) */
  SEMANTIC_LOSS_EXCEEDED = 'SEMANTIC_LOSS_EXCEEDED',
  /** Missing required fields for translation */
  MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS',
  /** Circular reference detected */
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  /** Resource exhaustion */
  RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION',
  /** Timeout */
  TIMEOUT = 'TIMEOUT',
}

export const FailureModeHandling: Record<
  TranslationFailureMode,
  { recoverable: boolean; action: string }
> = {
  [TranslationFailureMode.INVALID_INPUT]: {
    recoverable: false,
    action: 'Return validation errors to caller',
  },
  [TranslationFailureMode.UNSUPPORTED_DIRECTION]: {
    recoverable: false,
    action: 'Return supported directions list',
  },
  [TranslationFailureMode.INCOMPATIBLE_SCHEMA]: {
    recoverable: true,
    action: 'Return partial translation with compatibility issues',
  },
  [TranslationFailureMode.SEMANTIC_LOSS_EXCEEDED]: {
    recoverable: true,
    action: 'Return translation with documented semantic loss (non-strict)',
  },
  [TranslationFailureMode.MISSING_REQUIRED_FIELDS]: {
    recoverable: false,
    action: 'Return list of missing required fields',
  },
  [TranslationFailureMode.CIRCULAR_REFERENCE]: {
    recoverable: false,
    action: 'Return circular reference path for resolution',
  },
  [TranslationFailureMode.RESOURCE_EXHAUSTION]: {
    recoverable: false,
    action: 'Return resource limit error',
  },
  [TranslationFailureMode.TIMEOUT]: {
    recoverable: false,
    action: 'Return timeout error with partial results if available',
  },
};

// =============================================================================
// 9. VERSIONING RULES
// =============================================================================

/**
 * Versioning rules for translation artifacts
 */
export const VERSIONING_RULES = {
  /** Agent version follows semver */
  agentVersionFormat: 'semver',
  /** Translation output preserves source version */
  outputVersionSource: 'sourceSchema.metadata.version',
  /** Schema version from CanonicalSchema.metadata.version */
  schemaVersionSource: 'schema.metadata.version',
  /** Breaking changes require major version bump */
  breakingChangePolicies: [
    'New required translation fields require major version bump',
    'Removal of translation directions requires major version bump',
    'Mapping format changes require major version bump',
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
  'DecisionEvent (all translation decisions)',
  'Translation mappings (source → target)',
  'Compatibility issues detected',
  'Confidence scores per translation',
  'Input/output hashes for reproducibility',
  'Error events with stack traces',
  'Telemetry data (latency, resource usage)',
] as const;

/**
 * Data that MUST NOT be persisted
 */
export const NON_PERSISTED_DATA = [
  'Full translated output (reference by hash only)',
  'Full source schema (reference by hash only)',
  'API keys or credentials',
  'File system paths',
  'Internal processing state',
  'Raw HTTP request/response bodies',
] as const;

// =============================================================================
// 11. DOWNSTREAM CONSUMERS
// =============================================================================

/**
 * Systems that MAY consume this agent's output
 */
export const DOWNSTREAM_CONSUMERS = [
  {
    system: 'SDK Generator Agent',
    consumedData: ['Translated SDK method definitions'],
    purpose: 'Use translated SDK structures for code generation',
  },
  {
    system: 'LLM-Observatory',
    consumedData: ['DecisionEvents', 'Compatibility issues', 'Telemetry'],
    purpose: 'Observability and monitoring',
  },
  {
    system: 'agentics-cli',
    consumedData: ['Translated CLI command definitions'],
    purpose: 'CLI scaffolding and generation',
  },
  {
    system: 'Schema Registry',
    consumedData: ['Translation mappings', 'Version compatibility data'],
    purpose: 'Cross-format schema tracking',
  },
  {
    system: 'Documentation Generator',
    consumedData: ['Translated endpoint/method descriptions'],
    purpose: 'Cross-format documentation',
  },
] as const;

// =============================================================================
// 12. TRANSLATION RULES (Interface-Specific)
// =============================================================================

/**
 * Translation rules for REST → SDK
 */
export const REST_TO_SDK_RULES = {
  /** Map HTTP method to SDK method naming */
  methodNaming: {
    GET: 'get{Resource}',
    POST: 'create{Resource}',
    PUT: 'update{Resource}',
    PATCH: 'patch{Resource}',
    DELETE: 'delete{Resource}',
  },
  /** Map path params to method params */
  pathParamMapping: 'positional',
  /** Map query params to options object */
  queryParamMapping: 'options',
  /** Map request body to method param */
  requestBodyMapping: 'data',
  /** Map response to return type */
  responseMapping: 'Promise<T>',
} as const;

/**
 * Translation rules for SDK → CLI
 */
export const SDK_TO_CLI_RULES = {
  /** Map method name to command */
  commandNaming: 'kebab-case',
  /** Map class to command group */
  classMapping: 'subcommand',
  /** Map required params to arguments */
  requiredParamMapping: 'positional',
  /** Map optional params to flags */
  optionalParamMapping: 'flags',
  /** Map async returns to stdout */
  returnMapping: 'stdout-json',
} as const;

/**
 * Translation rules for CLI → REST
 */
export const CLI_TO_REST_RULES = {
  /** Map command to endpoint path */
  commandToPath: '/{parent}/{command}',
  /** Map positional args to path params */
  argsToPathParams: true,
  /** Map flags to query params */
  flagsToQueryParams: true,
  /** Infer HTTP method from command name */
  methodInference: {
    get: 'GET',
    list: 'GET',
    create: 'POST',
    add: 'POST',
    update: 'PUT',
    edit: 'PATCH',
    delete: 'DELETE',
    remove: 'DELETE',
  },
} as const;
