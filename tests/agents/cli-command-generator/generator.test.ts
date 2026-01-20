/**
 * CLI Command Generator - Core Generation Logic Tests
 *
 * Tests for the core CLI generation functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCLICommands,
  CLIFramework,
  CLIArgumentType,
  type CLIGeneratorInput,
} from '../../../src/agents/cli-command-generator/index.js';

describe('CLI Command Generator', () => {
  let baseInput: CLIGeneratorInput;

  beforeEach(() => {
    baseInput = {
      contractId: 'test-contract',
      contractVersion: '1.0.0',
      endpoints: [
        {
          operationId: 'createChatCompletion',
          path: '/v1/chat/completions',
          method: 'POST',
          summary: 'Create a chat completion',
          description: 'Creates a completion for the chat messages',
          parameters: [
            {
              name: 'model',
              in: 'query',
              type: { typeId: 'string' },
              required: true,
              description: 'Model to use',
            },
          ],
          requestBody: {
            type: { typeId: 'ChatCompletionRequest' },
            required: true,
            contentType: 'application/json',
            description: 'Chat completion request',
          },
          tags: ['Chat'],
        },
        {
          operationId: 'listModels',
          path: '/v1/models',
          method: 'GET',
          summary: 'List available models',
          description: 'Lists all available models',
          tags: ['Models'],
        },
      ],
      types: [
        {
          id: 'string',
          name: 'string',
          kind: 'primitive',
        },
        {
          id: 'ChatCompletionRequest',
          name: 'ChatCompletionRequest',
          kind: 'object',
          properties: [
            {
              name: 'messages',
              type: { typeId: 'array' },
              required: true,
              description: 'Messages to send',
            },
          ],
        },
      ],
      framework: CLIFramework.Commander,
      packageName: 'test-cli',
      packageVersion: '1.0.0',
      providerId: 'openai',
      providerName: 'OpenAI',
      options: {
        generateHandlers: true,
        generateTypes: true,
        includeExamples: true,
      },
    };
  });

  describe('generateCLICommands', () => {
    it('should generate CLI commands from endpoints', () => {
      const result = generateCLICommands(baseInput);

      expect(result.success).toBe(true);
      expect(result.program.commands.length).toBeGreaterThan(0);
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should generate correct program metadata', () => {
      const result = generateCLICommands(baseInput);

      expect(result.program.name).toBe('test-cli');
      expect(result.program.version).toBe('1.0.0');
      expect(result.program.description).toContain('OpenAI');
    });

    it('should convert operation IDs to kebab-case command names', () => {
      const result = generateCLICommands(baseInput);

      const commandNames = result.program.commands.flatMap((c) =>
        c.subcommands ? c.subcommands.map((s) => s.name) : [c.name]
      );

      // createChatCompletion should become create-chat-completion
      expect(
        commandNames.some((name) => name.includes('create-chat-completion'))
      ).toBe(true);
    });

    it('should generate global options', () => {
      const result = generateCLICommands(baseInput);

      expect(result.program.globalOptions).toBeDefined();
      expect(result.program.globalOptions!.length).toBeGreaterThan(0);

      const apiKeyOption = result.program.globalOptions!.find(
        (opt) => opt.name === 'api-key'
      );
      expect(apiKeyOption).toBeDefined();
      expect(apiKeyOption!.envVar).toBe('OPENAI_API_KEY');
    });

    it('should generate types file when enabled', () => {
      const result = generateCLICommands(baseInput);

      const typesFile = result.files.find((f) => f.type === 'types');
      expect(typesFile).toBeDefined();
      expect(typesFile!.content).toContain('interface');
    });

    it('should generate handler files when enabled', () => {
      const result = generateCLICommands(baseInput);

      const handlerFiles = result.files.filter((f) => f.type === 'handler');
      expect(handlerFiles.length).toBeGreaterThan(0);
    });

    it('should generate package.json manifest', () => {
      const result = generateCLICommands(baseInput);

      const manifestFile = result.files.find((f) => f.type === 'manifest');
      expect(manifestFile).toBeDefined();

      const manifest = JSON.parse(manifestFile!.content);
      expect(manifest.name).toBe('test-cli');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.bin).toBeDefined();
    });

    it('should generate README', () => {
      const result = generateCLICommands(baseInput);

      const readmeFile = result.files.find((f) => f.type === 'readme');
      expect(readmeFile).toBeDefined();
      expect(readmeFile!.content).toContain('# test-cli');
    });

    it('should handle empty endpoints gracefully', () => {
      const input = { ...baseInput, endpoints: [] };
      const result = generateCLICommands(input);

      expect(result.success).toBe(true);
      expect(result.program.commands.length).toBe(0);
    });

    it('should skip handler generation when disabled', () => {
      const input = {
        ...baseInput,
        options: { ...baseInput.options, generateHandlers: false },
      };
      const result = generateCLICommands(input);

      const handlerFiles = result.files.filter((f) => f.type === 'handler');
      expect(handlerFiles.length).toBe(0);
    });

    it('should skip types generation when disabled', () => {
      const input = {
        ...baseInput,
        options: { ...baseInput.options, generateTypes: false },
      };
      const result = generateCLICommands(input);

      const typesFile = result.files.find((f) => f.type === 'types');
      expect(typesFile).toBeUndefined();
    });

    it('should calculate confidence score', () => {
      const result = generateCLICommands(baseInput);

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should track generation duration', () => {
      const result = generateCLICommands(baseInput);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should add warnings for deprecated endpoints', () => {
      const input = {
        ...baseInput,
        endpoints: [
          {
            ...baseInput.endpoints[0]!,
            deprecated: true,
          },
        ],
      };
      const result = generateCLICommands(input);

      expect(result.warnings.some((w) => w.includes('deprecated'))).toBe(true);
    });
  });

  describe('Command Options Generation', () => {
    it('should convert path parameters to positional arguments', () => {
      const input: CLIGeneratorInput = {
        ...baseInput,
        endpoints: [
          {
            operationId: 'getModel',
            path: '/v1/models/{model_id}',
            method: 'GET',
            summary: 'Get model',
            parameters: [
              {
                name: 'model_id',
                in: 'path',
                type: { typeId: 'string' },
                required: true,
                description: 'Model ID',
              },
            ],
          },
        ],
      };
      const result = generateCLICommands(input);

      const command = result.program.commands.find((c) =>
        c.name === 'get-model' || c.subcommands?.some((s) => s.name === 'get-model')
      );
      expect(command).toBeDefined();

      const targetCommand = command!.subcommands?.[0] ?? command!;
      expect(targetCommand.arguments.length).toBeGreaterThan(0);
      expect(targetCommand.arguments[0]!.name).toBe('model_id');
    });

    it('should convert query parameters to options', () => {
      const result = generateCLICommands(baseInput);

      // Find the chat command
      const chatCommand = result.program.commands.find(
        (c) => c.name === 'chat' || c.subcommands?.some((s) => s.name.includes('chat'))
      );

      if (chatCommand?.subcommands) {
        const createCommand = chatCommand.subcommands.find((s) =>
          s.name.includes('create')
        );
        expect(createCommand).toBeDefined();
        const modelOption = createCommand!.options.find((o) => o.name === 'model');
        expect(modelOption).toBeDefined();
        expect(modelOption!.required).toBe(true);
      }
    });

    it('should add output format options', () => {
      const result = generateCLICommands(baseInput);

      const command = result.program.commands[0]!;
      const targetCommand = command.subcommands?.[0] ?? command;

      const outputOption = targetCommand.options.find((o) => o.name === 'output');
      expect(outputOption).toBeDefined();
      expect(outputOption!.choices).toEqual(['json', 'yaml', 'table']);
    });

    it('should handle request body as data options', () => {
      const result = generateCLICommands(baseInput);

      // Find command with request body
      const chatCommand = result.program.commands.find(
        (c) => c.name === 'chat' || c.subcommands?.some((s) => s.name.includes('create'))
      );

      if (chatCommand?.subcommands) {
        const createCommand = chatCommand.subcommands.find((s) =>
          s.name.includes('create')
        );
        expect(createCommand).toBeDefined();

        const dataOption = createCommand!.options.find((o) => o.name === 'data');
        const dataFileOption = createCommand!.options.find(
          (o) => o.name === 'data-file'
        );

        expect(dataOption).toBeDefined();
        expect(dataFileOption).toBeDefined();
      }
    });
  });

  describe('Framework Support', () => {
    it('should default to Commander framework', () => {
      const result = generateCLICommands(baseInput);

      expect(result.framework).toBe(CLIFramework.Commander);
    });

    it('should add warning for unsupported frameworks', () => {
      const input = { ...baseInput, framework: CLIFramework.Yargs };
      const result = generateCLICommands(input);

      expect(result.warnings.some((w) => w.includes('not yet implemented'))).toBe(
        true
      );
      // Should fall back to Commander
      expect(
        result.files.some((f) => f.content.includes("from 'commander'"))
      ).toBe(true);
    });
  });

  describe('File Generation', () => {
    it('should generate index file as entry point', () => {
      const result = generateCLICommands(baseInput);

      const indexFile = result.files.find((f) => f.type === 'index');
      expect(indexFile).toBeDefined();
      expect(indexFile!.path).toBe('src/index.ts');
      expect(indexFile!.executable).toBe(true);
      expect(indexFile!.content).toContain('#!/usr/bin/env node');
    });

    it('should generate command files in correct directory', () => {
      const result = generateCLICommands(baseInput);

      const commandFiles = result.files.filter((f) => f.type === 'command');
      expect(
        commandFiles.every((f) => f.path.startsWith('src/commands/'))
      ).toBe(true);
    });

    it('should generate handler files in correct directory', () => {
      const result = generateCLICommands(baseInput);

      const handlerFiles = result.files.filter((f) => f.type === 'handler');
      expect(
        handlerFiles.every((f) => f.path.startsWith('src/handlers/'))
      ).toBe(true);
    });

    it('should generate unique file paths', () => {
      const result = generateCLICommands(baseInput);

      const paths = result.files.map((f) => f.path);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(paths.length);
    });
  });

  describe('Examples Generation', () => {
    it('should generate examples when enabled', () => {
      const result = generateCLICommands(baseInput);

      const command = result.program.commands[0]!;
      const targetCommand = command.subcommands?.[0] ?? command;

      expect(targetCommand.examples).toBeDefined();
      expect(targetCommand.examples!.length).toBeGreaterThan(0);
    });

    it('should include command name in examples', () => {
      const result = generateCLICommands(baseInput);

      const command = result.program.commands[0]!;
      const targetCommand = command.subcommands?.[0] ?? command;

      expect(
        targetCommand.examples!.some((e) => e.includes('llm-forge'))
      ).toBe(true);
    });
  });

  describe('Global Options', () => {
    it('should include API key option', () => {
      const result = generateCLICommands(baseInput);

      const apiKeyOption = result.program.globalOptions!.find(
        (o) => o.name === 'api-key'
      );
      expect(apiKeyOption).toBeDefined();
      expect(apiKeyOption!.alias).toBe('k');
    });

    it('should include verbose option', () => {
      const result = generateCLICommands(baseInput);

      const verboseOption = result.program.globalOptions!.find(
        (o) => o.name === 'verbose'
      );
      expect(verboseOption).toBeDefined();
      expect(verboseOption!.type).toBe(CLIArgumentType.Boolean);
    });

    it('should include timeout option', () => {
      const result = generateCLICommands(baseInput);

      const timeoutOption = result.program.globalOptions!.find(
        (o) => o.name === 'timeout'
      );
      expect(timeoutOption).toBeDefined();
      expect(timeoutOption!.type).toBe(CLIArgumentType.Number);
    });

    it('should add custom global options', () => {
      const input: CLIGeneratorInput = {
        ...baseInput,
        options: {
          ...baseInput.options,
          globalOptions: [
            {
              name: 'custom-opt',
              alias: 'c',
              description: 'Custom option',
              type: CLIArgumentType.String,
              default: 'default',
            },
          ],
        },
      };
      const result = generateCLICommands(input);

      const customOption = result.program.globalOptions!.find(
        (o) => o.name === 'custom-opt'
      );
      expect(customOption).toBeDefined();
    });
  });
});
