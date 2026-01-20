/**
 * CLI Command Generator Agent - Edge Function Handler
 *
 * Google Cloud Edge Function handler for the CLI Command Generator Agent.
 * This is the main entry point for all agent invocations.
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
 * @module agents/cli-command-generator/handler
 */

import {
  CLIGeneratorInputSchema,
  CLIGenerationResult,
  CLI_COMMAND_GENERATOR_CONTRACT,
  type CLIGeneratorInput,
} from './types.js';
import { generateCLICommands } from './generator.js';
import { createDecisionEmitter, createMockDecisionEmitter, type RuVectorClient } from './decision-emitter.js';
import {
  TelemetryEmitter,
  createConsoleTelemetryEmitter,
  generateExecutionRef,
} from './telemetry.js';

/**
 * HTTP request structure for Edge Function
 */
export interface EdgeFunctionRequest {
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

/**
 * HTTP response structure for Edge Function
 */
export interface EdgeFunctionResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Agent handler configuration
 */
export interface AgentHandlerConfig {
  /** RuVector service client (for decision event persistence) */
  ruvectorClient?: RuVectorClient;
  /** Telemetry emitter (for observability) */
  telemetryEmitter?: TelemetryEmitter;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Handler result structure
 */
export interface HandlerResult {
  success: boolean;
  result?: CLIGenerationResult;
  eventId?: string;
  errors?: string[];
  executionRef: string;
}

/**
 * Validate input against the schema
 */
function validateInput(input: unknown): {
  success: boolean;
  data?: CLIGeneratorInput;
  errors?: string[];
} {
  const result = CLIGeneratorInputSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
  return { success: false, errors };
}

/**
 * Create JSON response
 */
function jsonResponse(
  data: unknown,
  statusCode: number = 200
): EdgeFunctionResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': CLI_COMMAND_GENERATOR_CONTRACT.agentId,
      'X-Agent-Version': CLI_COMMAND_GENERATOR_CONTRACT.version,
    },
    body: JSON.stringify(data),
  };
}

/**
 * Create error response
 */
function errorResponse(
  code: string,
  message: string,
  statusCode: number = 400,
  executionRef?: string
): EdgeFunctionResponse {
  return jsonResponse(
    {
      error: {
        code,
        message,
        agent_id: CLI_COMMAND_GENERATOR_CONTRACT.agentId,
        agent_version: CLI_COMMAND_GENERATOR_CONTRACT.version,
        execution_ref: executionRef,
      },
    },
    statusCode
  );
}

/**
 * Main agent handler function
 *
 * This function:
 * 1. Validates input using Zod schema
 * 2. Generates CLI commands
 * 3. Emits decision event to ruvector-service
 * 4. Emits telemetry to LLM-Observatory
 * 5. Returns deterministic output
 *
 * IMPORTANT CONFIRMATIONS (per PROMPT 2):
 * - This agent does NOT execute generated code
 * - This agent does NOT modify runtime behavior
 * - This agent does NOT orchestrate workflows
 */
