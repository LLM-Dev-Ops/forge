/**
 * Schema Comparator
 *
 * Core comparison logic for detecting breaking vs non-breaking changes
 * between CanonicalSchema versions.
 *
 * @module agents/version-compatibility-agent/comparator
 */

import { randomUUID } from 'crypto';
import type {
  CanonicalSchema,
  TypeDefinition,
  EndpointDefinition,
  AuthScheme,
  ErrorDefinition,
  PropertyDefinition,
  TypeKind,
} from '../../types/canonical-schema.js';
import type {
  CompatibilityChange,
  ChangeSeverity,
  ChangeCategory,
} from '../contracts/version-compatibility.contract.js';

/**
 * Comparison strictness levels
 */
export type Strictness = 'strict' | 'standard' | 'lenient';

/**
 * Schema comparator for detecting breaking and non-breaking changes
 */
export class SchemaComparator {
  /**
   * Compare types between source and target schemas
   */
  async compareTypes(
    source: CanonicalSchema,
    target: CanonicalSchema,
    strictness: Strictness,
    ignorePaths: string[]
  ): Promise<CompatibilityChange[]> {
    const changes: CompatibilityChange[] = [];

    // Index types by ID for efficient lookup
    const sourceTypes = new Map(source.types.map(t => [t.id, t]));
    const targetTypes = new Map(target.types.map(t => [t.id, t]));

    // Check for removed types (breaking)
    for (const [id, sourceType] of sourceTypes) {
      const path = `types.${sourceType.name}`;

      if (ignorePaths.some(p => path.startsWith(p))) {
        continue;
      }

      if (!targetTypes.has(id)) {
        changes.push(this.createChange({
          category: 'type-removed',
          severity: 'breaking',
          path,
          description: `Type "${sourceType.name}" has been removed`,
          sourceValue: sourceType.name,
          affectedComponents: this.findTypeReferences(source, sourceType.id),
          migrationComplexity: 4,
        }));
      }
    }

    // Check for added types (non-breaking)
    for (const [id, targetType] of targetTypes) {
      const path = `types.${targetType.name}`;

      if (ignorePaths.some(p => path.startsWith(p))) {
        continue;
      }

      if (!sourceTypes.has(id)) {
        changes.push(this.createChange({
          category: 'type-added',
          severity: 'non-breaking',
          path,
          description: `New type "${targetType.name}" added`,
          targetValue: targetType.name,
          affectedComponents: [],
          migrationComplexity: 1,
        }));
      }
    }

    // Check for modified types
    for (const [id, sourceType] of sourceTypes) {
      const targetType = targetTypes.get(id);
      if (!targetType) continue;

      const path = `types.${sourceType.name}`;

      if (ignorePaths.some(p => path.startsWith(p))) {
        continue;
      }

      // Check kind change (breaking)
      if (sourceType.kind !== targetType.kind) {
        changes.push(this.createChange({
          category: 'type-modified',
          severity: 'breaking',
          path: `${path}.kind`,
          description: `Type "${sourceType.name}" kind changed from ${sourceType.kind} to ${targetType.kind}`,
          sourceValue: sourceType.kind,
          targetValue: targetType.kind,
          affectedComponents: this.findTypeReferences(source, sourceType.id),
          migrationComplexity: 5,
        }));
        continue;
      }

      // Compare object type properties
      if (sourceType.kind === 'object' && targetType.kind === 'object') {
        const propertyChanges = this.compareObjectProperties(
          sourceType,
          targetType,
          path,
          source,
          strictness
        );
        changes.push(...propertyChanges);
      }

      // Compare enum values
      if (sourceType.kind === 'enum' && targetType.kind === 'enum') {
        const enumChanges = this.compareEnumValues(
          sourceType,
          targetType,
          path,
          strictness
        );
        changes.push(...enumChanges);
      }

      // Compare union variants
      if (sourceType.kind === 'union' && targetType.kind === 'union') {
        const unionChanges = this.compareUnionVariants(
          sourceType,
          targetType,
          path,
          strictness
        );
        changes.push(...unionChanges);
      }
    }

    return changes;
  }

