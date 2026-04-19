/**
 * Version Compatibility Agent
 *
 * PROMPT 2 DELIVERABLE: Runtime Implementation
 *
 * A VALIDATION/COMPATIBILITY-class agent that analyzes compatibility between
 * API and SDK versions, detecting breaking vs non-breaking changes.
 *
 * Deployment: Google Cloud Edge Function (stateless)
 * Classification: VALIDATION / COMPATIBILITY
 * decision_type: "version_compatibility_analysis"
 *
 * @module agents/version-compatibility-agent
 */

import { randomUUID } from 'crypto';
import type { CanonicalSchema, TypeDefinition, EndpointDefinition } from '../../types/canonical-schema.js';
import {
  AGENT_ID,
  AGENT_VERSION,
  CompatibilityAnalysisRequestSchema,
  CompatibilityFailureMode,
  type CompatibilityAnalysisRequest,
  type CompatibilityAnalysisResponse,
  type CompatibilityChange,
  type CompatibilityVerdict,
  type ChangeSeverity,
  type ChangeCategory,
  type SchemaVersionReference,
} from '../contracts/version-compatibility.contract.js';
import {
  VersionCompatibilityEventFactory,
  hashObject,
  type VersionCompatibilityEvent,
} from '../contracts/decision-events.js';
import { RuvectorServiceClient } from './ruvector-client.js';
import { SchemaComparator } from './comparator.js';

// =============================================================================
// AGENT RUNTIME
// =============================================================================

/**
 * Version Compatibility Agent runtime
 *
 * This agent:
 * - Compares schema versions for compatibility
 * - Detects breaking vs non-breaking changes
 * - Emits compatibility reports (advisory only)
 * - Provides upgrade guidance (no enforcement)
 *
 * This agent does NOT:
 * - Execute code
 * - Apply migrations
 * - Modify schemas
 * - Enforce policies
 */
export class VersionCompatibilityAgent {
  private readonly eventFactory: VersionCompatibilityEventFactory;
  private readonly ruvectorClient: RuvectorServiceClient;
  private readonly comparator: SchemaComparator;
  private readonly emitEvents: boolean;

  constructor(options: {
    ruvectorServiceUrl?: string;
    emitEvents?: boolean;
  } = {}) {
    this.eventFactory = new VersionCompatibilityEventFactory(AGENT_VERSION);
    this.ruvectorClient = new RuvectorServiceClient(options.ruvectorServiceUrl);
    this.comparator = new SchemaComparator();
    this.emitEvents = options.emitEvents ?? false;
  }

