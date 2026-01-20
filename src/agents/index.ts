/**
 * LLM-Forge Agents
 *
 * Central export point for all LLM-Forge agents and their contracts.
 *
 * @module agents
 */

// Contracts
export * from './contracts/index.js';

// SDK Generator Agent
export * from './sdk-generator/index.js';

// CLI Command Generator Agent
export * from './cli-command-generator/index.js';

// Version Compatibility Agent
export * from './version-compatibility-agent/index.js';

// =============================================================================
// AGENT REGISTRY
// =============================================================================

import { AGENT_ID, AGENT_VERSION } from './sdk-generator/index.js';
import {
  AGENT_CLASSIFICATION,
  NON_RESPONSIBILITIES,
  VERSIONING_RULES,
  PERSISTED_DATA,
  NON_PERSISTED_DATA,
  DOWNSTREAM_CONSUMERS,
} from './contracts/sdk-generator.contract.js';

import {
  CLI_AGENT_ID,
  CLI_AGENT_VERSION,
  AGENT_CLASSIFICATION as CLI_AGENT_CLASSIFICATION,
  NON_RESPONSIBILITIES as CLI_NON_RESPONSIBILITIES,
  VERSIONING_RULES as CLI_VERSIONING_RULES,
  PERSISTED_DATA as CLI_PERSISTED_DATA,
  NON_PERSISTED_DATA as CLI_NON_PERSISTED_DATA,
  DOWNSTREAM_CONSUMERS as CLI_DOWNSTREAM_CONSUMERS,
} from './contracts/cli-command-generator.contract.js';

import {
  AGENT_ID as VC_AGENT_ID,
  AGENT_VERSION as VC_AGENT_VERSION,
} from './version-compatibility-agent/index.js';
import {
  AGENT_CLASSIFICATION as VC_AGENT_CLASSIFICATION,
  NON_RESPONSIBILITIES as VC_NON_RESPONSIBILITIES,
  VERSIONING_RULES as VC_VERSIONING_RULES,
  PERSISTED_DATA as VC_PERSISTED_DATA,
  NON_PERSISTED_DATA as VC_NON_PERSISTED_DATA,
  DOWNSTREAM_CONSUMERS as VC_DOWNSTREAM_CONSUMERS,
} from './contracts/version-compatibility.contract.js';

/**
 * Agent metadata for registry
 */
export interface AgentMetadata {
  id: string;
  version: string;
  classification: typeof AGENT_CLASSIFICATION;
  nonResponsibilities: readonly string[];
  versioningRules: typeof VERSIONING_RULES;
  persistedData: readonly string[];
  nonPersistedData: readonly string[];
  downstreamConsumers: typeof DOWNSTREAM_CONSUMERS;
}

/**
 * Registered agents
 */
export const AGENTS: Record<string, AgentMetadata> = {
  [AGENT_ID]: {
    id: AGENT_ID,
    version: AGENT_VERSION,
    classification: AGENT_CLASSIFICATION,
    nonResponsibilities: NON_RESPONSIBILITIES,
    versioningRules: VERSIONING_RULES,
    persistedData: PERSISTED_DATA,
    nonPersistedData: NON_PERSISTED_DATA,
    downstreamConsumers: DOWNSTREAM_CONSUMERS,
  },
  [CLI_AGENT_ID]: {
    id: CLI_AGENT_ID,
    version: CLI_AGENT_VERSION,
    classification: CLI_AGENT_CLASSIFICATION,
    nonResponsibilities: CLI_NON_RESPONSIBILITIES,
    versioningRules: CLI_VERSIONING_RULES,
    persistedData: CLI_PERSISTED_DATA,
    nonPersistedData: CLI_NON_PERSISTED_DATA,
    downstreamConsumers: CLI_DOWNSTREAM_CONSUMERS,
  },
  [VC_AGENT_ID]: {
    id: VC_AGENT_ID,
    version: VC_AGENT_VERSION,
    classification: VC_AGENT_CLASSIFICATION,
    nonResponsibilities: VC_NON_RESPONSIBILITIES,
    versioningRules: VC_VERSIONING_RULES,
    persistedData: VC_PERSISTED_DATA,
    nonPersistedData: VC_NON_PERSISTED_DATA,
    downstreamConsumers: VC_DOWNSTREAM_CONSUMERS,
  },
};

/**
 * Get agent metadata by ID
 */
export function getAgentMetadata(agentId: string): AgentMetadata | undefined {
  return AGENTS[agentId];
}

/**
 * List all registered agents
 */
export function listAgents(): AgentMetadata[] {
  return Object.values(AGENTS);
}

/**
 * Check if an agent is registered
 */
export function isAgentRegistered(agentId: string): boolean {
  return agentId in AGENTS;
}
