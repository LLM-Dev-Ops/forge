/**
 * LLM-Forge Unified HTTP Service
 *
 * Single service exposing all agent endpoints:
 * - SDK Generator Agent
 * - CLI Command Generator Agent
 * - API Translation Agent
 * - Version Compatibility Agent
 *
 * ARCHITECTURE:
 * - Stateless execution
 * - No direct SQL access (all persistence via ruvector-service)
 * - Deterministic outputs
 * - Environment-based configuration
 *
 * PHASE 2 - OPERATIONAL INTELLIGENCE (Layer 1):
 * - Hard startup failure if Ruvector unavailable
 * - Signal emission (anomaly, drift, memory lineage, latency)
 * - Performance budgets (MAX_TOKENS=1000, MAX_LATENCY_MS=2000, MAX_CALLS_PER_RUN=3)
 * - Caching for historical reads/lineage lookups (TTL 60-120s)
 *
 * @module service/server
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';

// Agentics Execution Context
import {
  ExecutionContext,
  extractExecutionHeaders,
  createArtifactRef,
} from './execution-context.js';

// Phase 2 imports
import {
  initPhase2,
  type Phase2Context,
  PerformanceTracker,
  getSignalEmitter,
  getCache,
} from '../phase2/index.js';

// Import agent handlers
import {
  handler as sdkGeneratorHandler,
  AGENT_ID as SDK_AGENT_ID,
  AGENT_VERSION as SDK_AGENT_VERSION,
} from '../agents/sdk-generator/index.js';

import { handleGenerate as cliCommandGeneratorHandler } from '../agents/cli-command-generator/index.js';
import {
  CLI_AGENT_ID,
  CLI_AGENT_VERSION,
} from '../agents/contracts/cli-command-generator.contract.js';

import { APITranslator } from '../translators/api-translator.js';
import {
  AGENT_ID as TRANSLATOR_AGENT_ID,
  AGENT_VERSION as TRANSLATOR_AGENT_VERSION,
} from '../agents/contracts/api-translation.contract.js';

import { VersionCompatibilityAgent } from '../agents/version-compatibility-agent/index.js';
import {
  AGENT_ID as VC_AGENT_ID,
  AGENT_VERSION as VC_AGENT_VERSION,
} from '../agents/version-compatibility-agent/index.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = parseInt(process.env.PORT || '8080', 10);
const SERVICE_NAME = process.env.SERVICE_NAME || 'llm-forge';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const PLATFORM_ENV = process.env.PLATFORM_ENV || 'dev';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Phase 2 configuration
const AGENT_NAME = process.env.AGENT_NAME || 'llm-forge';
const AGENT_DOMAIN = process.env.AGENT_DOMAIN || 'code-generation';
const AGENT_PHASE = process.env.AGENT_PHASE || 'phase2';
const AGENT_LAYER = process.env.AGENT_LAYER || 'layer1';

// Phase 2 context (initialized at startup)
let phase2Context: Phase2Context | null = null;

// =============================================================================
// LOGGING
// =============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL as LogLevel]) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    env: PLATFORM_ENV,
    message,
    ...data,
  };

  console.log(JSON.stringify(entry));
}

// =============================================================================
// REQUEST HANDLING
// =============================================================================

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function sendJSON(
  res: ServerResponse,
  statusCode: number,
  data: unknown
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Service': SERVICE_NAME,
    'X-Service-Version': SERVICE_VERSION,
    'X-Platform-Env': PLATFORM_ENV,
  });
  res.end(JSON.stringify(data));
}

function sendError(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: string[]
): void {
  sendJSON(res, statusCode, {
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

async function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Get cache stats for health response
  const cache = getCache();
  const cacheStats = cache?.getStats();

  sendJSON(res, 200, {
    status: 'healthy',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: PLATFORM_ENV,
    timestamp: new Date().toISOString(),
    // Phase 2 metadata
    phase2: {
      agentName: AGENT_NAME,
      agentDomain: AGENT_DOMAIN,
      phase: AGENT_PHASE,
      layer: AGENT_LAYER,
      ruvectorConnected: phase2Context !== null,
      cache: cacheStats ? {
        entries: cacheStats.entries,
        hitRate: cacheStats.hitRate,
      } : null,
    },
    agents: {
      'sdk-generator': { status: 'available', version: SDK_AGENT_VERSION },
      'cli-generator': { status: 'available', version: CLI_AGENT_VERSION },
      'api-translator': { status: 'available', version: TRANSLATOR_AGENT_VERSION },
      'version-compatibility': { status: 'available', version: VC_AGENT_VERSION },
    },
  });
}

async function handleAgentList(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  sendJSON(res, 200, {
    service: SERVICE_NAME,
    agents: [
      {
        id: SDK_AGENT_ID,
        version: SDK_AGENT_VERSION,
        endpoint: '/api/v1/agents/sdk-generator',
        description: 'Generate SDKs from canonical schemas',
      },
      {
        id: CLI_AGENT_ID,
        version: CLI_AGENT_VERSION,
        endpoint: '/api/v1/agents/cli-generator',
        description: 'Generate CLI commands from API contracts',
      },
      {
        id: TRANSLATOR_AGENT_ID,
        version: TRANSLATOR_AGENT_VERSION,
        endpoint: '/api/v1/agents/api-translator',
        description: 'Translate API schemas between formats',
      },
      {
        id: VC_AGENT_ID,
        version: VC_AGENT_VERSION,
        endpoint: '/api/v1/agents/version-compatibility',
        description: 'Analyze version compatibility',
      },
    ],
  });
}

async function handleSDKGenerator(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();

  // Agentics: Extract execution context from headers
  const execHeaders = extractExecutionHeaders(
    req.headers as Record<string, string | string[] | undefined>
  );
  if (req.headers['x-execution-id'] && !execHeaders) {
    sendError(res, 400, 'MISSING_PARENT_SPAN', 'X-Parent-Span-Id header is required');
    return;
  }
  const execCtx = execHeaders
    ? new ExecutionContext(execHeaders.executionId, execHeaders.parentSpanId)
    : null;
  const agentSpan = execCtx?.startAgentSpan(SDK_AGENT_ID, {
    version: SDK_AGENT_VERSION,
    classification: 'GENERATION',
  });

  // Phase 2: Initialize performance tracker
  const signalEmitter = getSignalEmitter();
  const tracker = new PerformanceTracker(requestId, signalEmitter || undefined);

  log('info', 'SDK Generator request received', { requestId });

  try {
    const body = await readBody(req);
    tracker.recordOperation('read_body', Date.now() - startTime);

    const context = {
      requestId,
      startTime,
      getRemainingTime: () => Math.min(
        300000 - (Date.now() - startTime),
        tracker.getRemainingLatencyMs()
      ),
      emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
      dryRun: false,
      ruvectorEndpoint: process.env.RUVECTOR_SERVICE_URL,
      // Phase 2: Pass performance tracker
      performanceTracker: tracker,
    };

    const handlerStart = Date.now();
    const response = await sdkGeneratorHandler(body, context);
    tracker.recordOperation('handler', Date.now() - handlerStart);

    // Phase 2: Complete performance tracking
    const budgetResult = tracker.complete();

    // Agentics: Finalize agent span
    if (agentSpan && execCtx) {
      execCtx.attachArtifact(agentSpan, createArtifactRef('sdk-generation-result', response.body));
      if (response.statusCode >= 200 && response.statusCode < 400) {
        execCtx.completeAgentSpan(agentSpan);
      } else {
        execCtx.failAgentSpan(agentSpan, `HTTP ${response.statusCode}`);
      }
    }

    log('info', 'SDK Generator completed', {
      requestId,
      statusCode: response.statusCode,
      duration: budgetResult.metrics.latencyMs,
      withinBudget: budgetResult.withinBudget,
      violations: budgetResult.violations.map(v => v.budget),
    });

    const responseBody = execCtx
      ? JSON.stringify(execCtx.buildResponse(JSON.parse(response.body)))
      : response.body;

    res.writeHead(response.statusCode, {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Agent-ID': SDK_AGENT_ID,
      'X-Agent-Version': SDK_AGENT_VERSION,
      'X-Latency-Ms': String(budgetResult.metrics.latencyMs),
      'X-Within-Budget': String(budgetResult.withinBudget),
      ...(execCtx ? {
        'X-Execution-Id': execCtx.executionId,
        'X-Repo-Span-Id': execCtx.repoSpan.span_id,
      } : {}),
    });
    res.end(responseBody);
  } catch (error) {
    // Agentics: Fail agent span on error
    if (agentSpan && execCtx) {
      execCtx.failAgentSpan(agentSpan, error instanceof Error ? error.message : String(error));
    }

    // Phase 2: Emit anomaly signal for errors
    if (signalEmitter) {
      signalEmitter.emitAnomaly({
        anomalyType: 'handler_error',
        observed: error instanceof Error ? error.message : String(error),
        confidence: 1.0,
        severity: 'critical',
        requestId,
        context: { agent: 'sdk-generator' },
      });
    }

    log('error', 'SDK Generator error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (execCtx) {
      sendJSON(res, 500, execCtx.buildResponse({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'SDK generation failed' },
      }));
    } else {
      sendError(res, 500, 'INTERNAL_ERROR', 'SDK generation failed');
    }
  }
}

async function handleCLIGenerator(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();

  // Agentics: Extract execution context from headers
  const execHeaders = extractExecutionHeaders(
    req.headers as Record<string, string | string[] | undefined>
  );
  if (req.headers['x-execution-id'] && !execHeaders) {
    sendError(res, 400, 'MISSING_PARENT_SPAN', 'X-Parent-Span-Id header is required');
    return;
  }
  const execCtx = execHeaders
    ? new ExecutionContext(execHeaders.executionId, execHeaders.parentSpanId)
    : null;
  const agentSpan = execCtx?.startAgentSpan(CLI_AGENT_ID, {
    version: CLI_AGENT_VERSION,
    classification: 'GENERATION',
  });

  log('info', 'CLI Generator request received', { requestId });

  try {
    const body = await readBody(req);
    const input = JSON.parse(body);

    const result = await cliCommandGeneratorHandler(input, {
      verbose: false,
    });

    // Agentics: Finalize agent span
    const resultJson = JSON.stringify(result);
    if (agentSpan && execCtx) {
      execCtx.attachArtifact(agentSpan, createArtifactRef('cli-generation-result', resultJson));
      if (result.success) {
        execCtx.completeAgentSpan(agentSpan);
      } else {
        execCtx.failAgentSpan(agentSpan, (result.errors ?? []).join('; ') || 'Generation failed');
      }
    }

    log('info', 'CLI Generator completed', {
      requestId,
      success: result.success,
      duration: Date.now() - startTime,
    });

    const responseBody = execCtx
      ? JSON.stringify(execCtx.buildResponse(result))
      : resultJson;

    res.writeHead(result.success ? 200 : 400, {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Agent-ID': CLI_AGENT_ID,
      'X-Agent-Version': CLI_AGENT_VERSION,
      ...(execCtx ? {
        'X-Execution-Id': execCtx.executionId,
        'X-Repo-Span-Id': execCtx.repoSpan.span_id,
      } : {}),
    });

    res.end(responseBody);
  } catch (error) {
    if (agentSpan && execCtx) {
      execCtx.failAgentSpan(agentSpan, error instanceof Error ? error.message : String(error));
    }

    log('error', 'CLI Generator error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (execCtx) {
      sendJSON(res, 500, execCtx.buildResponse({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'CLI generation failed' },
      }));
    } else {
      sendError(res, 500, 'INTERNAL_ERROR', 'CLI generation failed');
    }
  }
}

async function handleAPITranslator(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();

  // Agentics: Extract execution context from headers
  const execHeaders = extractExecutionHeaders(
    req.headers as Record<string, string | string[] | undefined>
  );
  if (req.headers['x-execution-id'] && !execHeaders) {
    sendError(res, 400, 'MISSING_PARENT_SPAN', 'X-Parent-Span-Id header is required');
    return;
  }
  const execCtx = execHeaders
    ? new ExecutionContext(execHeaders.executionId, execHeaders.parentSpanId)
    : null;
  const agentSpan = execCtx?.startAgentSpan(TRANSLATOR_AGENT_ID, {
    version: TRANSLATOR_AGENT_VERSION,
    classification: 'TRANSLATION',
  });

  log('info', 'API Translator request received', { requestId });

  try {
    const body = await readBody(req);
    const input = JSON.parse(body);

    const translator = new APITranslator({
      emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
    });

    const result = await translator.translate({
      ...input,
      requestId,
    });

    // Agentics: Finalize agent span
    const resultJson = JSON.stringify(result);
    if (agentSpan && execCtx) {
      execCtx.attachArtifact(agentSpan, createArtifactRef('api-translation-result', resultJson));
      if (result.success) {
        execCtx.completeAgentSpan(agentSpan);
      } else {
        execCtx.failAgentSpan(agentSpan, (result.errors ?? []).join('; ') || 'Translation failed');
      }
    }

    log('info', 'API Translator completed', {
      requestId,
      success: result.success,
      duration: Date.now() - startTime,
    });

    const responseBody = execCtx
      ? JSON.stringify(execCtx.buildResponse(result))
      : resultJson;

    res.writeHead(result.success ? 200 : 400, {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Agent-ID': TRANSLATOR_AGENT_ID,
      'X-Agent-Version': TRANSLATOR_AGENT_VERSION,
      ...(execCtx ? {
        'X-Execution-Id': execCtx.executionId,
        'X-Repo-Span-Id': execCtx.repoSpan.span_id,
      } : {}),
    });

    res.end(responseBody);
  } catch (error) {
    if (agentSpan && execCtx) {
      execCtx.failAgentSpan(agentSpan, error instanceof Error ? error.message : String(error));
    }

    log('error', 'API Translator error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (execCtx) {
      sendJSON(res, 500, execCtx.buildResponse({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'API translation failed' },
      }));
    } else {
      sendError(res, 500, 'INTERNAL_ERROR', 'API translation failed');
    }
  }
}

async function handleVersionCompatibility(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();

  // Agentics: Extract execution context from headers
  const execHeaders = extractExecutionHeaders(
    req.headers as Record<string, string | string[] | undefined>
  );
  if (req.headers['x-execution-id'] && !execHeaders) {
    sendError(res, 400, 'MISSING_PARENT_SPAN', 'X-Parent-Span-Id header is required');
    return;
  }
  const execCtx = execHeaders
    ? new ExecutionContext(execHeaders.executionId, execHeaders.parentSpanId)
    : null;
  const agentSpan = execCtx?.startAgentSpan(VC_AGENT_ID, {
    version: VC_AGENT_VERSION,
    classification: 'VALIDATION',
  });

  log('info', 'Version Compatibility request received', { requestId });

  try {
    const body = await readBody(req);
    const input = JSON.parse(body);

    const agent = new VersionCompatibilityAgent({
      emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
    });

    const result = await agent.analyze({
      ...input,
      requestId,
    });

    // Agentics: Finalize agent span
    const resultJson = JSON.stringify(result);
    if (agentSpan && execCtx) {
      execCtx.attachArtifact(agentSpan, createArtifactRef('compatibility-analysis-result', resultJson));
      if (result.success) {
        execCtx.completeAgentSpan(agentSpan);
      } else {
        execCtx.failAgentSpan(agentSpan, (result.errors ?? []).join('; ') || 'Analysis failed');
      }
    }

    log('info', 'Version Compatibility completed', {
      requestId,
      success: result.success,
      verdict: result.verdict,
      duration: Date.now() - startTime,
    });

    const responseBody = execCtx
      ? JSON.stringify(execCtx.buildResponse(result))
      : resultJson;

    res.writeHead(result.success ? 200 : 400, {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Agent-ID': VC_AGENT_ID,
      'X-Agent-Version': VC_AGENT_VERSION,
      ...(execCtx ? {
        'X-Execution-Id': execCtx.executionId,
        'X-Repo-Span-Id': execCtx.repoSpan.span_id,
      } : {}),
    });

    res.end(responseBody);
  } catch (error) {
    if (agentSpan && execCtx) {
      execCtx.failAgentSpan(agentSpan, error instanceof Error ? error.message : String(error));
    }

    log('error', 'Version Compatibility error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (execCtx) {
      sendJSON(res, 500, execCtx.buildResponse({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Compatibility analysis failed' },
      }));
    } else {
      sendError(res, 500, 'INTERNAL_ERROR', 'Compatibility analysis failed');
    }
  }
}

async function handleEvents(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const event = JSON.parse(body);

    log('info', 'Event received', {
      source: event.source,
      event_type: event.event_type,
      execution_id: event.execution_id,
      timestamp: event.timestamp,
    });

    sendJSON(res, 202, {
      status: 'accepted',
      execution_id: event.execution_id,
    });
  } catch (error) {
    log('error', 'Event ingestion error', {
      error: error instanceof Error ? error.message : String(error),
    });
    sendError(res, 400, 'INVALID_EVENT', 'Failed to parse event payload');
  }
}

async function handleAgentStatus(
  agentId: string,
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const agents: Record<string, { id: string; version: string; description: string }> = {
    'sdk-generator': {
      id: SDK_AGENT_ID,
      version: SDK_AGENT_VERSION,
      description: 'Generate SDKs from canonical schemas',
    },
    'cli-generator': {
      id: CLI_AGENT_ID,
      version: CLI_AGENT_VERSION,
      description: 'Generate CLI commands from API contracts',
    },
    'api-translator': {
      id: TRANSLATOR_AGENT_ID,
      version: TRANSLATOR_AGENT_VERSION,
      description: 'Translate API schemas between formats',
    },
    'version-compatibility': {
      id: VC_AGENT_ID,
      version: VC_AGENT_VERSION,
      description: 'Analyze version compatibility',
    },
  };

  const agent = agents[agentId];

  if (!agent) {
    sendError(res, 404, 'AGENT_NOT_FOUND', `Agent not found: ${agentId}`);
    return;
  }

  sendJSON(res, 200, {
    ...agent,
    status: 'available',
    endpoint: `/api/v1/agents/${agentId}`,
  });
}

// =============================================================================
// REQUEST ROUTER
// =============================================================================

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { method, url } = req;
  const path = url?.split('?')[0] || '/';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Execution-Id, X-Parent-Span-Id');

  // Handle preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  log('debug', 'Request received', { method, path });

  try {
    // Health check
    if (path === '/health' && method === 'GET') {
      await handleHealth(req, res);
      return;
    }

    // Agent list
    if (path === '/api/v1/agents' && method === 'GET') {
      await handleAgentList(req, res);
      return;
    }

    // Event ingestion (automation-core)
    if (path === '/api/v1/events' && method === 'POST') {
      await handleEvents(req, res);
      return;
    }

    // Agent endpoints
    if (path.startsWith('/api/v1/agents/')) {
      const parts = path.split('/');
      const agentId = parts[4];
      const action = parts[5];

      // Agent status
      if (action === 'status' && method === 'GET') {
        await handleAgentStatus(agentId, req, res);
        return;
      }

      // Agent invocation
      if (method === 'POST') {
        switch (agentId) {
          case 'sdk-generator':
            await handleSDKGenerator(req, res);
            return;
          case 'cli-generator':
            await handleCLIGenerator(req, res);
            return;
          case 'api-translator':
            await handleAPITranslator(req, res);
            return;
          case 'version-compatibility':
            await handleVersionCompatibility(req, res);
            return;
        }
      }
    }

    // 404 for unknown routes
    sendError(res, 404, 'NOT_FOUND', `Route not found: ${method} ${path}`);
  } catch (error) {
    log('error', 'Unhandled error', {
      method,
      path,
      error: error instanceof Error ? error.message : String(error),
    });

    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = createServer(handleRequest);

/**
 * Phase 2 Enhanced Startup
 *
 * 1. Initialize Phase 2 infrastructure (validates env, verifies Ruvector)
 * 2. Start HTTP server only after Phase 2 is ready
 * 3. Fail HARD if Ruvector is unavailable
 */