  /**
   * Compare object type properties
   */
  private compareObjectProperties(
    sourceType: TypeDefinition & { kind: 'object' },
    targetType: TypeDefinition & { kind: 'object' },
    basePath: string,
    schema: CanonicalSchema,
    strictness: Strictness
  ): CompatibilityChange[] {
    const changes: CompatibilityChange[] = [];

    const sourceProps = new Map(
      (sourceType as any).properties?.map((p: PropertyDefinition) => [p.name, p]) || []
    );
    const targetProps = new Map(
      (targetType as any).properties?.map((p: PropertyDefinition) => [p.name, p]) || []
    );

    // Check for removed properties (breaking if required)
    for (const [name, sourceProp] of sourceProps) {
      const path = `${basePath}.properties.${name}`;

      if (!targetProps.has(name)) {
        const severity: ChangeSeverity = sourceProp.required ? 'breaking' : 'non-breaking';
        changes.push(this.createChange({
          category: 'property-removed',
          severity,
          path,
          description: `Property "${name}" removed from type "${sourceType.name}"${sourceProp.required ? ' (was required)' : ''}`,
          sourceValue: name,
          affectedComponents: [`${sourceType.name}.${name}`],
          migrationComplexity: sourceProp.required ? 4 : 2,
        }));
      }
    }

    // Check for added properties
    for (const [name, targetProp] of targetProps) {
      const path = `${basePath}.properties.${name}`;

      if (!sourceProps.has(name)) {
        // Adding a required property is breaking
        const severity: ChangeSeverity = targetProp.required ? 'breaking' : 'non-breaking';
        changes.push(this.createChange({
          category: 'property-added',
          severity,
          path,
          description: `New ${targetProp.required ? 'required ' : 'optional '}property "${name}" added to type "${sourceType.name}"`,
          targetValue: name,
          affectedComponents: [`${sourceType.name}.${name}`],
          migrationComplexity: targetProp.required ? 3 : 1,
        }));
      }
    }

    // Check for modified properties
    for (const [name, sourceProp] of sourceProps) {
      const targetProp = targetProps.get(name);
      if (!targetProp) continue;

      const path = `${basePath}.properties.${name}`;

      // Required status changed
      if (sourceProp.required !== targetProp.required) {
        // Making optional property required is breaking
        // Making required property optional is non-breaking
        const severity: ChangeSeverity = !sourceProp.required && targetProp.required
          ? 'breaking'
          : 'non-breaking';

        changes.push(this.createChange({
          category: 'property-modified',
          severity,
          path: `${path}.required`,
          description: `Property "${name}" required status changed from ${sourceProp.required} to ${targetProp.required}`,
          sourceValue: sourceProp.required,
          targetValue: targetProp.required,
          affectedComponents: [`${sourceType.name}.${name}`],
          migrationComplexity: !sourceProp.required && targetProp.required ? 3 : 1,
        }));
      }

      // Type changed
      if (sourceProp.type?.typeId !== targetProp.type?.typeId) {
        changes.push(this.createChange({
          category: 'property-modified',
          severity: 'breaking',
          path: `${path}.type`,
          description: `Property "${name}" type changed`,
          sourceValue: sourceProp.type?.typeId,
          targetValue: targetProp.type?.typeId,
          affectedComponents: [`${sourceType.name}.${name}`],
          migrationComplexity: 4,
        }));
      }
    }

    return changes;
  }

