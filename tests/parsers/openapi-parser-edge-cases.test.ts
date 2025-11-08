import { describe, it, expect } from 'vitest';
import { OpenAPIParser, parseOpenAPI } from '../../src/parsers/openapi-parser';
import { AuthSchemeType, OAuth2FlowType } from '../../src/types/canonical-schema';

describe('OpenAPIParser - Edge Cases for 95%+ Coverage', () => {
  describe('OAuth2 Authentication - All Flow Types', () => {
    it('should parse OAuth2 with password flow', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OAuth2 Password Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            oauth2Password: {
              type: 'oauth2',
              flows: {
                password: {
                  tokenUrl: 'https://example.com/oauth/token',
                  scopes: {
                    read: 'Read access',
                    write: 'Write access',
                  },
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication).toHaveLength(1);
      expect(result.schema?.authentication[0].type).toBe(AuthSchemeType.OAuth2);
      expect(result.schema?.authentication[0].flows).toHaveLength(1);
      expect(result.schema?.authentication[0].flows![0].type).toBe(OAuth2FlowType.Password);
      expect(result.schema?.authentication[0].flows![0].tokenUrl).toBe(
        'https://example.com/oauth/token'
      );
    });

    it('should parse OAuth2 with implicit flow', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OAuth2 Implicit Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            oauth2Implicit: {
              type: 'oauth2',
              flows: {
                implicit: {
                  authorizationUrl: 'https://example.com/oauth/authorize',
                  scopes: {
                    profile: 'User profile access',
                  },
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication[0].flows![0].type).toBe(OAuth2FlowType.Implicit);
    });

    it('should parse OAuth2 with clientCredentials flow', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OAuth2 Client Credentials Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            oauth2Client: {
              type: 'oauth2',
              flows: {
                clientCredentials: {
                  tokenUrl: 'https://example.com/oauth/token',
                  scopes: {},
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication[0].flows![0].type).toBe(
        OAuth2FlowType.ClientCredentials
      );
    });

    it('should parse OAuth2 with authorizationCode flow', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OAuth2 AuthCode Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            oauth2AuthCode: {
              type: 'oauth2',
              flows: {
                authorizationCode: {
                  authorizationUrl: 'https://example.com/oauth/authorize',
                  tokenUrl: 'https://example.com/oauth/token',
                  scopes: {
                    openid: 'OpenID scope',
                  },
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication[0].flows![0].type).toBe(
        OAuth2FlowType.AuthorizationCode
      );
    });

    it('should handle unknown OAuth2 flow type with default', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OAuth2 Unknown Flow Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            oauth2Unknown: {
              type: 'oauth2',
              flows: {
                unknownFlowType: {
                  tokenUrl: 'https://example.com/oauth/token',
                  scopes: {},
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      // Should default to AuthorizationCode for unknown flow types
      expect(result.schema?.authentication[0].flows![0].type).toBe(
        OAuth2FlowType.AuthorizationCode
      );
    });

    it('should parse OAuth2 with multiple flows', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OAuth2 Multiple Flows Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            oauth2Multi: {
              type: 'oauth2',
              description: 'OAuth2 with multiple flows',
              flows: {
                authorizationCode: {
                  authorizationUrl: 'https://example.com/oauth/authorize',
                  tokenUrl: 'https://example.com/oauth/token',
                  refreshUrl: 'https://example.com/oauth/refresh',
                  scopes: {
                    read: 'Read access',
                    write: 'Write access',
                  },
                },
                clientCredentials: {
                  tokenUrl: 'https://example.com/oauth/token',
                  scopes: {
                    admin: 'Admin access',
                  },
                },
                password: {
                  tokenUrl: 'https://example.com/oauth/token',
                  scopes: {
                    user: 'User access',
                  },
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication).toHaveLength(1);
      expect(result.schema?.authentication[0].type).toBe(AuthSchemeType.OAuth2);
      expect(result.schema?.authentication[0].flows).toHaveLength(3);
      expect(result.schema?.authentication[0].description).toBe('OAuth2 with multiple flows');

      // Verify all flow types
      const flowTypes = result.schema!.authentication[0].flows!.map((f) => f.type);
      expect(flowTypes).toContain(OAuth2FlowType.AuthorizationCode);
      expect(flowTypes).toContain(OAuth2FlowType.ClientCredentials);
      expect(flowTypes).toContain(OAuth2FlowType.Password);

      // Verify refreshUrl is included
      const authCodeFlow = result.schema!.authentication[0].flows!.find(
        (f) => f.type === OAuth2FlowType.AuthorizationCode
      );
      expect(authCodeFlow?.refreshUrl).toBe('https://example.com/oauth/refresh');
    });
  });

  describe('HTTP Authentication Schemes', () => {
    it('should parse HTTP Basic authentication', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Basic Auth Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            basicAuth: {
              type: 'http',
              scheme: 'basic',
              description: 'HTTP Basic Authentication',
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication).toHaveLength(1);
      expect(result.schema?.authentication[0].type).toBe(AuthSchemeType.Basic);
      expect(result.schema?.authentication[0].description).toBe('HTTP Basic Authentication');
    });

    it('should parse HTTP Bearer token authentication', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Bearer Auth Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT Bearer Token',
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication).toHaveLength(1);
      expect(result.schema?.authentication[0].type).toBe(AuthSchemeType.Bearer);
      expect(result.schema?.authentication[0].scheme).toBe('bearer');
      expect(result.schema?.authentication[0].description).toBe('JWT Bearer Token');
    });

    it('should parse API Key authentication in header', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API Key Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            apiKey: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
              description: 'API Key in header',
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication).toHaveLength(1);
      expect(result.schema?.authentication[0].type).toBe(AuthSchemeType.ApiKey);
      expect(result.schema?.authentication[0].in).toBe('header');
      expect(result.schema?.authentication[0].name).toBe('X-API-Key');
    });

    it('should parse API Key authentication in query', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API Key Query Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            apiKeyQuery: {
              type: 'apiKey',
              in: 'query',
              name: 'api_key',
              description: 'API Key in query parameter',
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.authentication[0].in).toBe('query');
      expect(result.schema?.authentication[0].name).toBe('api_key');
    });

    it('should handle unsupported security scheme types with warning', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Unsupported Auth Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            openIdConnect: {
              type: 'openIdConnect',
              openIdConnectUrl: 'https://example.com/.well-known/openid-configuration',
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Unsupported security scheme type: openIdConnect');
      expect(result.schema?.authentication).toHaveLength(0);
    });

    it('should handle HTTP scheme that is not basic or bearer', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'HTTP Digest Test', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            digestAuth: {
              type: 'http',
              scheme: 'digest',
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      // Digest auth is not supported, should not be in authentication schemes
      expect(result.schema?.authentication).toHaveLength(0);
    });
  });

  describe('Convenience Function', () => {
    it('should parse using parseOpenAPI convenience function with object input', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Convenience Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              operationId: 'getTest',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = await parseOpenAPI(spec, {
        providerId: 'test',
        providerName: 'Test Provider',
      });

      expect(result.success).toBe(true);
      expect(result.schema?.endpoints).toHaveLength(1);
      expect(result.schema?.endpoints[0].operationId).toBe('getTest');
    });

    it('should parse using parseOpenAPI convenience function with file path', async () => {
      const { resolve } = await import('path');
      const filePath = resolve(__dirname, '../fixtures/inline-types-api.json');

      const result = await parseOpenAPI(
        filePath,
        {
          providerId: 'test',
          providerName: 'Test Provider',
        }
      );

      expect(result.success).toBe(true);
      expect(result.schema?.endpoints.length).toBeGreaterThan(0);
    });
  });

  describe('Primitive Type Edge Cases', () => {
    it('should handle unknown primitive type with warning', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Unknown Type Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              operationId: 'getTest',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          weirdField: { type: 'unknownType' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('Unknown primitive type'))).toBe(true);
    });

    it('should handle null type', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Null Type Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            NullableField: {
              type: 'object',
              properties: {
                nullField: { type: 'null' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.types.some((t) => t.kind === 'primitive')).toBe(true);
    });
  });

  describe('Array Schema Edge Cases', () => {
    it('should handle array with object items', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Array Object Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            UserList: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const arrayType = result.schema?.types.find((t) => t.name === 'UserList');
      expect(arrayType?.kind).toBe('array');
      expect(arrayType?.minItems).toBe(1);
      expect(arrayType?.maxItems).toBe(100);
      expect(arrayType?.uniqueItems).toBe(true);
    });

    it('should throw error for array without items', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Invalid Array Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            BadArray: {
              type: 'array',
              // Missing items property
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('has no items definition'))).toBe(true);
    });
  });

  describe('Content Type Edge Cases', () => {
    it('should handle non-JSON content types', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'XML Content Test', version: '1.0.0' },
        paths: {
          '/xml': {
            get: {
              operationId: 'getXml',
              responses: {
                '200': {
                  description: 'XML Response',
                  content: {
                    'application/xml': {
                      schema: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.schema?.endpoints).toHaveLength(1);
      // Should use the first available content type if JSON is not available
    });

    it('should handle request body with no schema', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'No Schema Test', version: '1.0.0' },
        paths: {
          '/upload': {
            post: {
              operationId: 'upload',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    // No schema
                  },
                },
              },
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('Request body has no schema'))).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.requestBody).toBeUndefined();
    });
  });

  describe('Schema Composition Edge Cases', () => {
    it('should handle anyOf schemas', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'AnyOf Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Pet: {
              anyOf: [
                {
                  type: 'object',
                  properties: { bark: { type: 'string' } },
                },
                {
                  type: 'object',
                  properties: { meow: { type: 'string' } },
                },
              ],
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const petType = result.schema?.types.find((t) => t.name === 'Pet');
      expect(petType?.kind).toBe('object');
    });

    it('should handle allOf schemas', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'AllOf Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            ExtendedUser: {
              allOf: [
                {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
                {
                  type: 'object',
                  properties: { email: { type: 'string' } },
                },
              ],
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const userType = result.schema?.types.find((t) => t.name === 'ExtendedUser');
      expect(userType?.kind).toBe('object');
    });

    it('should handle oneOf schemas (unions)', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OneOf Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            StringOrNumber: {
              oneOf: [{ type: 'string' }, { type: 'number' }],
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const unionType = result.schema?.types.find((t) => t.name === 'StringOrNumber');
      expect(unionType?.kind).toBe('union');
      expect(unionType?.variants).toHaveLength(2);
    });
  });

  describe('Parameter Edge Cases', () => {
    it('should handle path parameters', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Path Param Test', version: '1.0.0' },
        paths: {
          '/users/{userId}': {
            get: {
              operationId: 'getUserById',
              parameters: [
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                  description: 'User ID',
                },
              ],
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.parameters).toHaveLength(1);
      expect(endpoint?.parameters[0].in).toBe('path');
      expect(endpoint?.parameters[0].required).toBe(true);
    });

    it('should handle header parameters', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Header Param Test', version: '1.0.0' },
        paths: {
          '/data': {
            get: {
              operationId: 'getData',
              parameters: [
                {
                  name: 'X-Request-ID',
                  in: 'header',
                  required: false,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.parameters[0].in).toBe('header');
    });

    it('should handle cookie parameters', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Cookie Param Test', version: '1.0.0' },
        paths: {
          '/session': {
            get: {
              operationId: 'getSession',
              parameters: [
                {
                  name: 'sessionId',
                  in: 'cookie',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.parameters[0].in).toBe('cookie');
    });

    it('should handle parameters with schema containing default values', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Default Param Test', version: '1.0.0' },
        paths: {
          '/items': {
            get: {
              operationId: 'getItems',
              parameters: [
                {
                  name: 'limit',
                  in: 'query',
                  schema: { type: 'integer', default: 10 },
                },
              ],
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.parameters).toHaveLength(1);
      expect(endpoint?.parameters[0].name).toBe('limit');
      expect(endpoint?.parameters[0].in).toBe('query');
    });

    it('should handle deprecated parameters', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Deprecated Param Test', version: '1.0.0' },
        paths: {
          '/legacy': {
            get: {
              operationId: 'getLegacy',
              parameters: [
                {
                  name: 'oldParam',
                  in: 'query',
                  deprecated: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.parameters[0].deprecated).toBe(true);
    });
  });

  describe('Constraints and Validation', () => {
    it('should preserve string constraints', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'String Constraints Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Username: {
              type: 'string',
              minLength: 3,
              maxLength: 20,
              pattern: '^[a-zA-Z0-9_]+$',
              format: 'username',
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const usernameType = result.schema?.types.find((t) => t.name === 'Username');
      expect(usernameType?.constraints?.minLength).toBe(3);
      expect(usernameType?.constraints?.maxLength).toBe(20);
      expect(usernameType?.constraints?.pattern).toBe('^[a-zA-Z0-9_]+$');
      expect(usernameType?.constraints?.format).toBe('username');
    });

    it('should preserve number constraints', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Number Constraints Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Age: {
              type: 'integer',
              minimum: 0,
              maximum: 150,
              exclusiveMinimum: false,
              exclusiveMaximum: true,
              multipleOf: 1,
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const ageType = result.schema?.types.find((t) => t.name === 'Age');
      expect(ageType?.constraints?.minimum).toBe(0);
      expect(ageType?.constraints?.maximum).toBe(150);
      expect(ageType?.constraints?.exclusiveMinimum).toBe(false);
      expect(ageType?.constraints?.exclusiveMaximum).toBe(true);
      expect(ageType?.constraints?.multipleOf).toBe(1);
    });
  });

  describe('Response Edge Cases', () => {
    it('should handle response with no content', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'No Content Response Test', version: '1.0.0' },
        paths: {
          '/delete': {
            delete: {
              operationId: 'deleteResource',
              responses: {
                '204': {
                  description: 'No Content - Successfully deleted',
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.responses).toHaveLength(1);
      expect(endpoint?.responses[0].statusCode).toBe(204);
      expect(endpoint?.responses[0].type).toBeUndefined();
    });

    it('should handle default response', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Default Response Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              operationId: 'testOp',
              responses: {
                default: {
                  description: 'Default error response',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          error: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.responses[0].statusCode).toBe('default');
    });
  });

  describe('HTTP Method Coverage', () => {
    it('should handle HEAD method', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'HEAD Method Test', version: '1.0.0' },
        paths: {
          '/resource': {
            head: {
              operationId: 'checkResource',
              responses: {
                '200': { description: 'Resource exists' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.method).toBe('HEAD');
    });

    it('should handle OPTIONS method', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OPTIONS Method Test', version: '1.0.0' },
        paths: {
          '/resource': {
            options: {
              operationId: 'resourceOptions',
              responses: {
                '200': { description: 'Options' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.method).toBe('OPTIONS');
    });

    it('should ignore non-HTTP methods in path item', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Path Item Properties Test', version: '1.0.0' },
        paths: {
          '/resource': {
            summary: 'Resource path',
            description: 'Path for resources',
            get: {
              operationId: 'getResource',
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      // Should only have GET endpoint, not summary/description as endpoints
      expect(result.schema?.endpoints).toHaveLength(1);
      expect(result.schema?.endpoints[0].method).toBe('GET');
    });
  });

  describe('Additional Properties', () => {
    it('should handle additionalProperties as boolean', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Additional Props Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            FlexibleObject: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              additionalProperties: true,
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const objType = result.schema?.types.find((t) => t.name === 'FlexibleObject');
      expect(objType?.additionalProperties).toBe(true);
    });

    it('should handle additionalProperties as schema', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Additional Props Schema Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            StringMap: {
              type: 'object',
              additionalProperties: {
                type: 'string',
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const objType = result.schema?.types.find((t) => t.name === 'StringMap');
      expect(objType?.kind).toBe('object');
    });
  });

  describe('Property Default Values', () => {
    it('should preserve property default values', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Property Defaults Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Config: {
              type: 'object',
              properties: {
                enabled: {
                  type: 'boolean',
                  default: true,
                },
                timeout: {
                  type: 'integer',
                  default: 30,
                },
                mode: {
                  type: 'string',
                  default: 'auto',
                },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const configType = result.schema?.types.find((t) => t.name === 'Config');
      expect(configType?.properties).toHaveLength(3);

      const enabledProp = configType?.properties?.find((p) => p.name === 'enabled');
      expect(enabledProp?.default).toBe(true);

      const timeoutProp = configType?.properties?.find((p) => p.name === 'timeout');
      expect(timeoutProp?.default).toBe(30);

      const modeProp = configType?.properties?.find((p) => p.name === 'mode');
      expect(modeProp?.default).toBe('auto');
    });
  });

  describe('Required Fields', () => {
    it('should handle required property arrays', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Required Test', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            User: {
              type: 'object',
              required: ['id', 'email'],
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const userType = result.schema?.types.find((t) => t.name === 'User');
      expect(userType?.required).toEqual(['id', 'email']);

      const idProp = userType?.properties?.find((p) => p.name === 'id');
      expect(idProp?.required).toBe(true);

      const nameProp = userType?.properties?.find((p) => p.name === 'name');
      expect(nameProp?.required).toBe(false);
    });
  });

  describe('Request Body Required', () => {
    it('should handle required request body', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Required Body Test', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
              responses: {
                '201': { description: 'Created' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.requestBody?.required).toBe(true);
    });

    it('should handle optional request body', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Optional Body Test', version: '1.0.0' },
        paths: {
          '/update': {
            patch: {
              operationId: 'updatePartial',
              requestBody: {
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                      },
                    },
                  },
                },
              },
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      };

      const parser = new OpenAPIParser({
        providerId: 'test',
        providerName: 'Test Provider',
      });

      const result = await parser.parse(spec);
      expect(result.success).toBe(true);
      const endpoint = result.schema?.endpoints[0];
      expect(endpoint?.requestBody?.required).toBe(false);
    });
  });
});
