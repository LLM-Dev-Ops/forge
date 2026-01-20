/**
 * CLI Command Generator Agent - Core Generation Logic
 *
 * Transforms API endpoint definitions into CLI command definitions and artifacts.
 * This is a GENERATION agent - outputs are deterministic and reproducible.
 *
 * @module agents/cli-command-generator/generator
 */

import type { z } from 'zod';
import {
  CLIFramework,
  CLIArgumentType,
  CLIOption,
  CLIArgument,
  CLICommandDefinition,
  CLIProgramDefinition,
  GeneratedCLIFile,
  CLIGenerationResult,
  CLIGeneratorInput,
  APIEndpointInputSchema,
} from './types.js';

type APIEndpointInput = z.infer<typeof APIEndpointInputSchema>;

/**
 * Maps API parameter types to CLI argument types
 */
function mapParameterType(typeId: string): CLIArgumentType {
  const typeMap: Record<string, CLIArgumentType> = {
    string: CLIArgumentType.String,
    integer: CLIArgumentType.Number,
    number: CLIArgumentType.Number,
    float: CLIArgumentType.Number,
    boolean: CLIArgumentType.Boolean,
    array: CLIArgumentType.Array,
    file: CLIArgumentType.File,
    object: CLIArgumentType.String, // JSON string
  };

  // Extract base type from typeId (e.g., "string_email" -> "string")
  const baseType = typeId.split('_')[0] ?? typeId;
  return typeMap[baseType] ?? CLIArgumentType.String;
}

/**
 * Convert operation ID to CLI command name
 * e.g., "createChatCompletion" -> "create-chat-completion"
 */
