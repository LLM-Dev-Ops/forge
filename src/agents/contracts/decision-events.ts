/**
 * Decision Events for LLM-Forge Agents
 *
 * This module defines the DecisionEvent types that are persisted to ruvector-service
 * for observability, tracing, and reproducibility verification.
 *
 * @module agents/contracts/decision-events
 */

import { z } from 'zod';

// =============================================================================
// BASE DECISION EVENT
// =============================================================================

/**
 * Base decision event schema that all agent decisions inherit from
 */
export const BaseDecisionEventSchema = z.object({
  /** Unique event identifier (UUIDv4) */
  eventId: z.string().uuid(),

  /** Agent that made the decision */
  agentId: z.string(),

  /** Agent version (semver) */
  agentVersion: z.string(),

  /** Request ID this decision relates to */
  requestId: z.string().uuid(),

  /** Event timestamp (ISO 8601) */
  timestamp: z.string().datetime(),

  /** Event type discriminator */
  eventType: z.string(),

  /** Confidence score (0.0 to 1.0) */
  confidenceScore: z.number().min(0).max(1),

  /** Confidence semantics */
  confidenceSemantics: z.enum(['deterministic', 'heuristic', 'constraint_based']),

  /** Input hash for reproducibility (SHA-256) */
  inputHash: z.string(),

  /** Output hash for verification (SHA-256) */
  outputHash: z.string(),

  /** Human-readable decision rationale */
  rationale: z.string(),

  /** Tracing context */
  tracing: z
    .object({
      traceId: z.string().optional(),
      spanId: z.string().optional(),
      parentSpanId: z.string().optional(),
    })
    .optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type BaseDecisionEvent = z.infer<typeof BaseDecisionEventSchema>;

// =============================================================================
// SDK GENERATION EVENTS
// =============================================================================

/**
 * SDK generation initiated event
 */
export const SDKGenerationInitiatedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('sdk_generation.initiated'),
  agentId: z.literal('sdk-generator-agent'),
  payload: z.object({
    targetLanguages: z.array(z.string()),
    schemaVersion: z.string(),
    packageName: z.string(),
    packageVersion: z.string(),
    typeCount: z.number().int().nonnegative(),
    endpointCount: z.number().int().nonnegative(),
  }),
});

export type SDKGenerationInitiatedEvent = z.infer<typeof SDKGenerationInitiatedEventSchema>;

/**
 * SDK generation completed event
 */
export const SDKGenerationCompletedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('sdk_generation.completed'),
  agentId: z.literal('sdk-generator-agent'),
  payload: z.object({
    success: z.boolean(),
    targetLanguages: z.array(z.string()),
    totalFiles: z.number().int().nonnegative(),
    totalSizeBytes: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    determinismHash: z.string(),
  }),
});

export type SDKGenerationCompletedEvent = z.infer<typeof SDKGenerationCompletedEventSchema>;

/**
 * SDK generation failed event
 */
export const SDKGenerationFailedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('sdk_generation.failed'),
  agentId: z.literal('sdk-generator-agent'),
  payload: z.object({
    failureMode: z.string(),
    errorMessage: z.string(),
    errorCode: z.string().optional(),
    recoverable: z.boolean(),
    partialResults: z.boolean(),
  }),
});

export type SDKGenerationFailedEvent = z.infer<typeof SDKGenerationFailedEventSchema>;

/**
 * Type mapping decision event
 */
export const TypeMappingDecisionEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('sdk_generation.type_mapping'),
  agentId: z.literal('sdk-generator-agent'),
  payload: z.object({
    sourceType: z.string(),
    targetLanguage: z.string(),
    targetType: z.string(),
    mappingStrategy: z.enum(['exact', 'approximate', 'fallback']),
    imports: z.array(z.string()),
  }),
});

export type TypeMappingDecisionEvent = z.infer<typeof TypeMappingDecisionEventSchema>;

/**
 * Language generation decision event
 */
export const LanguageGenerationDecisionEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('sdk_generation.language_generation'),
  agentId: z.literal('sdk-generator-agent'),
  payload: z.object({
    language: z.string(),
    filesGenerated: z.number().int().nonnegative(),
    totalSizeBytes: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    templateUsed: z.string().optional(),
  }),
});

export type LanguageGenerationDecisionEvent = z.infer<
  typeof LanguageGenerationDecisionEventSchema
>;

// =============================================================================
// UNION OF ALL SDK GENERATOR EVENTS
// =============================================================================

export const SDKGeneratorEventSchema = z.discriminatedUnion('eventType', [
  SDKGenerationInitiatedEventSchema,
  SDKGenerationCompletedEventSchema,
  SDKGenerationFailedEventSchema,
  TypeMappingDecisionEventSchema,
  LanguageGenerationDecisionEventSchema,
]);

export type SDKGeneratorEvent = z.infer<typeof SDKGeneratorEventSchema>;

// =============================================================================
// TELEMETRY EVENT
// =============================================================================

/**
 * Telemetry event for performance monitoring
 */
export const TelemetryEventSchema = z.object({
  /** Event ID */
  eventId: z.string().uuid(),
  /** Agent ID */
  agentId: z.string(),
  /** Request ID */
  requestId: z.string().uuid(),
  /** Timestamp */
  timestamp: z.string().datetime(),
  /** Event type */
  eventType: z.literal('telemetry'),
  /** Metrics */
  metrics: z.object({
    /** Total processing duration in ms */
    totalDurationMs: z.number().nonnegative(),
    /** Validation duration in ms */
    validationDurationMs: z.number().nonnegative().optional(),
    /** Generation duration in ms */
    generationDurationMs: z.number().nonnegative().optional(),
    /** Memory usage in bytes */
    memoryUsageBytes: z.number().int().nonnegative().optional(),
    /** CPU usage percentage */
    cpuUsagePercent: z.number().min(0).max(100).optional(),
  }),
  /** Resource utilization */
  resources: z
    .object({
      peakMemoryBytes: z.number().int().nonnegative().optional(),
      templateRenderCount: z.number().int().nonnegative().optional(),
      typeMappingCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

// =============================================================================
// EVENT FACTORY
// =============================================================================

import { createHash, randomUUID } from 'crypto';

/**
 * Factory for creating decision events
 */
export class DecisionEventFactory {
  private agentId: string;
  private agentVersion: string;

  constructor(agentId: string, agentVersion: string) {
    this.agentId = agentId;
    this.agentVersion = agentVersion;
  }

  /**
   * Create a base decision event with common fields
   */
  private createBase(
    requestId: string,
    inputHash: string,
    outputHash: string,
    confidenceScore: number,
    rationale: string,
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): Omit<BaseDecisionEvent, 'eventType'> {
    return {
      eventId: randomUUID(),
      agentId: this.agentId,
      agentVersion: this.agentVersion,
      requestId,
      timestamp: new Date().toISOString(),
      confidenceScore,
      confidenceSemantics: confidenceScore === 1.0 ? 'deterministic' : 'heuristic',
      inputHash,
      outputHash,
      rationale,
      tracing: tracingContext,
    };
  }

  /**
   * Create SDK generation initiated event
   */
  createInitiatedEvent(
    requestId: string,
    inputHash: string,
    payload: SDKGenerationInitiatedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): SDKGenerationInitiatedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        '', // No output yet
        1.0,
        `Initiated SDK generation for ${payload.targetLanguages.length} language(s)`,
        tracingContext
      ),
      eventType: 'sdk_generation.initiated',
      agentId: 'sdk-generator-agent',
      payload,
    } as SDKGenerationInitiatedEvent;
  }

  /**
   * Create SDK generation completed event
   */
  createCompletedEvent(
    requestId: string,
    inputHash: string,
    outputHash: string,
    payload: SDKGenerationCompletedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): SDKGenerationCompletedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        outputHash,
        1.0,
        `SDK generation ${payload.success ? 'completed successfully' : 'completed with errors'}`,
        tracingContext
      ),
      eventType: 'sdk_generation.completed',
      agentId: 'sdk-generator-agent',
      payload,
    } as SDKGenerationCompletedEvent;
  }

  /**
   * Create SDK generation failed event
   */
  createFailedEvent(
    requestId: string,
    inputHash: string,
    payload: SDKGenerationFailedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): SDKGenerationFailedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        '',
        0.0,
        `SDK generation failed: ${payload.failureMode}`,
        tracingContext
      ),
      eventType: 'sdk_generation.failed',
      agentId: 'sdk-generator-agent',
      payload,
    } as SDKGenerationFailedEvent;
  }

  /**
   * Create type mapping decision event
   */
  createTypeMappingEvent(
    requestId: string,
    inputHash: string,
    payload: TypeMappingDecisionEvent['payload'],
    confidenceScore: number,
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): TypeMappingDecisionEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        this.hashString(payload.targetType),
        confidenceScore,
        `Mapped ${payload.sourceType} to ${payload.targetType} using ${payload.mappingStrategy} strategy`,
        tracingContext
      ),
      eventType: 'sdk_generation.type_mapping',
      agentId: 'sdk-generator-agent',
      payload,
    } as TypeMappingDecisionEvent;
  }

  /**
   * Create language generation decision event
   */
  createLanguageGenerationEvent(
    requestId: string,
    inputHash: string,
    outputHash: string,
    payload: LanguageGenerationDecisionEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): LanguageGenerationDecisionEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        outputHash,
        1.0, // Language generation is deterministic
        `Generated ${payload.filesGenerated} files for ${payload.language}`,
        tracingContext
      ),
      eventType: 'sdk_generation.language_generation',
      agentId: 'sdk-generator-agent',
      payload,
    } as LanguageGenerationDecisionEvent;
  }

  /**
   * Create telemetry event
   */
  createTelemetryEvent(
    requestId: string,
    metrics: TelemetryEvent['metrics'],
    resources?: TelemetryEvent['resources']
  ): TelemetryEvent {
    return {
      eventId: randomUUID(),
      agentId: this.agentId,
      requestId,
      timestamp: new Date().toISOString(),
      eventType: 'telemetry',
      metrics,
      resources,
    };
  }

  /**
   * Hash a string using SHA-256
   */
  private hashString(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}

