/**
 * API Translator
 *
 * Core translation engine for converting between REST, SDK, and CLI representations.
 *
 * This is the RUNTIME implementation of the API Translation Agent.
 * It follows the contract defined in api-translation.contract.ts.
 *
 * @module translators/api-translator
 */

import { createHash, randomUUID } from 'crypto';
import type {
  CanonicalSchema,
  EndpointDefinition,
  TypeDefinition,
  ParameterDefinition,
  ParameterLocation,
} from '../types/canonical-schema.js';
import { HTTPMethod } from '../types/canonical-schema.js';
import {
  type APITranslationRequest,
  type APITranslationResponse,
  type TranslationResult,
  type TranslationMapping,
  type CompatibilityIssue,
  type RESTEndpoint,
  type SDKMethod,
  type CLICommand,
  InterfaceFormat,
  REST_TO_SDK_RULES,
  SDK_TO_CLI_RULES,
  CLI_TO_REST_RULES,
  TranslationFailureMode,
  APITranslationRequestSchema,
} from '../agents/contracts/api-translation.contract.js';
import { TranslationEventFactory, hashObject } from '../agents/contracts/decision-events.js';

/** Agent version constant */
const AGENT_VERSION = '1.0.0';

/**
 * Translation options
 */
export interface TranslatorOptions {
  /** Emit decision events */
  emitEvents?: boolean;
  /** Event callback for ruvector-service integration */
  onEvent?: (event: unknown) => void;
}

/**
 * APITranslator class
 *
 * Translates between REST, SDK, and CLI representations while
 * preserving semantic equivalence.
 */
export class APITranslator {
  private eventFactory: TranslationEventFactory;
  private options: TranslatorOptions;

  constructor(options: TranslatorOptions = {}) {
    this.eventFactory = new TranslationEventFactory(AGENT_VERSION);
    this.options = options;
  }

