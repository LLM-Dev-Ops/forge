/**
 * LLM-Forge - Cross-Provider SDK Generator
 *
 * Main library exports
 *
 * @module llm-forge
 */

// Types
export * from './types/index.js';

// Schema
export * from './schema/index.js';

// Parsers
export * from './parsers/index.js';

// Core
export * from './core/type-mapper.js';
export * from './core/template-engine.js';

// Generators
export * from './generators/index.js';

// Adapters (upstream integration layer)
export * from './adapters/index.js';

// Execution Context (Agentics Foundational Execution Unit)
export {
  ExecutionContext,
  extractExecutionHeaders,
  createArtifactRef,
  type ExecutionResponse,
  type RepoSpan,
  type AgentSpan,
  type ArtifactRef,
  type SpanStatus,
} from './service/execution-context.js';

// Cloud Function entry point (forge-agents)
export { handler } from './service/cloud-function.js';
