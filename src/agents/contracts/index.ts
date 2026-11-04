/**
 * Public agent contracts.
 *
 * Agent-owned metadata has intentionally shared names. Expose each complete
 * contract through a namespace rather than silently choosing a flat owner.
 * Keep all previously unambiguous flat exports for existing consumers.
 */
export * as SdkGeneratorContract from './sdk-generator.contract.js';
export * as CliCommandGeneratorContract from './cli-command-generator.contract.js';
export * as ApiTranslationContract from './api-translation.contract.js';
export * as VersionCompatibilityContract from './version-compatibility.contract.js';

export {
  TargetLanguageSchema,
  SDKGenerationRequestSchema,
  GeneratedFileArtifactSchema,
  SDKArtifactSchema,
  SDKGenerationResponseSchema,
  SDKGeneratorDecisionType,
  SDKGeneratorDecisionEventSchema,
} from './sdk-generator.contract.js';
export type {
  SupportedLanguage,
  SDKGenerationRequest,
  GeneratedFileArtifact,
  SDKArtifact,
  SDKGenerationResponse,
  SDKGeneratorDecisionEvent,
} from './sdk-generator.contract.js';

export {
  CLI_AGENT_ID,
  CLI_AGENT_VERSION,
  CLIFrameworkSchema,
  CLIArgumentTypeSchema,
  APIEndpointSchema,
  CLIGenerationRequestSchema,
  GeneratedCLIFileSchema,
  CLIGenerationResponseSchema,
  CLIGeneratorDecisionType,
  CLIGeneratorDecisionEventSchema,
} from './cli-command-generator.contract.js';
export type {
  SupportedCLIFramework,
  CLIGenerationRequest,
  GeneratedCLIFile,
  CLIGenerationResponse,
  CLIGeneratorDecisionEvent,
} from './cli-command-generator.contract.js';

export {
  InterfaceFormat,
  InterfaceFormatSchema,
  TranslationDirectionSchema,
  RESTEndpointSchema,
  SDKMethodSchema,
  CLICommandSchema,
  APITranslationRequestSchema,
  TranslationMappingSchema,
  CompatibilityIssueSchema,
  TranslationResultSchema,
  APITranslationResponseSchema,
  APITranslationDecisionType,
  TranslationConfidenceSemantics,
  APITranslationDecisionEventSchema,
  TranslationFailureMode,
  REST_TO_SDK_RULES,
  SDK_TO_CLI_RULES,
  CLI_TO_REST_RULES,
} from './api-translation.contract.js';
export type {
  TranslationDirection,
  RESTEndpoint,
  SDKMethod,
  CLICommand,
  APITranslationRequest,
  TranslationMapping,
  CompatibilityIssue,
  TranslationResult,
  APITranslationResponse,
  APITranslationDecisionEvent,
} from './api-translation.contract.js';

export {
  SemverVersionSchema,
  SchemaVersionReferenceSchema,
  CompatibilityAnalysisRequestSchema,
  ChangeSeveritySchema,
  ChangeCategorySchema,
  CompatibilityChangeSchema,
  CompatibilityVerdictSchema,
  VersionRecommendationSchema,
  CompatibilitySummarySchema,
  CompatibilityAnalysisResponseSchema,
  VersionCompatibilityDecisionType,
  CompatibilityConfidenceSemantics,
  VersionCompatibilityDecisionEventSchema,
  CompatibilityFailureMode,
} from './version-compatibility.contract.js';
export type {
  SchemaVersionReference,
  CompatibilityAnalysisRequest,
  ChangeSeverity,
  ChangeCategory,
  CompatibilityChange,
  CompatibilityVerdict,
  VersionRecommendation,
  CompatibilitySummary,
  CompatibilityAnalysisResponse,
  VersionCompatibilityDecisionEvent,
} from './version-compatibility.contract.js';

export * from './decision-events.js';