/**
 * Factory for creating API Translation decision events
 */
export class TranslationEventFactory {
  private agentId: string;
  private agentVersion: string;

  constructor(agentVersion: string) {
    this.agentId = 'api-translation-agent';
    this.agentVersion = agentVersion;
  }

  /**
   * Create a base decision event with common fields
   */
  private createBase(
    requestId: string,
    inputHash: string,
    outputHash: string,
    confidenceScore: number,
    rationale: string,
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): Omit<BaseDecisionEvent, 'eventType'> {
    return {
      eventId: randomUUID(),
      agentId: this.agentId,
      agentVersion: this.agentVersion,
      requestId,
      timestamp: new Date().toISOString(),
      confidenceScore,
      confidenceSemantics: confidenceScore === 1.0 ? 'deterministic' : 'heuristic',
      inputHash,
      outputHash,
      rationale,
      tracing: tracingContext,
    };
  }

  /**
   * Create API translation initiated event
   */
  createInitiatedEvent(
    requestId: string,
    inputHash: string,
    payload: APITranslationInitiatedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): APITranslationInitiatedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        '', // No output yet
        1.0,
        `Initiated API translation from ${payload.sourceFormat} to ${payload.targetFormat}`,
        tracingContext
      ),
      eventType: 'api_translation.initiated',
      agentId: 'api-translation-agent',
      payload,
    } as APITranslationInitiatedEvent;
  }

  /**
   * Create API translation completed event
   */
  createCompletedEvent(
    requestId: string,
    inputHash: string,
    outputHash: string,
    payload: APITranslationCompletedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): APITranslationCompletedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        outputHash,
        payload.overallConfidence,
        `API translation ${payload.success ? 'completed successfully' : 'completed with errors'}`,
        tracingContext
      ),
      eventType: 'api_translation.completed',
      agentId: 'api-translation-agent',
      payload,
    } as APITranslationCompletedEvent;
  }

  /**
   * Create API translation failed event
   */
  createFailedEvent(
    requestId: string,
    inputHash: string,
    payload: APITranslationFailedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): APITranslationFailedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        '',
        0.0,
        `API translation failed: ${payload.failureMode}`,
        tracingContext
      ),
      eventType: 'api_translation.failed',
      agentId: 'api-translation-agent',
      payload,
    } as APITranslationFailedEvent;
  }

  /**
   * Create format conversion decision event
   */
  createFormatConversionEvent(
    requestId: string,
    inputHash: string,
    payload: FormatConversionDecisionEvent['payload'],
    confidenceScore: number,
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): FormatConversionDecisionEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        this.hashString(payload.targetId),
        confidenceScore,
        `Converted ${payload.sourceId} (${payload.sourceFormat}) to ${payload.targetId} (${payload.targetFormat})`,
        tracingContext
      ),
      eventType: 'api_translation.format_conversion',
      agentId: 'api-translation-agent',
      payload,
    } as FormatConversionDecisionEvent;
  }

  /**
   * Create compatibility detection event
   */
  createCompatibilityDetectionEvent(
    requestId: string,
    inputHash: string,
    payload: CompatibilityDetectionEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): CompatibilityDetectionEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        '',
        payload.blockedByIssues ? 0.0 : 1.0,
        `Detected ${payload.issueCount} compatibility issues (${payload.errorCount} errors, ${payload.warningCount} warnings)`,
        tracingContext
      ),
      eventType: 'api_translation.compatibility_detection',
      agentId: 'api-translation-agent',
      payload,
    } as CompatibilityDetectionEvent;
  }

  /**
   * Hash a string using SHA-256
   */
  private hashString(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}

