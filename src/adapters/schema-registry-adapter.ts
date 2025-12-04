/**
 * LLM-Schema-Registry Adapter
 *
 * Thin adapter module for consuming model schemas, request/response specifications,
 * and type definitions from the LLM-Schema-Registry upstream repository.
 *
 * This adapter provides backward-compatible, additive integration without
 * modifying existing SDK generation pipelines.
 *
 * @module adapters/schema-registry-adapter
 */

import type { CanonicalSchema, TypeDefinition, TypeKind } from '../types/canonical-schema.js';

/**
 * Model schema definition from Schema Registry
 */
export interface SchemaRegistryModelSchema {
  modelId: string;
  modelName: string;
  provider: string;
  version: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportedFeatures?: string[];
  inputSchema?: SchemaRegistryTypeSpec;
  outputSchema?: SchemaRegistryTypeSpec;
}

/**
 * Request/response specification from Schema Registry
 */
export interface SchemaRegistryRequestResponseSpec {
  operationId: string;
  requestSchema: SchemaRegistryTypeSpec;
  responseSchema: SchemaRegistryTypeSpec;
  streamingResponseSchema?: SchemaRegistryTypeSpec;
  errorSchemas?: Record<string, SchemaRegistryTypeSpec>;
}

/**
 * Type specification from Schema Registry
 */
export interface SchemaRegistryTypeSpec {
  name: string;
  kind: 'object' | 'array' | 'primitive' | 'enum' | 'union';
  properties?: Record<string, SchemaRegistryPropertySpec>;
  items?: SchemaRegistryTypeSpec;
  variants?: SchemaRegistryTypeSpec[];
  enumValues?: Array<string | number>;
  primitiveType?: 'string' | 'number' | 'boolean' | 'null';
  required?: string[];
  description?: string;
}

/**
 * Property specification from Schema Registry
 */
export interface SchemaRegistryPropertySpec {
  type: SchemaRegistryTypeSpec;
  required?: boolean;
  description?: string;
  default?: unknown;
  deprecated?: boolean;
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors?: SchemaValidationError[];
  warnings?: SchemaValidationWarning[];
}

/**
 * Schema validation error
 */
export interface SchemaValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Schema validation warning
 */
export interface SchemaValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

/**
 * Schema compatibility check result
 */
export interface SchemaCompatibilityResult {
  compatible: boolean;
  breakingChanges?: string[];
  addedFields?: string[];
  removedFields?: string[];
  typeChanges?: Array<{
    path: string;
    from: string;
    to: string;
  }>;
}

/**
 * SchemaRegistryAdapter provides consumption layer for LLM-Schema-Registry.
 *
 * This adapter enables Forge to:
 * - Consume model schemas for type-safe SDK generation
 * - Utilize request/response specifications for endpoint modeling
 * - Apply type definitions for cross-provider type unification
 *
 * @example
 * ```typescript
 * const adapter = new SchemaRegistryAdapter();
 *
 * // Get model schema
 * const modelSchema = await adapter.getModelSchema('gpt-4o');
 *
 * // Validate canonical schema against registry
 * const validation = await adapter.validateSchema(canonicalSchema);
 * ```
 */
