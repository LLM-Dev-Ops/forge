/**
 * Version Compatibility Agent Contract
 *
 * PROMPT 1 DELIVERABLE: Full Agent Contract & Boundary Definition
 *
 * Agent Name: Version Compatibility Agent
 * Classification: VALIDATION / COMPATIBILITY
 * decision_type: "version_compatibility_analysis"
 *
 * @module agents/contracts/version-compatibility.contract
 */

import { z } from 'zod';
import type { CanonicalSchema, TypeDefinition, EndpointDefinition } from '../../types/canonical-schema.js';

// =============================================================================
// 1. AGENT PURPOSE STATEMENT (Precise, Non-Marketing)
// =============================================================================
/**
 * The Version Compatibility Agent is a VALIDATION/COMPATIBILITY-class agent
 * responsible for analyzing compatibility between API and SDK versions.
 *
 * It consumes agentics-contracts API schemas (CanonicalSchema) and produces
 * compatibility analysis reports identifying breaking vs non-breaking changes.
 *
 * The agent does NOT:
 * - Execute generated code
 * - Modify runtime behavior
 * - Orchestrate workflows
 * - Enforce policies
 * - Access SQL databases directly
 * - Apply migrations or upgrades
 * - Mutate schemas
 */
export const AGENT_PURPOSE = `
Version Compatibility Agent: VALIDATION/COMPATIBILITY-class agent for analyzing
compatibility between API and SDK versions with deterministic change detection.
` as const;

// =============================================================================
// 2. INPUT SCHEMA REFERENCES (agentics-contracts)
// =============================================================================

/**
 * Semver version string validation
 */
export const SemverVersionSchema = z.string().regex(
  /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/,
  'Must be valid semver (e.g., 1.0.0, 2.1.0-beta.1)'
);

/**
 * Schema version reference - lightweight reference to a schema by version
 */
export const SchemaVersionReferenceSchema = z.object({
  /** Provider identifier */
  providerId: z.string().min(1),
  /** Schema version */
  version: SemverVersionSchema,
  /** Schema hash for integrity verification */
  schemaHash: z.string().optional(),
});

export type SchemaVersionReference = z.infer<typeof SchemaVersionReferenceSchema>;

/**
 * Compatibility analysis request input schema
 */
export const CompatibilityAnalysisRequestSchema = z.object({
  /** Unique request identifier for tracing */
  requestId: z.string().uuid(),

  /** Source (older/baseline) schema for comparison */
  sourceSchema: z.custom<CanonicalSchema>((val) => {
    return (
      typeof val === 'object' &&
      val !== null &&
      'metadata' in val &&
      'types' in val &&
      'endpoints' in val
    );
  }, 'Invalid CanonicalSchema'),

  /** Target (newer) schema for comparison */
  targetSchema: z.custom<CanonicalSchema>((val) => {
    return (
      typeof val === 'object' &&
      val !== null &&
      'metadata' in val &&
      'types' in val &&
      'endpoints' in val
    );
  }, 'Invalid CanonicalSchema'),

  /** Analysis options */
  options: z.object({
    /** Strictness level for compatibility checking */
    strictness: z.enum(['strict', 'standard', 'lenient']).default('standard'),
    /** Include upgrade guidance in response */
    includeUpgradeGuidance: z.boolean().default(true),
    /** Include detailed diff for each change */
    includeDetailedDiff: z.boolean().default(false),
    /** Categories of changes to analyze */
    analyzeCategories: z.array(z.enum([
      'types',
      'endpoints',
      'authentication',
      'errors',
      'metadata',
    ])).default(['types', 'endpoints', 'authentication', 'errors']),
    /** Ignore specific paths/types from analysis */
    ignorePaths: z.array(z.string()).default([]),
  }).default({}),

  /** Tracing context for observability */
  tracingContext: z.object({
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    parentSpanId: z.string().optional(),
  }).optional(),
});

export type CompatibilityAnalysisRequest = z.infer<typeof CompatibilityAnalysisRequestSchema>;

// =============================================================================
// 3. OUTPUT SCHEMA / ARTIFACT REFERENCES
// =============================================================================

/**
 * Change severity levels
 */