  /**
   * Compare enum values
   */
  private compareEnumValues(
    sourceType: TypeDefinition & { kind: 'enum' },
    targetType: TypeDefinition & { kind: 'enum' },
    basePath: string,
    strictness: Strictness
  ): CompatibilityChange[] {
    const changes: CompatibilityChange[] = [];

    const sourceValues = new Set((sourceType as any).values?.map((v: any) => v.value) || []);
    const targetValues = new Set((targetType as any).values?.map((v: any) => v.value) || []);

    // Removed enum values are breaking
    for (const value of sourceValues) {
      if (!targetValues.has(value)) {
        changes.push(this.createChange({
          category: 'type-modified',
          severity: 'breaking',
          path: `${basePath}.values.${value}`,
          description: `Enum value "${value}" removed from "${sourceType.name}"`,
          sourceValue: value,
          affectedComponents: [`${sourceType.name}.${value}`],
          migrationComplexity: 3,
        }));
      }
    }

    // Added enum values are non-breaking
    for (const value of targetValues) {
      if (!sourceValues.has(value)) {
        changes.push(this.createChange({
          category: 'type-modified',
          severity: strictness === 'strict' ? 'non-breaking' : 'patch',
          path: `${basePath}.values.${value}`,
          description: `New enum value "${value}" added to "${sourceType.name}"`,
          targetValue: value,
          affectedComponents: [],
          migrationComplexity: 1,
        }));
      }
    }

    return changes;
  }

  /**
   * Compare union variants
   */
  private compareUnionVariants(
    sourceType: TypeDefinition & { kind: 'union' },
    targetType: TypeDefinition & { kind: 'union' },
    basePath: string,
    strictness: Strictness
  ): CompatibilityChange[] {
    const changes: CompatibilityChange[] = [];

    const sourceVariants = new Set(
      (sourceType as any).variants?.map((v: any) => v.typeId) || []
    );
    const targetVariants = new Set(
      (targetType as any).variants?.map((v: any) => v.typeId) || []
    );

    // Removed variants are breaking
    for (const typeId of sourceVariants) {
      if (!targetVariants.has(typeId)) {
        changes.push(this.createChange({
          category: 'type-modified',
          severity: 'breaking',
          path: `${basePath}.variants`,
          description: `Union variant removed from "${sourceType.name}"`,
          sourceValue: typeId,
          affectedComponents: [`${sourceType.name}`],
          migrationComplexity: 4,
        }));
      }
    }

    // Added variants are non-breaking (output union widening)
    for (const typeId of targetVariants) {
      if (!sourceVariants.has(typeId)) {
        changes.push(this.createChange({
          category: 'type-modified',
          severity: 'non-breaking',
          path: `${basePath}.variants`,
          description: `New union variant added to "${sourceType.name}"`,
          targetValue: typeId,
          affectedComponents: [],
          migrationComplexity: 1,
        }));
      }
    }

    return changes;
  }