export async function handleGenerate(
  input: unknown,
  config: AgentHandlerConfig = {}
): Promise<HandlerResult> {
  const executionRef = generateExecutionRef();
  const startTime = Date.now();

  // Initialize telemetry
  const telemetry = config.telemetryEmitter ?? createConsoleTelemetryEmitter(executionRef);

  // Initialize decision emitter
  const { emitter: decisionEmitter, client: mockClient } = config.ruvectorClient
    ? { emitter: createDecisionEmitter(config.ruvectorClient), client: null }
    : createMockDecisionEmitter();

  try {
    // Emit agent invocation telemetry
    const rawInput = input as Record<string, unknown>;
    await telemetry.emitAgentInvoked({
      contractId: String(rawInput.contractId ?? 'unknown'),
      framework: String(rawInput.framework ?? 'commander'),
      endpointCount: Array.isArray(rawInput.endpoints) ? rawInput.endpoints.length : 0,
    });

    // Step 1: Validate input
    if (config.verbose) {
      console.log('[CLI-GEN] Validating input...');
    }
    await telemetry.emitValidationStarted();
    const validationStart = Date.now();

    const validation = validateInput(input);

    if (!validation.success) {
      const validationDuration = Date.now() - validationStart;
      await telemetry.emitValidationFailed(validation.errors ?? [], validationDuration);

      // Emit failure decision event
      const failureInput: CLIGeneratorInput = {
        contractId: String(rawInput.contractId ?? 'unknown'),
        contractVersion: String(rawInput.contractVersion ?? '0.0.0'),
        endpoints: [],
        types: [],
        framework: 'commander' as const,
        packageName: String(rawInput.packageName ?? 'unknown'),
        packageVersion: '0.0.0',
        providerId: String(rawInput.providerId ?? 'unknown'),
        providerName: String(rawInput.providerName ?? 'Unknown'),
        options: {},
      };

      await decisionEmitter.emitFailureEvent(failureInput, validation.errors ?? []);

      return {
        success: false,
        errors: validation.errors,
        executionRef,
      };
    }

    await telemetry.emitValidationCompleted(Date.now() - validationStart);

    const validatedInput = validation.data!;

    // Step 2: Generate CLI commands
    if (config.verbose) {
      console.log('[CLI-GEN] Generating CLI commands...');
    }
    await telemetry.emitGenerationStarted(validatedInput.framework);
    const generationStart = Date.now();

    const result = generateCLICommands(validatedInput);

    if (result.success) {
      const linesOfCode = result.files.reduce((sum, f) => sum + f.content.split('\n').length, 0);
      await telemetry.emitGenerationCompleted({
        fileCount: result.files.length,
        linesOfCode,
        durationMs: Date.now() - generationStart,
      });
    } else {
      await telemetry.emitGenerationFailed(result.errors, Date.now() - generationStart);
    }

    // Step 3: Emit decision event to ruvector-service
    if (config.verbose) {
      console.log('[CLI-GEN] Emitting decision event...');
    }

    let eventId: string;
    if (result.success) {
      eventId = await decisionEmitter.emitGenerationEvent(validatedInput, result);
    } else {
      eventId = await decisionEmitter.emitFailureEvent(validatedInput, result.errors);
    }

    // Step 4: Emit completion telemetry
    const totalDuration = Date.now() - startTime;
    if (result.success) {
      await telemetry.emitAgentCompleted({
        commandCount: result.program.commands.length,
        fileCount: result.files.length,
        confidence: result.confidence,
        durationMs: totalDuration,
      });
    } else {
      await telemetry.emitAgentFailed(new Error(result.errors.join('; ')), totalDuration);
    }

    await telemetry.flush();

    return {
      success: result.success,
      result,
      eventId,
      errors: result.errors.length > 0 ? result.errors : undefined,
      executionRef,
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    await telemetry.emitAgentFailed(
      error instanceof Error ? error : new Error(String(error)),
      totalDuration
    );
    await telemetry.flush();

    return {
      success: false,
      errors: [error instanceof Error ? error.message : String(error)],
      executionRef,
    };
  }
}

/**
 * Edge Function HTTP handler
 *
 * Handles HTTP requests to the CLI Command Generator Agent.
 * Deployed as part of the LLM-Forge unified GCP service.
 */
export async function edgeFunctionHandler(
  request: EdgeFunctionRequest
): Promise<EdgeFunctionResponse> {
  const executionRef = generateExecutionRef();

  // Only accept POST requests
  if (request.method !== 'POST') {
    return errorResponse(
      'METHOD_NOT_ALLOWED',
      'Only POST method is supported',
      405,
      executionRef
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  } catch {
    return errorResponse(
      'INVALID_JSON',
      'Request body must be valid JSON',
      400,
      executionRef
    );
  }

  // Handle the request
  const result = await handleGenerate(body, {
    verbose: request.headers['x-verbose'] === 'true',
  });

  // Return response
  if (result.success && result.result) {
    return jsonResponse({
      success: true,
      execution_ref: result.executionRef,
      event_id: result.eventId,
      result: {
        program: result.result.program,
        files: result.result.files,
        framework: result.result.framework,
        warnings: result.result.warnings,
        duration: result.result.duration,
        confidence: result.result.confidence,
      },
    });
  }

  return jsonResponse(
    {
      success: false,
      execution_ref: result.executionRef,
      event_id: result.eventId,
      errors: result.errors,
    },
    result.errors?.some((e) => e.includes('VALIDATION')) ? 400 : 500
  );
}

/**
 * Health check handler
 */
export function healthCheckHandler(): EdgeFunctionResponse {
  return jsonResponse({
    status: 'healthy',
    agent_id: CLI_COMMAND_GENERATOR_CONTRACT.agentId,
    agent_version: CLI_COMMAND_GENERATOR_CONTRACT.version,
    classification: CLI_COMMAND_GENERATOR_CONTRACT.classification,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Contract info handler
 */
export function contractHandler(): EdgeFunctionResponse {
  return jsonResponse(CLI_COMMAND_GENERATOR_CONTRACT);
}