/**
 * Calculate SHA-256 hash of an object
 */
export function hashObject(obj: unknown): string {
  const normalized = JSON.stringify(obj, Object.keys(obj as object).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

// =============================================================================
// API TRANSLATION EVENTS
// =============================================================================

/**
 * API translation initiated event
 */
export const APITranslationInitiatedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('api_translation.initiated'),
  agentId: z.literal('api-translation-agent'),
  payload: z.object({
    sourceFormat: z.enum(['rest', 'sdk', 'cli']),
    targetFormat: z.enum(['rest', 'sdk', 'cli']),
    sourceElementCount: z.number().int().nonnegative(),
    schemaVersion: z.string().optional(),
    strict: z.boolean(),
  }),
});

export type APITranslationInitiatedEvent = z.infer<typeof APITranslationInitiatedEventSchema>;

/**
 * API translation completed event
 */
export const APITranslationCompletedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('api_translation.completed'),
  agentId: z.literal('api-translation-agent'),
  payload: z.object({
    success: z.boolean(),
    sourceFormat: z.enum(['rest', 'sdk', 'cli']),
    targetFormat: z.enum(['rest', 'sdk', 'cli']),
    translatedElementCount: z.number().int().nonnegative(),
    mappingCount: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    overallConfidence: z.number().min(0).max(1),
    warningCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    determinismHash: z.string(),
  }),
});

export type APITranslationCompletedEvent = z.infer<typeof APITranslationCompletedEventSchema>;

/**
 * API translation failed event
 */
export const APITranslationFailedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('api_translation.failed'),
  agentId: z.literal('api-translation-agent'),
  payload: z.object({
    failureMode: z.string(),
    errorMessage: z.string(),
    errorCode: z.string().optional(),
    recoverable: z.boolean(),
    partialResults: z.boolean(),
    sourceFormat: z.enum(['rest', 'sdk', 'cli']),
    targetFormat: z.enum(['rest', 'sdk', 'cli']),
  }),
});

export type APITranslationFailedEvent = z.infer<typeof APITranslationFailedEventSchema>;

/**
 * Format conversion decision event
 */