  /**
   * Analyze compatibility between two schema versions
   *
   * @param request - Compatibility analysis request
   * @returns Compatibility analysis response
   */
  async analyze(request: CompatibilityAnalysisRequest): Promise<CompatibilityAnalysisResponse> {
    const startTime = Date.now();
    const events: VersionCompatibilityEvent[] = [];
    const fallbackRequestId =
      typeof (request as any)?.requestId === 'string'
        ? (request as any).requestId
        : randomUUID();

    // Validate request shape (Zod will apply defaults to options.*)
    const validationResult = CompatibilityAnalysisRequestSchema.safeParse(request);
    if (!validationResult.success) {
      return this.createFailedResponse(
        fallbackRequestId,
        CompatibilityFailureMode.INVALID_SCHEMA,
        `Invalid request: ${validationResult.error.message}`,
        false
      );
    }

    // CRITICAL: use the parsed object so defaults (analyzeCategories, ignorePaths,
    // strictness, etc.) are applied. The original `request` may be missing fields.
    const validated = validationResult.data;

    // Explicitly verify schema metadata is populated. The Zod custom validator
    // only checks that the keys `metadata`/`types`/`endpoints` exist; it does
    // not verify that metadata.version / metadata.providerId are present and
    // non-empty. Missing metadata must surface as INVALID_SCHEMA (400), not as
    // a downstream null-ref crash.
    const metadataIssue =
      this.findInvalidSchemaIssue(validated.sourceSchema, 'sourceSchema') ??
      this.findInvalidSchemaIssue(validated.targetSchema, 'targetSchema');
    if (metadataIssue) {
      return this.createFailedResponse(
        validated.requestId,
        CompatibilityFailureMode.INVALID_SCHEMA,
        metadataIssue,
        false,
        this.safeVersionRef(validated.sourceSchema),
        this.safeVersionRef(validated.targetSchema)
      );
    }

    // Calculate input hashes
    const sourceHash = hashObject(validated.sourceSchema);
    const targetHash = hashObject(validated.targetSchema);
    const inputHash = hashObject({ sourceHash, targetHash, options: validated.options });

    // Pre-compute version refs so failure responses can echo them back to the caller
    const sourceVersionRef: SchemaVersionReference = {
      providerId: validated.sourceSchema.metadata.providerId,
      version: validated.sourceSchema.metadata.version,
      schemaHash: sourceHash,
    };
    const targetVersionRef: SchemaVersionReference = {
      providerId: validated.targetSchema.metadata.providerId,
      version: validated.targetSchema.metadata.version,
      schemaHash: targetHash,
    };

    // Emit initiated event
    const initiatedEvent = this.eventFactory.createInitiatedEvent(
      validated.requestId,
      inputHash,
      {
        sourceVersion: validated.sourceSchema.metadata.version,
        targetVersion: validated.targetSchema.metadata.version,
        sourceSchemaHash: sourceHash,
        targetSchemaHash: targetHash,
        strictness: validated.options.strictness,
        categoriesToAnalyze: validated.options.analyzeCategories,
      },
      validated.tracingContext
    );
    events.push(initiatedEvent);

    try {
      // Verify provider compatibility
      if (validated.sourceSchema.metadata.providerId !== validated.targetSchema.metadata.providerId) {
        const failedEvent = this.eventFactory.createFailedEvent(
          validated.requestId,
          inputHash,
          {
            failureMode: CompatibilityFailureMode.INCOMPATIBLE_PROVIDERS,
            errorMessage: `Provider mismatch: ${validated.sourceSchema.metadata.providerId} vs ${validated.targetSchema.metadata.providerId}`,
            recoverable: false,
            partialAnalysis: false,
          },
          validated.tracingContext
        );
        events.push(failedEvent);

        if (this.emitEvents) {
          await this.emitDecisionEvents(events);
        }

        return this.createFailedResponse(
          validated.requestId,
          CompatibilityFailureMode.INCOMPATIBLE_PROVIDERS,
          `Provider mismatch: ${validated.sourceSchema.metadata.providerId} vs ${validated.targetSchema.metadata.providerId}`,
          false,
          sourceVersionRef,
          targetVersionRef
        );
      }

      // Perform comparison
      const changes: CompatibilityChange[] = [];
      const warnings: string[] = [];
      const categories = Array.isArray(validated.options.analyzeCategories)
        ? validated.options.analyzeCategories
        : [];
      const ignorePaths = Array.isArray(validated.options.ignorePaths)
        ? validated.options.ignorePaths
        : [];

      // Compare types if requested
      if (categories.includes('types')) {
        const typeChanges = await this.comparator.compareTypes(
          validated.sourceSchema,
          validated.targetSchema,
          validated.options.strictness,
          ignorePaths
        );
        changes.push(...typeChanges);

        // Emit type comparison events
        for (const typeChange of typeChanges) {
          const typeEvent = this.eventFactory.createTypeComparisonEvent(
            validated.requestId,
            inputHash,
            {
              typeName: typeChange.path.split('.')[1] || typeChange.path,
              sourceTypeId: typeChange.sourceValue ? String(typeChange.sourceValue) : undefined,
              targetTypeId: typeChange.targetValue ? String(typeChange.targetValue) : undefined,
              comparisonResult: this.mapSeverityToComparison(typeChange.severity),
              changesDetected: 1,
            },
            validated.tracingContext
          );
          events.push(typeEvent);
        }
      }

      // Compare endpoints if requested
      if (categories.includes('endpoints')) {
        const endpointChanges = await this.comparator.compareEndpoints(
          validated.sourceSchema,
          validated.targetSchema,
          validated.options.strictness,
          ignorePaths
        );
        changes.push(...endpointChanges);

        // Emit endpoint comparison events
        for (const endpointChange of endpointChanges) {
          const pathParts = endpointChange.path.split('.');
          const endpointEvent = this.eventFactory.createEndpointComparisonEvent(
            validated.requestId,
            inputHash,
            {
              endpointPath: pathParts[1] || endpointChange.path,
              method: pathParts[2] || 'UNKNOWN',
              sourceEndpointId: endpointChange.sourceValue ? String(endpointChange.sourceValue) : undefined,
              targetEndpointId: endpointChange.targetValue ? String(endpointChange.targetValue) : undefined,
              comparisonResult: this.mapSeverityToComparison(endpointChange.severity),
              parameterChanges: endpointChange.category.includes('parameter') ? 1 : 0,
              responseChanges: endpointChange.category.includes('response') ? 1 : 0,
            },
            validated.tracingContext
          );
          events.push(endpointEvent);
        }
      }

      // Compare authentication if requested
      if (categories.includes('authentication')) {
        const authChanges = await this.comparator.compareAuthentication(
          validated.sourceSchema,
          validated.targetSchema,
          validated.options.strictness
        );
        changes.push(...authChanges);
      }

      // Compare errors if requested
      if (categories.includes('errors')) {
        const errorChanges = await this.comparator.compareErrors(
          validated.sourceSchema,
          validated.targetSchema,
          validated.options.strictness
        );
        changes.push(...errorChanges);
      }

      // Compare metadata if requested
      if (categories.includes('metadata')) {
        const metadataChanges = await this.comparator.compareMetadata(
          validated.sourceSchema,
          validated.targetSchema,
          validated.options.strictness
        );
        changes.push(...metadataChanges);
      }

      // Emit breaking change events
      const breakingChanges = changes.filter(c => c.severity === 'breaking');
      for (const change of breakingChanges) {
        const breakingEvent = this.eventFactory.createBreakingChangeEvent(
          validated.requestId,
          inputHash,
          {
            changeId: change.changeId,
            category: change.category,
            path: change.path,
            severity: change.severity,
            description: change.description,
            migrationComplexity: change.impact.migrationComplexity,
            affectedComponents: change.impact.affectedComponents,
          },
          1.0,
          validated.tracingContext
        );
        events.push(breakingEvent);
      }

      // Calculate summary
      const summary = this.calculateSummary(changes);

      // Determine verdict
      const verdict = this.determineVerdict(changes, validated.options.strictness);

      // Calculate version recommendation
      const versionRecommendation = this.calculateVersionRecommendation(
        validated.targetSchema.metadata.version,
        changes
      );

      // Emit version recommendation event
      const recommendationEvent = this.eventFactory.createVersionRecommendationEvent(
        validated.requestId,
        inputHash,
        {
          currentVersion: validated.targetSchema.metadata.version,
          recommendedBump: versionRecommendation.bumpType,
          recommendedVersion: versionRecommendation.recommendedVersion,
          rationale: versionRecommendation.rationale,
          breakingChangeCount: summary.breakingChanges,
          constraintsApplied: ['semver-compliance', `strictness-${validated.options.strictness}`],
        },
        validated.tracingContext
      );
      events.push(recommendationEvent);

      // Add upgrade guidance if requested
      if (validated.options.includeUpgradeGuidance) {
        for (const change of changes) {
          change.upgradeGuidance = this.generateUpgradeGuidance(change);
        }
      }

      // Calculate determinism hash
      const outputHash = hashObject({
        verdict,
        summary,
        changes: changes.map(c => ({ path: c.path, severity: c.severity, category: c.category })),
        versionRecommendation,
      });

      const durationMs = Date.now() - startTime;

      // Emit completed event
      const completedEvent = this.eventFactory.createCompletedEvent(
        validated.requestId,
        inputHash,
        outputHash,
        {
          success: true,
          verdict,
          totalChanges: summary.totalChanges,
          breakingChanges: summary.breakingChanges,
          nonBreakingChanges: summary.nonBreakingChanges,
          recommendedBump: versionRecommendation.bumpType,
          durationMs,
          determinismHash: outputHash,
        },
        validated.tracingContext
      );
      events.push(completedEvent);

      // Emit all events to ruvector-service
      if (this.emitEvents) {
        await this.emitDecisionEvents(events);
      }

      // Build response
      const response: CompatibilityAnalysisResponse = {
        requestId: validated.requestId,
        success: true,
        sourceVersion: sourceVersionRef,
        targetVersion: targetVersionRef,
        verdict,
        summary,
        changes,
        versionRecommendation,
        analysisMetadata: {
          agentVersion: AGENT_VERSION,
          analyzedAt: new Date().toISOString(),
          durationMs,
          determinismHash: outputHash,
        },
        warnings,
        errors: [],
      };

      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Distinguish a true budget exceedance from an unhandled runtime crash.
      // Anything else (e.g. `Cannot read properties of undefined`) is an
      // INTERNAL_ERROR, not a timeout — masking it as ANALYSIS_TIMEOUT hides
      // real bugs from upstream callers.
      const isTimeout =
        error instanceof Error &&
        /timeout|timed? ?out|deadline/i.test(error.message);
      const failureMode = isTimeout
        ? CompatibilityFailureMode.ANALYSIS_TIMEOUT
        : CompatibilityFailureMode.INTERNAL_ERROR;

      const failedEvent = this.eventFactory.createFailedEvent(
        validated.requestId,
        inputHash,
        {
          failureMode,
          errorMessage,
          recoverable: false,
          partialAnalysis: false,
        },
        validated.tracingContext
      );
      events.push(failedEvent);

      if (this.emitEvents) {
        await this.emitDecisionEvents(events);
      }

      return this.createFailedResponse(
        validated.requestId,
        failureMode,
        errorMessage,
        false,
        sourceVersionRef,
        targetVersionRef
      );
    }
  }

