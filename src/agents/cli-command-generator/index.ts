/**
 * CLI Command Generator Agent
 *
 * Generates CLI command definitions and handlers from API contracts.
 *
 * Classification: GENERATION
 * - Produces CLI command specs
 * - Generates argument schemas and help text
 * - Ensures alignment with agentics-cli patterns
 * - Emits deterministic command artifacts
 *
 * Decision Type: cli_generation
 *
 * @module agents/cli-command-generator
 */

// Types and contracts
export {
  // Enums
  CLIFramework,
  CLIArgumentType,

  // Interfaces
  type CLIOption,
  type CLIArgument,
  type CLICommandDefinition,
  type CLIProgramDefinition,
  type GeneratedCLIFile,
  type CLIGenerationResult,
  type CLIGeneratorInput,
  type CLICommandGeneratorDecisionEvent,

  // Schemas
  CLIGeneratorInputSchema,
  APIEndpointInputSchema,
  TypeDefinitionInputSchema,
  CLICommandGeneratorDecisionEventSchema,

  // Contract
  CLI_COMMAND_GENERATOR_CONTRACT,
} from './types.js';

// Core generation
export { generateCLICommands } from './generator.js';

// Decision event emission
export {
  type RuVectorClient,
  MockRuVectorClient,
  DecisionEmitter,
  createDecisionEmitter,
  createMockDecisionEmitter,
} from './decision-emitter.js';

// Telemetry
export {
  TelemetryEventType,
  type TelemetryEvent,
  type TelemetrySink,
  ConsoleTelemetrySink,
  BufferedTelemetrySink,
  TelemetryEmitter,
  createConsoleTelemetryEmitter,
  createBufferedTelemetryEmitter,
  generateExecutionRef,
} from './telemetry.js';

// Edge Function handlers
export {
  type EdgeFunctionRequest,
  type EdgeFunctionResponse,
  type AgentHandlerConfig,
  type HandlerResult,
  handleGenerate,
  edgeFunctionHandler,
  healthCheckHandler,
  contractHandler,
} from './handler.js';
