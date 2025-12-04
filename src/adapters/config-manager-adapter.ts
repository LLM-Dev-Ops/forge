/**
 * LLM-Config-Manager Adapter
 *
 * Thin adapter module for consuming configuration to control SDK generation
 * parameters, feature flags, provider availability, and versioning policies
 * from the LLM-Config-Manager upstream repository.
 *
 * This adapter provides backward-compatible, additive integration without
 * modifying existing SDK generation pipelines.
 *
 * @module adapters/config-manager-adapter
 */

/**
 * SDK generation parameters from Config Manager
 */
export interface ConfigManagerSDKParams {
  /** Target language for SDK generation */
  targetLanguage: string;
  /** Output directory for generated files */
  outputDirectory?: string;
  /** Whether to generate async/await variants */
  generateAsync: boolean;
  /** Whether to generate streaming support */
  generateStreaming: boolean;
  /** Whether to include validation code */
  includeValidation: boolean;
  /** Whether to generate documentation */
  generateDocs: boolean;
  /** Package name for generated SDK */
  packageName?: string;
  /** Package version for generated SDK */
  packageVersion?: string;
  /** Custom template overrides */
  templateOverrides?: Record<string, string>;
}

/**
 * Feature flags from Config Manager
 */
export interface ConfigManagerFeatureFlags {
  /** Enable experimental features */
  experimentalFeatures: boolean;
  /** Enable debug mode in generated SDKs */
  debugMode: boolean;
  /** Enable telemetry in generated SDKs */
  telemetry: boolean;
  /** Enable request/response logging */
  requestLogging: boolean;
  /** Enable automatic retries */
  autoRetry: boolean;
  /** Enable circuit breaker pattern */
  circuitBreaker: boolean;
  /** Enable request caching */
  caching: boolean;
  /** Custom feature flags */
  custom?: Record<string, boolean>;
}

/**
 * Provider availability configuration from Config Manager
 */
export interface ConfigManagerProviderAvailability {
  /** Provider identifier */
  providerId: string;
  /** Whether the provider is enabled */
  enabled: boolean;
  /** Provider health status */
  status: 'healthy' | 'degraded' | 'unavailable';
  /** Region availability */
  regions?: string[];
  /** Rate limit configuration */
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay?: number;
    tokensPerMinute?: number;
  };
  /** Maintenance windows */
  maintenanceWindows?: Array<{
    start: string;
    end: string;
    message?: string;
  }>;
}

/**
 * Versioning policy from Config Manager
 */
export interface ConfigManagerVersioningPolicy {
  /** Versioning strategy */
  strategy: 'semver' | 'calver' | 'custom';
  /** Current version */
  currentVersion: string;
  /** Minimum supported version */
  minSupportedVersion?: string;
  /** Deprecation policy */
  deprecationPolicy?: {
    /** Warning period in days */
    warningPeriodDays: number;
    /** Removal period in days */
    removalPeriodDays: number;
  };
  /** Version constraints */
  constraints?: {
    /** Breaking change allowed */
    allowBreaking: boolean;
    /** Pre-release allowed */
    allowPrerelease: boolean;
  };
}

/**
 * Complete configuration from Config Manager
 */