  /**
   * Compare endpoints between source and target schemas
   */
  async compareEndpoints(
    source: CanonicalSchema,
    target: CanonicalSchema,
    strictness: Strictness,
    ignorePaths: string[]
  ): Promise<CompatibilityChange[]> {
    const changes: CompatibilityChange[] = [];

    // Index endpoints by operationId
    const sourceEndpoints = new Map(source.endpoints.map(e => [e.operationId, e]));
    const targetEndpoints = new Map(target.endpoints.map(e => [e.operationId, e]));

    // Check for removed endpoints (breaking)
    for (const [opId, sourceEndpoint] of sourceEndpoints) {
      const path = `endpoints.${sourceEndpoint.path}.${sourceEndpoint.method}`;

      if (ignorePaths.some(p => path.startsWith(p))) {
        continue;
      }

      if (!targetEndpoints.has(opId)) {
        changes.push(this.createChange({
          category: 'endpoint-removed',
          severity: 'breaking',
          path,
          description: `Endpoint ${sourceEndpoint.method} ${sourceEndpoint.path} has been removed`,
          sourceValue: opId,
          affectedComponents: [opId],
          migrationComplexity: 5,
        }));
      }
    }

    // Check for added endpoints (non-breaking)
    for (const [opId, targetEndpoint] of targetEndpoints) {
      const path = `endpoints.${targetEndpoint.path}.${targetEndpoint.method}`;

      if (ignorePaths.some(p => path.startsWith(p))) {
        continue;
      }

      if (!sourceEndpoints.has(opId)) {
        changes.push(this.createChange({
          category: 'endpoint-added',
          severity: 'non-breaking',
          path,
          description: `New endpoint ${targetEndpoint.method} ${targetEndpoint.path} added`,
          targetValue: opId,
          affectedComponents: [],
          migrationComplexity: 1,
        }));
      }
    }

    // Check for modified endpoints
    for (const [opId, sourceEndpoint] of sourceEndpoints) {
      const targetEndpoint = targetEndpoints.get(opId);
      if (!targetEndpoint) continue;

      const path = `endpoints.${sourceEndpoint.path}.${sourceEndpoint.method}`;

      if (ignorePaths.some(p => path.startsWith(p))) {
        continue;
      }

      // Check path change (breaking)
      if (sourceEndpoint.path !== targetEndpoint.path) {
        changes.push(this.createChange({
          category: 'endpoint-modified',
          severity: 'breaking',
          path: `${path}.path`,
          description: `Endpoint path changed from ${sourceEndpoint.path} to ${targetEndpoint.path}`,
          sourceValue: sourceEndpoint.path,
          targetValue: targetEndpoint.path,
          affectedComponents: [opId],
          migrationComplexity: 4,
        }));
      }

      // Check method change (breaking)
      if (sourceEndpoint.method !== targetEndpoint.method) {
        changes.push(this.createChange({
          category: 'endpoint-modified',
          severity: 'breaking',
          path: `${path}.method`,
          description: `Endpoint method changed from ${sourceEndpoint.method} to ${targetEndpoint.method}`,
          sourceValue: sourceEndpoint.method,
          targetValue: targetEndpoint.method,
          affectedComponents: [opId],
          migrationComplexity: 3,
        }));
      }

      // Compare parameters
      const paramChanges = this.compareParameters(
        sourceEndpoint,
        targetEndpoint,
        path,
        strictness
      );
      changes.push(...paramChanges);

      // Compare responses
      const responseChanges = this.compareResponses(
        sourceEndpoint,
        targetEndpoint,
        path,
        strictness
      );
      changes.push(...responseChanges);
    }

    return changes;
  }

  /**
   * Compare endpoint parameters
   */
  private compareParameters(
    source: EndpointDefinition,
    target: EndpointDefinition,
    basePath: string,
    strictness: Strictness
  ): CompatibilityChange[] {
    const changes: CompatibilityChange[] = [];

    const sourceParams = new Map(
      source.parameters?.map(p => [`${p.in}:${p.name}`, p]) || []
    );
    const targetParams = new Map(
      target.parameters?.map(p => [`${p.in}:${p.name}`, p]) || []
    );

    // Removed parameters
    for (const [key, sourceParam] of sourceParams) {
      if (!targetParams.has(key)) {
        // Removing a required parameter is breaking
        changes.push(this.createChange({
          category: 'parameter-removed',
          severity: sourceParam.required ? 'breaking' : 'non-breaking',
          path: `${basePath}.parameters.${sourceParam.name}`,
          description: `Parameter "${sourceParam.name}" removed from ${source.method} ${source.path}`,
          sourceValue: sourceParam.name,
          affectedComponents: [source.operationId],
          migrationComplexity: sourceParam.required ? 3 : 1,
        }));
      }
    }

    // Added parameters
    for (const [key, targetParam] of targetParams) {
      if (!sourceParams.has(key)) {
        // Adding a required parameter is breaking
        changes.push(this.createChange({
          category: 'parameter-added',
          severity: targetParam.required ? 'breaking' : 'non-breaking',
          path: `${basePath}.parameters.${targetParam.name}`,
          description: `New ${targetParam.required ? 'required ' : 'optional '}parameter "${targetParam.name}" added to ${target.method} ${target.path}`,
          targetValue: targetParam.name,
          affectedComponents: [target.operationId],
          migrationComplexity: targetParam.required ? 4 : 1,
        }));
      }
    }

    // Modified parameters
    for (const [key, sourceParam] of sourceParams) {
      const targetParam = targetParams.get(key);
      if (!targetParam) continue;

      // Required status changed
      if (sourceParam.required !== targetParam.required) {
        changes.push(this.createChange({
          category: 'parameter-modified',
          severity: !sourceParam.required && targetParam.required ? 'breaking' : 'non-breaking',
          path: `${basePath}.parameters.${sourceParam.name}.required`,
          description: `Parameter "${sourceParam.name}" required status changed`,
          sourceValue: sourceParam.required,
          targetValue: targetParam.required,
          affectedComponents: [source.operationId],
          migrationComplexity: !sourceParam.required && targetParam.required ? 3 : 1,
        }));
      }
    }

    return changes;
  }

