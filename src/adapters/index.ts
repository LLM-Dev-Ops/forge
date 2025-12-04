/**
 * Upstream Integration Adapters
 *
 * This module exports thin adapter layers for consuming data from
 * LLM-Dev-Ops upstream repositories:
 *
 * - LLM-Connector-Hub: Provider metadata, routing definitions, adapter specs
 * - LLM-Schema-Registry: Model schemas, request/response specs, type definitions
 * - LLM-Config-Manager: SDK parameters, feature flags, provider availability
 *
 * These adapters provide backward-compatible, additive integration without
 * modifying existing SDK generation pipelines.
 *
 * @module adapters
 */

// Connector Hub Adapter
export {
  ConnectorHubAdapter,
  connectorHubAdapter,
  getConnectorHubAdapter,
} from './connector-hub-adapter.js';

export type {
  ConnectorHubCapabilities,
  ConnectorHubProviderMetadata,
  ConnectorHubRoutingDefinition,
  ConnectorHubAdapterSpec,
  ProviderDetectionResult,
} from './connector-hub-adapter.js';

// Schema Registry Adapter
export {
  SchemaRegistryAdapter,
  schemaRegistryAdapter,
  getSchemaRegistryAdapter,
} from './schema-registry-adapter.js';

export type {
  SchemaRegistryModelSchema,
  SchemaRegistryRequestResponseSpec,
  SchemaRegistryTypeSpec,
  SchemaRegistryPropertySpec,
  SchemaValidationResult,
  SchemaValidationError,
  SchemaValidationWarning,
  SchemaCompatibilityResult,
} from './schema-registry-adapter.js';

// Config Manager Adapter
export {
  ConfigManagerAdapter,
  configManagerAdapter,
  getConfigManagerAdapter,
} from './config-manager-adapter.js';

export type {
  ConfigManagerSDKParams,
  ConfigManagerFeatureFlags,
  ConfigManagerProviderAvailability,
  ConfigManagerVersioningPolicy,
  ConfigManagerConfiguration,
  ConfigValidationResult,
  ConfigMergeOptions,
} from './config-manager-adapter.js';