  /**
   * Validate that a schema has the metadata fields required for analysis.
   * Returns a human-readable error message if invalid, or undefined if OK.
   */
  private findInvalidSchemaIssue(schema: unknown, label: string): string | undefined {
    if (typeof schema !== 'object' || schema === null) {
      return `${label} is not an object`;
    }
    const meta = (schema as { metadata?: unknown }).metadata;
    if (typeof meta !== 'object' || meta === null) {
      return `${label}.metadata is missing or not an object`;
    }
    const m = meta as Record<string, unknown>;
    if (typeof m.version !== 'string' || m.version.length === 0) {
      return `${label}.metadata.version is missing or not a string`;
    }
    if (typeof m.providerId !== 'string' || m.providerId.length === 0) {
      return `${label}.metadata.providerId is missing or not a string`;
    }
    // Schema arrays — guard against null/undefined that would crash the comparator.
    const s = schema as Record<string, unknown>;
    for (const key of ['types', 'endpoints', 'authentication', 'errors']) {
      const v = s[key];
      if (v !== undefined && v !== null && !Array.isArray(v)) {
        return `${label}.${key} must be an array`;
      }
    }
    return undefined;
  }

  /**
   * Best-effort version reference extraction. Used when reporting failures
   * so the caller can correlate the response to its inputs even when the
   * input was malformed.
   */
  private safeVersionRef(schema: unknown): SchemaVersionReference {
    const meta = (schema as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const version = typeof meta.version === 'string' && meta.version.length > 0
      ? (meta.version as string)
      : '0.0.0';
    const providerId = typeof meta.providerId === 'string'
      ? (meta.providerId as string)
      : '';
    return { providerId, version };
  }

  /**
   * Map severity to comparison result
   */
  private mapSeverityToComparison(severity: ChangeSeverity): 'identical' | 'compatible' | 'breaking' | 'removed' | 'added' {
    switch (severity) {
      case 'breaking':
        return 'breaking';
      case 'non-breaking':
        return 'compatible';
      case 'patch':
        return 'compatible';
      case 'informational':
        return 'identical';
    }
  }

  /**
   * Calculate summary statistics from changes
   */
  private calculateSummary(changes: CompatibilityChange[]): {
    totalChanges: number;
    breakingChanges: number;
    nonBreakingChanges: number;
    patchChanges: number;
    informationalChanges: number;
    changesByCategory: Record<string, number>;
  } {
    const summary = {
      totalChanges: changes.length,
      breakingChanges: 0,
      nonBreakingChanges: 0,
      patchChanges: 0,
      informationalChanges: 0,
      changesByCategory: {} as Record<string, number>,
    };

    for (const change of changes) {
      switch (change.severity) {
        case 'breaking':
          summary.breakingChanges++;
          break;
        case 'non-breaking':
          summary.nonBreakingChanges++;
          break;
        case 'patch':
          summary.patchChanges++;
          break;
        case 'informational':
          summary.informationalChanges++;
          break;
      }

      summary.changesByCategory[change.category] = (summary.changesByCategory[change.category] || 0) + 1;
    }

    return summary;
  }

  /**
   * Determine overall compatibility verdict
   */
  private determineVerdict(changes: CompatibilityChange[], strictness: 'strict' | 'standard' | 'lenient'): CompatibilityVerdict {
    const hasBreaking = changes.some(c => c.severity === 'breaking');
    const hasNonBreaking = changes.some(c => c.severity === 'non-breaking');
    const breakingCount = changes.filter(c => c.severity === 'breaking').length;

    if (breakingCount === 0) {
      if (hasNonBreaking) {
        return 'backwards-compatible';
      }
      return 'fully-compatible';
    }

    // In lenient mode, few breaking changes are marked as breaking
    // In strict mode, any breaking change is incompatible
    if (strictness === 'strict') {
      return breakingCount > 0 ? 'incompatible' : 'breaking';
    }

    if (strictness === 'lenient') {
      return breakingCount > 5 ? 'incompatible' : 'breaking';
    }

    // Standard mode
    return breakingCount > 10 ? 'incompatible' : 'breaking';
  }

  /**
   * Calculate version recommendation based on changes
   */
  private calculateVersionRecommendation(
    currentVersion: string,
    changes: CompatibilityChange[]
  ): { bumpType: 'major' | 'minor' | 'patch' | 'none'; recommendedVersion: string; rationale: string } {
    const hasBreaking = changes.some(c => c.severity === 'breaking');
    const hasNonBreaking = changes.some(c => c.severity === 'non-breaking');
    const hasPatch = changes.some(c => c.severity === 'patch');

    // Parse current version
    const versionMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!versionMatch) {
      return {
        bumpType: 'none',
        recommendedVersion: currentVersion,
        rationale: 'Unable to parse current version',
      };
    }

    let [, major, minor, patch] = versionMatch.map(Number);

    if (hasBreaking) {
      return {
        bumpType: 'major',
        recommendedVersion: `${major + 1}.0.0`,
        rationale: `Breaking changes detected: ${changes.filter(c => c.severity === 'breaking').length} breaking change(s) require major version bump`,
      };
    }

    if (hasNonBreaking) {
      return {
        bumpType: 'minor',
        recommendedVersion: `${major}.${minor + 1}.0`,
        rationale: `New features/additions detected: ${changes.filter(c => c.severity === 'non-breaking').length} non-breaking change(s) require minor version bump`,
      };
    }

    if (hasPatch) {
      return {
        bumpType: 'patch',
        recommendedVersion: `${major}.${minor}.${patch + 1}`,
        rationale: `Backwards-compatible fixes: ${changes.filter(c => c.severity === 'patch').length} patch change(s)`,
      };
    }

    return {
      bumpType: 'none',
      recommendedVersion: currentVersion,
      rationale: 'No significant changes detected',
    };
  }