function operationIdToCommandName(operationId: string): string {
  return operationId
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Convert parameter name to CLI option name
 * e.g., "maxTokens" -> "max-tokens"
 */
function parameterToOptionName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Generate alias from option name (first letter)
 */
function generateAlias(name: string, usedAliases: Set<string>): string | undefined {
  const firstLetter = name[0]?.toLowerCase();
  if (firstLetter && !usedAliases.has(firstLetter)) {
    usedAliases.add(firstLetter);
    return firstLetter;
  }
  return undefined;
}

/**
 * Convert endpoint to CLI command definition
 */
function endpointToCommand(
  endpoint: APIEndpointInput,
  typeMap: Map<string, { name: string; kind: string; values?: Array<{ value: string | number; name: string }> }>
): CLICommandDefinition {
  const commandName = operationIdToCommandName(endpoint.operationId);
  const usedAliases = new Set<string>();

  // Convert parameters to options
  const options: CLIOption[] = [];
  const args: CLIArgument[] = [];

  // Process path parameters as positional arguments
  const pathParams = endpoint.parameters?.filter((p) => p.in === 'path') ?? [];
  for (const param of pathParams) {
    args.push({
      name: param.name,
      description: param.description ?? `The ${param.name} parameter`,
      type: mapParameterType(param.type.typeId),
      required: param.required,
      default: param.default,
    });
  }

  // Process query/header parameters as options
  const optionParams = endpoint.parameters?.filter((p) => p.in === 'query' || p.in === 'header') ?? [];
  for (const param of optionParams) {
    const optionName = parameterToOptionName(param.name);
    const alias = generateAlias(optionName, usedAliases);
    const paramType = typeMap.get(param.type.typeId);

    let cliType = mapParameterType(param.type.typeId);
    let choices: string[] | undefined;

    // Handle enum types
    if (paramType?.kind === 'enum' && paramType.values) {
      cliType = CLIArgumentType.Choice;
      choices = paramType.values.map((v) => String(v.value));
    }

    options.push({
      name: optionName,
      alias,
      description: param.description ?? `The ${param.name} parameter`,
      type: cliType,
      required: param.required,
      default: param.default,
      choices,
      deprecated: param.deprecated,
    });
  }

  // Process request body as a special option
  if (endpoint.requestBody) {
    const bodyType = typeMap.get(endpoint.requestBody.type.typeId);
    if (bodyType) {
      // For complex types, accept JSON or file input
      options.push({
        name: 'data',
        alias: generateAlias('data', usedAliases),
        description: endpoint.requestBody.description ?? 'Request body data (JSON string)',
        type: CLIArgumentType.String,
        required: endpoint.requestBody.required,
      });

      options.push({
        name: 'data-file',
        alias: generateAlias('file', usedAliases),
        description: 'Path to JSON file containing request body',
        type: CLIArgumentType.File,
        required: false,
      });
    }
  }

  // Add standard output options
  options.push({
    name: 'output',
    alias: generateAlias('output', usedAliases),
    description: 'Output format (json, yaml, table)',
    type: CLIArgumentType.Choice,
    required: false,
    default: 'json',
    choices: ['json', 'yaml', 'table'],
  });

  options.push({
    name: 'output-file',
    description: 'Write output to file instead of stdout',
    type: CLIArgumentType.File,
    required: false,
  });

  // Generate examples
  const examples = generateExamples(commandName, args, options, endpoint);

  return {
    name: commandName,
    summary: endpoint.summary ?? `Execute ${endpoint.operationId}`,
    description: endpoint.description ?? `Executes the ${endpoint.operationId} API operation (${endpoint.method} ${endpoint.path})`,
    arguments: args,
    options,
    examples,
    deprecated: endpoint.deprecated,
    handlerRef: `handlers/${commandName}.js`,
    tags: endpoint.tags,
  };
}

/**
 * Generate usage examples for a command
 */
function generateExamples(
  commandName: string,
  args: CLIArgument[],
  options: CLIOption[],
  endpoint: APIEndpointInput
): string[] {
  const examples: string[] = [];
  const baseCommand = `llm-forge ${commandName}`;

  // Basic example with required args
  const requiredArgs = args.filter((a) => a.required).map((a) => `<${a.name}>`);
  const requiredOpts = options
    .filter((o) => o.required && o.name !== 'output')
    .map((o) => `--${o.name} <value>`);

  if (requiredArgs.length > 0 || requiredOpts.length > 0) {
    examples.push(`${baseCommand} ${[...requiredArgs, ...requiredOpts].join(' ')}`);
  } else {
    examples.push(baseCommand);
  }

  // Example with JSON output
  if (endpoint.requestBody) {
    examples.push(`${baseCommand} --data '{"key": "value"}' --output json`);
    examples.push(`${baseCommand} --data-file ./request.json`);
  }

  return examples;
}

/**
 * Generate program-level global options
 */
function generateGlobalOptions(input: CLIGeneratorInput): CLIOption[] {
  const globalOptions: CLIOption[] = [
    {
      name: 'api-key',
      alias: 'k',
      description: `${input.providerName} API key (or set ${input.providerId.toUpperCase()}_API_KEY env var)`,
      type: CLIArgumentType.String,
      required: false,
      envVar: `${input.providerId.toUpperCase()}_API_KEY`,
    },
    {
      name: 'base-url',
      description: 'Override API base URL',
      type: CLIArgumentType.String,
      required: false,
    },
    {
      name: 'timeout',
      alias: 't',
      description: 'Request timeout in milliseconds',
      type: CLIArgumentType.Number,
      required: false,
      default: 30000,
    },
    {
      name: 'verbose',
      alias: 'v',
      description: 'Enable verbose output',
      type: CLIArgumentType.Boolean,
      required: false,
      default: false,
    },
    {
      name: 'quiet',
      alias: 'q',
      description: 'Suppress non-error output',
      type: CLIArgumentType.Boolean,
      required: false,
      default: false,
    },
    {
      name: 'no-color',
      description: 'Disable colored output',
      type: CLIArgumentType.Boolean,
      required: false,
      default: false,
    },
  ];

  // Add custom global options from input
  if (input.options.globalOptions) {
    for (const opt of input.options.globalOptions) {
      globalOptions.push({
        name: opt.name,
        alias: opt.alias,
        description: opt.description,
        type: opt.type,
        required: false,
        default: opt.default,
      });
    }
  }

  return globalOptions;
}

/**
 * Generate the complete CLI program definition
 */
function generateProgramDefinition(input: CLIGeneratorInput): CLIProgramDefinition {
  // Build type map for reference
  const typeMap = new Map<string, { name: string; kind: string; values?: Array<{ value: string | number; name: string }> }>();
  for (const type of input.types) {
    typeMap.set(type.id, {
      name: type.name,
      kind: type.kind,
      values: type.values,
    });
  }

  // Convert endpoints to commands
  const commands: CLICommandDefinition[] = [];
  for (const endpoint of input.endpoints) {
    const command = endpointToCommand(endpoint, typeMap);
    if (input.options.commandPrefix) {
      command.name = `${input.options.commandPrefix}-${command.name}`;
    }
    commands.push(command);
  }

  // Group commands by tags if available
  const taggedCommands = new Map<string, CLICommandDefinition[]>();
  const untaggedCommands: CLICommandDefinition[] = [];

  for (const command of commands) {
    if (command.tags && command.tags.length > 0) {
      const primaryTag = command.tags[0]!;
      if (!taggedCommands.has(primaryTag)) {
        taggedCommands.set(primaryTag, []);
      }
      taggedCommands.get(primaryTag)!.push(command);
    } else {
      untaggedCommands.push(command);
    }
  }

  // Create subcommand groups if there are tags
  const finalCommands: CLICommandDefinition[] = [];
  for (const [tag, tagCommands] of taggedCommands) {
    if (tagCommands.length > 1) {
      // Create a group command
      finalCommands.push({
        name: tag.toLowerCase(),
        summary: `${tag} operations`,
        description: `Commands for ${tag} operations`,
        arguments: [],
        options: [],
        subcommands: tagCommands,
        handlerRef: `handlers/${tag.toLowerCase()}/index.js`,
      });
    } else {
      // Single command, add directly
      finalCommands.push(...tagCommands);
    }
  }
  finalCommands.push(...untaggedCommands);

  return {
    name: input.packageName,
    version: input.packageVersion,
    description: `CLI for ${input.providerName} API`,
    commands: finalCommands,
    globalOptions: generateGlobalOptions(input),
    helpConfig: {
      showHelpOnNoArgs: true,
      showVersionOnNoArgs: false,
      customHelpFooter: `\nDocumentation: https://github.com/LLM-Dev-Ops/${input.packageName}\nReport issues: https://github.com/LLM-Dev-Ops/${input.packageName}/issues`,
    },
  };
}

/**
 * Generate TypeScript files for Commander.js framework
 */
function generateCommanderFiles(
  program: CLIProgramDefinition,
  input: CLIGeneratorInput
): GeneratedCLIFile[] {
  const files: GeneratedCLIFile[] = [];

  // Generate types file
  if (input.options.generateTypes !== false) {
    files.push(generateTypesFile(program, input));
  }

  // Generate main index file
  files.push(generateIndexFile(program, input));

  // Generate command files
  for (const command of program.commands) {
    files.push(generateCommandFile(command, program, input));

    // Generate subcommand files
    if (command.subcommands) {
      for (const subcommand of command.subcommands) {
        files.push(generateCommandFile(subcommand, program, input, command.name));
      }
    }
  }

  // Generate handler stubs
  if (input.options.generateHandlers !== false) {
    for (const command of program.commands) {
      files.push(generateHandlerFile(command, input));

      if (command.subcommands) {
        for (const subcommand of command.subcommands) {
          files.push(generateHandlerFile(subcommand, input, command.name));
        }
      }
    }
  }

  // Generate package.json
  files.push(generatePackageJson(program, input));

  // Generate README
  files.push(generateReadme(program, input));

  return files;
}

/**
 * Generate types file
 */
function generateTypesFile(program: CLIProgramDefinition, input: CLIGeneratorInput): GeneratedCLIFile {
  const content = `/**
 * CLI Types for ${program.name}
 * Generated by CLI Command Generator Agent v${input.contractVersion}
 *
 * DO NOT EDIT - This file is auto-generated
 */

/**
 * Global CLI options available to all commands
 */
export interface GlobalOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  verbose?: boolean;
  quiet?: boolean;
  noColor?: boolean;
}

/**
 * Output format options
 */
export type OutputFormat = 'json' | 'yaml' | 'table';

/**
 * Command execution context
 */
export interface CommandContext {
  globalOptions: GlobalOptions;
  outputFormat: OutputFormat;
  outputFile?: string;
}

${program.commands.map((cmd) => generateCommandTypes(cmd)).join('\n\n')}
`;

  return {
    path: 'src/types.ts',
    content,
    type: 'types',
  };
}

/**
 * Generate TypeScript types for a command's options
 */
function generateCommandTypes(command: CLICommandDefinition): string {
  const typeName = toPascalCase(command.name) + 'Options';
  const props = command.options
    .filter((opt) => !['output', 'output-file'].includes(opt.name))
    .map((opt) => {
      const propName = toCamelCase(opt.name);
      const tsType = cliTypeToTsType(opt.type, opt.choices);
      const optional = opt.required ? '' : '?';
      return `  ${propName}${optional}: ${tsType};`;
    });

  let result = `export interface ${typeName} {\n${props.join('\n')}\n}`;

  if (command.subcommands) {
    for (const sub of command.subcommands) {
      result += '\n\n' + generateCommandTypes(sub);
    }
  }

  return result;
}

/**
 * Map CLI argument type to TypeScript type
 */
function cliTypeToTsType(type: CLIArgumentType, choices?: string[]): string {
  if (choices && choices.length > 0) {
    return choices.map((c) => `'${c}'`).join(' | ');
  }

  switch (type) {
    case CLIArgumentType.String:
    case CLIArgumentType.File:
    case CLIArgumentType.Directory:
      return 'string';
    case CLIArgumentType.Number:
      return 'number';
    case CLIArgumentType.Boolean:
      return 'boolean';
    case CLIArgumentType.Array:
      return 'string[]';
    case CLIArgumentType.Choice:
      return 'string';
    default:
      return 'unknown';
  }
}

/**
 * Generate main index file
 */
function generateIndexFile(program: CLIProgramDefinition, input: CLIGeneratorInput): GeneratedCLIFile {
  const imports = program.commands
    .map((cmd) => `import { register${toPascalCase(cmd.name)}Command } from './commands/${cmd.name}.js';`)
    .join('\n');

  const registrations = program.commands
    .map((cmd) => `  register${toPascalCase(cmd.name)}Command(program);`)
    .join('\n');

  const globalOptionsCode = (program.globalOptions ?? [])
    .map((opt) => {
      const flags = opt.alias ? `-${opt.alias}, --${opt.name}` : `--${opt.name}`;
      const typeArg = opt.type === CLIArgumentType.Boolean ? '' : ` <${opt.name}>`;
      const defaultVal = opt.default !== undefined ? `, ${JSON.stringify(opt.default)}` : '';
      return `  .option('${flags}${typeArg}', '${opt.description}'${defaultVal})`;
    })
    .join('\n');

  const content = `#!/usr/bin/env node
/**
 * ${program.name} CLI
 * ${program.description}
 *
 * Generated by CLI Command Generator Agent v${input.contractVersion}
 * Contract: ${input.contractId}@${input.contractVersion}
 *
 * DO NOT EDIT - This file is auto-generated
 */

import { Command } from 'commander';

${imports}

const program = new Command();

program
  .name('${program.name}')
  .description('${program.description}')
  .version('${program.version}')
${globalOptionsCode};

// Register commands
${registrations}

// Help configuration
${program.helpConfig?.showHelpOnNoArgs ? "program.showHelpAfterError();" : ''}

// Parse arguments
program.parse();
`;

  return {
    path: 'src/index.ts',
    content,
    type: 'index',
    executable: true,
  };
}

/**
 * Generate a command file
 */
function generateCommandFile(
  command: CLICommandDefinition,
  program: CLIProgramDefinition,
  input: CLIGeneratorInput,
  parentName?: string
): GeneratedCLIFile {
  const funcName = `register${toPascalCase(command.name)}Command`;
  const handlerImport = parentName
    ? `import { handle${toPascalCase(command.name)} } from '../handlers/${parentName}/${command.name}.js';`
    : `import { handle${toPascalCase(command.name)} } from '../handlers/${command.name}.js';`;

  const argsCode = command.arguments
    .map((arg) => {
      const bracket = arg.required ? '<' : '[';
      const closeBracket = arg.required ? '>' : ']';
      const variadic = arg.variadic ? '...' : '';
      return `  .argument('${bracket}${arg.name}${variadic}${closeBracket}', '${arg.description}')`;
    })
    .join('\n');

  const optionsCode = command.options
    .map((opt) => {
      const flags = opt.alias ? `-${opt.alias}, --${opt.name}` : `--${opt.name}`;
      let typeArg = '';
      if (opt.type !== CLIArgumentType.Boolean) {
        if (opt.choices) {
          typeArg = ` <${opt.name}>`;
        } else if (opt.variadic) {
          typeArg = ` <${opt.name}...>`;
        } else {
          typeArg = ` <${opt.name}>`;
        }
      }
      const defaultVal = opt.default !== undefined ? `, ${JSON.stringify(opt.default)}` : '';
      let line = `  .option('${flags}${typeArg}', '${opt.description}'${defaultVal})`;
      if (opt.choices) {
        line = `  .addOption(new Option('${flags}${typeArg}', '${opt.description}').choices(${JSON.stringify(opt.choices)})${opt.default ? `.default(${JSON.stringify(opt.default)})` : ''})`;
      }
      return line;
    })
    .join('\n');

  const hasChoices = command.options.some((opt) => opt.choices);
  const optionImport = hasChoices ? ', Option' : '';

  const subcommandsCode = command.subcommands
    ? command.subcommands
        .map((sub) => `  register${toPascalCase(sub.name)}Subcommand(cmd);`)
        .join('\n')
    : '';

  const subcommandImports = command.subcommands
    ? command.subcommands
        .map((sub) => `import { register${toPascalCase(sub.name)}Subcommand } from './${command.name}/${sub.name}.js';`)
        .join('\n')
    : '';

  const content = `/**
 * ${command.name} command
 * ${command.summary}
 *
 * Generated by CLI Command Generator Agent
 */

import { Command${optionImport} } from 'commander';
${handlerImport}
${subcommandImports}

export function ${funcName}(program: Command): void {
  const cmd = program
    .command('${command.name}')
    .description('${command.description}')
${argsCode}
${optionsCode}
    .action(handle${toPascalCase(command.name)});

${subcommandsCode}
}
`;

  const path = parentName
    ? `src/commands/${parentName}/${command.name}.ts`
    : `src/commands/${command.name}.ts`;

  return {
    path,
    content,
    type: 'command',
  };
}

/**
 * Generate handler stub file
 */
function generateHandlerFile(
  command: CLICommandDefinition,
  input: CLIGeneratorInput,
  parentName?: string
): GeneratedCLIFile {
  const funcName = `handle${toPascalCase(command.name)}`;
  const typeName = `${toPascalCase(command.name)}Options`;

  const argParams = command.arguments.map((arg) => arg.name).join(', ');
  const argTypes = command.arguments.map((arg) => `${arg.name}: string`).join(', ');

  const content = `/**
 * Handler for ${command.name} command
 *
 * Generated by CLI Command Generator Agent
 *
 * TODO: Implement actual API call logic
 */

import type { ${typeName} } from '../types.js';

export async function ${funcName}(${argTypes ? argTypes + ', ' : ''}options: ${typeName}): Promise<void> {
  // TODO: Implement handler
  console.log('Executing ${command.name}...');
  console.log('Arguments:', { ${argParams} });
  console.log('Options:', options);

  // Example implementation:
  // const client = new ${toPascalCase(input.providerName)}Client({
  //   apiKey: process.env.${input.providerId.toUpperCase()}_API_KEY,
  // });
  // const result = await client.${toCamelCase(command.name)}(${argParams ? argParams + ', ' : ''}options);
  // console.log(JSON.stringify(result, null, 2));
}
`;

  const path = parentName
    ? `src/handlers/${parentName}/${command.name}.ts`
    : `src/handlers/${command.name}.ts`;

  return {
    path,
    content,
    type: 'handler',
  };
}

/**
 * Generate package.json
 */
function generatePackageJson(program: CLIProgramDefinition, input: CLIGeneratorInput): GeneratedCLIFile {
  const pkg = {
    name: program.name,
    version: program.version,
    description: program.description,
    type: 'module',
    main: './dist/index.js',
    bin: {
      [program.name]: './dist/index.js',
    },
    scripts: {
      build: 'tsc',
      dev: 'tsx src/index.ts',
      start: 'node dist/index.js',
      lint: 'eslint src --ext .ts',
      'type-check': 'tsc --noEmit',
    },
    keywords: ['cli', input.providerId, 'llm', 'api'],
    author: '',
    license: 'MIT',
    dependencies: {
      commander: '^12.0.0',
      chalk: '^5.3.0',
      ora: '^8.0.1',
    },
    devDependencies: {
      '@types/node': '^20.11.0',
      typescript: '^5.3.3',
      tsx: '^4.7.0',
      eslint: '^8.56.0',
      '@typescript-eslint/eslint-plugin': '^6.19.0',
      '@typescript-eslint/parser': '^6.19.0',
    },
    engines: {
      node: '>=18.0.0',
    },
    files: ['dist'],
  };

  return {
    path: 'package.json',
    content: JSON.stringify(pkg, null, 2),
    type: 'manifest',
  };
}

/**
 * Generate README
 */
function generateReadme(program: CLIProgramDefinition, input: CLIGeneratorInput): GeneratedCLIFile {
  const commandDocs = program.commands
    .map((cmd) => {
      let doc = `### \`${cmd.name}\`\n\n${cmd.description}\n\n`;

      if (cmd.arguments.length > 0) {
        doc += '**Arguments:**\n\n';
        for (const arg of cmd.arguments) {
          doc += `- \`${arg.name}\` - ${arg.description}${arg.required ? ' (required)' : ''}\n`;
        }
        doc += '\n';
      }

      if (cmd.options.length > 0) {
        doc += '**Options:**\n\n';
        for (const opt of cmd.options) {
          const alias = opt.alias ? `-${opt.alias}, ` : '';
          doc += `- \`${alias}--${opt.name}\` - ${opt.description}`;
          if (opt.default !== undefined) {
            doc += ` (default: \`${JSON.stringify(opt.default)}\`)`;
          }
          doc += '\n';
        }
        doc += '\n';
      }

      if (cmd.examples && cmd.examples.length > 0) {
        doc += '**Examples:**\n\n```bash\n';
        doc += cmd.examples.join('\n');
        doc += '\n```\n';
      }

      return doc;
    })
    .join('\n');

  const content = `# ${program.name}

${program.description}

## Installation

\`\`\`bash
npm install -g ${program.name}
\`\`\`

## Usage

\`\`\`bash
${program.name} [command] [options]
\`\`\`

## Global Options

${(program.globalOptions ?? []).map((opt) => `- \`--${opt.name}\` - ${opt.description}`).join('\n')}