  /**
   * Compare endpoint responses
   */
  private compareResponses(
    source: EndpointDefinition,
    target: EndpointDefinition,
    basePath: string,
    strictness: Strictness
  ): CompatibilityChange[] {
    const changes: CompatibilityChange[] = [];

    const sourceResponses = new Map(
      source.responses.map(r => [String(r.statusCode), r])
    );
    const targetResponses = new Map(
      target.responses.map(r => [String(r.statusCode), r])
    );

    // Removed responses
    for (const [code, sourceResponse] of sourceResponses) {
      if (!targetResponses.has(code)) {
        changes.push(this.createChange({
          category: 'response-removed',
          severity: code.startsWith('2') ? 'breaking' : 'non-breaking',
          path: `${basePath}.responses.${code}`,
          description: `Response ${code} removed from ${source.method} ${source.path}`,
          sourceValue: code,
          affectedComponents: [source.operationId],
          migrationComplexity: code.startsWith('2') ? 4 : 2,
        }));
      }
    }

    // Added responses
    for (const [code, targetResponse] of targetResponses) {
      if (!sourceResponses.has(code)) {
        changes.push(this.createChange({
          category: 'response-added',
          severity: 'non-breaking',
          path: `${basePath}.responses.${code}`,
          description: `New response ${code} added to ${target.method} ${target.path}`,
          targetValue: code,
          affectedComponents: [],
          migrationComplexity: 1,
        }));
      }
    }

    // Modified responses
    for (const [code, sourceResponse] of sourceResponses) {
      const targetResponse = targetResponses.get(code);
      if (!targetResponse) continue;

      // Response type changed
      if (sourceResponse.type?.typeId !== targetResponse.type?.typeId) {
        changes.push(this.createChange({
          category: 'response-modified',
          severity: code.startsWith('2') ? 'breaking' : 'non-breaking',
          path: `${basePath}.responses.${code}.type`,
          description: `Response ${code} type changed for ${source.method} ${source.path}`,
          sourceValue: sourceResponse.type?.typeId,
          targetValue: targetResponse.type?.typeId,
          affectedComponents: [source.operationId],
          migrationComplexity: code.startsWith('2') ? 4 : 2,
        }));
      }
    }

    return changes;
  }

  /**
   * Compare authentication schemes
   */
  async compareAuthentication(
    source: CanonicalSchema,
    target: CanonicalSchema,
    strictness: Strictness
  ): Promise<CompatibilityChange[]> {
    const changes: CompatibilityChange[] = [];

    const sourceAuth = new Map(source.authentication.map(a => [a.id, a]));
    const targetAuth = new Map(target.authentication.map(a => [a.id, a]));

    // Removed auth schemes (breaking)
    for (const [id, sourceScheme] of sourceAuth) {
      if (!targetAuth.has(id)) {
        changes.push(this.createChange({
          category: 'auth-removed',
          severity: 'breaking',
          path: `authentication.${id}`,
          description: `Authentication scheme "${id}" (${sourceScheme.type}) has been removed`,
          sourceValue: id,
          affectedComponents: ['authentication'],
          migrationComplexity: 5,
        }));
      }
    }

    // Added auth schemes (non-breaking)
    for (const [id, targetScheme] of targetAuth) {
      if (!sourceAuth.has(id)) {
        changes.push(this.createChange({
          category: 'auth-added',
          severity: 'non-breaking',
          path: `authentication.${id}`,
          description: `New authentication scheme "${id}" (${targetScheme.type}) added`,
          targetValue: id,
          affectedComponents: [],
          migrationComplexity: 1,
        }));
      }
    }

    // Modified auth schemes
    for (const [id, sourceScheme] of sourceAuth) {
      const targetScheme = targetAuth.get(id);
      if (!targetScheme) continue;

      if (sourceScheme.type !== targetScheme.type) {
        changes.push(this.createChange({
          category: 'auth-modified',
          severity: 'breaking',
          path: `authentication.${id}.type`,
          description: `Authentication scheme "${id}" type changed from ${sourceScheme.type} to ${targetScheme.type}`,
          sourceValue: sourceScheme.type,
          targetValue: targetScheme.type,
          affectedComponents: ['authentication'],
          migrationComplexity: 4,
        }));
      }
    }

    return changes;
  }