export const FormatConversionDecisionEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('api_translation.format_conversion'),
  agentId: z.literal('api-translation-agent'),
  payload: z.object({
    sourceId: z.string(),
    sourceFormat: z.enum(['rest', 'sdk', 'cli']),
    targetId: z.string(),
    targetFormat: z.enum(['rest', 'sdk', 'cli']),
    transformation: z.string(),
    semanticLoss: z.string().optional(),
  }),
});

export type FormatConversionDecisionEvent = z.infer<typeof FormatConversionDecisionEventSchema>;

/**
 * Compatibility detection decision event
 */
export const CompatibilityDetectionEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('api_translation.compatibility_detection'),
  agentId: z.literal('api-translation-agent'),
  payload: z.object({
    issueCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    infoCount: z.number().int().nonnegative(),
    blockedByIssues: z.boolean(),
  }),
});

export type CompatibilityDetectionEvent = z.infer<typeof CompatibilityDetectionEventSchema>;

// =============================================================================
// UNION OF ALL API TRANSLATION EVENTS
// =============================================================================

export const APITranslationEventSchema = z.discriminatedUnion('eventType', [
  APITranslationInitiatedEventSchema,
  APITranslationCompletedEventSchema,
  APITranslationFailedEventSchema,
  FormatConversionDecisionEventSchema,
  CompatibilityDetectionEventSchema,
]);

export type APITranslationEvent = z.infer<typeof APITranslationEventSchema>;

// =============================================================================
// VERSION COMPATIBILITY EVENTS
// =============================================================================

/**
 * Version compatibility analysis initiated event
 */
export const VersionCompatibilityInitiatedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('version_compatibility_analysis.initiated'),
  agentId: z.literal('version-compatibility-agent'),
  payload: z.object({
    sourceVersion: z.string(),
    targetVersion: z.string(),
    sourceSchemaHash: z.string(),
    targetSchemaHash: z.string(),
    strictness: z.enum(['strict', 'standard', 'lenient']),
    categoriesToAnalyze: z.array(z.string()),
  }),
});

export type VersionCompatibilityInitiatedEvent = z.infer<typeof VersionCompatibilityInitiatedEventSchema>;

/**
 * Version compatibility analysis completed event
 */
export const VersionCompatibilityCompletedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('version_compatibility_analysis.completed'),
  agentId: z.literal('version-compatibility-agent'),
  payload: z.object({
    success: z.boolean(),
    verdict: z.enum(['fully-compatible', 'backwards-compatible', 'breaking', 'incompatible']),
    totalChanges: z.number().int().nonnegative(),
    breakingChanges: z.number().int().nonnegative(),
    nonBreakingChanges: z.number().int().nonnegative(),
    recommendedBump: z.enum(['major', 'minor', 'patch', 'none']),
    durationMs: z.number().nonnegative(),
    determinismHash: z.string(),
  }),
});

export type VersionCompatibilityCompletedEvent = z.infer<typeof VersionCompatibilityCompletedEventSchema>;

/**
 * Version compatibility analysis failed event
 */
export const VersionCompatibilityFailedEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('version_compatibility_analysis.failed'),
  agentId: z.literal('version-compatibility-agent'),
  payload: z.object({
    failureMode: z.string(),
    errorMessage: z.string(),
    errorCode: z.string().optional(),
    recoverable: z.boolean(),
    partialAnalysis: z.boolean(),
  }),
});

export type VersionCompatibilityFailedEvent = z.infer<typeof VersionCompatibilityFailedEventSchema>;

/**
 * Breaking change detection event
 */
export const BreakingChangeDetectionEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('version_compatibility_analysis.breaking_change'),
  agentId: z.literal('version-compatibility-agent'),
  payload: z.object({
    changeId: z.string().uuid(),
    category: z.string(),
    path: z.string(),
    severity: z.enum(['breaking', 'non-breaking', 'patch', 'informational']),
    description: z.string(),
    migrationComplexity: z.number().int().min(1).max(5),
    affectedComponents: z.array(z.string()),
  }),
});

