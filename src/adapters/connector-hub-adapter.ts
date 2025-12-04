/**
 * LLM-Connector-Hub Adapter
 *
 * Thin adapter module for consuming provider metadata, routing definitions,
 * and adapter specifications from the LLM-Connector-Hub upstream repository.
 *
 * This adapter provides backward-compatible, additive integration without
 * modifying existing SDK generation pipelines.
 *
 * @module adapters/connector-hub-adapter
 */

import type { CanonicalSchema, SchemaMetadata } from '../types/canonical-schema.js';

/**
 * Provider capabilities as defined by Connector Hub
 */
export interface ConnectorHubCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  jsonMode: boolean;
  maxTokens?: number;
  supportsSystemMessage: boolean;
}

/**
 * Provider metadata from Connector Hub
 */
export interface ConnectorHubProviderMetadata {
  name: string;
  version: string;
  capabilities: ConnectorHubCapabilities;
  models?: string[];
  baseUrl?: string;
  authType?: 'api_key' | 'bearer' | 'oauth2';
}

/**
 * Routing definition from Connector Hub
 */
export interface ConnectorHubRoutingDefinition {
  strategy: 'cost-optimized' | 'latency-based' | 'health-monitoring' | 'failover';
  providers: string[];
  weights?: Record<string, number>;
  fallbackOrder?: string[];
}

/**
 * Adapter specification from Connector Hub
 */
export interface ConnectorHubAdapterSpec {
  providerId: string;
  requestTransform?: (request: unknown) => unknown;
  responseTransform?: (response: unknown) => unknown;
  errorMapping?: Record<string, string>;
}

/**
 * Result of provider detection using Connector Hub metadata
 */
export interface ProviderDetectionResult {
  detected: boolean;
  providerId?: string;
  confidence: number;
  method: 'header' | 'response_format' | 'model_name' | 'url' | 'manual';
}

/**
 * ConnectorHubAdapter provides consumption layer for LLM-Connector-Hub.
 *
 * This adapter enables Forge to:
 * - Consume provider metadata for enhanced SDK generation
 * - Utilize routing definitions for multi-provider scenarios
 * - Apply adapter specifications for request/response transformations
 *
 * @example
 * ```typescript
 * const adapter = new ConnectorHubAdapter();
 *
 * // Get provider metadata
 * const metadata = adapter.getProviderMetadata('openai');
 *
 * // Enrich canonical schema with capabilities
 * const enrichedSchema = adapter.enrichSchemaWithCapabilities(schema);
 * ```
 */