  /**
   * Generate upgrade guidance for a change
   */
  private generateUpgradeGuidance(change: CompatibilityChange): string {
    const guidanceMap: Record<ChangeCategory, string> = {
      'type-added': `New type "${change.path.split('.').pop()}" is available. No migration required.`,
      'type-removed': `Type "${change.path.split('.').pop()}" has been removed. Update all references to use alternative types.`,
      'type-modified': `Type "${change.path.split('.').pop()}" has been modified. Review property changes and update usage accordingly.`,
      'property-added': `New property added at "${change.path}". No migration required for existing code.`,
      'property-removed': `Property at "${change.path}" has been removed. Remove all references from your code.`,
      'property-modified': `Property at "${change.path}" has been modified. Review the changes and update your code.`,
      'endpoint-added': `New endpoint available. No migration required.`,
      'endpoint-removed': `Endpoint at "${change.path}" has been removed. Update all API calls to use alternative endpoints.`,
      'endpoint-modified': `Endpoint at "${change.path}" has been modified. Review parameter and response changes.`,
      'parameter-added': `New parameter added. Optional parameters don't require code changes.`,
      'parameter-removed': `Parameter has been removed. Remove from all API calls.`,
      'parameter-modified': `Parameter has been modified. Update your API calls accordingly.`,
      'response-added': `New response type added. Handle the new response in your code.`,
      'response-removed': `Response type has been removed. Update response handling.`,
      'response-modified': `Response structure has been modified. Update response parsing.`,
      'auth-added': `New authentication method available.`,
      'auth-removed': `Authentication method removed. Switch to alternative auth method.`,
      'auth-modified': `Authentication requirements changed. Update your auth configuration.`,
      'error-added': `New error code added. Consider adding error handling for it.`,
      'error-removed': `Error code removed. Can remove specific error handling if no longer needed.`,
      'error-modified': `Error format changed. Update error handling code.`,
      'metadata-changed': `Metadata updated. Usually no code changes required.`,
    };

    return guidanceMap[change.category] || `Review the change at "${change.path}" and update your code accordingly.`;
  }