export type BreakingChangeDetectionEvent = z.infer<typeof BreakingChangeDetectionEventSchema>;

/**
 * Type comparison decision event
 */
export const TypeComparisonEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('version_compatibility_analysis.type_comparison'),
  agentId: z.literal('version-compatibility-agent'),
  payload: z.object({
    typeName: z.string(),
    sourceTypeId: z.string().optional(),
    targetTypeId: z.string().optional(),
    comparisonResult: z.enum(['identical', 'compatible', 'breaking', 'removed', 'added']),
    changesDetected: z.number().int().nonnegative(),
  }),
});

export type TypeComparisonEvent = z.infer<typeof TypeComparisonEventSchema>;

/**
 * Endpoint comparison decision event
 */
export const EndpointComparisonEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('version_compatibility_analysis.endpoint_comparison'),
  agentId: z.literal('version-compatibility-agent'),
  payload: z.object({
    endpointPath: z.string(),
    method: z.string(),
    sourceEndpointId: z.string().optional(),
    targetEndpointId: z.string().optional(),
    comparisonResult: z.enum(['identical', 'compatible', 'breaking', 'removed', 'added']),
    parameterChanges: z.number().int().nonnegative(),
    responseChanges: z.number().int().nonnegative(),
  }),
});

export type EndpointComparisonEvent = z.infer<typeof EndpointComparisonEventSchema>;

/**
 * Version recommendation decision event
 */
export const VersionRecommendationEventSchema = BaseDecisionEventSchema.extend({
  eventType: z.literal('version_compatibility_analysis.version_recommendation'),
  agentId: z.literal('version-compatibility-agent'),
  payload: z.object({
    currentVersion: z.string(),
    recommendedBump: z.enum(['major', 'minor', 'patch', 'none']),
    recommendedVersion: z.string(),
    rationale: z.string(),
    breakingChangeCount: z.number().int().nonnegative(),
    constraintsApplied: z.array(z.string()),
  }),
});

export type VersionRecommendationEvent = z.infer<typeof VersionRecommendationEventSchema>;

// =============================================================================
// UNION OF ALL VERSION COMPATIBILITY EVENTS
// =============================================================================

export const VersionCompatibilityEventSchema = z.discriminatedUnion('eventType', [
  VersionCompatibilityInitiatedEventSchema,
  VersionCompatibilityCompletedEventSchema,
  VersionCompatibilityFailedEventSchema,
  BreakingChangeDetectionEventSchema,
  TypeComparisonEventSchema,
  EndpointComparisonEventSchema,
  VersionRecommendationEventSchema,
]);

export type VersionCompatibilityEvent = z.infer<typeof VersionCompatibilityEventSchema>;

// =============================================================================
// VERSION COMPATIBILITY EVENT FACTORY
// =============================================================================

/**
 * Factory for creating version compatibility decision events
 */
export class VersionCompatibilityEventFactory {
  private agentId = 'version-compatibility-agent';
  private agentVersion: string;

  constructor(agentVersion: string) {
    this.agentVersion = agentVersion;
  }

  /**
   * Create base event fields
   */
  private createBase(
    requestId: string,
    inputHash: string,
    outputHash: string,
    confidenceScore: number,
    rationale: string,
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): Omit<BaseDecisionEvent, 'eventType'> {
    return {
      eventId: randomUUID(),
      agentId: this.agentId,
      agentVersion: this.agentVersion,
      requestId,
      timestamp: new Date().toISOString(),
      confidenceScore,
      confidenceSemantics: confidenceScore === 1.0 ? 'deterministic' : 'constraint_based',
      inputHash,
      outputHash,
      rationale,
      tracing: tracingContext,
    };
  }

