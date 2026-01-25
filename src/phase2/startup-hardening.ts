/**
 * Phase 2 - Operational Intelligence: Startup Hardening
 *
 * Enforces required environment variables and verifies Ruvector availability
 * at service startup. Fails HARD if Ruvector is unavailable.
 *
 * REQUIRED ENV VARS:
 * - RUVECTOR_SERVICE_URL
 * - RUVECTOR_API_KEY (from Google Secret Manager)
 * - AGENT_NAME
 * - AGENT_DOMAIN
 * - AGENT_PHASE=phase2
 * - AGENT_LAYER=layer1
 *
 * @module phase2/startup-hardening
 */

// =============================================================================
// TYPES
// =============================================================================

export interface StartupConfig {
  ruvectorServiceUrl: string;
  ruvectorApiKey: string;
  agentName: string;
  agentDomain: string;
  agentPhase: string;
  agentLayer: string;
}

export interface RuvectorHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version?: string;
  timestamp: string;
}

export interface StartupValidationResult {
  valid: boolean;
  config: StartupConfig | null;
  errors: string[];
  ruvectorVerified: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const REQUIRED_ENV_VARS = [
  'RUVECTOR_SERVICE_URL',
  'RUVECTOR_API_KEY',
  'AGENT_NAME',
  'AGENT_DOMAIN',
] as const;

const PHASE2_REQUIREMENTS = {
  AGENT_PHASE: 'phase2',
  AGENT_LAYER: 'layer1',
} as const;

const RUVECTOR_HEALTH_TIMEOUT_MS = 5000;
const RUVECTOR_HEALTH_RETRIES = 3;
const RUVECTOR_RETRY_DELAY_MS = 1000;

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validates all required environment variables are present
 */
function validateEnvironmentVariables(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    const value = process.env[varName];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Validate phase and layer
  const phase = process.env.AGENT_PHASE;
  const layer = process.env.AGENT_LAYER;

  if (phase && phase !== PHASE2_REQUIREMENTS.AGENT_PHASE) {
    errors.push(
      `AGENT_PHASE must be '${PHASE2_REQUIREMENTS.AGENT_PHASE}', got '${phase}'`
    );
  }

  if (layer && layer !== PHASE2_REQUIREMENTS.AGENT_LAYER) {
    errors.push(
      `AGENT_LAYER must be '${PHASE2_REQUIREMENTS.AGENT_LAYER}', got '${layer}'`
    );
  }

  // Set defaults if not provided
  if (!phase) {
    process.env.AGENT_PHASE = PHASE2_REQUIREMENTS.AGENT_PHASE;
  }
  if (!layer) {
    process.env.AGENT_LAYER = PHASE2_REQUIREMENTS.AGENT_LAYER;
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Extracts configuration from environment
 */
function extractConfig(): StartupConfig {
  return {
    ruvectorServiceUrl: process.env.RUVECTOR_SERVICE_URL!,
    ruvectorApiKey: process.env.RUVECTOR_API_KEY!,
    agentName: process.env.AGENT_NAME!,
    agentDomain: process.env.AGENT_DOMAIN!,
    agentPhase: process.env.AGENT_PHASE || PHASE2_REQUIREMENTS.AGENT_PHASE,
    agentLayer: process.env.AGENT_LAYER || PHASE2_REQUIREMENTS.AGENT_LAYER,
  };
}

// =============================================================================
// RUVECTOR VERIFICATION
// =============================================================================

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verify Ruvector service is available and healthy
 * Retries up to RUVECTOR_HEALTH_RETRIES times before failing
 */
async function verifyRuvector(config: StartupConfig): Promise<{
  verified: boolean;
  error?: string;
}> {
  const healthUrl = `${config.ruvectorServiceUrl}/health`;

  for (let attempt = 1; attempt <= RUVECTOR_HEALTH_RETRIES; attempt++) {
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.ruvectorApiKey}`,
          'X-Agent-Name': config.agentName,
          'X-Agent-Domain': config.agentDomain,
          'X-Agent-Phase': config.agentPhase,
        },
        signal: AbortSignal.timeout(RUVECTOR_HEALTH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Ruvector returned HTTP ${response.status}`);
      }

      const health = (await response.json()) as RuvectorHealthResponse;

      if (health.status === 'unhealthy') {
        throw new Error('Ruvector service reported unhealthy status');
      }

      // Success - Ruvector is available
      return { verified: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (attempt < RUVECTOR_HEALTH_RETRIES) {
        console.error(
          `[STARTUP] Ruvector health check failed (attempt ${attempt}/${RUVECTOR_HEALTH_RETRIES}): ${errorMessage}`
        );
        await sleep(RUVECTOR_RETRY_DELAY_MS * attempt);
      } else {
        return {
          verified: false,
          error: `Ruvector unavailable after ${RUVECTOR_HEALTH_RETRIES} attempts: ${errorMessage}`,
        };
      }
    }
  }

  return { verified: false, error: 'Ruvector verification exhausted retries' };
}

// =============================================================================
// MAIN STARTUP VALIDATION
// =============================================================================

/**
 * Perform full startup validation
 *
 * 1. Validate required environment variables
 * 2. Verify Ruvector service is available
 * 3. Fail HARD if either check fails
 *
 * @throws Error if validation fails (causes process exit)
 */
export async function validateStartup(): Promise<StartupValidationResult> {
  console.log('[STARTUP] Phase 2 - Operational Intelligence: Layer 1');
  console.log('[STARTUP] Validating startup requirements...');

  // Step 1: Validate environment variables
  const envValidation = validateEnvironmentVariables();

  if (!envValidation.valid) {
    console.error('[STARTUP] FATAL: Environment validation failed');
    for (const error of envValidation.errors) {
      console.error(`[STARTUP]   - ${error}`);
    }
    return {
      valid: false,
      config: null,
      errors: envValidation.errors,
      ruvectorVerified: false,
    };
  }

  const config = extractConfig();
  console.log('[STARTUP] Environment validated');
  console.log(`[STARTUP]   Agent: ${config.agentName}`);
  console.log(`[STARTUP]   Domain: ${config.agentDomain}`);
  console.log(`[STARTUP]   Phase: ${config.agentPhase}`);
  console.log(`[STARTUP]   Layer: ${config.agentLayer}`);

  // Step 2: Verify Ruvector
  console.log('[STARTUP] Verifying Ruvector service...');
  const ruvectorResult = await verifyRuvector(config);

  if (!ruvectorResult.verified) {
    console.error('[STARTUP] FATAL: Ruvector verification failed');
    console.error(`[STARTUP]   ${ruvectorResult.error}`);
    return {
      valid: false,
      config,
      errors: [ruvectorResult.error!],
      ruvectorVerified: false,
    };
  }

  console.log('[STARTUP] Ruvector verified');
  console.log('[STARTUP] Startup validation PASSED');

  return {
    valid: true,
    config,
    errors: [],
    ruvectorVerified: true,
  };
}

/**
 * Enforce startup requirements - exits process if validation fails
 */
export async function enforceStartup(): Promise<StartupConfig> {
  const result = await validateStartup();

  if (!result.valid) {
    console.error('[STARTUP] Service cannot start - requirements not met');
    process.exit(1);
  }

  return result.config!;
}

/**
 * Get current startup configuration (after validation)
 */
export function getStartupConfig(): StartupConfig | null {
  try {
    return extractConfig();
  } catch {
    return null;
  }
}