  /**
   * Execute a translation request
   *
   * @param request - Translation request
   * @returns Translation response
   */
  async translate(request: APITranslationRequest): Promise<APITranslationResponse> {
    const startTime = Date.now();
    const inputHash = hashObject(request);

    // Validate request
    const validation = APITranslationRequestSchema.safeParse(request);
    if (!validation.success) {
      return this.createErrorResponse(request.requestId, inputHash, [
        `Invalid request: ${validation.error.message}`,
      ]);
    }

    // Emit initiated event
    if (this.options.emitEvents && this.options.onEvent) {
      this.options.onEvent(
        this.eventFactory.createInitiatedEvent(request.requestId, inputHash, {
          sourceFormat: request.direction.from,
          targetFormat: request.direction.to,
          sourceElementCount: this.countSourceElements(request),
          schemaVersion: request.sourceSchema?.metadata?.version,
          strict: request.options?.strict ?? false,
        })
      );
    }

    try {
      const result = await this.executeTranslation(request);
      const durationMs = Date.now() - startTime;
      const outputHash = hashObject(result);

      // Emit completed event
      if (this.options.emitEvents && this.options.onEvent) {
        this.options.onEvent(
          this.eventFactory.createCompletedEvent(request.requestId, inputHash, outputHash, {
            success: true,
            sourceFormat: request.direction.from,
            targetFormat: request.direction.to,
            translatedElementCount: this.countResultElements(result),
            mappingCount: result.mappings.length,
            durationMs,
            overallConfidence: result.overallConfidence,
            warningCount: result.issues.filter((i: CompatibilityIssue) => i.severity === 'warning').length,
            errorCount: result.issues.filter((i: CompatibilityIssue) => i.severity === 'error').length,
            determinismHash: outputHash,
          })
        );
      }

      return {
        requestId: request.requestId,
        success: true,
        result,
        compatibility: {
          schemaVersion: request.sourceSchema?.metadata?.version ?? '1.0.0',
          agentVersion: AGENT_VERSION,
          translatedAt: new Date().toISOString(),
          determinismHash: outputHash,
        },
        warnings: result.issues.filter((i: CompatibilityIssue) => i.severity === 'warning').map((i: CompatibilityIssue) => i.message),
        errors: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Emit failed event
      if (this.options.emitEvents && this.options.onEvent) {
        this.options.onEvent(
          this.eventFactory.createFailedEvent(request.requestId, inputHash, {
            failureMode: TranslationFailureMode.INCOMPATIBLE_SCHEMA,
            errorMessage,
            recoverable: false,
            partialResults: false,
            sourceFormat: request.direction.from,
            targetFormat: request.direction.to,
          })
        );
      }

      return this.createErrorResponse(request.requestId, inputHash, [errorMessage]);
    }
  }

  /**
   * Execute the translation based on direction
   */
  private async executeTranslation(request: APITranslationRequest): Promise<TranslationResult> {
    const { direction, sourceSchema, restEndpoints, sdkMethods, cliCommands, options } = request;
    const mappings: TranslationMapping[] = [];
    const issues: CompatibilityIssue[] = [];

    let result: Partial<TranslationResult> = {
      direction,
      mappings,
      issues,
      overallConfidence: 1.0,
    };

    // Execute translation based on direction
    if (direction.from === InterfaceFormat.REST && direction.to === InterfaceFormat.SDK) {
      const endpoints = restEndpoints ?? this.extractRESTEndpoints(sourceSchema);
      const translated = this.translateRESTToSDK(endpoints, mappings, issues, options);
      result.sdkMethods = translated;
    } else if (direction.from === InterfaceFormat.REST && direction.to === InterfaceFormat.CLI) {
      const endpoints = restEndpoints ?? this.extractRESTEndpoints(sourceSchema);
      const translated = this.translateRESTToCLI(endpoints, mappings, issues, options);
      result.cliCommands = translated;
    } else if (direction.from === InterfaceFormat.SDK && direction.to === InterfaceFormat.REST) {
      if (!sdkMethods) {
        throw new Error('SDK methods required for SDK → REST translation');
      }
      const translated = this.translateSDKToREST(sdkMethods, mappings, issues, options);
      result.restEndpoints = translated;
    } else if (direction.from === InterfaceFormat.SDK && direction.to === InterfaceFormat.CLI) {
      if (!sdkMethods) {
        throw new Error('SDK methods required for SDK → CLI translation');
      }
      const translated = this.translateSDKToCLI(sdkMethods, mappings, issues, options);
      result.cliCommands = translated;
    } else if (direction.from === InterfaceFormat.CLI && direction.to === InterfaceFormat.REST) {
      if (!cliCommands) {
        throw new Error('CLI commands required for CLI → REST translation');
      }
      const translated = this.translateCLIToREST(cliCommands, mappings, issues, options);
      result.restEndpoints = translated;
    } else if (direction.from === InterfaceFormat.CLI && direction.to === InterfaceFormat.SDK) {
      if (!cliCommands) {
        throw new Error('CLI commands required for CLI → SDK translation');
      }
      const translated = this.translateCLIToSDK(cliCommands, mappings, issues, options);
      result.sdkMethods = translated;
    } else {
      throw new Error(`Unsupported translation direction: ${direction.from} → ${direction.to}`);
    }

    // Calculate overall confidence
    result.overallConfidence = this.calculateOverallConfidence(mappings, issues);

    // Check strict mode
    if (options?.strict && result.overallConfidence < 1.0) {
      throw new Error(
        `Semantic loss detected in strict mode. Confidence: ${result.overallConfidence}`
      );
    }

    return result as TranslationResult;
  }

  // =============================================================================
  // REST → SDK TRANSLATION
  // =============================================================================

  private translateRESTToSDK(
    endpoints: RESTEndpoint[],
    mappings: TranslationMapping[],
    issues: CompatibilityIssue[],
    options?: APITranslationRequest['options']
  ): SDKMethod[] {
    const methods: SDKMethod[] = [];

    for (const endpoint of endpoints) {
      const methodName = this.deriveSDKMethodName(endpoint);
      const className = this.deriveClassName(endpoint);

      const method: SDKMethod = {
        name: methodName,
        className,
        parameters: this.convertRESTParamsToSDK(endpoint),
        returnType: endpoint.responseType ?? 'unknown',
        async: true,
        streaming: endpoint.streaming,
        description: `${endpoint.method} ${endpoint.path}`,
        throws: ['ApiError'],
      };

      methods.push(method);

      // Record mapping
      mappings.push({
        sourceId: endpoint.operationId,
        sourceFormat: InterfaceFormat.REST,
        targetId: `${className}.${methodName}`,
        targetFormat: InterfaceFormat.SDK,
        confidence: 1.0,
        transformation: 'REST_TO_SDK_METHOD',
      });
    }

    return methods;
  }

  private deriveSDKMethodName(endpoint: RESTEndpoint): string {
    // Use operation ID if available, otherwise derive from method + path
    if (endpoint.operationId) {
      return this.toCamelCase(endpoint.operationId);
    }

    const method = endpoint.method.toLowerCase();
    const pathParts = endpoint.path.split('/').filter((p: string) => p && !p.startsWith('{'));
    const resource = pathParts[pathParts.length - 1] ?? 'resource';

    const prefix =
      REST_TO_SDK_RULES.methodNaming[endpoint.method as keyof typeof REST_TO_SDK_RULES.methodNaming]
        ?.replace('{Resource}', '') ?? method;

    return prefix + this.toPascalCase(resource);
  }

  private deriveClassName(endpoint: RESTEndpoint): string {
    // Derive class name from tags or path
    if (endpoint.tags.length > 0 && endpoint.tags[0]) {
      return this.toPascalCase(endpoint.tags[0]) + 'Client';
    }

    const pathParts = endpoint.path.split('/').filter((p: string) => p && !p.startsWith('{'));
    const resource = pathParts[0] ?? 'Api';
    return this.toPascalCase(resource) + 'Client';
  }

  private convertRESTParamsToSDK(
    endpoint: RESTEndpoint
  ): SDKMethod['parameters'] {
    const params: SDKMethod['parameters'] = [];

    // Path parameters (positional)
    for (const param of endpoint.pathParams) {
      params.push({
        name: this.toCamelCase(param),
        type: 'string',
        required: true,
      });
    }

    // Request body
    if (endpoint.requestBody) {
      params.push({
        name: 'data',
        type: endpoint.requestBody,
        required: true,
      });
    }

    // Query parameters (as options object)
    if (endpoint.queryParams.length > 0) {
      params.push({
        name: 'options',
        type: `{ ${endpoint.queryParams.map((q: string) => `${this.toCamelCase(q)}?: string`).join('; ')} }`,
        required: false,
      });
    }

    return params;
  }

  // =============================================================================
  // REST → CLI TRANSLATION
  // =============================================================================

  private translateRESTToCLI(
    endpoints: RESTEndpoint[],
    mappings: TranslationMapping[],
    issues: CompatibilityIssue[],
    options?: APITranslationRequest['options']
  ): CLICommand[] {
    const commands: CLICommand[] = [];

    for (const endpoint of endpoints) {
      const commandName = this.deriveCLICommandName(endpoint);
      const parent = endpoint.tags[0] ? this.toKebabCase(endpoint.tags[0]) : undefined;

      const command: CLICommand = {
        command: commandName,
        parent,
        arguments: this.convertRESTPathParamsToCLIArgs(endpoint),
        options: this.convertRESTQueryParamsToCLIOptions(endpoint),
        description: `${endpoint.method} ${endpoint.path}`,
        examples: [`${parent ? parent + ' ' : ''}${commandName} <id>`],
      };

      commands.push(command);

      // Record mapping
      mappings.push({
        sourceId: endpoint.operationId,
        sourceFormat: InterfaceFormat.REST,
        targetId: parent ? `${parent} ${commandName}` : commandName,
        targetFormat: InterfaceFormat.CLI,
        confidence: 1.0,
        transformation: 'REST_TO_CLI_COMMAND',
      });
    }

    return commands;
  }

  private deriveCLICommandName(endpoint: RESTEndpoint): string {
    // Derive command name from operation ID or method + resource
    if (endpoint.operationId) {
      return this.toKebabCase(endpoint.operationId);
    }

    const method = endpoint.method.toLowerCase();
    const pathParts = endpoint.path.split('/').filter((p: string) => p && !p.startsWith('{'));
    const resource = pathParts[pathParts.length - 1] ?? 'resource';

    return `${method}-${this.toKebabCase(resource)}`;
  }

  private convertRESTPathParamsToCLIArgs(
    endpoint: RESTEndpoint
  ): CLICommand['arguments'] {
    return endpoint.pathParams.map((param: string) => ({
      name: this.toKebabCase(param),
      description: `${param} parameter`,
      required: true,
      variadic: false,
    }));
  }

  private convertRESTQueryParamsToCLIOptions(
    endpoint: RESTEndpoint
  ): CLICommand['options'] {
    const options: CLICommand['options'] = endpoint.queryParams.map((param: string) => ({
      flag: `--${this.toKebabCase(param)} <value>`,
      description: `${param} parameter`,
      type: 'string' as const,
      required: false,
    }));

    // Add common options
    options.push({
      flag: '-o, --output <format>',
      description: 'Output format (json, table)',
      type: 'string' as const,
      required: false,
      default: 'json',
    });

    return options;
  }

  // =============================================================================
  // SDK → REST TRANSLATION
  // =============================================================================

  private translateSDKToREST(
    methods: SDKMethod[],
    mappings: TranslationMapping[],
    issues: CompatibilityIssue[],
    options?: APITranslationRequest['options']
  ): RESTEndpoint[] {
    const endpoints: RESTEndpoint[] = [];

    for (const method of methods) {
      const httpMethod = this.inferHTTPMethod(method.name);
      const path = this.deriveRESTPath(method);

      const endpoint: RESTEndpoint = {
        method: httpMethod,
        path,
        operationId: `${method.className}_${method.name}`,
        pathParams: this.extractPathParams(method.parameters),
        queryParams: this.extractQueryParams(method.parameters),
        headerParams: [],
        requestBody: this.extractRequestBodyType(method.parameters),
        responseType: method.returnType,
        contentType: 'application/json',
        streaming: method.streaming,
        tags: [method.className.replace('Client', '')],
      };

      endpoints.push(endpoint);

      // Record mapping
      mappings.push({
        sourceId: `${method.className}.${method.name}`,
        sourceFormat: InterfaceFormat.SDK,
        targetId: `${httpMethod} ${path}`,
        targetFormat: InterfaceFormat.REST,
        confidence: 0.9, // Heuristic mapping
        transformation: 'SDK_TO_REST_ENDPOINT',
        semanticLoss: 'HTTP method inferred from method name',
      });
    }

    return endpoints;
  }

  private inferHTTPMethod(methodName: string): RESTEndpoint['method'] {
    const name = methodName.toLowerCase();
    if (name.startsWith('get') || name.startsWith('list') || name.startsWith('fetch')) {
      return 'GET';
    }
    if (name.startsWith('create') || name.startsWith('add') || name.startsWith('post')) {
      return 'POST';
    }
    if (name.startsWith('update') || name.startsWith('put') || name.startsWith('replace')) {
      return 'PUT';
    }
    if (name.startsWith('patch') || name.startsWith('modify')) {
      return 'PATCH';
    }
    if (name.startsWith('delete') || name.startsWith('remove')) {
      return 'DELETE';
    }
    return 'POST'; // Default
  }

  private deriveRESTPath(method: SDKMethod): string {
    const resource = this.toKebabCase(method.className.replace('Client', ''));
    type SDKParam = { name: string; type: string; required: boolean; default?: unknown };
    const pathParams = method.parameters.filter((p: SDKParam) => p.required && p.type === 'string');

    let path = `/${resource}`;
    for (const param of pathParams.slice(0, 1)) {
      // Only first required string param as path param
      path += `/{${param.name}}`;
    }

    return path;
  }

  private extractPathParams(params: SDKMethod['parameters']): string[] {
    type SDKParam = { name: string; type: string; required: boolean; default?: unknown };
    return params.filter((p: SDKParam) => p.required && p.type === 'string').map((p: SDKParam) => p.name);
  }

  private extractQueryParams(params: SDKMethod['parameters']): string[] {
    // Look for options object type parameters
    type SDKParam = { name: string; type: string; required: boolean; default?: unknown };
    const optionsParam = params.find((p: SDKParam) => p.name === 'options');
    if (optionsParam && optionsParam.type.includes('{')) {
      // Parse simple object type like { key?: string; }
      const matches = optionsParam.type.match(/(\w+)\??\s*:/g);
      if (matches) {
        return matches.map((m: string) => m.replace(/[?:]/g, '').trim());
      }
    }
    return [];
  }

  private extractRequestBodyType(params: SDKMethod['parameters']): string | undefined {
    type SDKParam = { name: string; type: string; required: boolean; default?: unknown };
    const dataParam = params.find((p: SDKParam) => p.name === 'data');
    return dataParam?.type;
  }

  // =============================================================================
  // SDK → CLI TRANSLATION
  // =============================================================================

  private translateSDKToCLI(
    methods: SDKMethod[],
    mappings: TranslationMapping[],
    issues: CompatibilityIssue[],
    options?: APITranslationRequest['options']
  ): CLICommand[] {
    const commands: CLICommand[] = [];

    for (const method of methods) {
      const commandName = this.toKebabCase(method.name);
      const parent = this.toKebabCase(method.className.replace('Client', ''));

      const command: CLICommand = {
        command: commandName,
        parent,
        arguments: method.parameters
          .filter((p: { name: string; type: string; required: boolean }) => p.required && !p.name.includes('options'))
          .map((p: { name: string; type: string; required: boolean }) => ({
            name: this.toKebabCase(p.name),
            description: `${p.name} (${p.type})`,
            required: p.required,
            variadic: false,
          })),
        options: method.parameters
          .filter((p: { name: string; type: string; required: boolean; default?: unknown }) => !p.required)
          .map((p: { name: string; type: string; required: boolean; default?: unknown }) => ({
            flag: `--${this.toKebabCase(p.name)} <value>`,
            description: `${p.name} parameter`,
            type: 'string' as const,
            required: false,
            default: p.default,
          })),
        description: method.description ?? `Execute ${method.name}`,
        examples: [`${parent} ${commandName}`],
      };

      commands.push(command);

      // Record mapping
      mappings.push({
        sourceId: `${method.className}.${method.name}`,
        sourceFormat: InterfaceFormat.SDK,
        targetId: `${parent} ${commandName}`,
        targetFormat: InterfaceFormat.CLI,
        confidence: 1.0,
        transformation: 'SDK_TO_CLI_COMMAND',
      });
    }

    return commands;
  }

  // =============================================================================
  // CLI → REST TRANSLATION
  // =============================================================================

  private translateCLIToREST(
    commands: CLICommand[],
    mappings: TranslationMapping[],
    issues: CompatibilityIssue[],
    options?: APITranslationRequest['options']
  ): RESTEndpoint[] {
    const endpoints: RESTEndpoint[] = [];

    for (const command of commands) {
      const httpMethod = this.inferHTTPMethodFromCommand(command.command);
      const path = this.deriveCLIToRESTPath(command);

      const endpoint: RESTEndpoint = {
        method: httpMethod,
        path,
        operationId: command.parent
          ? `${command.parent}_${command.command}`.replace(/-/g, '_')
          : command.command.replace(/-/g, '_'),
        pathParams: command.arguments.filter((a) => a.required).map((a) => a.name),
        queryParams: command.options
          .filter((o) => o.type === 'string')
          .map((o) => o.flag.match(/--(\S+)/)?.[1] ?? ''),
        headerParams: [],
        contentType: 'application/json',
        streaming: false,
        tags: command.parent ? [this.toPascalCase(command.parent)] : [],
      };

      endpoints.push(endpoint);

      // Record mapping
      mappings.push({
        sourceId: command.parent ? `${command.parent} ${command.command}` : command.command,
        sourceFormat: InterfaceFormat.CLI,
        targetId: `${httpMethod} ${path}`,
        targetFormat: InterfaceFormat.REST,
        confidence: 0.85,
        transformation: 'CLI_TO_REST_ENDPOINT',
        semanticLoss: 'HTTP method and request body inferred from command name',
      });
    }

    return endpoints;
  }

  private inferHTTPMethodFromCommand(command: string): RESTEndpoint['method'] {
    const name = command.toLowerCase();
    for (const [prefix, method] of Object.entries(CLI_TO_REST_RULES.methodInference)) {
      if (name.startsWith(prefix)) {
        return method as RESTEndpoint['method'];
      }
    }
    return 'POST';
  }

  private deriveCLIToRESTPath(command: CLICommand): string {
    let path = command.parent ? `/${command.parent}` : '';
    path += `/${command.command}`;

    for (const arg of command.arguments.filter((a) => a.required)) {
      path += `/{${arg.name}}`;
    }

    return path;
  }

  // =============================================================================
  // CLI → SDK TRANSLATION
  // =============================================================================

  private translateCLIToSDK(
    commands: CLICommand[],
    mappings: TranslationMapping[],
    issues: CompatibilityIssue[],
    options?: APITranslationRequest['options']
  ): SDKMethod[] {
    const methods: SDKMethod[] = [];

    for (const command of commands) {
      const methodName = this.toCamelCase(command.command);
      const className = command.parent
        ? this.toPascalCase(command.parent) + 'Client'
        : 'ApiClient';

      const method: SDKMethod = {
        name: methodName,
        className,
        parameters: [
          ...command.arguments.map((arg) => ({
            name: this.toCamelCase(arg.name),
            type: 'string',
            required: arg.required,
          })),
          ...command.options
            .filter((opt) => opt.type !== 'boolean')
            .map((opt) => ({
              name: this.toCamelCase(opt.flag.match(/--(\S+)/)?.[1] ?? 'option'),
              type: opt.type === 'array' ? 'string[]' : 'string',
              required: opt.required,
              default: opt.default,
            })),
        ],
        returnType: 'Promise<unknown>',
        async: true,
        streaming: false,
        description: command.description,
        throws: ['CliError'],
      };

      methods.push(method);

      // Record mapping
      mappings.push({
        sourceId: command.parent ? `${command.parent} ${command.command}` : command.command,
        sourceFormat: InterfaceFormat.CLI,
        targetId: `${className}.${methodName}`,
        targetFormat: InterfaceFormat.SDK,
        confidence: 0.9,
        transformation: 'CLI_TO_SDK_METHOD',
        semanticLoss: 'Return type unknown, inferred from CLI output',
      });
    }

    return methods;
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  /**
   * Extract REST endpoints from canonical schema
   */
  private extractRESTEndpoints(schema?: CanonicalSchema): RESTEndpoint[] {
    if (!schema) return [];

    return schema.endpoints.map((endpoint) => ({
      method: endpoint.method as RESTEndpoint['method'],
      path: endpoint.path,
      operationId: endpoint.operationId,
      pathParams: endpoint.parameters
        ?.filter((p) => p.in === 'path')
        .map((p) => p.name) ?? [],
      queryParams: endpoint.parameters
        ?.filter((p) => p.in === 'query')
        .map((p) => p.name) ?? [],
      headerParams: endpoint.parameters
        ?.filter((p) => p.in === 'header')
        .map((p) => p.name) ?? [],
      requestBody: endpoint.requestBody?.type?.typeId,
      responseType: endpoint.responses?.[0]?.type?.typeId,
      contentType: endpoint.requestBody?.contentType ?? 'application/json',
      streaming: endpoint.streaming,
      tags: endpoint.tags ?? [],
    }));
  }

  /**
   * Count source elements in request
   */
  private countSourceElements(request: APITranslationRequest): number {
    return (
      (request.restEndpoints?.length ?? 0) +
      (request.sdkMethods?.length ?? 0) +
      (request.cliCommands?.length ?? 0) +
      (request.sourceSchema?.endpoints?.length ?? 0)
    );
  }

  /**
   * Count result elements
   */
  private countResultElements(result: TranslationResult): number {
    return (
      (result.restEndpoints?.length ?? 0) +
      (result.sdkMethods?.length ?? 0) +
      (result.cliCommands?.length ?? 0)
    );
  }

  /**
   * Calculate overall confidence from mappings and issues
   */
  private calculateOverallConfidence(
    mappings: TranslationMapping[],
    issues: CompatibilityIssue[]
  ): number {
    if (mappings.length === 0) return 0;

    // Average mapping confidence
    const avgMappingConfidence =
      mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length;

    // Penalty for issues
    const errorPenalty = issues.filter((i) => i.severity === 'error').length * 0.2;
    const warningPenalty = issues.filter((i) => i.severity === 'warning').length * 0.05;

    return Math.max(0, avgMappingConfidence - errorPenalty - warningPenalty);
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    requestId: string,
    inputHash: string,
    errors: string[]
  ): APITranslationResponse {
    return {
      requestId,
      success: false,
      compatibility: {
        schemaVersion: '1.0.0',
        agentVersion: AGENT_VERSION,
        translatedAt: new Date().toISOString(),
        determinismHash: inputHash,
      },
      warnings: [],
      errors,
    };
  }

  // =============================================================================
  // STRING UTILITY METHODS
  // =============================================================================

  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (c) => c.toLowerCase());
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (c) => c.toUpperCase());
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .toLowerCase();
  }
}

/**
 * Create a translator instance with default options
 */
export function createTranslator(options?: TranslatorOptions): APITranslator {
  return new APITranslator(options);
}
