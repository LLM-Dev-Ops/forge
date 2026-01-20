/**
 * SDK Generator Agent
 *
 * Main entry point for the SDK Generator Agent module.
 *
 * @module agents/sdk-generator
 */

// Handler
export {
  handler,
  AGENT_ID,
  AGENT_VERSION,
  type EdgeFunctionContext,
  type EdgeFunctionResponse,
  CONFIRMATION_NO_EXECUTION,
  CONFIRMATION_NO_RUNTIME_MODIFICATION,
  CONFIRMATION_NO_ORCHESTRATION,
} from './handler.js';

// Validator
export {
  validateRequest,
  validateRawRequest,
  type ValidationResult,
  validators,
} from './validator.js';

// Confidence
export {
  calculateConfidence,
  calculateTypeMappingConfidence,
  type ConfidenceResult,
  confidenceCalculators,
} from './confidence.js';

// Emitter
export { DecisionEventEmitter, MockDecisionEventEmitter } from './emitter.js';
