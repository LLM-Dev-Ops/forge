/**
 * CLI Command Generator Agent - Type Definitions
 *
 * Defines contracts for generating CLI command definitions from API contracts.
 * This agent is classified as GENERATION - it produces deterministic CLI artifacts.
 *
 * @module agents/cli-command-generator/types
 */

import { z } from 'zod';

/**
 * Supported CLI frameworks for command generation
 */
export enum CLIFramework {
  Commander = 'commander',
  Yargs = 'yargs',
  Clipanion = 'clipanion',
  Oclif = 'oclif',
}

/**
 * CLI argument type mapping
 */
export enum CLIArgumentType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Array = 'array',
  Choice = 'choice',
  File = 'file',
  Directory = 'directory',
}

/**
 * CLI option definition
 */
export interface CLIOption {
  /** Option name (long form, e.g., 'output') */
  name: string;
  /** Short form alias (e.g., 'o') */
  alias?: string;
  /** Option description for help text */
  description: string;
  /** Argument type */
  type: CLIArgumentType;
  /** Whether this option is required */
  required: boolean;
  /** Default value */
  default?: unknown;
  /** Valid choices (for choice type) */
  choices?: string[];
  /** Whether this option can be specified multiple times */
  variadic?: boolean;
  /** Environment variable override */
  envVar?: string;
  /** Deprecated flag */
  deprecated?: boolean;
  /** Deprecation message */
  deprecationMessage?: string;
}

/**
 * CLI positional argument definition
 */
export interface CLIArgument {
  /** Argument name */
  name: string;
  /** Argument description */
  description: string;
  /** Argument type */
  type: CLIArgumentType;
  /** Whether this argument is required */
  required: boolean;
  /** Default value */
  default?: unknown;
  /** Whether this argument accepts multiple values */
  variadic?: boolean;
}

/**
 * CLI command definition
 */
export interface CLICommandDefinition {
  /** Command name (e.g., 'generate', 'parse') */
  name: string;
  /** Command aliases */
  aliases?: string[];
  /** Brief description for command listing */
  summary: string;
  /** Detailed description for help text */
  description: string;
  /** Positional arguments */
  arguments: CLIArgument[];
  /** Options/flags */
  options: CLIOption[];
  /** Subcommands */
  subcommands?: CLICommandDefinition[];
  /** Example usage strings */
  examples?: string[];
  /** Whether this command is hidden from help */
  hidden?: boolean;
  /** Deprecated flag */
  deprecated?: boolean;
  /** Handler function reference */
  handlerRef: string;
  /** Tags for grouping */
  tags?: string[];
}

/**
 * CLI program definition (root level)
 */
export interface CLIProgramDefinition {
  /** Program name */
  name: string;
  /** Program version */
  version: string;
  /** Program description */
  description: string;
  /** Commands */
  commands: CLICommandDefinition[];
  /** Global options (available to all commands) */
  globalOptions?: CLIOption[];
  /** Help text customizations */
  helpConfig?: {
    showHelpOnNoArgs?: boolean;
    showVersionOnNoArgs?: boolean;
    customHelpHeader?: string;
    customHelpFooter?: string;
  };
}

/**
 * Generated CLI file artifact
 */
export interface GeneratedCLIFile {
  /** Relative file path */
  path: string;
  /** File content */
  content: string;
  /** File type */
  type: 'command' | 'handler' | 'types' | 'index' | 'manifest' | 'readme';
  /** Whether this file is executable */
  executable?: boolean;
}

/**
 * CLI generation result
 */
export interface CLIGenerationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Generated files */
  files: GeneratedCLIFile[];
  /** Program definition that was generated */
  program: CLIProgramDefinition;
  /** Target framework */
  framework: CLIFramework;
  /** Generation warnings */
  warnings: string[];
  /** Generation errors */
  errors: string[];
  /** Generation duration in milliseconds */
  duration: number;
  /** Confidence score (0-1) */
  confidence: number;
}

// ============================================================================
// Input Schema (agentics-contracts alignment)
// ============================================================================

/**
 * Zod schema for API endpoint input (from canonical schema)
 */
export const APIEndpointInputSchema = z.object({
  operationId: z.string(),
  path: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  summary: z.string().optional(),
  description: z.string().optional(),
  parameters: z.array(z.object({
    name: z.string(),
    in: z.enum(['path', 'query', 'header', 'cookie']),
    type: z.object({
      typeId: z.string(),
      nullable: z.boolean().optional(),
    }),
    required: z.boolean(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    deprecated: z.boolean().optional(),
  })).optional(),
  requestBody: z.object({
    type: z.object({
      typeId: z.string(),
      nullable: z.boolean().optional(),
    }),
    required: z.boolean(),
    contentType: z.string(),
    description: z.string().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  deprecated: z.boolean().optional(),
});

/**
 * Zod schema for type definition input
 */
export const TypeDefinitionInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['primitive', 'object', 'array', 'union', 'enum', 'reference']),
  description: z.string().optional(),
  properties: z.array(z.object({
    name: z.string(),
    type: z.object({
      typeId: z.string(),
      nullable: z.boolean().optional(),
    }),
    required: z.boolean(),
    description: z.string().optional(),
    default: z.unknown().optional(),
  })).optional(),
  values: z.array(z.object({
    value: z.union([z.string(), z.number()]),
    name: z.string(),
    description: z.string().optional(),
  })).optional(),
});

/**
 * Zod schema for CLI generation input
 */