async function startServer(): Promise<void> {
  try {
    // Phase 2: Initialize infrastructure (exits process on failure)
    console.log('[STARTUP] Initializing Phase 2 - Operational Intelligence...');
    phase2Context = await initPhase2();
    console.log('[STARTUP] Phase 2 initialized successfully');

    // Start HTTP server
    server.listen(PORT, () => {
      log('info', 'LLM-Forge service started', {
        port: PORT,
        environment: PLATFORM_ENV,
        phase2: {
          agentName: AGENT_NAME,
          agentDomain: AGENT_DOMAIN,
          phase: AGENT_PHASE,
          layer: AGENT_LAYER,
        },
        agents: [
          SDK_AGENT_ID,
          CLI_AGENT_ID,
          TRANSLATOR_AGENT_ID,
          VC_AGENT_ID,
        ],
      });

      console.log(`
╔════════════════════════════════════════════════════════════╗
║           LLM-FORGE SERVICE - PHASE 2 ENABLED              ║
╠════════════════════════════════════════════════════════════╣
║  Service:     ${SERVICE_NAME.padEnd(42)}║
║  Version:     ${SERVICE_VERSION.padEnd(42)}║
║  Environment: ${PLATFORM_ENV.padEnd(42)}║
║  Port:        ${String(PORT).padEnd(42)}║
╠════════════════════════════════════════════════════════════╣
║  Phase 2 - Operational Intelligence (Layer 1):             ║
║    Agent:     ${AGENT_NAME.padEnd(42)}║
║    Domain:    ${AGENT_DOMAIN.padEnd(42)}║
║    Ruvector:  Connected                                    ║
╠════════════════════════════════════════════════════════════╣
║  Agents:                                                   ║
║    • SDK Generator Agent (${SDK_AGENT_VERSION})                        ║
║    • CLI Command Generator Agent (${CLI_AGENT_VERSION})                ║
║    • API Translation Agent (${TRANSLATOR_AGENT_VERSION})                       ║
║    • Version Compatibility Agent (${VC_AGENT_VERSION})                 ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    GET  /health                                            ║
║    GET  /api/v1/agents                                     ║
║    POST /api/v1/events                                     ║
║    POST /api/v1/agents/sdk-generator                       ║
║    POST /api/v1/agents/cli-generator                       ║
║    POST /api/v1/agents/api-translator                      ║
║    POST /api/v1/agents/version-compatibility               ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('[STARTUP] FATAL: Failed to initialize service');
    console.error(error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown with Phase 2 cleanup
async function gracefulShutdown(signal: string): Promise<void> {
  log('info', `Received ${signal}, shutting down gracefully`);

  // Phase 2: Flush pending signals
  const signalEmitter = getSignalEmitter();
  if (signalEmitter) {
    log('info', 'Flushing pending signals...');
    await signalEmitter.forceFlush();
  }

  // Phase 2: Stop cache cleanup
  const cache = getCache();
  if (cache) {
    cache.stopCleanup();
  }

  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    log('warn', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { server };