export interface ConfigManagerConfiguration {
  /** SDK generation parameters */
  sdkParams: ConfigManagerSDKParams;
  /** Feature flags */
  featureFlags: ConfigManagerFeatureFlags;
  /** Provider availability */
  providers: ConfigManagerProviderAvailability[];
  /** Versioning policy */
  versioning: ConfigManagerVersioningPolicy;
  /** Configuration metadata */
  metadata?: {
    lastUpdated: string;
    environment: string;
    configVersion: string;
  };
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  warnings?: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Configuration merge options
 */
export interface ConfigMergeOptions {
  /** Override strategy for conflicts */
  overrideStrategy: 'local' | 'remote' | 'merge';
  /** Deep merge arrays */
  deepMergeArrays: boolean;
  /** Preserve undefined values */
  preserveUndefined: boolean;
}

/**
 * ConfigManagerAdapter provides consumption layer for LLM-Config-Manager.
 *
 * This adapter enables Forge to:
 * - Consume SDK generation parameters for customization
 * - Utilize feature flags for conditional generation
 * - Query provider availability for runtime decisions
 * - Apply versioning policies for release management
 *
 * @example
 * ```typescript
 * const adapter = new ConfigManagerAdapter();
 *
 * // Get SDK generation parameters
 * const params = await adapter.getSDKParams('typescript');
 *
 * // Check feature flag
 * const enabled = await adapter.isFeatureEnabled('experimentalFeatures');
 *
 * // Get provider availability
 * const availability = await adapter.getProviderAvailability('openai');
 * ```
 */
export class ConfigManagerAdapter {
  private configuration: ConfigManagerConfiguration | null = null;
  private configOverrides: Partial<ConfigManagerConfiguration> = {};
  private initialized: boolean = false;

  /**
   * Initialize the adapter by loading configuration from Config Manager.
   * This is a lazy initialization that occurs on first use.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Attempt to load from llm-config-manager package
      await this.loadFromConfigManager();
      this.initialized = true;
    } catch {
      // Fallback to built-in defaults if package not available
      this.loadBuiltInDefaults();
      this.initialized = true;
    }
  }

  /**
   * Load configuration from the llm-config-manager package.
   * @internal
   */
  private async loadFromConfigManager(): Promise<void> {
    // Dynamic import to avoid hard dependency
    // Using Function constructor to avoid TypeScript module resolution
    const importDynamic = new Function('modulePath', 'return import(modulePath)');
    const configManager = await (importDynamic('llm-config-manager') as Promise<unknown>).catch(() => null);

    if (configManager) {
      this.loadConfigFromManager(configManager);
    } else {
      throw new Error('llm-config-manager package not available');
    }
  }

  /**
   * Load configuration from the Config Manager package.
   * @internal
   */
  private loadConfigFromManager(manager: unknown): void {
    const managerAny = manager as Record<string, unknown>;

    // Check for common export patterns
    if (typeof managerAny.getConfiguration === 'function') {
      this.configuration = (managerAny.getConfiguration as () => ConfigManagerConfiguration)();
    } else if (typeof managerAny.config === 'object') {
      this.configuration = managerAny.config as ConfigManagerConfiguration;
    }
  }

  /**
   * Load built-in default configuration.
   * Used as fallback when llm-config-manager is not available.
   * @internal
   */
  private loadBuiltInDefaults(): void {
    this.configuration = {
      sdkParams: {
        targetLanguage: 'typescript',
        generateAsync: true,
        generateStreaming: true,
        includeValidation: true,
        generateDocs: true,
      },
      featureFlags: {
        experimentalFeatures: false,
        debugMode: false,
        telemetry: false,
        requestLogging: false,
        autoRetry: true,
        circuitBreaker: false,
        caching: false,
      },
      providers: [
        {
          providerId: 'openai',
          enabled: true,
          status: 'healthy',
          regions: ['us', 'eu', 'asia'],
          rateLimit: {
            requestsPerMinute: 60,
            tokensPerMinute: 90000,
          },
        },
        {
          providerId: 'anthropic',
          enabled: true,
          status: 'healthy',
          regions: ['us', 'eu'],
          rateLimit: {
            requestsPerMinute: 60,
            tokensPerMinute: 100000,
          },
        },
        {
          providerId: 'google',
          enabled: true,
          status: 'healthy',
          regions: ['us', 'eu', 'asia'],
          rateLimit: {
            requestsPerMinute: 60,
          },
        },
        {
          providerId: 'mistral',
          enabled: true,
          status: 'healthy',
          regions: ['eu'],
          rateLimit: {
            requestsPerMinute: 60,
          },
        },
      ],
      versioning: {
        strategy: 'semver',
        currentVersion: '1.0.0',
        minSupportedVersion: '0.9.0',
        deprecationPolicy: {
          warningPeriodDays: 90,
          removalPeriodDays: 180,
        },
        constraints: {
          allowBreaking: false,
          allowPrerelease: true,
        },
      },
      metadata: {
        lastUpdated: new Date().toISOString(),
        environment: 'production',
        configVersion: '1.0.0',
      },
    };
  }

