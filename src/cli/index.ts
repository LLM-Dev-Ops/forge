/**
 * LLM-Forge CLI
 *
 * Command-line interface for the LLM-Forge SDK generator.
 *
 * @module cli
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

import { parseOpenAPI } from '../parsers/openapi-parser.js';
import { validator } from '../schema/validator.js';
import {
  handler as sdkGeneratorHandler,
  AGENT_ID,
  AGENT_VERSION,
  type EdgeFunctionContext,
} from '../agents/sdk-generator/index.js';
import {
  handleGenerate as cliCommandGeneratorHandler,
  CLI_COMMAND_GENERATOR_CONTRACT,
} from '../agents/cli-command-generator/index.js';
import {
  AGENTS,
  getAgentMetadata,
  listAgents,
} from '../agents/index.js';

const program = new Command();

// Read package.json for version
const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf-8')
);

program
  .name('llm-forge')
  .description('Cross-provider SDK generator for Large Language Model APIs')
  .version(packageJson.version);

/**
 * Parse command
 */
program
  .command('parse')
  .description('Parse an OpenAPI specification and output canonical schema')
  .argument('<input>', 'OpenAPI specification file (JSON or YAML)')
  .option('-p, --provider <id>', 'Provider ID (e.g., openai, anthropic)', 'unknown')
  .option('-n, --provider-name <name>', 'Provider display name')
  .option('-o, --output <file>', 'Output file for canonical schema (JSON)')
  .option('--no-resolve', 'Do not resolve external $ref references')
  .option('--strict', 'Strict mode (fail on warnings)')
  .action(async (input, options) => {
    const spinner = ora('Parsing OpenAPI specification...').start();

    try {
      // Parse OpenAPI
      const result = await parseOpenAPI(input, {
        providerId: options.provider,
        providerName: options.providerName ?? options.provider,
        resolveRefs: options.resolve,
        strict: options.strict,
      });

      if (!result.success || !result.schema) {
        spinner.fail('Parse failed');
        console.error(chalk.red('Errors:'));
        result.errors.forEach((err) => console.error(chalk.red(`  - ${err}`)));

        if (result.warnings.length > 0) {
          console.warn(chalk.yellow('Warnings:'));
          result.warnings.forEach((warn) => console.warn(chalk.yellow(`  - ${warn}`)));
        }

        process.exit(1);
      }

      spinner.text = 'Validating canonical schema...';

      // Validate canonical schema
      const validation = validator.validate(result.schema);

      if (!validation.valid) {
        spinner.fail('Validation failed');
        console.error(chalk.red('Validation errors:'));
        validation.errors.forEach((err) =>
          console.error(chalk.red(`  ${err.path}: ${err.message}`))
        );
        process.exit(1);
      }

      spinner.succeed('Parse and validation successful');

      // Output results
      console.log(chalk.green('\n✓ Canonical Schema Generated'));
      console.log(chalk.gray(`  Provider: ${result.schema.metadata.providerName}`));
      console.log(chalk.gray(`  API Version: ${result.schema.metadata.apiVersion}`));
      console.log(chalk.gray(`  Types: ${result.schema.types.length}`));
      console.log(chalk.gray(`  Endpoints: ${result.schema.endpoints.length}`));
      console.log(chalk.gray(`  Auth Schemes: ${result.schema.authentication.length}`));

      if (result.warnings.length > 0) {
        console.warn(chalk.yellow(`\nWarnings (${result.warnings.length}):`));
        result.warnings.forEach((warn) => console.warn(chalk.yellow(`  - ${warn}`)));
      }

      // Write output if specified
      if (options.output) {
        const { writeFileSync } = await import('fs');
        writeFileSync(options.output, JSON.stringify(result.schema, null, 2));
        console.log(chalk.green(`\n✓ Written to ${options.output}`));
      } else {
        // Output to console
        console.log(chalk.gray('\nCanonical Schema:'));
        console.log(JSON.stringify(result.schema, null, 2));
      }
    } catch (error) {
      spinner.fail('Unexpected error');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Generate command
 */
program
  .command('generate')
  .description('Generate SDKs from canonical schema or OpenAPI spec')
  .argument('[input]', 'Canonical schema (JSON) or OpenAPI spec (JSON/YAML)')
  .option('-l, --lang <languages...>', 'Target languages (python, typescript, rust, go, java, csharp)')
  .option('-o, --output <dir>', 'Output directory', './generated')
  .option('-n, --name <name>', 'Package name', 'my-llm-sdk')
  .option('--pkg-version <version>', 'Package version', '0.1.0')
  .option('-p, --provider <id>', 'Provider ID (e.g., openai, anthropic)')
  .option('--provider-name <name>', 'Provider display name')
  .option('--no-parallel', 'Disable parallel generation')
  .action(async (input, options) => {
    const spinner = ora('Generating SDKs...').start();

    try {
      const { parseOpenAPI } = await import('../parsers/openapi-parser.js');
      const { GeneratorOrchestrator } = await import('../generators/generator-orchestrator.js');
      const { TargetLanguage } = await import('../core/type-mapper.js');

      let schema;

      // If input is provided, parse it
      if (input) {
        spinner.text = 'Parsing input specification...';

        // Check if it's already a canonical schema or needs parsing
        const inputData = JSON.parse(
          (await import('fs')).readFileSync(input, 'utf-8')
        );

        if (inputData.metadata && inputData.types && inputData.endpoints) {
          // Already a canonical schema
          schema = inputData;
        } else {
          // Parse as OpenAPI
          const result = await parseOpenAPI(input, {
            providerId: options.provider ?? 'unknown',
            providerName: options.providerName ?? options.provider ?? 'Unknown Provider',
          });

          if (!result.success || !result.schema) {
            spinner.fail('Parse failed');
            console.error(chalk.red('Errors:'));
            result.errors.forEach((err) => console.error(chalk.red(`  - ${err}`)));
            process.exit(1);
          }

          schema = result.schema;
        }
      } else {
        spinner.fail('No input file specified');
        console.error(chalk.red('Please provide an OpenAPI spec or canonical schema file'));
        process.exit(1);
      }

      spinner.text = 'Generating SDKs...';

      // Parse target languages
      const languageMap: Record<string, typeof TargetLanguage[keyof typeof TargetLanguage]> = {
        python: TargetLanguage.Python,
        typescript: TargetLanguage.TypeScript,
        ts: TargetLanguage.TypeScript,
        javascript: TargetLanguage.JavaScript,
        js: TargetLanguage.JavaScript,
        rust: TargetLanguage.Rust,
        go: TargetLanguage.Go,
        java: TargetLanguage.Java,
        csharp: TargetLanguage.CSharp,
        'c#': TargetLanguage.CSharp,
        cs: TargetLanguage.CSharp,
      };

      const languages = (options.lang ?? ['python', 'typescript'])
        .map((lang: string) => languageMap[lang.toLowerCase()])
        .filter((lang: typeof TargetLanguage[keyof typeof TargetLanguage] | undefined): lang is typeof TargetLanguage[keyof typeof TargetLanguage] => lang !== undefined);

      if (languages.length === 0) {
        spinner.fail('No valid languages specified');
        process.exit(1);
      }

      // Create orchestrator
      const orchestrator = new GeneratorOrchestrator(schema, {
        languages,
        outputDir: options.output,
        packageName: options.name,
        packageVersion: options.pkgVersion,
        parallel: options.parallel,
        writeFiles: true,
      });

      // Generate
      const result = await orchestrator.generate();

      if (result.success) {
        spinner.succeed('SDK generation complete');

        console.log(chalk.green(`\n✓ Generated ${result.totalFiles} files for ${languages.length} language(s)`));
        console.log(chalk.gray(`  Output directory: ${options.output}`));
        console.log(chalk.gray(`  Generation time: ${result.duration}ms`));

        if (result.totalWarnings > 0) {
          console.log(chalk.yellow(`\n⚠ ${result.totalWarnings} warning(s)`));
        }

        // Show build instructions
        console.log(chalk.cyan('\n' + orchestrator.getBuildInstructions(result.results)));
      } else {
        spinner.fail('SDK generation failed');
        console.error(chalk.red(`\n✗ ${result.totalErrors} error(s)`));

        for (const [lang, langResult] of result.results.entries()) {
          if (langResult.errors.length > 0) {
            console.error(chalk.red(`\n${lang}:`));
            langResult.errors.forEach((err) => console.error(chalk.red(`  - ${err}`)));
          }
        }

        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Unexpected error');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Generate CLI command (invokes CLI Command Generator Agent)
 */
program
  .command('generate-cli')
  .description('Generate CLI commands from API contract (CLI Command Generator Agent)')
  .argument('<contract-file>', 'API contract file (JSON with endpoints and types)')
  .option('-f, --framework <framework>', 'Target CLI framework', 'commander')
  .option('-o, --output <dir>', 'Output directory', './cli-generated')
  .option('-n, --name <name>', 'Package name', 'my-cli')
  .option('--pkg-version <version>', 'Package version', '0.1.0')
  .option('-p, --provider <id>', 'Provider ID (e.g., openai, anthropic)', 'unknown')
  .option('--provider-name <name>', 'Provider display name')
  .option('--no-handlers', 'Disable handler stub generation')
  .option('--no-types', 'Disable TypeScript type generation')
  .option('--emit-events', 'Emit DecisionEvents to ruvector-service')
  .option('--dry-run', 'Validate without generating files')
  .option('-v, --verbose', 'Verbose output')
  .action(async (contractFile, options) => {
    const spinner = ora('Running CLI Command Generator Agent...').start();
    const requestId = randomUUID();

    try {
      // Read contract file
      const contractContent = readFileSync(contractFile, 'utf-8');
      let contractData;

      try {
        contractData = JSON.parse(contractContent);
      } catch {
        spinner.fail('Invalid JSON in contract file');
        console.error(chalk.red('The contract file must be valid JSON'));
        process.exit(1);
      }

      spinner.text = 'Validating contract and preparing input...';

      // Build input for the CLI Command Generator Agent
      const input = {
        contractId: contractData.contractId ?? `contract-${requestId.slice(0, 8)}`,
        contractVersion: contractData.contractVersion ?? '1.0.0',
        endpoints: contractData.endpoints ?? [],
        types: contractData.types ?? [],
        framework: options.framework,
        packageName: options.name,
        packageVersion: options.pkgVersion,
        providerId: options.provider,
        providerName: options.providerName ?? options.provider,
        options: {
          generateHandlers: options.handlers !== false,
          generateTypes: options.types !== false,
          includeExamples: true,
        },
      };

      if (input.endpoints.length === 0) {
        spinner.fail('No endpoints found in contract');
        console.error(chalk.red('The contract file must contain an "endpoints" array'));
        process.exit(1);
      }

      spinner.text = 'Invoking CLI Command Generator Agent...';

      // Invoke the handler
      const result = await cliCommandGeneratorHandler(input, {
        verbose: options.verbose,
      });

      if (result.success && result.result) {
        spinner.succeed('CLI Command Generator Agent completed successfully');

        const genResult = result.result;

        console.log(chalk.green(`\n✓ Agent: ${CLI_COMMAND_GENERATOR_CONTRACT.agentId} v${CLI_COMMAND_GENERATOR_CONTRACT.version}`));
        console.log(chalk.gray(`  Execution Ref: ${result.executionRef}`));
        console.log(chalk.gray(`  Event ID: ${result.eventId}`));

        console.log(chalk.cyan('\nGeneration Results:'));
        console.log(chalk.white(`  Program: ${genResult.program.name} v${genResult.program.version}`));
        console.log(chalk.gray(`  Commands: ${genResult.program.commands.length}`));
        console.log(chalk.gray(`  Files: ${genResult.files.length}`));
        console.log(chalk.gray(`  Framework: ${genResult.framework}`));
        console.log(chalk.gray(`  Confidence: ${(genResult.confidence * 100).toFixed(1)}%`));
        console.log(chalk.gray(`  Duration: ${genResult.duration}ms`));

        if (genResult.warnings.length > 0) {
          console.log(chalk.yellow(`\n⚠ ${genResult.warnings.length} warning(s):`));
          genResult.warnings.forEach((w) => console.log(chalk.yellow(`  - ${w}`)));
        }

        // Write files if not dry-run
        if (!options.dryRun) {
          const { mkdirSync, writeFileSync } = await import('fs');
          const { dirname, join } = await import('path');

          spinner.text = 'Writing generated files...';

          for (const file of genResult.files) {
            const fullPath = join(options.output, file.path);
            const dir = dirname(fullPath);

            mkdirSync(dir, { recursive: true });
            writeFileSync(fullPath, file.content);

            if (options.verbose) {
              console.log(chalk.gray(`  → ${fullPath}`));
            }
          }

          spinner.succeed(`Written ${genResult.files.length} files to ${options.output}`);

          console.log(chalk.cyan('\nGenerated Files:'));
          for (const file of genResult.files) {
            const icon = file.type === 'command' ? '📄' :
                        file.type === 'handler' ? '⚡' :
                        file.type === 'types' ? '📝' :
                        file.type === 'index' ? '🚀' :
                        file.type === 'manifest' ? '📦' : '📖';
            console.log(chalk.gray(`  ${icon} ${file.path}`));
          }

          console.log(chalk.cyan('\nNext Steps:'));
          console.log(chalk.gray(`  cd ${options.output}`));
          console.log(chalk.gray('  npm install'));
          console.log(chalk.gray('  npm run build'));
          console.log(chalk.gray(`  ./${genResult.program.name} --help`));
        } else {
          console.log(chalk.yellow('\n(Dry run - no files written)'));
        }

        if (options.emitEvents) {
          console.log(chalk.cyan('\n✓ DecisionEvent emitted to ruvector-service'));
        }
      } else {
        spinner.fail('CLI Command Generator Agent failed');

        console.error(chalk.red('\n✗ Generation Errors:'));
        for (const error of result.errors ?? ['Unknown error']) {
          console.error(chalk.red(`  - ${error}`));
        }

        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Unexpected error');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

/**
 * Agent command group
 */
const agentCmd = program
  .command('agent')
  .description('Agent management commands');

/**
 * Agent list command
 */
agentCmd
  .command('list')
  .description('List all registered agents')
  .action(() => {
    const agents = listAgents();

    console.log(chalk.cyan('\nRegistered Agents:\n'));

    for (const agent of agents) {
      console.log(chalk.green(`  ${agent.id}`));
      console.log(chalk.gray(`    Version: ${agent.version}`));
      console.log(chalk.gray(`    Classification: ${agent.classification.type}`));
      console.log(chalk.gray(`    Deterministic: ${agent.classification.deterministic}`));
      console.log(chalk.gray(`    Stateless: ${agent.classification.stateless}`));
      console.log('');
    }
  });

/**
 * Agent info command
 */
agentCmd
  .command('info')
  .description('Show detailed information about an agent')
  .argument('<agent-id>', 'Agent ID (e.g., sdk-generator-agent)')
  .action((agentId) => {
    const agent = getAgentMetadata(agentId);

    if (!agent) {
      console.error(chalk.red(`Agent not found: ${agentId}`));
      console.log(chalk.gray(`Available agents: ${Object.keys(AGENTS).join(', ')}`));
      process.exit(1);
    }

    console.log(chalk.cyan(`\nAgent: ${agent.id}\n`));
    console.log(chalk.white('Classification:'));
    console.log(chalk.gray(`  Type: ${agent.classification.type}`));
    console.log(chalk.gray(`  Deterministic: ${agent.classification.deterministic}`));
    console.log(chalk.gray(`  Stateless: ${agent.classification.stateless}`));
    console.log(chalk.gray(`  Idempotent: ${agent.classification.idempotent}`));

    console.log(chalk.white('\nCharacteristics:'));
    for (const char of agent.classification.characteristics) {
      console.log(chalk.gray(`  - ${char}`));
    }

    console.log(chalk.white('\nNon-Responsibilities:'));
    for (const nonResp of agent.nonResponsibilities.slice(0, 5)) {
      console.log(chalk.gray(`  - ${nonResp}`));
    }
    if (agent.nonResponsibilities.length > 5) {
      console.log(chalk.gray(`  ... and ${agent.nonResponsibilities.length - 5} more`));
    }

    console.log(chalk.white('\nPersisted Data:'));
    for (const data of agent.persistedData) {
      console.log(chalk.gray(`  - ${data}`));
    }

    console.log(chalk.white('\nDownstream Consumers:'));
    for (const consumer of agent.downstreamConsumers) {
      console.log(chalk.gray(`  - ${consumer.system}: ${consumer.purpose}`));
    }

    console.log('');
  });

/**
 * Agent generate command (invokes SDK Generator Agent)
 */
agentCmd
  .command('generate')
  .description('Run SDK Generator Agent with DecisionEvent emission')
  .argument('<input>', 'Canonical schema (JSON) or OpenAPI spec')
  .option('-l, --lang <languages...>', 'Target languages', ['typescript', 'python'])
  .option('-n, --name <name>', 'Package name', 'my-llm-sdk')
  .option('--pkg-version <version>', 'Package version', '0.1.0')
  .option('--emit-events', 'Emit DecisionEvents to ruvector-service')
  .option('--ruvector-endpoint <url>', 'RuVector service endpoint')
  .option('--dry-run', 'Validate without generating files')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    const spinner = ora('Running SDK Generator Agent...').start();
    const requestId = randomUUID();

    try {
      // Read input file
      const inputContent = readFileSync(input, 'utf-8');
      let schema;

      // Check if it's a canonical schema or OpenAPI
      const inputData = JSON.parse(inputContent);

      if (inputData.metadata && inputData.types && inputData.endpoints) {
        schema = inputData;
      } else {
        // Parse as OpenAPI
        spinner.text = 'Parsing OpenAPI specification...';
        const result = await parseOpenAPI(input, {
          providerId: 'unknown',
          providerName: 'Unknown Provider',
        });

        if (!result.success || !result.schema) {
          spinner.fail('Parse failed');
          console.error(chalk.red('Errors:'));
          result.errors.forEach((err) => console.error(chalk.red(`  - ${err}`)));
          process.exit(1);
        }

        schema = result.schema;
      }

      spinner.text = 'Invoking SDK Generator Agent...';

      // Build request
      const request = {
        requestId,
        schema,
        targetLanguages: options.lang,
        packageConfig: {
          name: options.name,
          version: options.pkgVersion,
          license: 'Apache-2.0',
        },
        options: {
          includeExamples: true,
          includeTests: true,
          strictTypes: true,
          asyncVariants: true,
          streamingSupport: true,
        },
      };

      // Create execution context
      const startTime = Date.now();
      const context: EdgeFunctionContext = {
        requestId,
        startTime,
        getRemainingTime: () => 300000 - (Date.now() - startTime), // 5 minutes
        emitEvents: options.emitEvents ?? false,
        dryRun: options.dryRun ?? false,
        ruvectorEndpoint: options.ruvectorEndpoint,
      };

      // Invoke handler
      const response = await sdkGeneratorHandler(JSON.stringify(request), context);

      // Parse response
      const result = JSON.parse(response.body);

      if (response.statusCode >= 200 && response.statusCode < 300 && result.success) {
        spinner.succeed('SDK Generator Agent completed successfully');

        console.log(chalk.green(`\n✓ Agent: ${AGENT_ID} v${AGENT_VERSION}`));
        console.log(chalk.gray(`  Request ID: ${requestId}`));
        console.log(chalk.gray(`  Determinism Hash: ${result.compatibility?.determinismHash}`));

        if (result.artifacts) {
          console.log(chalk.cyan('\nGenerated Artifacts:'));
          for (const artifact of result.artifacts) {
            console.log(chalk.white(`  ${artifact.language}:`));
            console.log(chalk.gray(`    Files: ${artifact.metrics.totalFiles}`));
            console.log(chalk.gray(`    Size: ${(artifact.metrics.totalSizeBytes / 1024).toFixed(2)} KB`));
            console.log(chalk.gray(`    Duration: ${artifact.metrics.generationDurationMs}ms`));
          }
        }

        if (result.warnings?.length > 0) {
          console.log(chalk.yellow(`\n⚠ ${result.warnings.length} warning(s):`));
          result.warnings.forEach((w: string) => console.log(chalk.yellow(`  - ${w}`)));
        }

        if (options.emitEvents) {
          console.log(chalk.cyan('\n✓ DecisionEvents emitted to ruvector-service'));
        }
      } else {
        spinner.fail('SDK Generator Agent failed');

        console.error(chalk.red(`\n✗ Agent Error: ${result.error?.code}`));
        console.error(chalk.red(`  Message: ${result.error?.message}`));

        if (result.error?.details) {
          console.error(chalk.red('\n  Details:'));
          result.error.details.forEach((d: string) => console.error(chalk.red(`    - ${d}`)));
        }

        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Unexpected error');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Translate command - API Translation Agent
 */
program
  .command('translate')
  .description('Translate API schemas between REST, SDK, and CLI representations')
  .argument('<input>', 'Canonical schema (JSON) to translate')
  .option('--from <format>', 'Source format (rest, sdk, cli)', 'rest')
  .option('--to <format>', 'Target format (rest, sdk, cli)', 'sdk')
  .option('-o, --output <file>', 'Output file for translation result (JSON)')
  .option('--strict', 'Strict mode (fail on semantic loss)')
  .option('--include-mappings', 'Include translation mappings in output', true)
  .option('--naming <convention>', 'Naming convention (camelCase, snake_case, kebab-case, PascalCase)')
  .option('--emit-events', 'Emit DecisionEvents (for ruvector-service integration)')
  .option('--dry-run', 'Validate without producing output')
  .action(async (input, options) => {
    const spinner = ora('Translating API schema...').start();

    try {
      const { APITranslator } = await import('../translators/api-translator.js');
      const { InterfaceFormat } = await import('../agents/contracts/api-translation.contract.js');
      const fs = await import('fs');

      // Validate formats
      const formatMap: Record<string, typeof InterfaceFormat[keyof typeof InterfaceFormat]> = {
        rest: InterfaceFormat.REST,
        sdk: InterfaceFormat.SDK,
        cli: InterfaceFormat.CLI,
      };

      const fromFormat = formatMap[options.from.toLowerCase()];
      const toFormat = formatMap[options.to.toLowerCase()];

      if (!fromFormat) {
        spinner.fail('Invalid source format');
        console.error(chalk.red(`Unknown format: ${options.from}. Valid formats: rest, sdk, cli`));
        process.exit(1);
      }

      if (!toFormat) {
        spinner.fail('Invalid target format');
        console.error(chalk.red(`Unknown format: ${options.to}. Valid formats: rest, sdk, cli`));
        process.exit(1);
      }

      if (fromFormat === toFormat) {
        spinner.fail('Source and target formats are the same');
        console.error(chalk.red('Cannot translate to the same format'));
        process.exit(1);
      }

      spinner.text = `Loading input from ${input}...`;

      // Load input file
      const inputData = JSON.parse(fs.readFileSync(input, 'utf-8'));

      // Validate it's a canonical schema
      if (!inputData.metadata || !inputData.types || !inputData.endpoints) {
        spinner.fail('Invalid input');
        console.error(chalk.red('Input must be a valid canonical schema with metadata, types, and endpoints'));
        process.exit(1);
      }

      spinner.text = `Translating from ${options.from} to ${options.to}...`;

      // Create translator
      const translator = new APITranslator({
        emitEvents: options.emitEvents,
        onEvent: options.emitEvents ? (event) => {
          console.log(chalk.gray(`[Event] ${JSON.stringify(event)}`));
        } : undefined,
      });

      // Execute translation
      const result = await translator.translate({
        requestId: randomUUID(),
        direction: {
          from: fromFormat,
          to: toFormat,
        },
        sourceSchema: inputData,
        options: {
          strict: options.strict ?? false,
          includeMappings: options.includeMappings ?? true,
          preserveIdentifiers: true,
          namingConvention: options.naming,
          groupByTag: true,
        },
      });

      if (!result.success) {
        spinner.fail('Translation failed');
        console.error(chalk.red('Errors:'));
        result.errors.forEach((err) => console.error(chalk.red(`  - ${err}`)));
        process.exit(1);
      }

      spinner.succeed('Translation successful');

      // Show results summary
      console.log(chalk.green(`\n✓ Translation Complete: ${options.from} → ${options.to}`));
      console.log(chalk.gray(`  Request ID: ${result.requestId}`));
      console.log(chalk.gray(`  Agent Version: ${result.compatibility.agentVersion}`));
      console.log(chalk.gray(`  Determinism Hash: ${result.compatibility.determinismHash.slice(0, 16)}...`));

      if (result.result) {
        const elementCount =
          (result.result.restEndpoints?.length ?? 0) +
          (result.result.sdkMethods?.length ?? 0) +
          (result.result.cliCommands?.length ?? 0);

        console.log(chalk.gray(`  Elements Translated: ${elementCount}`));
        console.log(chalk.gray(`  Mappings: ${result.result.mappings.length}`));
        console.log(chalk.gray(`  Confidence: ${(result.result.overallConfidence * 100).toFixed(1)}%`));

        if (result.result.issues.length > 0) {
          console.log(chalk.yellow(`\n⚠ ${result.result.issues.length} issue(s) detected:`));
          result.result.issues.forEach((issue) => {
            const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
            const color = issue.severity === 'error' ? chalk.red : issue.severity === 'warning' ? chalk.yellow : chalk.blue;
            console.log(color(`  ${icon} [${issue.code}] ${issue.message}`));
          });
        }
      }

      if (result.warnings.length > 0) {
        console.log(chalk.yellow(`\nWarnings (${result.warnings.length}):`));
        result.warnings.forEach((warn) => console.log(chalk.yellow(`  - ${warn}`)));
      }

      // Write output
      if (!options.dryRun) {
        if (options.output) {
          fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
          console.log(chalk.green(`\n✓ Written to ${options.output}`));
        } else {
          console.log(chalk.gray('\nTranslation Result:'));
          console.log(JSON.stringify(result.result, null, 2));
        }
      } else {
        console.log(chalk.cyan('\n[Dry run] No output written'));
      }
    } catch (error) {
      spinner.fail('Unexpected error');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Compatibility command - Version Compatibility Agent
 */
program
  .command('compatibility')
  .description('Analyze compatibility between API/SDK versions (Version Compatibility Agent)')
  .argument('<source>', 'Source schema (JSON) - baseline version')
  .argument('<target>', 'Target schema (JSON) - new version')
  .option('-s, --strictness <level>', 'Strictness level (strict, standard, lenient)', 'standard')
  .option('-o, --output <file>', 'Output report file (JSON)')
  .option('--no-guidance', 'Disable upgrade guidance')
  .option('--detailed-diff', 'Include detailed diff for each change')
  .option('--categories <cats...>', 'Categories to analyze', ['types', 'endpoints', 'authentication', 'errors'])
  .option('--ignore <paths...>', 'Paths to ignore')
  .option('--emit-events', 'Emit DecisionEvents to ruvector-service')
  .option('-v, --verbose', 'Verbose output')
  .option('--json', 'Output as JSON')
  .action(async (source, target, options) => {
    const spinner = ora('Running Version Compatibility Agent...').start();

    try {
      const { VersionCompatibilityAgent } = await import('../agents/version-compatibility-agent/index.js');
      const fs = await import('fs');

      spinner.text = 'Loading source schema...';

      // Load source schema
      let sourceSchema;
      try {
        sourceSchema = JSON.parse(fs.readFileSync(source, 'utf-8'));
      } catch (err) {
        spinner.fail('Failed to load source schema');
        console.error(chalk.red(`Could not read or parse ${source}`));
        process.exit(1);
      }

      // Validate source schema
      if (!sourceSchema.metadata || !sourceSchema.types || !sourceSchema.endpoints) {
        spinner.fail('Invalid source schema');
        console.error(chalk.red('Source must be a valid canonical schema with metadata, types, and endpoints'));
        process.exit(1);
      }

      spinner.text = 'Loading target schema...';

      // Load target schema
      let targetSchema;
      try {
        targetSchema = JSON.parse(fs.readFileSync(target, 'utf-8'));
      } catch (err) {
        spinner.fail('Failed to load target schema');
        console.error(chalk.red(`Could not read or parse ${target}`));
        process.exit(1);
      }

      // Validate target schema
      if (!targetSchema.metadata || !targetSchema.types || !targetSchema.endpoints) {
        spinner.fail('Invalid target schema');
        console.error(chalk.red('Target must be a valid canonical schema with metadata, types, and endpoints'));
        process.exit(1);
      }

      spinner.text = 'Analyzing compatibility...';

      // Create agent
      const agent = new VersionCompatibilityAgent({
        emitEvents: options.emitEvents ?? false,
      });

      // Run analysis
      const result = await agent.analyze({
        requestId: randomUUID(),
        sourceSchema,
        targetSchema,
        options: {
          strictness: options.strictness,
          includeUpgradeGuidance: options.guidance !== false,
          includeDetailedDiff: options.detailedDiff ?? false,
          analyzeCategories: options.categories,
          ignorePaths: options.ignore ?? [],
        },
      });

      if (!result.success) {
        spinner.fail('Compatibility analysis failed');
        console.error(chalk.red('Errors:'));
        result.errors.forEach((err) => console.error(chalk.red(`  - ${err}`)));
        process.exit(1);
      }

      spinner.succeed('Compatibility analysis complete');

      // JSON output mode
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Human-readable output
      const verdictColors: Record<string, typeof chalk> = {
        'fully-compatible': chalk.green,
        'backwards-compatible': chalk.cyan,
        'breaking': chalk.yellow,
        'incompatible': chalk.red,
      };

      const verdictEmoji: Record<string, string> = {
        'fully-compatible': '✅',
        'backwards-compatible': '🔄',
        'breaking': '⚠️',
        'incompatible': '❌',
      };

      const verdictColor = verdictColors[result.verdict] || chalk.white;

      console.log(chalk.cyan('\n' + '═'.repeat(60)));
      console.log(chalk.cyan('  VERSION COMPATIBILITY ANALYSIS REPORT'));
      console.log(chalk.cyan('═'.repeat(60)));

      console.log(chalk.white('\n📊 Analysis Summary:'));
      console.log(chalk.gray(`   Source: ${result.sourceVersion.providerId} v${result.sourceVersion.version}`));
      console.log(chalk.gray(`   Target: ${result.targetVersion.providerId} v${result.targetVersion.version}`));
      console.log(chalk.gray(`   Agent: version-compatibility-agent v${result.analysisMetadata.agentVersion}`));
      console.log(chalk.gray(`   Duration: ${result.analysisMetadata.durationMs}ms`));

      console.log(chalk.white('\n🎯 Verdict:'));
      console.log(verdictColor(`   ${verdictEmoji[result.verdict]} ${result.verdict.toUpperCase()}`));

      console.log(chalk.white('\n📈 Changes Detected:'));
      console.log(chalk.gray(`   Total Changes: ${result.summary.totalChanges}`));

      if (result.summary.breakingChanges > 0) {
        console.log(chalk.red(`   Breaking: ${result.summary.breakingChanges}`));
      } else {
        console.log(chalk.green(`   Breaking: ${result.summary.breakingChanges}`));
      }

      console.log(chalk.cyan(`   Non-Breaking: ${result.summary.nonBreakingChanges}`));
      console.log(chalk.gray(`   Patch: ${result.summary.patchChanges}`));
      console.log(chalk.gray(`   Informational: ${result.summary.informationalChanges}`));

      if (Object.keys(result.summary.changesByCategory).length > 0) {
        console.log(chalk.white('\n📋 Changes by Category:'));
        for (const [category, count] of Object.entries(result.summary.changesByCategory)) {
          console.log(chalk.gray(`   ${category}: ${count}`));
        }
      }

      console.log(chalk.white('\n📦 Version Recommendation:'));
      const bumpEmoji: Record<string, string> = {
        major: '🔴',
        minor: '🟡',
        patch: '🟢',
        none: '⚪',
      };
      console.log(chalk.cyan(`   ${bumpEmoji[result.versionRecommendation.bumpType]} ${result.versionRecommendation.bumpType.toUpperCase()} → ${result.versionRecommendation.recommendedVersion}`));
      console.log(chalk.gray(`   ${result.versionRecommendation.rationale}`));

      // Show breaking changes if verbose
      if (options.verbose && result.changes.length > 0) {
        console.log(chalk.white('\n🔍 Detailed Changes:'));

        const breakingChanges = result.changes.filter((c) => c.severity === 'breaking');
        if (breakingChanges.length > 0) {
          console.log(chalk.red('\n  Breaking Changes:'));
          for (const change of breakingChanges) {
            console.log(chalk.red(`    ✗ ${change.path}`));
            console.log(chalk.gray(`      ${change.description}`));
            if (change.upgradeGuidance) {
              console.log(chalk.yellow(`      → ${change.upgradeGuidance}`));
            }
          }
        }

        const nonBreakingChanges = result.changes.filter((c) => c.severity === 'non-breaking');
        if (nonBreakingChanges.length > 0 && options.verbose) {
          console.log(chalk.cyan('\n  Non-Breaking Changes:'));
          for (const change of nonBreakingChanges.slice(0, 10)) {
            console.log(chalk.cyan(`    + ${change.path}`));
            console.log(chalk.gray(`      ${change.description}`));
          }
          if (nonBreakingChanges.length > 10) {
            console.log(chalk.gray(`    ... and ${nonBreakingChanges.length - 10} more`));
          }
        }
      }

      if (result.warnings.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Warnings (${result.warnings.length}):`));
        result.warnings.forEach((warn) => console.log(chalk.yellow(`    - ${warn}`)));
      }

      console.log(chalk.cyan('\n' + '═'.repeat(60)));

      // Write output file if specified
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
        console.log(chalk.green(`\n✓ Report written to ${options.output}`));
      }

      if (options.emitEvents) {
        console.log(chalk.cyan('\n✓ DecisionEvents emitted to ruvector-service'));
      }

      // Exit with appropriate code based on verdict
      if (result.verdict === 'incompatible') {
        process.exit(2);
      } else if (result.verdict === 'breaking') {
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Unexpected error');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Validate command
 */
program
  .command('validate')
  .description('Validate a canonical schema')
  .argument('<input>', 'Canonical schema file (JSON)')
  .option('--strict', 'Strict validation mode')
  .action(async (input, options) => {
    const spinner = ora('Validating schema...').start();

    try {
      const fs = await import('fs');

      // Load input file
      const inputData = JSON.parse(fs.readFileSync(input, 'utf-8'));

      // Validate
      const result = validator.validate(inputData);

      if (!result.valid) {
        spinner.fail('Validation failed');
        console.error(chalk.red('Errors:'));
        result.errors.forEach((err) =>
          console.error(chalk.red(`  ${err.path}: ${err.message}`))
        );
        process.exit(1);
      }

      spinner.succeed('Schema is valid');

      console.log(chalk.green('\n✓ Schema Validation Passed'));
      console.log(chalk.gray(`  Types: ${inputData.types?.length ?? 0}`));
      console.log(chalk.gray(`  Endpoints: ${inputData.endpoints?.length ?? 0}`));
      console.log(chalk.gray(`  Auth Schemes: ${inputData.authentication?.length ?? 0}`));

      if (result.warnings.length > 0) {
        console.log(chalk.yellow(`\nWarnings (${result.warnings.length}):`));
        result.warnings.forEach((warn) => console.log(chalk.yellow(`  - ${warn}`)));
      }
    } catch (error) {
      spinner.fail('Unexpected error');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
