/**
 * CLI Command Generator - Handler Tests
 *
 * Tests for the Edge Function handler and input validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleGenerate,
  edgeFunctionHandler,
  healthCheckHandler,
  contractHandler,
  CLI_COMMAND_GENERATOR_CONTRACT,
  CLIFramework,
  type EdgeFunctionRequest,
} from '../../../src/agents/cli-command-generator/index.js';

describe('CLI Command Generator Handler', () => {
  const validInput = {
    contractId: 'test-contract',
    contractVersion: '1.0.0',
    endpoints: [
      {
        operationId: 'listItems',
        path: '/items',
        method: 'GET',
        summary: 'List all items',
      },
    ],
    types: [],
    framework: 'commander',
    packageName: 'test-cli',
    packageVersion: '1.0.0',
    providerId: 'test',
    providerName: 'Test Provider',
    options: {},
  };

  describe('handleGenerate', () => {
    it('should successfully generate CLI commands with valid input', async () => {
      const result = await handleGenerate(validInput);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.executionRef).toBeDefined();
      expect(result.eventId).toBeDefined();
    });

    it('should return error for invalid input', async () => {
      const result = await handleGenerate({
        // Missing required fields
        packageName: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should validate contractId is required', async () => {
      const input = { ...validInput };
      delete (input as Record<string, unknown>).contractId;

      const result = await handleGenerate(input);

      expect(result.success).toBe(false);
      expect(result.errors!.some((e) => e.includes('contractId'))).toBe(true);
    });

    it('should validate packageName is required', async () => {
      const input = { ...validInput };
      delete (input as Record<string, unknown>).packageName;

      const result = await handleGenerate(input);

      expect(result.success).toBe(false);
      expect(result.errors!.some((e) => e.includes('packageName'))).toBe(true);
    });

    it('should validate framework is valid enum', async () => {
      const input = { ...validInput, framework: 'invalid-framework' };

      const result = await handleGenerate(input);

      expect(result.success).toBe(false);
      expect(result.errors!.some((e) => e.includes('framework'))).toBe(true);
    });

    it('should accept all valid frameworks', async () => {
      for (const framework of Object.values(CLIFramework)) {
        const input = { ...validInput, framework };
        const result = await handleGenerate(input);

        expect(result.success).toBe(true);
      }
    });

    it('should include execution reference in result', async () => {
      const result = await handleGenerate(validInput);

      expect(result.executionRef).toBeDefined();
      expect(result.executionRef).toMatch(/^cli-gen-/);
    });

    it('should include event ID in result', async () => {
      const result = await handleGenerate(validInput);

      expect(result.eventId).toBeDefined();
      expect(result.eventId).toMatch(/^evt_/);
    });

    it('should handle empty endpoints array', async () => {
      const input = { ...validInput, endpoints: [] };
      const result = await handleGenerate(input);

      expect(result.success).toBe(true);
      expect(result.result!.program.commands.length).toBe(0);
    });

    it('should pass verbose flag to telemetry', async () => {
      const result = await handleGenerate(validInput, { verbose: true });

      expect(result.success).toBe(true);
    });
  });

  describe('edgeFunctionHandler', () => {
    it('should return 405 for non-POST requests', async () => {
      const request: EdgeFunctionRequest = {
        method: 'GET',
        headers: {},
      };

      const response = await edgeFunctionHandler(request);

      expect(response.statusCode).toBe(405);
      expect(JSON.parse(response.body).error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('should return 400 for invalid JSON body', async () => {
      const request: EdgeFunctionRequest = {
        method: 'POST',
        headers: {},
        body: 'invalid json',
      };

      const response = await edgeFunctionHandler(request);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.code).toBe('INVALID_JSON');
    });

    it('should return 200 for valid request', async () => {
      const request: EdgeFunctionRequest = {
        method: 'POST',
        headers: {},
        body: validInput,
      };

      const response = await edgeFunctionHandler(request);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should include agent headers in response', async () => {
      const request: EdgeFunctionRequest = {
        method: 'POST',
        headers: {},
        body: validInput,
      };

      const response = await edgeFunctionHandler(request);

      expect(response.headers['X-Agent-Id']).toBe(CLI_COMMAND_GENERATOR_CONTRACT.agentId);
      expect(response.headers['X-Agent-Version']).toBe(CLI_COMMAND_GENERATOR_CONTRACT.version);
    });

    it('should handle verbose header', async () => {
      const request: EdgeFunctionRequest = {
        method: 'POST',
        headers: { 'x-verbose': 'true' },
        body: validInput,
      };

      const response = await edgeFunctionHandler(request);

      expect(response.statusCode).toBe(200);
    });

    it('should parse string body as JSON', async () => {
      const request: EdgeFunctionRequest = {
        method: 'POST',
        headers: {},
        body: JSON.stringify(validInput),
      };

      const response = await edgeFunctionHandler(request);

      expect(response.statusCode).toBe(200);
    });

    it('should include execution_ref in response', async () => {
      const request: EdgeFunctionRequest = {
        method: 'POST',
        headers: {},
        body: validInput,
      };

      const response = await edgeFunctionHandler(request);
      const body = JSON.parse(response.body);

      expect(body.execution_ref).toBeDefined();
    });
  });

  describe('healthCheckHandler', () => {
    it('should return healthy status', () => {
      const response = healthCheckHandler();

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
    });

    it('should include agent metadata', () => {
      const response = healthCheckHandler();
      const body = JSON.parse(response.body);

      expect(body.agent_id).toBe(CLI_COMMAND_GENERATOR_CONTRACT.agentId);
      expect(body.agent_version).toBe(CLI_COMMAND_GENERATOR_CONTRACT.version);
      expect(body.classification).toBe('GENERATION');
    });

    it('should include timestamp', () => {
      const response = healthCheckHandler();
      const body = JSON.parse(response.body);

      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('contractHandler', () => {
    it('should return full contract', () => {
      const response = contractHandler();

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual(CLI_COMMAND_GENERATOR_CONTRACT);
    });

    it('should include all contract fields', () => {
      const response = contractHandler();
      const body = JSON.parse(response.body);

      expect(body.agentId).toBe('cli-command-generator');
      expect(body.version).toBeDefined();
      expect(body.classification).toBe('GENERATION');
      expect(body.decisionType).toBe('cli_generation');
      expect(body.supportedFrameworks).toBeDefined();
      expect(body.nonResponsibilities).toBeDefined();
      expect(body.failureModes).toBeDefined();
    });
  });
});
