/**
 * Pipeline Context Types
 *
 * Types for multi-agent orchestration pipeline integration.
 * Enables forge-agents to participate as a step in a larger
 * orchestration pipeline, receiving context from upstream agents
 * and emitting typed artifacts for downstream consumers.
 *
 * @module types/pipeline-context
 */

import { randomUUID } from 'crypto';

// =============================================================================
// PIPELINE CONTEXT
// =============================================================================

/**
 * Output from a previous pipeline step
 */
export interface PipelineStepOutput {
  step_id: string;
  domain: string;
  agent: string;
  output: Record<string, unknown>;
}

/**
 * Execution metadata from the orchestrator
 */
export interface PipelineExecutionMetadata {
  trace_id: string;
  initiated_by: string;
  [key: string]: unknown;
}

/**
 * Pipeline context passed from upstream agents
 */
export interface PipelineContext {
  plan_id: string;
  step_id: string;
  previous_steps: PipelineStepOutput[];
  execution_metadata: PipelineExecutionMetadata;
}

// =============================================================================
// PIPELINE ARTIFACTS
// =============================================================================

/**
 * Artifact types produced by forge agents
 */
export type PipelineArtifactType =
  | 'forge_scaffold'
  | 'cli_wrapper'
  | 'api_translation'
  | 'version_report';

/**
 * Typed artifact reference for downstream consumption
 */
export interface PipelineArtifact {
  artifact_id: string;
  type: PipelineArtifactType;
  content: Record<string, unknown>;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Find a planner output in pipeline_context previous_steps.
 * Returns the planner step's output, or null if not found.
 */
export function findPlannerOutput(
  ctx?: PipelineContext
): Record<string, unknown> | null {
  if (!ctx?.previous_steps) return null;
  const step = ctx.previous_steps.find(
    (s) => s.agent === 'planner' && s.output?.plan
  );
  return step?.output ?? null;
}

/**
 * Find an SDK scaffold output in pipeline_context previous_steps.
 * Returns the SDK step's output, or null if not found.
 */
export function findSDKScaffoldOutput(
  ctx?: PipelineContext
): Record<string, unknown> | null {
  if (!ctx?.previous_steps) return null;
  const step = ctx.previous_steps.find(
    (s) => s.agent === 'sdk' && s.domain === 'forge'
  );
  return step?.output ?? null;
}

/**
 * Create a pipeline artifact with a generated UUID.
 */
export function createPipelineArtifact(
  type: PipelineArtifactType,
  content: Record<string, unknown>
): PipelineArtifact {
  return { artifact_id: randomUUID(), type, content };
}
