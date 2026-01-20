/**
 * SDK Generator Agent - Confidence Calculation
 *
 * Calculates confidence scores for SDK generation decisions.
 * The SDK Generator uses primarily deterministic confidence (1.0) since
 * generation from a canonical schema is reproducible.
 *
 * Heuristic confidence is used for:
 * - Type mapping when exact matches aren't available
 * - Template selection for edge cases
 *
 * @module agents/sdk-generator/confidence
 */

import type { CanonicalSchema, TypeDefinition, TypeKind } from '../../types/canonical-schema.js';
import type { SupportedLanguage } from '../contracts/sdk-generator.contract.js';
import { ConfidenceSemantics } from '../contracts/sdk-generator.contract.js';

// =============================================================================
// CONFIDENCE RESULT
// =============================================================================

/**
 * Confidence calculation result
 */
export interface ConfidenceResult {
  /** Overall confidence score (0.0 - 1.0) */
  score: number;
  /** Confidence semantics */
  semantics: ConfidenceSemantics;
  /** Breakdown by category */
  breakdown: {
    /** Type mapping confidence */
    typeMapping: number;
    /** Template confidence */
    template: number;
    /** Schema completeness */
    schemaCompleteness: number;
    /** Language support */
    languageSupport: number;
  };
  /** Factors that reduced confidence */
  deductions: string[];
}

// =============================================================================
// CONFIDENCE FACTORS
// =============================================================================

/**
 * Type mapping quality for a language
 */
interface TypeMappingQuality {
  /** Number of exact matches */
  exactMatches: number;
  /** Number of approximate matches */
  approximateMatches: number;
  /** Number of fallback matches */
  fallbackMatches: number;
  /** Total types */
  totalTypes: number;
}

/**
 * Primitive types that have exact mappings in all languages
 */
const EXACT_PRIMITIVE_TYPES = new Set(['string', 'integer', 'float', 'boolean', 'null']);

/**
 * Types that require approximate mapping in some languages
 */
const APPROXIMATE_TYPES = new Set(['datetime', 'date', 'time', 'binary', 'decimal']);

/**
 * Calculate type mapping quality for a schema and language
 */
function calculateTypeMappingQuality(
  schema: CanonicalSchema,
  language: SupportedLanguage
): TypeMappingQuality {
  let exactMatches = 0;
  let approximateMatches = 0;
  let fallbackMatches = 0;

  for (const type of schema.types) {
    const quality = getTypeMappingQuality(type, language);
    switch (quality) {
      case 'exact':
        exactMatches++;
        break;
      case 'approximate':
        approximateMatches++;
        break;
      case 'fallback':
        fallbackMatches++;
        break;
    }
  }

  return {
    exactMatches,
    approximateMatches,
    fallbackMatches,
    totalTypes: schema.types.length,
  };
}

/**
 * Get mapping quality for a single type
 */
function getTypeMappingQuality(
  type: TypeDefinition,
  _language: SupportedLanguage
): 'exact' | 'approximate' | 'fallback' {
  switch (type.kind) {
    case 'primitive' as TypeKind:
      // Primitive types have exact mappings
      if ('primitiveKind' in type) {
        return EXACT_PRIMITIVE_TYPES.has(type.primitiveKind) ? 'exact' : 'approximate';
      }
      return 'exact';

    case 'object' as TypeKind:
      // Objects map exactly to structs/classes/interfaces
      return 'exact';

    case 'array' as TypeKind:
      // Arrays map exactly to language arrays/lists
      return 'exact';

    case 'enum' as TypeKind:
      // Enums map exactly to language enums
      return 'exact';

    case 'union' as TypeKind:
      // Unions require language-specific handling
      // TypeScript: union types (exact)
      // Python: Union[] (exact)
      // Rust: enum with variants (exact)
      // Go: interface{} (approximate)
      // Java: Object or sealed classes (approximate)
      // C#: object or union types (approximate)
      return 'approximate';

    default:
      return 'fallback';
  }
}

/**
 * Calculate schema completeness score
 */
function calculateSchemaCompleteness(schema: CanonicalSchema): number {
  let score = 1.0;
  const deductions: string[] = [];

  // Check metadata completeness
  if (!schema.metadata.description) {
    score -= 0.02;
    deductions.push('Missing schema description');
  }

  // Check type documentation
  const typesWithoutDescription = schema.types.filter((t) => !t.description).length;
  if (typesWithoutDescription > 0) {
    const ratio = typesWithoutDescription / Math.max(schema.types.length, 1);
    score -= ratio * 0.05;
  }

  // Check endpoint documentation
  const endpointsWithoutDescription = schema.endpoints.filter((e) => !e.description).length;
  if (endpointsWithoutDescription > 0) {
    const ratio = endpointsWithoutDescription / Math.max(schema.endpoints.length, 1);
    score -= ratio * 0.05;
  }

  // Check for deprecated items without deprecation message
  const deprecatedWithoutMessage = [
    ...schema.types.filter((t) => t.deprecated && !t.deprecationMessage),
    ...schema.endpoints.filter((e) => e.deprecated && !('deprecationMessage' in e)),
  ].length;
  if (deprecatedWithoutMessage > 0) {
    score -= 0.02;
  }

  // Check for error definitions
  if (schema.errors.length === 0) {
    score -= 0.03;
  }

  return Math.max(0, score);
}