export class SchemaRegistryAdapter {
  private modelSchemas: Map<string, SchemaRegistryModelSchema> = new Map();
  private requestResponseSpecs: Map<string, SchemaRegistryRequestResponseSpec> = new Map();
  private typeDefinitions: Map<string, SchemaRegistryTypeSpec> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize the adapter by loading schemas from Schema Registry.
   * This is a lazy initialization that occurs on first use.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Attempt to load from llm-schema-registry package
      await this.loadFromSchemaRegistry();
      this.initialized = true;
    } catch {
      // Fallback to built-in defaults if package not available
      this.loadBuiltInDefaults();
      this.initialized = true;
    }
  }

  /**
   * Load schemas from the llm-schema-registry package.
   * @internal
   */
  private async loadFromSchemaRegistry(): Promise<void> {
    // Dynamic import to avoid hard dependency
    // Using Function constructor to avoid TypeScript module resolution
    const importDynamic = new Function('modulePath', 'return import(modulePath)');
    const schemaRegistry = await (importDynamic('llm-schema-registry') as Promise<unknown>).catch(() => null);

    if (schemaRegistry) {
      this.registerSchemasFromRegistry(schemaRegistry);
    } else {
      throw new Error('llm-schema-registry package not available');
    }
  }

  /**
   * Register schemas from the Schema Registry package.
   * @internal
   */
  private registerSchemasFromRegistry(registry: unknown): void {
    const registryAny = registry as Record<string, unknown>;

    // Check for common export patterns
    if (typeof registryAny.getModelSchemas === 'function') {
      const schemas = (registryAny.getModelSchemas as () => SchemaRegistryModelSchema[])();
      for (const schema of schemas) {
        this.modelSchemas.set(schema.modelId.toLowerCase(), schema);
      }
    }

    if (typeof registryAny.getRequestResponseSpecs === 'function') {
      const specs = (registryAny.getRequestResponseSpecs as () => SchemaRegistryRequestResponseSpec[])();
      for (const spec of specs) {
        this.requestResponseSpecs.set(spec.operationId.toLowerCase(), spec);
      }
    }

    if (typeof registryAny.getTypeDefinitions === 'function') {
      const types = (registryAny.getTypeDefinitions as () => Array<SchemaRegistryTypeSpec & { id: string }>)();
      for (const type of types) {
        this.typeDefinitions.set(type.id || type.name.toLowerCase(), type);
      }
    }
  }

  /**
   * Load built-in default schema definitions.
   * Used as fallback when llm-schema-registry is not available.
   * @internal
   */
  private loadBuiltInDefaults(): void {
    const defaultModelSchemas: SchemaRegistryModelSchema[] = [
      {
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        provider: 'openai',
        version: '2024-05-13',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportedFeatures: ['chat', 'vision', 'function_calling', 'json_mode'],
      },
      {
        modelId: 'gpt-4o-mini',
        modelName: 'GPT-4o Mini',
        provider: 'openai',
        version: '2024-07-18',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportedFeatures: ['chat', 'vision', 'function_calling', 'json_mode'],
      },
      {
        modelId: 'claude-3-5-sonnet-20241022',
        modelName: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        version: '2024-10-22',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportedFeatures: ['chat', 'vision', 'tool_use'],
      },
      {
        modelId: 'claude-3-opus-20240229',
        modelName: 'Claude 3 Opus',
        provider: 'anthropic',
        version: '2024-02-29',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportedFeatures: ['chat', 'vision', 'tool_use'],
      },
      {
        modelId: 'gemini-1.5-pro',
        modelName: 'Gemini 1.5 Pro',
        provider: 'google',
        version: '1.5',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportedFeatures: ['chat', 'vision', 'function_calling'],
      },
      {
        modelId: 'mistral-large-latest',
        modelName: 'Mistral Large',
        provider: 'mistral',
        version: 'latest',
        contextWindow: 32000,
        maxOutputTokens: 8192,
        supportedFeatures: ['chat', 'function_calling', 'json_mode'],
      },
    ];

    for (const schema of defaultModelSchemas) {
      this.modelSchemas.set(schema.modelId.toLowerCase(), schema);
    }

    // Default request/response specs for common operations
    const defaultSpecs: SchemaRegistryRequestResponseSpec[] = [
      {
        operationId: 'chat_completion',
        requestSchema: {
          name: 'ChatCompletionRequest',
          kind: 'object',
          properties: {
            model: { type: { name: 'string', kind: 'primitive', primitiveType: 'string' }, required: true },
            messages: {
              type: {
                name: 'messages',
                kind: 'array',
                items: { name: 'Message', kind: 'object' },
              },
              required: true,
            },
            temperature: { type: { name: 'number', kind: 'primitive', primitiveType: 'number' }, required: false },
            max_tokens: { type: { name: 'number', kind: 'primitive', primitiveType: 'number' }, required: false },
            stream: { type: { name: 'boolean', kind: 'primitive', primitiveType: 'boolean' }, required: false },
          },
          required: ['model', 'messages'],
        },
        responseSchema: {
          name: 'ChatCompletionResponse',
          kind: 'object',
          properties: {
            id: { type: { name: 'string', kind: 'primitive', primitiveType: 'string' }, required: true },
            object: { type: { name: 'string', kind: 'primitive', primitiveType: 'string' }, required: true },
            created: { type: { name: 'number', kind: 'primitive', primitiveType: 'number' }, required: true },
            model: { type: { name: 'string', kind: 'primitive', primitiveType: 'string' }, required: true },
            choices: {
              type: {
                name: 'choices',
                kind: 'array',
                items: { name: 'Choice', kind: 'object' },
              },
              required: true,
            },
            usage: { type: { name: 'Usage', kind: 'object' }, required: false },
          },
          required: ['id', 'object', 'created', 'model', 'choices'],
        },
        streamingResponseSchema: {
          name: 'ChatCompletionChunk',
          kind: 'object',
          properties: {
            id: { type: { name: 'string', kind: 'primitive', primitiveType: 'string' }, required: true },
            object: { type: { name: 'string', kind: 'primitive', primitiveType: 'string' }, required: true },
            created: { type: { name: 'number', kind: 'primitive', primitiveType: 'number' }, required: true },
            model: { type: { name: 'string', kind: 'primitive', primitiveType: 'string' }, required: true },
            choices: {
              type: {
                name: 'choices',
                kind: 'array',
                items: { name: 'ChunkChoice', kind: 'object' },
              },
              required: true,
            },
          },
          required: ['id', 'object', 'created', 'model', 'choices'],
        },
      },
    ];

    for (const spec of defaultSpecs) {
      this.requestResponseSpecs.set(spec.operationId.toLowerCase(), spec);
    }
  }

  /**
   * Get model schema by model ID.
   *
   * @param modelId - The model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022')
   * @returns Model schema or undefined if not found
   */
  async getModelSchema(modelId: string): Promise<SchemaRegistryModelSchema | undefined> {
    await this.initialize();
    return this.modelSchemas.get(modelId.toLowerCase());
  }

  /**
   * Get all registered model IDs.
   *
   * @returns Array of model identifiers
   */
  async getRegisteredModels(): Promise<string[]> {
    await this.initialize();
    return Array.from(this.modelSchemas.keys());
  }

  /**
   * Get models by provider.
   *
   * @param provider - Provider identifier
   * @returns Array of model schemas for the provider
   */
  async getModelsByProvider(provider: string): Promise<SchemaRegistryModelSchema[]> {
    await this.initialize();
    return Array.from(this.modelSchemas.values()).filter(
      (schema) => schema.provider.toLowerCase() === provider.toLowerCase()
    );
  }

  /**
   * Get request/response specification by operation ID.
   *
   * @param operationId - The operation identifier
   * @returns Request/response spec or undefined
   */
  async getRequestResponseSpec(operationId: string): Promise<SchemaRegistryRequestResponseSpec | undefined> {
    await this.initialize();
    return this.requestResponseSpecs.get(operationId.toLowerCase());
  }

  /**
   * Get type definition by ID.
   *
   * @param typeId - The type identifier
   * @returns Type specification or undefined
   */
  async getTypeDefinition(typeId: string): Promise<SchemaRegistryTypeSpec | undefined> {
    await this.initialize();
    return this.typeDefinitions.get(typeId.toLowerCase());
  }

  /**
   * Validate a canonical schema against Schema Registry specifications.
   *
   * @param schema - The canonical schema to validate
   * @returns Validation result
   */
  async validateSchema(schema: CanonicalSchema): Promise<SchemaValidationResult> {
    await this.initialize();

    const errors: SchemaValidationError[] = [];
    const warnings: SchemaValidationWarning[] = [];

    // Validate metadata
    if (!schema.metadata.providerId) {
      errors.push({
        path: 'metadata.providerId',
        message: 'Provider ID is required',
        code: 'MISSING_PROVIDER_ID',
      });
    }

    // Validate types
    for (const type of schema.types) {
      this.validateTypeDefinition(type, errors, warnings);
    }

    // Validate endpoints
    for (const endpoint of schema.endpoints) {
      if (!endpoint.operationId) {
        errors.push({
          path: `endpoints.${endpoint.id}`,
          message: 'Operation ID is required for all endpoints',
          code: 'MISSING_OPERATION_ID',
        });
      }

      // Check if we have a spec for this operation
      const spec = await this.getRequestResponseSpec(endpoint.operationId);
      if (!spec) {
        warnings.push({
          path: `endpoints.${endpoint.id}`,
          message: `No registry specification found for operation: ${endpoint.operationId}`,
          suggestion: 'Consider registering this operation in Schema Registry',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate a type definition.
   * @internal
   */
  private validateTypeDefinition(
    type: TypeDefinition,
    errors: SchemaValidationError[],
    warnings: SchemaValidationWarning[]
  ): void {
    if (!type.id) {
      errors.push({
        path: `types.${type.name}`,
        message: 'Type ID is required',
        code: 'MISSING_TYPE_ID',
      });
    }

    if (!type.name) {
      errors.push({
        path: `types.${type.id}`,
        message: 'Type name is required',
        code: 'MISSING_TYPE_NAME',
      });
    }

    // Kind-specific validation
    switch (type.kind) {
      case 'object' as TypeKind:
        if (!('properties' in type) || !type.properties) {
          warnings.push({
            path: `types.${type.id}`,
            message: 'Object type has no properties defined',
            suggestion: 'Consider adding properties or using a different type kind',
          });
        }
        break;
      case 'array' as TypeKind:
        if (!('items' in type) || !type.items) {
          errors.push({
            path: `types.${type.id}`,
            message: 'Array type must have items defined',
            code: 'MISSING_ARRAY_ITEMS',
          });
        }
        break;
      case 'enum' as TypeKind:
        if (!('values' in type) || !type.values || type.values.length === 0) {
          errors.push({
            path: `types.${type.id}`,
            message: 'Enum type must have at least one value',
            code: 'EMPTY_ENUM',
          });
        }
        break;
    }
  }

  /**
   * Check compatibility between two canonical schemas.
   *
   * @param oldSchema - The previous schema version
   * @param newSchema - The new schema version
   * @returns Compatibility check result
   */
  async checkCompatibility(
    oldSchema: CanonicalSchema,
    newSchema: CanonicalSchema
  ): Promise<SchemaCompatibilityResult> {
    await this.initialize();

    const breakingChanges: string[] = [];
    const addedFields: string[] = [];
    const removedFields: string[] = [];
    const typeChanges: Array<{ path: string; from: string; to: string }> = [];

    // Compare types
    const oldTypeMap = new Map(oldSchema.types.map((t) => [t.id, t]));
    const newTypeMap = new Map(newSchema.types.map((t) => [t.id, t]));

    // Check for removed types
    for (const [id, oldType] of oldTypeMap) {
      if (!newTypeMap.has(id)) {
        breakingChanges.push(`Type removed: ${oldType.name} (${id})`);
        removedFields.push(`type:${id}`);
      }
    }

    // Check for added types
    for (const [id, newType] of newTypeMap) {
      if (!oldTypeMap.has(id)) {
        addedFields.push(`type:${id} (${newType.name})`);
      }
    }

    // Compare endpoints
    const oldEndpointMap = new Map(oldSchema.endpoints.map((e) => [e.id, e]));
    const newEndpointMap = new Map(newSchema.endpoints.map((e) => [e.id, e]));

    // Check for removed endpoints (breaking)
    for (const [id, oldEndpoint] of oldEndpointMap) {
      if (!newEndpointMap.has(id)) {
        breakingChanges.push(`Endpoint removed: ${oldEndpoint.operationId} (${oldEndpoint.path})`);
      }
    }

    // Check for added endpoints (non-breaking)
    for (const [id, newEndpoint] of newEndpointMap) {
      if (!oldEndpointMap.has(id)) {
        addedFields.push(`endpoint:${newEndpoint.operationId} (${newEndpoint.path})`);
      }
    }

    return {
      compatible: breakingChanges.length === 0,
      breakingChanges: breakingChanges.length > 0 ? breakingChanges : undefined,
      addedFields: addedFields.length > 0 ? addedFields : undefined,
      removedFields: removedFields.length > 0 ? removedFields : undefined,
      typeChanges: typeChanges.length > 0 ? typeChanges : undefined,
    };
  }

  /**
   * Enrich a canonical schema with Schema Registry type information.
   *
   * @param schema - The canonical schema to enrich
   * @returns Enriched schema with registry metadata
   */
  async enrichSchemaWithRegistryTypes(schema: CanonicalSchema): Promise<CanonicalSchema> {
    await this.initialize();

    // Create enriched metadata
    const enrichedMetadata = {
      ...schema.metadata,
      metadata: {
        ...schema.metadata.metadata,
        schemaRegistry: {
          enrichedAt: new Date().toISOString(),
          registeredModels: await this.getModelsByProvider(schema.metadata.providerId),
        },
      },
    };

    return {
      ...schema,
      metadata: enrichedMetadata,
    };
  }
}

/**
 * Singleton instance of the SchemaRegistryAdapter.
 * Use this for shared access across the application.
 */
export const schemaRegistryAdapter = new SchemaRegistryAdapter();

/**
 * Get the singleton SchemaRegistryAdapter instance.
 *
 * @returns The singleton adapter instance
 */
export function getSchemaRegistryAdapter(): SchemaRegistryAdapter {
  return schemaRegistryAdapter;
}
