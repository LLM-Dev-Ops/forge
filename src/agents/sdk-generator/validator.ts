/**
 * SDK Generator Agent - Input Validation
 *
 * Validates incoming requests against agentics-contracts schemas.
 * Provides detailed error reporting for invalid inputs.
 *
 * @module agents/sdk-generator/validator
 */

import { z } from 'zod';
import type { SDKGenerationRequest } from '../contracts/sdk-generator.contract.js';
import { SDKGenerationRequestSchema, TargetLanguageSchema } from '../contracts/sdk-generator.contract.js';
import type { CanonicalSchema } from '../../types/canonical-schema.js';

// =============================================================================
// VALIDATION RESULT
// =============================================================================

/**
 * Result of request validation
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors (if any) */
  errors: string[];
  /** Validation warnings (non-fatal) */
  warnings: string[];
}

// =============================================================================
// SEMANTIC VALIDATION
// =============================================================================

/**
 * Validate the semantic correctness of a CanonicalSchema
 */
function validateSchemaSemantics(schema: CanonicalSchema): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate metadata
  if (!schema.metadata?.version) {
    errors.push('schema.metadata.version is required');
  }
  if (!schema.metadata?.providerId) {
    errors.push('schema.metadata.providerId is required');
  }

  // Validate types
  const typeIds = new Set<string>();
  for (const type of schema.types) {
    if (!type.id) {
      errors.push(`Type "${type.name}" is missing an id`);
      continue;
    }
    if (typeIds.has(type.id)) {
      errors.push(`Duplicate type id: ${type.id}`);
    }
    typeIds.add(type.id);
  }

  // Validate endpoints
  const operationIds = new Set<string>();
  for (const endpoint of schema.endpoints) {
    if (!endpoint.operationId) {
      errors.push(`Endpoint "${endpoint.path}" is missing operationId`);
      continue;
    }
    if (operationIds.has(endpoint.operationId)) {
      errors.push(`Duplicate operationId: ${endpoint.operationId}`);
    }
    operationIds.add(endpoint.operationId);

    // Validate type references in endpoint
    if (endpoint.requestBody?.type?.typeId) {
      if (!typeIds.has(endpoint.requestBody.type.typeId)) {
        errors.push(
          `Endpoint "${endpoint.operationId}" references unknown request body type: ${endpoint.requestBody.type.typeId}`
        );
      }
    }

    for (const response of endpoint.responses) {
      if (response.type?.typeId && !typeIds.has(response.type.typeId)) {
        warnings.push(
          `Endpoint "${endpoint.operationId}" response ${response.statusCode} references unknown type: ${response.type.typeId}`
        );
      }
    }
  }

  // Validate authentication schemes
  const authIds = new Set<string>();
  for (const auth of schema.authentication) {
    if (authIds.has(auth.id)) {
      errors.push(`Duplicate authentication scheme id: ${auth.id}`);
    }
    authIds.add(auth.id);
  }

  // Validate endpoint auth references
  for (const endpoint of schema.endpoints) {
    for (const authRef of endpoint.authentication) {
      if (!authIds.has(authRef)) {
        warnings.push(
          `Endpoint "${endpoint.operationId}" references unknown auth scheme: ${authRef}`
        );
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate package configuration
 */
function validatePackageConfig(
  config: SDKGenerationRequest['packageConfig']
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate package name format
  const namePattern = /^[a-z][a-z0-9-_]*$/i;
  if (!namePattern.test(config.name)) {
    warnings.push(
      `Package name "${config.name}" may not be valid for all registries. Consider using lowercase alphanumeric with hyphens.`
    );
  }

  // Check for reserved names
  const reservedNames = ['test', 'node_modules', 'package', 'npm', 'private'];
  if (reservedNames.includes(config.name.toLowerCase())) {
    errors.push(`Package name "${config.name}" is reserved and cannot be used`);
  }

  // Validate version format (semver)
  const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9-.]+)?(\+[a-zA-Z0-9-.]+)?$/;
  if (!semverPattern.test(config.version)) {
    errors.push(`Package version "${config.version}" is not valid semver`);
  }

  return { errors, warnings };
}

/**
 * Validate target languages
 */
function validateTargetLanguages(
  languages: string[]
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const supportedLanguages = TargetLanguageSchema.options;
  const unsupported = languages.filter(
    (lang) => !supportedLanguages.includes(lang as never)
  );

  if (unsupported.length > 0) {
    errors.push(`Unsupported languages: ${unsupported.join(', ')}. Supported: ${supportedLanguages.join(', ')}`);
  }

  // Check for duplicates
  const seen = new Set<string>();
  for (const lang of languages) {
    if (seen.has(lang)) {
      warnings.push(`Duplicate language "${lang}" will be generated only once`);
    }
    seen.add(lang);
  }

  return { errors, warnings };
}

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validate an SDK generation request
 *
 * Performs both structural (Zod) and semantic validation.
 *
 * @param request - The request to validate
 * @returns Validation result with errors and warnings
 */
export function validateRequest(request: SDKGenerationRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Structural validation (Zod)
  const structuralResult = SDKGenerationRequestSchema.safeParse(request);
  if (!structuralResult.success) {
    errors.push(
      ...structuralResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    );
    // Return early if structural validation fails
    return { valid: false, errors, warnings };
  }

  // Semantic validation of schema
  const schemaSemantics = validateSchemaSemantics(request.schema);
  errors.push(...schemaSemantics.errors);
  warnings.push(...schemaSemantics.warnings);

  // Package config validation
  const packageValidation = validatePackageConfig(request.packageConfig);
  errors.push(...packageValidation.errors);
  warnings.push(...packageValidation.warnings);

  // Target language validation
  const languageValidation = validateTargetLanguages(request.targetLanguages);
  errors.push(...languageValidation.errors);
  warnings.push(...languageValidation.warnings);

  // Generation options validation
  if (request.options.templateDir) {
    // Cannot use custom templates in Edge Function (no file system access)
    warnings.push('Custom template directory is not supported in Edge Function mode');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a raw JSON string as an SDK generation request
 *
 * @param json - Raw JSON string
 * @returns Validation result
 */
export function validateRawRequest(json: string): ValidationResult {
  try {
    const parsed = JSON.parse(json);
    const zodResult = SDKGenerationRequestSchema.safeParse(parsed);

    if (!zodResult.success) {
      return {
        valid: false,
        errors: zodResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        warnings: [],
      };
    }

    return validateRequest(zodResult.data);
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
    };
  }
}

// =============================================================================
// SCHEMA VALIDATORS (Exported for testing)
// =============================================================================

export const validators = {
  validateSchemaSemantics,
  validatePackageConfig,
  validateTargetLanguages,
};