## Commands

${commandDocs}

## Environment Variables

- \`${input.providerId.toUpperCase()}_API_KEY\` - API key for authentication

## License

MIT

---

Generated by [LLM-Forge CLI Command Generator Agent](https://github.com/LLM-Dev-Ops/llm-forge)
`;

  return {
    path: 'README.md',
    content,
    type: 'readme',
  };
}

/**
 * Helper: Convert to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Helper: Convert to camelCase
 */
function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Calculate confidence score for generation
 *
 * Deterministic generation has high confidence.
 * Factors that may reduce confidence:
 * - Missing endpoint descriptions
 * - Missing parameter types
 * - Deprecated endpoints
 */
function calculateConfidence(input: CLIGeneratorInput, program: CLIProgramDefinition): number {
  let score = 1.0;
  const deductions: number[] = [];

  // Check for missing descriptions
  const endpointsWithDescription = input.endpoints.filter((e) => e.description).length;
  const descriptionRatio = endpointsWithDescription / input.endpoints.length;
  if (descriptionRatio < 1.0) {
    deductions.push((1.0 - descriptionRatio) * 0.1);
  }

  // Check for deprecated endpoints
  const deprecatedCount = input.endpoints.filter((e) => e.deprecated).length;
  if (deprecatedCount > 0) {
    deductions.push((deprecatedCount / input.endpoints.length) * 0.05);
  }

  // Check for missing types
  const missingTypes = input.endpoints
    .flatMap((e) => e.parameters ?? [])
    .filter((p) => !input.types.find((t) => t.id === p.type.typeId))
    .length;
  if (missingTypes > 0) {
    deductions.push(Math.min(missingTypes * 0.02, 0.2));
  }

  // Apply deductions
  for (const deduction of deductions) {
    score -= deduction;
  }

  return Math.max(0.5, Math.min(1.0, score));
}

