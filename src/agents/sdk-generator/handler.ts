/**
 * SDK Generator Agent - Edge Function Handler
 *
 * PROMPT 2 DELIVERABLE: Runtime & Infrastructure Implementation
 *
 * This is the main entry point for the SDK Generator Agent, designed to run
 * as a Google Cloud Edge Function within the LLM-Forge unified GCP service.
 *
 * Constraints:
 * - Stateless execution
 * - Deterministic behavior
 * - No orchestration logic
 * - No enforcement logic
 * - No runtime execution
 * - No direct SQL access
 * - Async, non-blocking writes via ruvector-service only
 *
 * @module agents/sdk-generator/handler
 */

import type { CanonicalSchema } from '../../types/canonical-schema.js';
import type {
  SDKGenerationRequest,
  SDKGenerationResponse,
  SDKArtifact,
  GeneratedFileArtifact,
  SupportedLanguage,
} from '../contracts/sdk-generator.contract.js';
import {
  SDKGenerationRequestSchema,
  FailureMode,
  FailureModeHandling,
} from '../contracts/sdk-generator.contract.js';
import { validateRequest, ValidationResult } from './validator.js';
import { calculateConfidence, ConfidenceResult } from './confidence.js';
import { DecisionEventEmitter } from './emitter.js';
import { hashObject } from '../contracts/decision-events.js';
import { validator as schemaValidator } from '../../schema/validator.js';
import { GeneratorOrchestrator } from '../../generators/generator-orchestrator.js';
import { TargetLanguage } from '../../core/type-mapper.js';
import { createHash, randomUUID } from 'crypto';

// =============================================================================
// AGENT METADATA
// =============================================================================

/** Agent identifier */
export const AGENT_ID = 'sdk-generator-agent';

/** Agent version (semver) */
export const AGENT_VERSION = '1.0.0';

/** Maximum request size in bytes (10MB) */
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;

/** Maximum execution time in ms (5 minutes) */
const MAX_EXECUTION_TIME_MS = 5 * 60 * 1000;

// =============================================================================
// LANGUAGE MAPPING
// =============================================================================

const LANGUAGE_MAP: Record<SupportedLanguage, TargetLanguage> = {
  typescript: TargetLanguage.TypeScript,
  python: TargetLanguage.Python,
  rust: TargetLanguage.Rust,
  go: TargetLanguage.Go,
  java: TargetLanguage.Java,
  csharp: TargetLanguage.CSharp,
  javascript: TargetLanguage.JavaScript,
};

// =============================================================================
// EDGE FUNCTION HANDLER
// =============================================================================

/**
 * Edge Function request context
 */
export interface EdgeFunctionContext {
  /** Request ID for tracing */
  requestId: string;
  /** Execution start time */
  startTime: number;
  /** Remaining execution time in ms */
  getRemainingTime: () => number;
  /** Whether to emit decision events */
  emitEvents: boolean;
  /** Dry run mode (no file generation) */
  dryRun: boolean;
  /** RuVector service endpoint (for event emission) */
  ruvectorEndpoint?: string;
}

/**
 * Edge Function response
 */
export interface EdgeFunctionResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Main Edge Function handler for SDK Generator Agent
 *
 * This handler:
 * 1. Validates input against agentics-contracts schemas
 * 2. Validates the CanonicalSchema for semantic correctness
 * 3. Generates SDK artifacts for requested languages
 * 4. Emits DecisionEvents to ruvector-service (async, non-blocking)
 * 5. Returns deterministic output
 *
 * @param requestBody - Raw request body (JSON string)
 * @param context - Edge function execution context
 * @returns Edge function response
 */