/**
 * Calculate language support confidence
 */
function calculateLanguageSupportConfidence(languages: SupportedLanguage[]): number {
  // All languages are fully supported
  const fullySupported = new Set<SupportedLanguage>([
    'typescript',
    'python',
    'rust',
    'go',
    'java',
    'csharp',
    'javascript',
  ]);

  const supportedCount = languages.filter((l) => fullySupported.has(l)).length;
  return supportedCount / languages.length;
}

// =============================================================================
// MAIN CONFIDENCE CALCULATION
// =============================================================================

/**
 * Calculate confidence for SDK generation
 *
 * @param schema - The canonical schema
 * @param languages - Target languages
 * @returns Confidence result with score and breakdown
 */
export function calculateConfidence(
  schema: CanonicalSchema,
  languages: SupportedLanguage[]
): ConfidenceResult {
  const deductions: string[] = [];

  // Calculate type mapping confidence (average across languages)
  let typeMappingSum = 0;
  for (const language of languages) {
    const quality = calculateTypeMappingQuality(schema, language);
    if (quality.totalTypes === 0) {
      typeMappingSum += 1.0;
    } else {
      const exactRatio = quality.exactMatches / quality.totalTypes;
      const approxRatio = quality.approximateMatches / quality.totalTypes;
      // Exact = 1.0, Approximate = 0.9, Fallback = 0.7
      typeMappingSum += exactRatio + approxRatio * 0.9 + (1 - exactRatio - approxRatio) * 0.7;
    }

    if (quality.fallbackMatches > 0) {
      deductions.push(
        `${language}: ${quality.fallbackMatches} type(s) using fallback mapping`
      );
    }
  }
  const typeMappingConfidence = typeMappingSum / languages.length;

  // Template confidence is always 1.0 (deterministic templates)
  const templateConfidence = 1.0;

  // Schema completeness
  const schemaCompleteness = calculateSchemaCompleteness(schema);
  if (schemaCompleteness < 1.0) {
    deductions.push(`Schema completeness: ${(schemaCompleteness * 100).toFixed(1)}%`);
  }

  // Language support
  const languageSupport = calculateLanguageSupportConfidence(languages);

  // Calculate overall score (weighted average)
  const weights = {
    typeMapping: 0.3,
    template: 0.3,
    schemaCompleteness: 0.2,
    languageSupport: 0.2,
  };

  const overallScore =
    typeMappingConfidence * weights.typeMapping +
    templateConfidence * weights.template +
    schemaCompleteness * weights.schemaCompleteness +
    languageSupport * weights.languageSupport;

  // Determine semantics
  const semantics =
    overallScore === 1.0
      ? ConfidenceSemantics.DETERMINISTIC
      : overallScore >= 0.9
        ? ConfidenceSemantics.CONSTRAINT_BASED
        : ConfidenceSemantics.HEURISTIC;

  return {
    score: Math.round(overallScore * 1000) / 1000, // Round to 3 decimal places
    semantics,
    breakdown: {
      typeMapping: Math.round(typeMappingConfidence * 1000) / 1000,
      template: templateConfidence,
      schemaCompleteness: Math.round(schemaCompleteness * 1000) / 1000,
      languageSupport,
    },
    deductions,
  };
}

/**
 * Calculate confidence for a single type mapping
 *
 * Used for emitting TypeMappingDecisionEvents
 *
 * @param sourceType - Source type from canonical schema
 * @param targetLanguage - Target language
 * @param mappingStrategy - Strategy used for mapping
 * @returns Confidence score (0.0 - 1.0)
 */
export function calculateTypeMappingConfidence(
  _sourceType: string,
  _targetLanguage: SupportedLanguage,
  mappingStrategy: 'exact' | 'approximate' | 'fallback'
): number {
  switch (mappingStrategy) {
    case 'exact':
      return 1.0;
    case 'approximate':
      return 0.9;
    case 'fallback':
      return 0.7;
  }
}

// =============================================================================
// EXPORTED FOR TESTING
// =============================================================================

export const confidenceCalculators = {
  calculateTypeMappingQuality,
  getTypeMappingQuality,
  calculateSchemaCompleteness,
  calculateLanguageSupportConfidence,
};