export class ConnectorHubAdapter {
  private providerRegistry: Map<string, ConnectorHubProviderMetadata> = new Map();
  private routingDefinitions: Map<string, ConnectorHubRoutingDefinition> = new Map();
  private adapterSpecs: Map<string, ConnectorHubAdapterSpec> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize the adapter by loading metadata from Connector Hub.
   * This is a lazy initialization that occurs on first use.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Attempt to load from llm-connector-hub package
      // This is wrapped in try-catch for graceful degradation
      await this.loadFromConnectorHub();
      this.initialized = true;
    } catch {
      // Fallback to built-in defaults if package not available
      this.loadBuiltInDefaults();
      this.initialized = true;
    }
  }

  /**
   * Load provider metadata from the llm-connector-hub package.
   * @internal
   */
  private async loadFromConnectorHub(): Promise<void> {
    // Dynamic import to avoid hard dependency
    // Using Function constructor to avoid TypeScript module resolution
    const importDynamic = new Function('modulePath', 'return import(modulePath)');
    const connectorHub = await (importDynamic('llm-connector-hub') as Promise<unknown>).catch(() => null);

    if (connectorHub) {
      // If package is available, register providers from it
      this.registerProvidersFromHub(connectorHub);
    } else {
      throw new Error('llm-connector-hub package not available');
    }
  }

  /**
   * Register providers from the Connector Hub package.
   * @internal
   */
  private registerProvidersFromHub(hub: unknown): void {
    // Type-safe extraction of provider metadata
    const hubAny = hub as Record<string, unknown>;

    // Check for common export patterns
    if (typeof hubAny.getProviders === 'function') {
      const providers = (hubAny.getProviders as () => ConnectorHubProviderMetadata[])();
      for (const provider of providers) {
        this.providerRegistry.set(provider.name.toLowerCase(), provider);
      }
    }
  }

  /**
   * Load built-in default provider definitions.
   * Used as fallback when llm-connector-hub is not available.
   * @internal
   */
  private loadBuiltInDefaults(): void {
    const defaultProviders: ConnectorHubProviderMetadata[] = [
      {
        name: 'openai',
        version: '1.0.0',
        capabilities: {
          streaming: true,
          functionCalling: true,
          vision: true,
          jsonMode: true,
          maxTokens: 128000,
          supportsSystemMessage: true,
        },
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        baseUrl: 'https://api.openai.com/v1',
        authType: 'bearer',
      },
      {
        name: 'anthropic',
        version: '1.0.0',
        capabilities: {
          streaming: true,
          functionCalling: true,
          vision: true,
          jsonMode: false,
          maxTokens: 200000,
          supportsSystemMessage: true,
        },
        models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
        baseUrl: 'https://api.anthropic.com/v1',
        authType: 'api_key',
      },
      {
        name: 'google',
        version: '1.0.0',
        capabilities: {
          streaming: true,
          functionCalling: true,
          vision: true,
          jsonMode: true,
          maxTokens: 1000000,
          supportsSystemMessage: true,
        },
        models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        authType: 'api_key',
      },
      {
        name: 'mistral',
        version: '1.0.0',
        capabilities: {
          streaming: true,
          functionCalling: true,
          vision: false,
          jsonMode: true,
          maxTokens: 32000,
          supportsSystemMessage: true,
        },
        models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
        baseUrl: 'https://api.mistral.ai/v1',
        authType: 'bearer',
      },
    ];

    for (const provider of defaultProviders) {
      this.providerRegistry.set(provider.name.toLowerCase(), provider);
    }
  }

  /**
   * Get provider metadata by provider ID.
   *
   * @param providerId - The provider identifier (e.g., 'openai', 'anthropic')
   * @returns Provider metadata or undefined if not found
   */
  async getProviderMetadata(providerId: string): Promise<ConnectorHubProviderMetadata | undefined> {
    await this.initialize();
    return this.providerRegistry.get(providerId.toLowerCase());
  }

  /**
   * Get all registered provider IDs.
   *
   * @returns Array of provider identifiers
   */
  async getRegisteredProviders(): Promise<string[]> {
    await this.initialize();
    return Array.from(this.providerRegistry.keys());
  }

  /**
   * Get provider capabilities for SDK generation hints.
   *
   * @param providerId - The provider identifier
   * @returns Capabilities object or undefined
   */
  async getProviderCapabilities(providerId: string): Promise<ConnectorHubCapabilities | undefined> {
    const metadata = await this.getProviderMetadata(providerId);
    return metadata?.capabilities;
  }

  /**
   * Enrich a canonical schema with Connector Hub capabilities metadata.
   * This adds provider-specific capabilities to the schema's metadata
   * without modifying the core structure.
   *
   * @param schema - The canonical schema to enrich
   * @returns Enriched schema with capabilities metadata
   */
  async enrichSchemaWithCapabilities(schema: CanonicalSchema): Promise<CanonicalSchema> {
    await this.initialize();

    const providerId = schema.metadata.providerId.toLowerCase();
    const capabilities = await this.getProviderCapabilities(providerId);

    if (!capabilities) {
      return schema;
    }

    // Create enriched metadata without modifying original
    const enrichedMetadata: SchemaMetadata = {
      ...schema.metadata,
      metadata: {
        ...schema.metadata.metadata,
        connectorHub: {
          capabilities,
          enrichedAt: new Date().toISOString(),
        },
      },
    };

    return {
      ...schema,
      metadata: enrichedMetadata,
    };
  }

  /**
   * Register a routing definition for multi-provider scenarios.
   *
   * @param name - Routing definition name
   * @param definition - The routing definition
   */
  registerRoutingDefinition(name: string, definition: ConnectorHubRoutingDefinition): void {
    this.routingDefinitions.set(name, definition);
  }

  /**
   * Get a routing definition by name.
   *
   * @param name - Routing definition name
   * @returns Routing definition or undefined
   */
  getRoutingDefinition(name: string): ConnectorHubRoutingDefinition | undefined {
    return this.routingDefinitions.get(name);
  }

  /**
   * Register an adapter specification for request/response transformation.
   *
   * @param providerId - Provider identifier
   * @param spec - Adapter specification
   */
  registerAdapterSpec(providerId: string, spec: ConnectorHubAdapterSpec): void {
    this.adapterSpecs.set(providerId.toLowerCase(), spec);
  }

  /**
   * Get adapter specification for a provider.
   *
   * @param providerId - Provider identifier
   * @returns Adapter specification or undefined
   */
  getAdapterSpec(providerId: string): ConnectorHubAdapterSpec | undefined {
    return this.adapterSpecs.get(providerId.toLowerCase());
  }

  /**
   * Detect provider from response using Connector Hub heuristics.
   *
   * @param response - The response object to analyze
   * @param headers - Optional HTTP headers
   * @param url - Optional request URL
   * @returns Detection result with confidence score
   */
  async detectProvider(
    response: unknown,
    headers?: Record<string, string>,
    url?: string
  ): Promise<ProviderDetectionResult> {
    await this.initialize();

    // Check headers first (highest confidence)
    if (headers) {
      const headerProvider = this.detectFromHeaders(headers);
      if (headerProvider) {
        return {
          detected: true,
          providerId: headerProvider,
          confidence: 0.95,
          method: 'header',
        };
      }
    }

    // Check URL patterns
    if (url) {
      const urlProvider = this.detectFromUrl(url);
      if (urlProvider) {
        return {
          detected: true,
          providerId: urlProvider,
          confidence: 0.9,
          method: 'url',
        };
      }
    }

    // Check response format
    const formatProvider = this.detectFromResponseFormat(response);
    if (formatProvider) {
      return {
        detected: true,
        providerId: formatProvider,
        confidence: 0.8,
        method: 'response_format',
      };
    }

    return {
      detected: false,
      confidence: 0,
      method: 'manual',
    };
  }

  /**
   * Detect provider from HTTP headers.
   * @internal
   */
  private detectFromHeaders(headers: Record<string, string>): string | undefined {
    const headerMap: Record<string, string> = {
      'x-openai-organization': 'openai',
      'anthropic-version': 'anthropic',
      'x-goog-api-client': 'google',
    };

    for (const [header, provider] of Object.entries(headerMap)) {
      if (headers[header] || headers[header.toLowerCase()]) {
        return provider;
      }
    }

    return undefined;
  }

  /**
   * Detect provider from URL patterns.
   * @internal
   */
  private detectFromUrl(url: string): string | undefined {
    const urlPatterns: Array<[RegExp, string]> = [
      [/api\.openai\.com/, 'openai'],
      [/api\.anthropic\.com/, 'anthropic'],
      [/generativelanguage\.googleapis\.com/, 'google'],
      [/api\.mistral\.ai/, 'mistral'],
      [/api\.cohere\.ai/, 'cohere'],
    ];

    for (const [pattern, provider] of urlPatterns) {
      if (pattern.test(url)) {
        return provider;
      }
    }

    return undefined;
  }

  /**
   * Detect provider from response format.
   * @internal
   */
  private detectFromResponseFormat(response: unknown): string | undefined {
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const resp = response as Record<string, unknown>;

    // OpenAI format detection
    if (resp.object === 'chat.completion' || resp.object === 'text_completion') {
      return 'openai';
    }

    // Anthropic format detection
    if (resp.type === 'message' && resp.role === 'assistant') {
      return 'anthropic';
    }

    // Google format detection
    if (resp.candidates && Array.isArray(resp.candidates)) {
      return 'google';
    }

    return undefined;
  }
}

/**
 * Singleton instance of the ConnectorHubAdapter.
 * Use this for shared access across the application.
 */
export const connectorHubAdapter = new ConnectorHubAdapter();

/**
 * Get the singleton ConnectorHubAdapter instance.
 *
 * @returns The singleton adapter instance
 */
export function getConnectorHubAdapter(): ConnectorHubAdapter {
  return connectorHubAdapter;
}