export const ChangeSeveritySchema = z.enum([
  'breaking',      // Major version bump required
  'non-breaking',  // Minor version bump
  'patch',         // Patch version bump (backwards compatible fix)
  'informational', // No version impact (docs, comments)
]);

export type ChangeSeverity = z.infer<typeof ChangeSeveritySchema>;

/**
 * Change category
 */
export const ChangeCategorySchema = z.enum([
  'type-added',
  'type-removed',
  'type-modified',
  'property-added',
  'property-removed',
  'property-modified',
  'endpoint-added',
  'endpoint-removed',
  'endpoint-modified',
  'parameter-added',
  'parameter-removed',
  'parameter-modified',
  'response-added',
  'response-removed',
  'response-modified',
  'auth-added',
  'auth-removed',
  'auth-modified',
  'error-added',
  'error-removed',
  'error-modified',
  'metadata-changed',
]);

export type ChangeCategory = z.infer<typeof ChangeCategorySchema>;

/**
 * Individual change detection
 */
export const CompatibilityChangeSchema = z.object({
  /** Unique change identifier */
  changeId: z.string().uuid(),
  /** Change category */
  category: ChangeCategorySchema,
  /** Change severity */
  severity: ChangeSeveritySchema,
  /** Path to the changed element (e.g., "types.User.properties.email") */
  path: z.string(),
  /** Brief description of the change */
  description: z.string(),
  /** Value in source schema (if applicable) */
  sourceValue: z.unknown().optional(),
  /** Value in target schema (if applicable) */
  targetValue: z.unknown().optional(),
  /** Detailed diff (if requested) */
  diff: z.string().optional(),
  /** Impact assessment */
  impact: z.object({
    /** Affected SDK methods/types */
    affectedComponents: z.array(z.string()),
    /** Affected languages */
    affectedLanguages: z.array(z.string()),
    /** Migration complexity (1-5) */
    migrationComplexity: z.number().int().min(1).max(5),
  }),
  /** Upgrade guidance (if requested) */
  upgradeGuidance: z.string().optional(),
});

export type CompatibilityChange = z.infer<typeof CompatibilityChangeSchema>;

/**
 * Overall compatibility verdict
 */
export const CompatibilityVerdictSchema = z.enum([
  'fully-compatible',     // No breaking changes
  'backwards-compatible', // Breaking additions only, existing code works
  'breaking',             // Breaking changes detected
  'incompatible',         // Major structural incompatibility
]);

export type CompatibilityVerdict = z.infer<typeof CompatibilityVerdictSchema>;

/**
 * Version recommendation based on analysis
 */
export const VersionRecommendationSchema = z.object({
  /** Recommended version bump type */
  bumpType: z.enum(['major', 'minor', 'patch', 'none']),
  /** Recommended new version */
  recommendedVersion: SemverVersionSchema,
  /** Rationale for recommendation */
  rationale: z.string(),
});

export type VersionRecommendation = z.infer<typeof VersionRecommendationSchema>;

/**
 * Compatibility analysis summary
 */
export const CompatibilitySummarySchema = z.object({
  /** Total number of changes detected */
  totalChanges: z.number().int().nonnegative(),
  /** Breaking changes count */
  breakingChanges: z.number().int().nonnegative(),
  /** Non-breaking changes count */
  nonBreakingChanges: z.number().int().nonnegative(),
  /** Patch changes count */
  patchChanges: z.number().int().nonnegative(),
  /** Informational changes count */
  informationalChanges: z.number().int().nonnegative(),
  /** Changes by category */
  changesByCategory: z.record(z.number().int().nonnegative()),
});

export type CompatibilitySummary = z.infer<typeof CompatibilitySummarySchema>;

/**
 * Complete compatibility analysis response
 */