  /**
   * Create a failed response
   */
  private createFailedResponse(
    requestId: string,
    failureMode: CompatibilityFailureMode,
    errorMessage: string,
    partialAnalysis: boolean,
    sourceVersion?: SchemaVersionReference,
    targetVersion?: SchemaVersionReference
  ): CompatibilityAnalysisResponse {
    return {
      requestId,
      success: false,
      sourceVersion: sourceVersion ?? { providerId: '', version: '0.0.0' },
      targetVersion: targetVersion ?? { providerId: '', version: '0.0.0' },
      verdict: 'incompatible',
      summary: {
        totalChanges: 0,
        breakingChanges: 0,
        nonBreakingChanges: 0,
        patchChanges: 0,
        informationalChanges: 0,
        changesByCategory: {},
      },
      changes: [],
      versionRecommendation: {
        bumpType: 'none',
        recommendedVersion: '0.0.0',
        rationale: 'Analysis failed',
      },
      analysisMetadata: {
        agentVersion: AGENT_VERSION,
        analyzedAt: new Date().toISOString(),
        durationMs: 0,
        determinismHash: '',
      },
      warnings: [],
      errors: [`${failureMode}: ${errorMessage}`],
    };
  }

  /**
   * Emit decision events to ruvector-service
   */
  private async emitDecisionEvents(events: VersionCompatibilityEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.ruvectorClient.emitDecisionEvent(event);
      } catch (error) {
        // Log but don't fail - events are advisory
        console.error(`Failed to emit event ${event.eventId}:`, error);
      }
    }
  }
}

// Export types and utilities
export { AGENT_ID, AGENT_VERSION };
export type {
  CompatibilityAnalysisRequest,
  CompatibilityAnalysisResponse,
  CompatibilityChange,
  CompatibilityVerdict,
};