/**
 * Main generation function
 *
 * @param input - Validated generation input
 * @returns Generation result with files and metadata
 */
export function generateCLICommands(input: CLIGeneratorInput): CLIGenerationResult {
  const startTime = Date.now();
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    // Generate program definition
    const program = generateProgramDefinition(input);

    // Generate files based on framework
    let files: GeneratedCLIFile[];
    switch (input.framework) {
      case CLIFramework.Commander:
        files = generateCommanderFiles(program, input);
        break;
      case CLIFramework.Yargs:
      case CLIFramework.Clipanion:
      case CLIFramework.Oclif:
        warnings.push(`Framework ${input.framework} support is planned but not yet implemented. Falling back to Commander.`);
        files = generateCommanderFiles(program, input);
        break;
      default:
        throw new Error(`Unsupported framework: ${input.framework}`);
    }

    // Calculate confidence
    const confidence = calculateConfidence(input, program);

    // Add warnings for deprecated items
    for (const endpoint of input.endpoints) {
      if (endpoint.deprecated) {
        warnings.push(`Endpoint ${endpoint.operationId} is deprecated`);
      }
    }

    return {
      success: true,
      files,
      program,
      framework: input.framework,
      warnings,
      errors,
      duration: Date.now() - startTime,
      confidence,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      success: false,
      files: [],
      program: {
        name: input.packageName,
        version: input.packageVersion,
        description: '',
        commands: [],
      },
      framework: input.framework,
      warnings,
      errors,
      duration: Date.now() - startTime,
      confidence: 0,
    };
  }
}