export const CompatibilityAnalysisResponseSchema = z.object({
  /** Original request ID */
  requestId: z.string().uuid(),
  /** Analysis success status */
  success: z.boolean(),
  /** Source schema version info */
  sourceVersion: SchemaVersionReferenceSchema,
  /** Target schema version info */
  targetVersion: SchemaVersionReferenceSchema,
  /** Overall compatibility verdict */
  verdict: CompatibilityVerdictSchema,
  /** Summary statistics */
  summary: CompatibilitySummarySchema,
  /** Detailed changes */
  changes: z.array(CompatibilityChangeSchema),
  /** Version recommendation */
  versionRecommendation: VersionRecommendationSchema,
  /** Analysis metadata */
  analysisMetadata: z.object({
    /** Agent version */
    agentVersion: z.string(),
    /** Analysis timestamp */
    analyzedAt: z.string().datetime(),
    /** Analysis duration in ms */
    durationMs: z.number().nonnegative(),
    /** Determinism hash */
    determinismHash: z.string(),
  }),
  /** Warnings */
  warnings: z.array(z.string()),
  /** Errors (if success=false) */
  errors: z.array(z.string()),
});

export type CompatibilityAnalysisResponse = z.infer<typeof CompatibilityAnalysisResponseSchema>;

// =============================================================================
// 4. DECISION EVENT MAPPING
// =============================================================================

/**
 * Decision types for Version Compatibility Agent
 */
export enum VersionCompatibilityDecisionType {
  /** Primary decision: version compatibility analysis */
  VERSION_COMPATIBILITY_ANALYSIS = 'version_compatibility_analysis',
  /** Type comparison decision */
  TYPE_COMPARISON = 'type_comparison',
  /** Endpoint comparison decision */
  ENDPOINT_COMPARISON = 'endpoint_comparison',
  /** Breaking change detection */
  BREAKING_CHANGE_DETECTION = 'breaking_change_detection',
  /** Version recommendation decision */
  VERSION_RECOMMENDATION = 'version_recommendation',
}

/**
 * Confidence semantics for compatibility analysis
 * - DETERMINISTIC: Same schemas always produce same analysis
 * - HEURISTIC: Best-effort analysis with confidence score
 * - CONSTRAINT_BASED: Analysis based on semver constraints
 */
export enum CompatibilityConfidenceSemantics {
  /** Output is deterministic and reproducible */
  DETERMINISTIC = 'deterministic',
  /** Output uses heuristic analysis */
  HEURISTIC = 'heuristic',
  /** Output satisfies semver constraints */
  CONSTRAINT_BASED = 'constraint_based',
}

/**
 * Decision event for version compatibility analysis
 */
