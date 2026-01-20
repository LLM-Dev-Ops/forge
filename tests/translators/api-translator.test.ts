/**
 * API Translator Tests
 *
 * Tests for the API Translation Agent runtime implementation.
 * Verifies translation between REST, SDK, and CLI representations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { APITranslator, createTranslator } from '../../src/translators/api-translator.js';
import {
  InterfaceFormat,
  type RESTEndpoint,
  type SDKMethod,
  type CLICommand,
  type APITranslationRequest,
} from '../../src/agents/contracts/api-translation.contract.js';
import type { CanonicalSchema } from '../../src/types/canonical-schema.js';
import { HTTPMethod, TypeKind, PrimitiveTypeKind } from '../../src/types/canonical-schema.js';

// Test fixtures
const createTestSchema = (): CanonicalSchema => ({
  metadata: {
    version: '1.0.0',
    providerId: 'test-provider',
    providerName: 'Test Provider',
    apiVersion: 'v1',
    generatedAt: new Date().toISOString(),
  },
  types: [
    {
      id: 'string-type',
      name: 'string',
      kind: TypeKind.Primitive,
      primitiveKind: PrimitiveTypeKind.String,
    },
    {
      id: 'user-type',
      name: 'User',
      kind: TypeKind.Object,
      properties: [
        { name: 'id', type: { typeId: 'string-type' }, required: true },
        { name: 'name', type: { typeId: 'string-type' }, required: true },
        { name: 'email', type: { typeId: 'string-type' }, required: false },
      ],
      required: ['id', 'name'],
    },
  ],
  endpoints: [
    {
      id: 'get-user',
      operationId: 'getUser',
      path: '/users/{userId}',
      method: HTTPMethod.GET,
      summary: 'Get a user by ID',
      parameters: [
        {
          name: 'userId',
          in: 'path',
          type: { typeId: 'string-type' },
          required: true,
        },
      ],
      responses: [
        {
          statusCode: 200,
          type: { typeId: 'user-type' },
          description: 'Success',
        },
      ],
      streaming: false,
      authentication: ['bearer'],
      tags: ['Users'],
    },
    {
      id: 'create-user',
      operationId: 'createUser',
      path: '/users',
      method: HTTPMethod.POST,
      summary: 'Create a new user',
      requestBody: {
        type: { typeId: 'user-type' },
        required: true,
        contentType: 'application/json',
      },
      responses: [
        {
          statusCode: 201,
          type: { typeId: 'user-type' },
          description: 'Created',
        },
      ],
      streaming: false,
      authentication: ['bearer'],
      tags: ['Users'],
    },
    {
      id: 'list-users',
      operationId: 'listUsers',
      path: '/users',
      method: HTTPMethod.GET,
      summary: 'List all users',
      parameters: [
        {
          name: 'limit',
          in: 'query',
          type: { typeId: 'string-type' },
          required: false,
        },
        {
          name: 'offset',
          in: 'query',
          type: { typeId: 'string-type' },
          required: false,
        },
      ],
      responses: [
        {
          statusCode: 200,
          description: 'Success',
        },
      ],
      streaming: false,
      authentication: ['bearer'],
      tags: ['Users'],
    },
  ],
  authentication: [
    {
      id: 'bearer',
      type: 'bearer',
      scheme: 'Bearer',
    },
  ],
  errors: [],
});

const createRESTEndpoints = (): RESTEndpoint[] => [
  {
    method: 'GET',
    path: '/users/{userId}',
    operationId: 'getUser',
    pathParams: ['userId'],
    queryParams: [],
    headerParams: [],
    responseType: 'User',
    contentType: 'application/json',
    streaming: false,
    tags: ['Users'],
  },
  {
    method: 'POST',
    path: '/users',
    operationId: 'createUser',
    pathParams: [],
    queryParams: [],
    headerParams: [],
    requestBody: 'User',
    responseType: 'User',
    contentType: 'application/json',
    streaming: false,
    tags: ['Users'],
  },
];

const createSDKMethods = (): SDKMethod[] => [
  {
    name: 'getUser',
    className: 'UsersClient',
    parameters: [
      { name: 'userId', type: 'string', required: true },
    ],
    returnType: 'Promise<User>',
    async: true,
    streaming: false,
    description: 'Get a user by ID',
    throws: ['ApiError'],
  },
  {
    name: 'createUser',
    className: 'UsersClient',
    parameters: [
      { name: 'data', type: 'User', required: true },
    ],
    returnType: 'Promise<User>',
    async: true,
    streaming: false,
    description: 'Create a new user',
    throws: ['ApiError'],
  },
];

const createCLICommands = (): CLICommand[] => [
  {
    command: 'get-user',
    parent: 'users',
    arguments: [
      { name: 'user-id', description: 'User ID', required: true, variadic: false },
    ],
    options: [
      { flag: '-o, --output <format>', description: 'Output format', type: 'string', required: false, default: 'json' },
    ],
    description: 'Get a user by ID',
    examples: ['users get-user abc123'],
  },
  {
    command: 'create-user',
    parent: 'users',
    arguments: [],
    options: [
      { flag: '--name <name>', description: 'User name', type: 'string', required: true },
      { flag: '--email <email>', description: 'User email', type: 'string', required: false },
    ],
    description: 'Create a new user',
    examples: ['users create-user --name "John Doe"'],
  },
];

describe('APITranslator', () => {
  let translator: APITranslator;

  beforeEach(() => {
    translator = new APITranslator();
  });

  describe('createTranslator', () => {
    it('should create a translator instance', () => {
      const t = createTranslator();
      expect(t).toBeInstanceOf(APITranslator);
    });

    it('should accept options', () => {
      const events: unknown[] = [];
      const t = createTranslator({
        emitEvents: true,
        onEvent: (event) => events.push(event),
      });
      expect(t).toBeInstanceOf(APITranslator);
    });
  });

  describe('REST → SDK Translation', () => {
    it('should translate canonical schema from REST to SDK', async () => {
      const schema = createTestSchema();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
        options: {
          strict: false,
          includeMappings: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result?.sdkMethods).toBeDefined();
      expect(result.result?.sdkMethods?.length).toBeGreaterThan(0);
    });

    it('should generate SDK methods with correct naming', async () => {
      const schema = createTestSchema();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440001',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
      });

      expect(result.success).toBe(true);
      const methods = result.result?.sdkMethods;
      expect(methods).toBeDefined();

      // Check method names are camelCase
      for (const method of methods ?? []) {
        expect(method.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        expect(method.className).toMatch(/^[A-Z][a-zA-Z0-9]*Client$/);
      }
    });

    it('should include translation mappings', async () => {
      const schema = createTestSchema();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440002',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
        options: {
          includeMappings: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.result?.mappings).toBeDefined();
      expect(result.result?.mappings.length).toBeGreaterThan(0);

      for (const mapping of result.result?.mappings ?? []) {
        expect(mapping.sourceFormat).toBe(InterfaceFormat.REST);
        expect(mapping.targetFormat).toBe(InterfaceFormat.SDK);
        expect(mapping.confidence).toBeGreaterThan(0);
        expect(mapping.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate overall confidence', async () => {
      const schema = createTestSchema();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440003',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
      });

      expect(result.success).toBe(true);
      expect(result.result?.overallConfidence).toBeDefined();
      expect(result.result?.overallConfidence).toBeGreaterThan(0);
      expect(result.result?.overallConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('REST → CLI Translation', () => {
    it('should translate canonical schema from REST to CLI', async () => {
      const schema = createTestSchema();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440004',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.CLI,
        },
        sourceSchema: schema,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result?.cliCommands).toBeDefined();
      expect(result.result?.cliCommands?.length).toBeGreaterThan(0);
    });

    it('should generate CLI commands with kebab-case naming', async () => {
      const schema = createTestSchema();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440005',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.CLI,
        },
        sourceSchema: schema,
      });

      expect(result.success).toBe(true);
      const commands = result.result?.cliCommands;
      expect(commands).toBeDefined();

      // Check command names are kebab-case
      for (const command of commands ?? []) {
        expect(command.command).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    });
  });

  describe('SDK → REST Translation', () => {
    it('should translate SDK methods to REST endpoints', async () => {
      const methods = createSDKMethods();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440006',
        direction: {
          from: InterfaceFormat.SDK,
          to: InterfaceFormat.REST,
        },
        sdkMethods: methods,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result?.restEndpoints).toBeDefined();
      expect(result.result?.restEndpoints?.length).toBe(methods.length);
    });

    it('should infer HTTP methods from SDK method names', async () => {
      const methods = createSDKMethods();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440007',
        direction: {
          from: InterfaceFormat.SDK,
          to: InterfaceFormat.REST,
        },
        sdkMethods: methods,
      });

      expect(result.success).toBe(true);
      const endpoints = result.result?.restEndpoints;

      // getUser should become GET
      const getEndpoint = endpoints?.find((e) => e.operationId.includes('getUser'));
      expect(getEndpoint?.method).toBe('GET');

      // createUser should become POST
      const createEndpoint = endpoints?.find((e) => e.operationId.includes('createUser'));
      expect(createEndpoint?.method).toBe('POST');
    });
  });

  describe('SDK → CLI Translation', () => {
    it('should translate SDK methods to CLI commands', async () => {
      const methods = createSDKMethods();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440008',
        direction: {
          from: InterfaceFormat.SDK,
          to: InterfaceFormat.CLI,
        },
        sdkMethods: methods,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result?.cliCommands).toBeDefined();
      expect(result.result?.cliCommands?.length).toBe(methods.length);
    });
  });

  describe('CLI → REST Translation', () => {
    it('should translate CLI commands to REST endpoints', async () => {
      const commands = createCLICommands();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440009',
        direction: {
          from: InterfaceFormat.CLI,
          to: InterfaceFormat.REST,
        },
        cliCommands: commands,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result?.restEndpoints).toBeDefined();
      expect(result.result?.restEndpoints?.length).toBe(commands.length);
    });

    it('should infer HTTP methods from CLI command names', async () => {
      const commands = createCLICommands();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440010',
        direction: {
          from: InterfaceFormat.CLI,
          to: InterfaceFormat.REST,
        },
        cliCommands: commands,
      });

      expect(result.success).toBe(true);
      const endpoints = result.result?.restEndpoints;

      // get-user should become GET
      const getEndpoint = endpoints?.find((e) => e.operationId.includes('get_user'));
      expect(getEndpoint?.method).toBe('GET');

      // create-user should become POST
      const createEndpoint = endpoints?.find((e) => e.operationId.includes('create_user'));
      expect(createEndpoint?.method).toBe('POST');
    });
  });

  describe('CLI → SDK Translation', () => {
    it('should translate CLI commands to SDK methods', async () => {
      const commands = createCLICommands();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440011',
        direction: {
          from: InterfaceFormat.CLI,
          to: InterfaceFormat.SDK,
        },
        cliCommands: commands,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result?.sdkMethods).toBeDefined();
      expect(result.result?.sdkMethods?.length).toBe(commands.length);
    });
  });

  describe('Error Handling', () => {
    it('should return error for missing SDK methods in SDK → REST', async () => {
      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440012',
        direction: {
          from: InterfaceFormat.SDK,
          to: InterfaceFormat.REST,
        },
        // Missing sdkMethods
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error for missing CLI commands in CLI → REST', async () => {
      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440013',
        direction: {
          from: InterfaceFormat.CLI,
          to: InterfaceFormat.REST,
        },
        // Missing cliCommands
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail in strict mode when semantic loss occurs', async () => {
      const methods = createSDKMethods();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440014',
        direction: {
          from: InterfaceFormat.SDK,
          to: InterfaceFormat.REST,
        },
        sdkMethods: methods,
        options: {
          strict: true, // Enable strict mode
        },
      });

      // SDK → REST translation has heuristic mapping (confidence < 1.0)
      // So strict mode should fail
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Semantic loss'))).toBe(true);
    });
  });

  describe('Response Metadata', () => {
    it('should include compatibility metadata', async () => {
      const schema = createTestSchema();

      const result = await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440015',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
      });

      expect(result.success).toBe(true);
      expect(result.compatibility).toBeDefined();
      expect(result.compatibility.agentVersion).toBe('1.0.0');
      expect(result.compatibility.determinismHash).toBeDefined();
      expect(result.compatibility.translatedAt).toBeDefined();
    });

    it('should include requestId in response', async () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440016';
      const schema = createTestSchema();

      const result = await translator.translate({
        requestId,
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
      });

      expect(result.requestId).toBe(requestId);
    });
  });

  describe('Event Emission', () => {
    it('should emit events when configured', async () => {
      const events: unknown[] = [];
      const translator = new APITranslator({
        emitEvents: true,
        onEvent: (event) => events.push(event),
      });

      const schema = createTestSchema();

      await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440017',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
      });

      expect(events.length).toBeGreaterThan(0);
    });

    it('should not emit events when not configured', async () => {
      const events: unknown[] = [];
      const translator = new APITranslator({
        emitEvents: false,
      });

      const schema = createTestSchema();

      await translator.translate({
        requestId: '550e8400-e29b-41d4-a716-446655440018',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
      });

      expect(events.length).toBe(0);
    });
  });

  describe('Determinism', () => {
    it('should produce same output hash for same input', async () => {
      const schema = createTestSchema();
      const request: APITranslationRequest = {
        requestId: '550e8400-e29b-41d4-a716-446655440019',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: schema,
      };

      const result1 = await translator.translate(request);
      const result2 = await translator.translate(request);

      expect(result1.compatibility.determinismHash).toBe(result2.compatibility.determinismHash);
    });
  });
});

describe('APITranslationContract', () => {
  describe('Schema Validation', () => {
    it('should validate valid translation request', async () => {
      const { APITranslationRequestSchema } = await import(
        '../../src/agents/contracts/api-translation.contract.js'
      );

      const request = {
        requestId: '550e8400-e29b-41d4-a716-446655440020',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: createTestSchema(),
      };

      const result = APITranslationRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should reject invalid request ID', async () => {
      const { APITranslationRequestSchema } = await import(
        '../../src/agents/contracts/api-translation.contract.js'
      );

      const request = {
        requestId: 'not-a-uuid',
        direction: {
          from: InterfaceFormat.REST,
          to: InterfaceFormat.SDK,
        },
        sourceSchema: createTestSchema(),
      };

      const result = APITranslationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });
});