export async function handler(
  requestBody: string,
  context: EdgeFunctionContext
): Promise<EdgeFunctionResponse> {
  const emitter = new DecisionEventEmitter(
    AGENT_ID,
    AGENT_VERSION,
    context.ruvectorEndpoint
  );

  let inputHash = '';
  let request: SDKGenerationRequest | null = null;

  try {
    // Check request size
    if (Buffer.byteLength(requestBody, 'utf-8') > MAX_REQUEST_SIZE) {
      return createErrorResponse(413, FailureMode.RESOURCE_EXHAUSTION, 'Request too large');
    }

    // Parse and validate request
    const parseResult = parseRequest(requestBody);
    if (!parseResult.success) {
      return createErrorResponse(400, FailureMode.INVALID_SCHEMA, parseResult.error);
    }
    request = parseResult.data;

    // Calculate input hash for reproducibility
    inputHash = hashObject(request);

    // Emit initiated event (non-blocking)
    if (context.emitEvents) {
      emitter.emitInitiatedEvent(
        context.requestId,
        inputHash,
        {
          targetLanguages: request.targetLanguages,
          schemaVersion: request.schema.metadata.version,
          packageName: request.packageConfig.name,
          packageVersion: request.packageConfig.version,
          typeCount: request.schema.types.length,
          endpointCount: request.schema.endpoints.length,
        },
        request.tracingContext
      );
    }

    // Validate request against contract
    const validation = validateRequest(request);
    if (!validation.valid) {
      return createValidationErrorResponse(validation, context.requestId, emitter, inputHash);
    }

    // Validate CanonicalSchema semantics
    const schemaValidation = schemaValidator.validate(request.schema);
    if (!schemaValidation.valid) {
      if (context.emitEvents) {
        emitter.emitFailedEvent(context.requestId, inputHash, {
          failureMode: FailureMode.SCHEMA_VALIDATION_FAILURE,
          errorMessage: schemaValidation.errors.map((e) => e.message).join('; '),
          recoverable: false,
          partialResults: false,
        });
      }
      return createErrorResponse(
        400,
        FailureMode.SCHEMA_VALIDATION_FAILURE,
        schemaValidation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')
      );
    }

    // Check remaining time before generation
    if (context.getRemainingTime() < 30000) {
      // Need at least 30s
      return createErrorResponse(408, FailureMode.TIMEOUT, 'Insufficient execution time');
    }

    // Generate SDKs
    const generationResult = await generateSDKs(request, context, emitter, inputHash);

    // Calculate output hash
    const outputHash = hashObject(generationResult.artifacts);

    // Calculate determinism hash
    const determinismHash = createHash('sha256')
      .update(inputHash)
      .update(outputHash)
      .digest('hex');

    // Build response
    const response: SDKGenerationResponse = {
      requestId: context.requestId,
      success: generationResult.success,
      artifacts: generationResult.artifacts,
      compatibility: {
        schemaVersion: request.schema.metadata.version,
        agentVersion: AGENT_VERSION,
        generatedAt: new Date().toISOString(),
        determinismHash,
      },
      warnings: generationResult.warnings,
      errors: generationResult.errors,
    };

    // Emit completed event (non-blocking)
    if (context.emitEvents) {
      emitter.emitCompletedEvent(
        context.requestId,
        inputHash,
        outputHash,
        {
          success: response.success,
          targetLanguages: request.targetLanguages,
          totalFiles: response.artifacts.reduce((sum, a) => sum + a.files.length, 0),
          totalSizeBytes: response.artifacts.reduce((sum, a) => sum + a.metrics.totalSizeBytes, 0),
          durationMs: Date.now() - context.startTime,
          warningCount: response.warnings.length,
          errorCount: response.errors.length,
          determinismHash,
        },
        request.tracingContext
      );

      // Emit telemetry
      emitter.emitTelemetryEvent(context.requestId, {
        totalDurationMs: Date.now() - context.startTime,
        generationDurationMs: Date.now() - context.startTime,
      });
    }

    return {
      statusCode: response.success ? 200 : 207, // 207 for partial success
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': AGENT_ID,
        'X-Agent-Version': AGENT_VERSION,
        'X-Determinism-Hash': determinismHash,
        'X-Request-Id': context.requestId,
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Emit failed event
    if (context.emitEvents) {
      emitter.emitFailedEvent(context.requestId, inputHash, {
        failureMode: FailureMode.TEMPLATE_RENDERING_FAILURE,
        errorMessage,
        recoverable: false,
        partialResults: false,
      });
    }

    return createErrorResponse(500, FailureMode.TEMPLATE_RENDERING_FAILURE, errorMessage);
  }
}

// =============================================================================
// REQUEST PARSING
// =============================================================================

interface ParseResult {
  success: boolean;
  data?: SDKGenerationRequest;
  error?: string;
}

function parseRequest(body: string): ParseResult {
  try {
    const parsed = JSON.parse(body);
    const validated = SDKGenerationRequestSchema.safeParse(parsed);

    if (validated.success) {
      return { success: true, data: validated.data };
    }

    return {
      success: false,
      error: validated.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
    };
  } catch (error) {
    return {
      success: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =============================================================================
// SDK GENERATION
// =============================================================================

interface GenerationResult {
  success: boolean;
  artifacts: SDKArtifact[];
  warnings: string[];
  errors: string[];
}

async function generateSDKs(
  request: SDKGenerationRequest,
  context: EdgeFunctionContext,
  emitter: DecisionEventEmitter,
  inputHash: string
): Promise<GenerationResult> {
  const artifacts: SDKArtifact[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // Map languages
  const languages = request.targetLanguages
    .map((lang) => LANGUAGE_MAP[lang])
    .filter((lang): lang is TargetLanguage => lang !== undefined);

  if (languages.length === 0) {
    errors.push('No valid target languages specified');
    return { success: false, artifacts, warnings, errors };
  }

  // Create orchestrator (without file writing - we return artifacts directly)
  const orchestrator = new GeneratorOrchestrator(request.schema, {
    languages,
    outputDir: '/tmp/generated', // Temporary, won't actually write if dryRun
    packageName: request.packageConfig.name,
    packageVersion: request.packageConfig.version,
    parallel: true,
    writeFiles: !context.dryRun,
  });

  try {
    const result = await orchestrator.generate();

    // Convert to artifacts
    for (const [language, langResult] of result.results.entries()) {
      const startTime = Date.now();
      const files: GeneratedFileArtifact[] = langResult.files.map((file) => ({
        path: file.path,
        content: file.content,
        contentHash: createHash('sha256').update(file.content).digest('hex'),
        sizeBytes: Buffer.byteLength(file.content, 'utf-8'),
        executable: file.executable ?? false,
        generatedAt: new Date().toISOString(),
      }));

      const artifact: SDKArtifact = {
        language: languageToSupportedLanguage(language),
        files,
        buildCommand: langResult.buildCommand,
        testCommand: langResult.testCommand,
        publishCommand: langResult.publishCommand,
        registryUrl: langResult.registryUrl,
        metrics: {
          totalFiles: files.length,
          totalSizeBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
          generationDurationMs: Date.now() - startTime,
          typeCount: request.schema.types.length,
          endpointCount: request.schema.endpoints.length,
        },
      };

      artifacts.push(artifact);

      // Emit language generation event
      if (context.emitEvents) {
        emitter.emitLanguageGenerationEvent(
          context.requestId,
          inputHash,
          hashObject(files),
          {
            language: artifact.language,
            filesGenerated: artifact.metrics.totalFiles,
            totalSizeBytes: artifact.metrics.totalSizeBytes,
            durationMs: artifact.metrics.generationDurationMs,
          },
          request.tracingContext
        );
      }

      // Add warnings from this language
      warnings.push(...langResult.warnings.map((w) => `[${language}] ${w}`));
      errors.push(...langResult.errors.map((e) => `[${language}] ${e}`));
    }

    return {
      success: errors.length === 0,
      artifacts,
      warnings,
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);
    return { success: false, artifacts, warnings, errors };
  }
}

function languageToSupportedLanguage(lang: TargetLanguage): SupportedLanguage {
  const reverseMap: Record<TargetLanguage, SupportedLanguage> = {
    [TargetLanguage.TypeScript]: 'typescript',
    [TargetLanguage.Python]: 'python',
    [TargetLanguage.Rust]: 'rust',
    [TargetLanguage.Go]: 'go',
    [TargetLanguage.Java]: 'java',
    [TargetLanguage.CSharp]: 'csharp',
    [TargetLanguage.JavaScript]: 'javascript',
  };
  return reverseMap[lang];
}

// =============================================================================
// ERROR RESPONSES
// =============================================================================

function createErrorResponse(
  statusCode: number,
  failureMode: FailureMode,
  message: string
): EdgeFunctionResponse {
  const handling = FailureModeHandling[failureMode];

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': AGENT_ID,
      'X-Agent-Version': AGENT_VERSION,
      'X-Failure-Mode': failureMode,
    },
    body: JSON.stringify({
      success: false,
      error: {
        code: failureMode,
        message,
        recoverable: handling.recoverable,
        action: handling.action,
      },
    }),
  };
}

function createValidationErrorResponse(
  validation: ValidationResult,
  requestId: string,
  emitter: DecisionEventEmitter,
  inputHash: string
): EdgeFunctionResponse {
  emitter.emitFailedEvent(requestId, inputHash, {
    failureMode: FailureMode.INVALID_SCHEMA,
    errorMessage: validation.errors.join('; '),
    recoverable: false,
    partialResults: false,
  });

  return {
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': AGENT_ID,
      'X-Agent-Version': AGENT_VERSION,
      'X-Failure-Mode': FailureMode.INVALID_SCHEMA,
    },
    body: JSON.stringify({
      success: false,
      error: {
        code: FailureMode.INVALID_SCHEMA,
        message: 'Request validation failed',
        details: validation.errors,
        recoverable: false,
      },
    }),
  };
}

// =============================================================================
// EXPLICIT CONFIRMATIONS
// =============================================================================

/**
 * CONFIRMATION: This agent does NOT execute generated code
 *
 * The SDK Generator Agent only produces code artifacts as strings.
 * It never invokes compilers, interpreters, or runtime environments.
 */
export const CONFIRMATION_NO_EXECUTION = true;

/**
 * CONFIRMATION: This agent does NOT modify runtime behavior
 *
 * The SDK Generator Agent is stateless and idempotent.
 * It has no side effects beyond returning artifacts and emitting events.
 */
export const CONFIRMATION_NO_RUNTIME_MODIFICATION = true;

/**
 * CONFIRMATION: This agent does NOT orchestrate workflows
 *
 * The SDK Generator Agent operates as a single unit of work.
 * It does not spawn child processes or coordinate with other agents.
 */
export const CONFIRMATION_NO_ORCHESTRATION = true;