export const VersionCompatibilityDecisionEventSchema = z.object({
  /** Event unique identifier */
  eventId: z.string().uuid(),
  /** Decision type */
  decisionType: z.nativeEnum(VersionCompatibilityDecisionType),
  /** Agent identifier */
  agentId: z.literal('version-compatibility-agent'),
  /** Agent version */
  agentVersion: z.string(),
  /** Request ID this decision relates to */
  requestId: z.string().uuid(),
  /** Timestamp of decision */
  timestamp: z.string().datetime(),
  /** Confidence semantics */
  confidenceSemantics: z.nativeEnum(CompatibilityConfidenceSemantics),
  /** Confidence score (0.0-1.0) */
  confidenceScore: z.number().min(0).max(1),
  /** Input hash for reproducibility */
  inputHash: z.string(),
  /** Output hash for verification */
  outputHash: z.string(),
  /** Decision rationale */
  rationale: z.string(),
  /** Constraints applied during analysis */
  constraintsApplied: z.array(z.string()),
  /** Execution reference */
  executionRef: z.string().optional(),
  /** Decision metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type VersionCompatibilityDecisionEvent = z.infer<typeof VersionCompatibilityDecisionEventSchema>;

// =============================================================================
// 5. CLI CONTRACT
// =============================================================================

/**
 * CLI invocation shape for Version Compatibility Agent
 *
 * Primary command: validate
 *
 * Usage:
 *   llm-forge validate <source> <target> [options]
 *
 * Arguments:
 *   source                   Source schema (JSON) - baseline version
 *   target                   Target schema (JSON) - new version
 *
 * Options:
 *   -s, --strictness <level>   Strictness level (strict, standard, lenient)
 *   -o, --output <file>        Output report file (JSON)
 *   --no-guidance              Disable upgrade guidance
 *   --detailed-diff            Include detailed diff for each change
 *   --categories <cats...>     Categories to analyze (types, endpoints, auth, errors)
 *   --ignore <paths...>        Paths to ignore
 *   --emit-events              Emit DecisionEvents to ruvector-service
 *   -v, --verbose              Verbose output
 *   --json                     Output as JSON
 */
export const CLIContract = {
  command: 'validate',
  arguments: [
    {
      name: 'source',
      description: 'Source schema (JSON) - baseline version',
      required: true,
    },
    {
      name: 'target',
      description: 'Target schema (JSON) - new version',
      required: true,
    },
  ],
  options: [
    {
      flag: '-s, --strictness <level>',
      description: 'Strictness level',
      choices: ['strict', 'standard', 'lenient'],
      default: 'standard',
    },
    {
      flag: '-o, --output <file>',
      description: 'Output report file (JSON)',
    },
    {
      flag: '--no-guidance',
      description: 'Disable upgrade guidance',
    },
    {
      flag: '--detailed-diff',
      description: 'Include detailed diff for each change',
    },
    {
      flag: '--categories <cats...>',
      description: 'Categories to analyze',
      default: ['types', 'endpoints', 'authentication', 'errors'],
    },
    {
      flag: '--ignore <paths...>',
      description: 'Paths to ignore',
    },
    {
      flag: '--emit-events',
      description: 'Emit DecisionEvents to ruvector-service',
    },
    {
      flag: '-v, --verbose',
      description: 'Verbose output',
    },
    {
      flag: '--json',
      description: 'Output as JSON',
    },
  ],
} as const;

// =============================================================================
// 6. GENERATION / TRANSLATION / VALIDATION CLASSIFICATION
// =============================================================================

/**
 * Agent classification: VALIDATION / COMPATIBILITY
 *
 * This agent is classified as VALIDATION/COMPATIBILITY because:
 * 1. It analyzes existing schemas for compatibility
 * 2. It does NOT produce new artifacts (code, SDKs)
 * 3. It does NOT translate between formats
 * 4. It validates version compatibility and provides advisory output
 *
 * The analysis is:
 * - Deterministic: Same schemas → Same compatibility report (hash-verifiable)
 * - Stateless: No persistent state between invocations
 * - Idempotent: Multiple invocations with same input produce identical output
 * - Advisory: Output is for guidance only, not enforcement
 */
export const AGENT_CLASSIFICATION = {
  type: 'VALIDATION' as const,
  subtype: 'COMPATIBILITY' as const,
  deterministic: true,
  stateless: true,
  idempotent: true,
  advisory: true,
  characteristics: [
    'Compares schema versions for compatibility',
    'Detects breaking vs non-breaking changes',
    'Emits compatibility reports (advisory only)',
    'Provides upgrade guidance (no enforcement)',
    'Output is deterministic and reproducible',
    'No side effects beyond report generation',
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
  'MUST NEVER execute code',
  'MUST NEVER apply migrations',
  'MUST NEVER modify schemas',
  'MUST NEVER upgrade/downgrade versions',

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
  'MUST NEVER enforce compatibility policies',
  'MUST NEVER block deployments',
  'MUST NEVER modify release pipelines',

  // Secrets
  'MUST NEVER access API keys',
  'MUST NEVER log sensitive schema data',
  'MUST NEVER persist credentials',

  // Enforcement
  'MUST NEVER reject schema changes',
  'MUST NEVER gate releases',
  'MUST NEVER enforce version bumps',
] as const;

// =============================================================================
// 8. FAILURE MODES
// =============================================================================

/**
 * Known failure modes and handling
 */
export enum CompatibilityFailureMode {
  /** Invalid source schema */
  INVALID_SOURCE_SCHEMA = 'INVALID_SOURCE_SCHEMA',
  /** Invalid target schema */
  INVALID_TARGET_SCHEMA = 'INVALID_TARGET_SCHEMA',
  /** Schema version mismatch */
  SCHEMA_VERSION_MISMATCH = 'SCHEMA_VERSION_MISMATCH',
  /** Incompatible provider IDs */
  INCOMPATIBLE_PROVIDERS = 'INCOMPATIBLE_PROVIDERS',
  /** Analysis timeout */
  ANALYSIS_TIMEOUT = 'ANALYSIS_TIMEOUT',
  /** Resource exhaustion */
  RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION',
  /** Type resolution failure */
  TYPE_RESOLUTION_FAILURE = 'TYPE_RESOLUTION_FAILURE',
  /** Circular reference detected */
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
}

export const FailureModeHandling: Record<
  CompatibilityFailureMode,
  { recoverable: boolean; action: string }
> = {
  [CompatibilityFailureMode.INVALID_SOURCE_SCHEMA]: {
    recoverable: false,
    action: 'Return validation errors for source schema',
  },
  [CompatibilityFailureMode.INVALID_TARGET_SCHEMA]: {
    recoverable: false,
    action: 'Return validation errors for target schema',
  },
  [CompatibilityFailureMode.SCHEMA_VERSION_MISMATCH]: {
    recoverable: true,
    action: 'Analyze with version mismatch warning',
  },
  [CompatibilityFailureMode.INCOMPATIBLE_PROVIDERS]: {
    recoverable: false,
    action: 'Return provider compatibility error',
  },
  [CompatibilityFailureMode.ANALYSIS_TIMEOUT]: {
    recoverable: false,
    action: 'Return timeout with partial analysis if available',
  },
  [CompatibilityFailureMode.RESOURCE_EXHAUSTION]: {
    recoverable: false,
    action: 'Return resource limit error',
  },
  [CompatibilityFailureMode.TYPE_RESOLUTION_FAILURE]: {
    recoverable: true,
    action: 'Mark unresolved types as unknown in analysis',
  },
  [CompatibilityFailureMode.CIRCULAR_REFERENCE]: {
    recoverable: true,
    action: 'Detect and break circular references with warning',
  },
};

// =============================================================================
// 9. VERSIONING RULES
// =============================================================================

/**
 * Versioning rules for compatibility analysis
 */
export const VERSIONING_RULES = {
  /** Agent version follows semver */
  agentVersionFormat: 'semver',
  /** Input schemas must have valid versions */
  schemaVersionFormat: 'semver',
  /** Breaking change detection rules */
  breakingChangeRules: [
    'Removal of public types = breaking',
    'Removal of required properties = breaking',
    'Removal of endpoints = breaking',
    'Addition of required properties = breaking',
    'Type narrowing = breaking',
    'Response type changes = breaking',
  ],
  /** Non-breaking change rules */
  nonBreakingChangeRules: [
    'Addition of optional properties = non-breaking',
    'Addition of new endpoints = non-breaking',
    'Addition of new types = non-breaking',
    'Type widening = non-breaking',
    'Documentation changes = non-breaking',
  ],
  /** Determinism hash format */
  determinismHashFormat: 'SHA-256 of normalized schema diff',
} as const;

// =============================================================================
// 10. PERSISTENCE RULES (ruvector-service)
// =============================================================================

/**
 * Data that MUST be persisted to ruvector-service
 */
export const PERSISTED_DATA = [
  'DecisionEvent (all analysis decisions)',
  'Compatibility verdict and summary',
  'Breaking change details',
  'Version recommendations',
  'Input/output hashes for reproducibility',
  'Analysis duration metrics',
  'Error events with context',
] as const;

/**
 * Data that MUST NOT be persisted
 */
export const NON_PERSISTED_DATA = [
  'Full schema content (reference by hash only)',
  'Detailed diff content (too large)',
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
    consumedData: ['Compatibility verdict', 'Version recommendation'],
    purpose: 'Advisory input for release decisions',
  },
  {
    system: 'SDK Generator Agent',
    consumedData: ['Breaking change list', 'Migration complexity'],
    purpose: 'Inform generation strategy for version upgrades',
  },
  {
    system: 'Schema Registry',
    consumedData: ['Compatibility metadata', 'Version info'],
    purpose: 'Version tracking and history',
  },
  {
    system: 'Developer Documentation',
    consumedData: ['Upgrade guidance', 'Change descriptions'],
    purpose: 'Changelog generation',
  },
] as const;

// =============================================================================
// 12. AGENT VERSION
// =============================================================================

export const AGENT_VERSION = '1.0.0';
export const AGENT_ID = 'version-compatibility-agent';