  /**
   * Compare error definitions
   */
  async compareErrors(
    source: CanonicalSchema,
    target: CanonicalSchema,
    strictness: Strictness
  ): Promise<CompatibilityChange[]> {
    const changes: CompatibilityChange[] = [];

    const sourceErrors = new Map(source.errors.map(e => [e.code, e]));
    const targetErrors = new Map(target.errors.map(e => [e.code, e]));

    // Removed errors (non-breaking - clients should be able to handle unknown errors)
    for (const [code, sourceError] of sourceErrors) {
      if (!targetErrors.has(code)) {
        changes.push(this.createChange({
          category: 'error-removed',
          severity: 'informational',
          path: `errors.${code}`,
          description: `Error "${code}" has been removed`,
          sourceValue: code,
          affectedComponents: [],
          migrationComplexity: 1,
        }));
      }
    }

    // Added errors (non-breaking)
    for (const [code, targetError] of targetErrors) {
      if (!sourceErrors.has(code)) {
        changes.push(this.createChange({
          category: 'error-added',
          severity: 'non-breaking',
          path: `errors.${code}`,
          description: `New error "${code}" added`,
          targetValue: code,
          affectedComponents: [],
          migrationComplexity: 1,
        }));
      }
    }

    return changes;
  }

  /**
   * Find references to a type in the schema
   */
  private findTypeReferences(schema: CanonicalSchema, typeId: string): string[] {
    const references: string[] = [];

    // Check other types
    for (const type of schema.types) {
      if (type.kind === 'object') {
        for (const prop of (type as any).properties || []) {
          if (prop.type?.typeId === typeId) {
            references.push(`${type.name}.${prop.name}`);
          }
        }
      }
      if (type.kind === 'array') {
        if ((type as any).items?.typeId === typeId) {
          references.push(`${type.name}[]`);
        }
      }
    }

    // Check endpoints
    for (const endpoint of schema.endpoints) {
      // Check request body
      if (endpoint.requestBody?.type?.typeId === typeId) {
        references.push(`${endpoint.operationId}.requestBody`);
      }

      // Check responses
      for (const response of endpoint.responses) {
        if (response.type?.typeId === typeId) {
          references.push(`${endpoint.operationId}.response.${response.statusCode}`);
        }
      }

      // Check parameters
      for (const param of endpoint.parameters || []) {
        if (param.type?.typeId === typeId) {
          references.push(`${endpoint.operationId}.${param.name}`);
        }
      }
    }

    return references;
  }

  /**
   * Create a compatibility change
   */
  private createChange(params: {
    category: ChangeCategory;
    severity: ChangeSeverity;
    path: string;
    description: string;
    sourceValue?: unknown;
    targetValue?: unknown;
    affectedComponents: string[];
    migrationComplexity: number;
  }): CompatibilityChange {
    return {
      changeId: randomUUID(),
      category: params.category,
      severity: params.severity,
      path: params.path,
      description: params.description,
      sourceValue: params.sourceValue,
      targetValue: params.targetValue,
      impact: {
        affectedComponents: params.affectedComponents,
        affectedLanguages: ['typescript', 'python', 'rust', 'go', 'java', 'csharp'],
        migrationComplexity: params.migrationComplexity,
      },
    };
  }
}