  /**
   * Get SDK generation parameters for a target language.
   *
   * @param targetLanguage - The target language (e.g., 'typescript', 'python')
   * @returns SDK parameters with language-specific settings
   */
  async getSDKParams(targetLanguage?: string): Promise<ConfigManagerSDKParams> {
    await this.initialize();

    const baseParams = this.configuration?.sdkParams || {
      targetLanguage: targetLanguage || 'typescript',
      generateAsync: true,
      generateStreaming: true,
      includeValidation: true,
      generateDocs: true,
    };

    // Apply overrides
    const overrideParams = this.configOverrides.sdkParams;

    return {
      ...baseParams,
      ...overrideParams,
      targetLanguage: targetLanguage || baseParams.targetLanguage,
    };
  }

  /**
   * Get all feature flags.
   *
   * @returns Feature flags configuration
   */
  async getFeatureFlags(): Promise<ConfigManagerFeatureFlags> {
    await this.initialize();

    const baseFlags = this.configuration?.featureFlags || {
      experimentalFeatures: false,
      debugMode: false,
      telemetry: false,
      requestLogging: false,
      autoRetry: true,
      circuitBreaker: false,
      caching: false,
    };

    // Apply overrides
    const overrideFlags = this.configOverrides.featureFlags;

    return {
      ...baseFlags,
      ...overrideFlags,
    };
  }

  /**
   * Check if a specific feature is enabled.
   *
   * @param featureName - The feature flag name
   * @returns Whether the feature is enabled
   */
  async isFeatureEnabled(featureName: keyof ConfigManagerFeatureFlags | string): Promise<boolean> {
    const flags = await this.getFeatureFlags();

    if (featureName in flags) {
      return flags[featureName as keyof ConfigManagerFeatureFlags] as boolean;
    }

    // Check custom flags
    return flags.custom?.[featureName] ?? false;
  }

  /**
   * Get provider availability for a specific provider.
   *
   * @param providerId - The provider identifier
   * @returns Provider availability or undefined
   */
  async getProviderAvailability(providerId: string): Promise<ConfigManagerProviderAvailability | undefined> {
    await this.initialize();

    const providers = this.configuration?.providers || [];
    return providers.find((p) => p.providerId.toLowerCase() === providerId.toLowerCase());
  }

  /**
   * Get all provider availability configurations.
   *
   * @returns Array of provider availability configurations
   */
  async getAllProviderAvailability(): Promise<ConfigManagerProviderAvailability[]> {
    await this.initialize();
    return this.configuration?.providers || [];
  }

  /**
   * Check if a provider is available.
   *
   * @param providerId - The provider identifier
   * @returns Whether the provider is enabled and healthy
   */
  async isProviderAvailable(providerId: string): Promise<boolean> {
    const availability = await this.getProviderAvailability(providerId);
    return availability?.enabled === true && availability?.status === 'healthy';
  }

  /**
   * Get the versioning policy.
   *
   * @returns Versioning policy configuration
   */
  async getVersioningPolicy(): Promise<ConfigManagerVersioningPolicy> {
    await this.initialize();

    return (
      this.configuration?.versioning || {
        strategy: 'semver',
        currentVersion: '1.0.0',
      }
    );
  }

  /**
   * Get the complete configuration.
   *
   * @returns Full configuration object
   */
  async getConfiguration(): Promise<ConfigManagerConfiguration> {
    await this.initialize();

    if (!this.configuration) {
      throw new Error('Configuration not loaded');
    }

    return this.mergeConfigurations(this.configuration, this.configOverrides);
  }

  /**
   * Set configuration overrides.
   * These will be merged with the base configuration.
   *
   * @param overrides - Partial configuration to override
   */
  setOverrides(overrides: Partial<ConfigManagerConfiguration>): void {
    this.configOverrides = overrides;
  }