  /**
   * Create analysis initiated event
   */
  createInitiatedEvent(
    requestId: string,
    inputHash: string,
    payload: VersionCompatibilityInitiatedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): VersionCompatibilityInitiatedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        '',
        1.0,
        `Initiated version compatibility analysis: ${payload.sourceVersion} → ${payload.targetVersion}`,
        tracingContext
      ),
      eventType: 'version_compatibility_analysis.initiated',
      agentId: 'version-compatibility-agent',
      payload,
    } as VersionCompatibilityInitiatedEvent;
  }

  /**
   * Create analysis completed event
   */
  createCompletedEvent(
    requestId: string,
    inputHash: string,
    outputHash: string,
    payload: VersionCompatibilityCompletedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): VersionCompatibilityCompletedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        outputHash,
        1.0,
        `Compatibility analysis completed: ${payload.verdict} (${payload.breakingChanges} breaking changes)`,
        tracingContext
      ),
      eventType: 'version_compatibility_analysis.completed',
      agentId: 'version-compatibility-agent',
      payload,
    } as VersionCompatibilityCompletedEvent;
  }

  /**
   * Create analysis failed event
   */
  createFailedEvent(
    requestId: string,
    inputHash: string,
    payload: VersionCompatibilityFailedEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): VersionCompatibilityFailedEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        '',
        0.0,
        `Compatibility analysis failed: ${payload.failureMode}`,
        tracingContext
      ),
      eventType: 'version_compatibility_analysis.failed',
      agentId: 'version-compatibility-agent',
      payload,
    } as VersionCompatibilityFailedEvent;
  }

  /**
   * Create breaking change detection event
   */
  createBreakingChangeEvent(
    requestId: string,
    inputHash: string,
    payload: BreakingChangeDetectionEvent['payload'],
    confidenceScore: number,
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): BreakingChangeDetectionEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        hashObject(payload),
        confidenceScore,
        `Detected ${payload.severity} change at ${payload.path}: ${payload.description}`,
        tracingContext
      ),
      eventType: 'version_compatibility_analysis.breaking_change',
      agentId: 'version-compatibility-agent',
      payload,
    } as BreakingChangeDetectionEvent;
  }

  /**
   * Create type comparison event
   */
  createTypeComparisonEvent(
    requestId: string,
    inputHash: string,
    payload: TypeComparisonEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): TypeComparisonEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        hashObject(payload),
        1.0,
        `Type ${payload.typeName} comparison: ${payload.comparisonResult}`,
        tracingContext
      ),
      eventType: 'version_compatibility_analysis.type_comparison',
      agentId: 'version-compatibility-agent',
      payload,
    } as TypeComparisonEvent;
  }

  /**
   * Create endpoint comparison event
   */
  createEndpointComparisonEvent(
    requestId: string,
    inputHash: string,
    payload: EndpointComparisonEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): EndpointComparisonEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        hashObject(payload),
        1.0,
        `Endpoint ${payload.method} ${payload.endpointPath} comparison: ${payload.comparisonResult}`,
        tracingContext
      ),
      eventType: 'version_compatibility_analysis.endpoint_comparison',
      agentId: 'version-compatibility-agent',
      payload,
    } as EndpointComparisonEvent;
  }

  /**
   * Create version recommendation event
   */
  createVersionRecommendationEvent(
    requestId: string,
    inputHash: string,
    payload: VersionRecommendationEvent['payload'],
    tracingContext?: { traceId?: string; spanId?: string; parentSpanId?: string }
  ): VersionRecommendationEvent {
    return {
      ...this.createBase(
        requestId,
        inputHash,
        hashObject(payload),
        1.0,
        `Version recommendation: ${payload.recommendedBump} to ${payload.recommendedVersion}`,
        tracingContext
      ),
      eventType: 'version_compatibility_analysis.version_recommendation',
      agentId: 'version-compatibility-agent',
      payload,
    } as VersionRecommendationEvent;
  }
}

// =============================================================================
// COMBINED EVENT UNION (ALL AGENTS)
// =============================================================================

export const AllAgentEventsSchema = z.union([
  SDKGeneratorEventSchema,
  APITranslationEventSchema,
  VersionCompatibilityEventSchema,
]);

export type AllAgentEvents = z.infer<typeof AllAgentEventsSchema>;