export const CLIGeneratorInputSchema = z.object({
  /** Source contract/schema identifier */
  contractId: z.string(),
  /** Contract version */
  contractVersion: z.string(),
  /** API endpoints to generate commands for */
  endpoints: z.array(APIEndpointInputSchema),
  /** Type definitions for argument types */
  types: z.array(TypeDefinitionInputSchema),
  /** Target CLI framework */
  framework: z.nativeEnum(CLIFramework).default(CLIFramework.Commander),
  /** Package/program name */
  packageName: z.string(),
  /** Package version */
  packageVersion: z.string().default('0.1.0'),
  /** Provider ID (e.g., 'openai', 'anthropic') */
  providerId: z.string(),
  /** Provider display name */
  providerName: z.string(),
  /** Generation options */
  options: z.object({
    /** Include handler implementation stubs */
    generateHandlers: z.boolean().default(true),
    /** Include type definitions */
    generateTypes: z.boolean().default(true),
    /** Include examples in help text */
    includeExamples: z.boolean().default(true),
    /** Command name prefix */
    commandPrefix: z.string().optional(),
    /** Global options to add to all commands */
    globalOptions: z.array(z.object({
      name: z.string(),
      alias: z.string().optional(),
      description: z.string(),
      type: z.nativeEnum(CLIArgumentType),
      default: z.unknown().optional(),
    })).optional(),
  }).default({}),
});

export type CLIGeneratorInput = z.infer<typeof CLIGeneratorInputSchema>;

// ============================================================================
// Decision Event Schema (ruvector-service persistence)
// ============================================================================

/**
 * Decision event for ruvector-service persistence
 */
export interface CLICommandGeneratorDecisionEvent {
  /** Agent identifier */
  agent_id: 'cli-command-generator';
  /** Agent version */
  agent_version: string;
  /** Decision type */
  decision_type: 'cli_generation';
  /** Hash of input data for deduplication */
  inputs_hash: string;
  /** Generation outputs */
  outputs: {
    /** Number of commands generated */
    commandCount: number;
    /** Number of files generated */
    fileCount: number;
    /** Total lines of code generated */
    linesOfCode: number;
    /** Generated command names */
    commandNames: string[];
    /** Framework used */
    framework: CLIFramework;
    /** Package name */
    packageName: string;
  };
  /** Confidence score (0-1) - deterministic generation = 1.0 */
  confidence: number;
  /** Constraints applied during generation */
  constraints_applied: {
    /** Schema constraints from contract */
    schema_constraints: string[];
    /** Language constraints (TypeScript target) */
    language_constraints: string[];
    /** Version constraints */
    version_constraints: string[];
    /** Framework-specific constraints */
    framework_constraints: string[];
  };
  /** Execution reference for tracing */
  execution_ref: string;
  /** Timestamp (UTC ISO 8601) */
  timestamp: string;
}

/**
 * Zod schema for decision event validation
 */
export const CLICommandGeneratorDecisionEventSchema = z.object({
  agent_id: z.literal('cli-command-generator'),
  agent_version: z.string(),
  decision_type: z.literal('cli_generation'),
  inputs_hash: z.string(),
  outputs: z.object({
    commandCount: z.number(),
    fileCount: z.number(),
    linesOfCode: z.number(),
    commandNames: z.array(z.string()),
    framework: z.nativeEnum(CLIFramework),
    packageName: z.string(),
  }),
  confidence: z.number().min(0).max(1),
  constraints_applied: z.object({
    schema_constraints: z.array(z.string()),
    language_constraints: z.array(z.string()),
    version_constraints: z.array(z.string()),
    framework_constraints: z.array(z.string()),
  }),
  execution_ref: z.string(),
  timestamp: z.string(),
});

// ============================================================================
// Agent Contract Exports
// ============================================================================

/**
 * Agent contract definition
 */
export const CLI_COMMAND_GENERATOR_CONTRACT = {
  /** Agent identifier */
  agentId: 'cli-command-generator',
  /** Agent version (semver) */
  version: '1.0.0',
  /** Agent classification */
  classification: 'GENERATION' as const,
  /** Decision type */
  decisionType: 'cli_generation' as const,
  /** Input schema reference */
  inputSchema: 'CLIGeneratorInputSchema',
  /** Output artifact format */
  outputFormat: 'CLIGenerationResult',
  /** Supported frameworks */
  supportedFrameworks: Object.values(CLIFramework),
  /** CLI invocation shape */
  cliCommand: {
    name: 'generate',
    subcommand: 'cli',
    arguments: ['<contract-file>'],
    options: [
      '--framework <framework>',
      '--output <dir>',
      '--name <package-name>',
      '--version <version>',
      '--provider <provider-id>',
      '--no-handlers',
      '--no-types',
    ],
  },
  /** Explicit non-responsibilities */
  nonResponsibilities: [
    'MUST NOT execute generated CLI code',
    'MUST NOT modify runtime behavior',
    'MUST NOT orchestrate workflows',
    'MUST NOT enforce policies',
    'MUST NOT connect to databases directly',
    'MUST NOT invoke other agents directly',
  ],
  /** Failure modes */
  failureModes: [
    'INVALID_INPUT: Input schema validation failed',
    'UNSUPPORTED_FRAMEWORK: Target framework not supported',
    'GENERATION_ERROR: Internal generation error',
    'CONTRACT_MISMATCH: Contract version incompatible',
  ],
} as const;