  /**
   * Clear configuration overrides.
   */
  clearOverrides(): void {
    this.configOverrides = {};
  }

  /**
   * Validate a configuration object.
   *
   * @param config - Configuration to validate
   * @returns Validation result
   */
  validateConfiguration(config: Partial<ConfigManagerConfiguration>): ConfigValidationResult {
    const errors: Array<{ path: string; message: string; code: string }> = [];
    const warnings: Array<{ path: string; message: string }> = [];

    // Validate SDK params
    if (config.sdkParams) {
      if (!config.sdkParams.targetLanguage) {
        errors.push({
          path: 'sdkParams.targetLanguage',
          message: 'Target language is required',
          code: 'MISSING_TARGET_LANGUAGE',
        });
      }
    }

    // Validate versioning
    if (config.versioning) {
      if (!config.versioning.strategy) {
        errors.push({
          path: 'versioning.strategy',
          message: 'Versioning strategy is required',
          code: 'MISSING_VERSIONING_STRATEGY',
        });
      }

      if (!config.versioning.currentVersion) {
        errors.push({
          path: 'versioning.currentVersion',
          message: 'Current version is required',
          code: 'MISSING_CURRENT_VERSION',
        });
      }
    }

    // Validate providers
    if (config.providers) {
      for (let i = 0; i < config.providers.length; i++) {
        const provider = config.providers[i];
        if (provider && !provider.providerId) {
          errors.push({
            path: `providers[${i}].providerId`,
            message: 'Provider ID is required',
            code: 'MISSING_PROVIDER_ID',
          });
        }

        if (provider && provider.status === 'unavailable' && provider.enabled) {
          warnings.push({
            path: `providers[${i}]`,
            message: `Provider ${provider.providerId} is enabled but marked as unavailable`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Merge two configurations with override strategy.
   * @internal
   */
  private mergeConfigurations(
    base: ConfigManagerConfiguration,
    overrides: Partial<ConfigManagerConfiguration>
  ): ConfigManagerConfiguration {
    return {
      sdkParams: {
        ...base.sdkParams,
        ...overrides.sdkParams,
      },
      featureFlags: {
        ...base.featureFlags,
        ...overrides.featureFlags,
        custom: {
          ...base.featureFlags.custom,
          ...overrides.featureFlags?.custom,
        },
      },
      providers: overrides.providers || base.providers,
      versioning: {
        ...base.versioning,
        ...overrides.versioning,
      },
      metadata: base.metadata ? {
        lastUpdated: overrides.metadata?.lastUpdated ?? base.metadata.lastUpdated,
        environment: overrides.metadata?.environment ?? base.metadata.environment,
        configVersion: overrides.metadata?.configVersion ?? base.metadata.configVersion,
      } : undefined,
    };
  }

  /**
   * Get configuration for a specific SDK generation scenario.
   *
   * @param language - Target language
   * @param providerId - Target provider
   * @returns Merged configuration for the scenario
   */
  async getScenarioConfiguration(
    language: string,
    providerId: string
  ): Promise<{
    sdkParams: ConfigManagerSDKParams;
    featureFlags: ConfigManagerFeatureFlags;
    provider: ConfigManagerProviderAvailability | undefined;
    versioning: ConfigManagerVersioningPolicy;
  }> {
    const [sdkParams, featureFlags, provider, versioning] = await Promise.all([
      this.getSDKParams(language),
      this.getFeatureFlags(),
      this.getProviderAvailability(providerId),
      this.getVersioningPolicy(),
    ]);

    return {
      sdkParams,
      featureFlags,
      provider,
      versioning,
    };
  }
}

/**
 * Singleton instance of the ConfigManagerAdapter.
 * Use this for shared access across the application.
 */
export const configManagerAdapter = new ConfigManagerAdapter();

/**
 * Get the singleton ConfigManagerAdapter instance.
 *
 * @returns The singleton adapter instance
 */
export function getConfigManagerAdapter(): ConfigManagerAdapter {
  return configManagerAdapter;
}
