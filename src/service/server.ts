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
 * @module service/server
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';

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
  sendJSON(res, 200, {
    status: 'healthy',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: PLATFORM_ENV,
    timestamp: new Date().toISOString(),
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

  log('info', 'SDK Generator request received', { requestId });

  try {
    const body = await readBody(req);

    const context = {
      requestId,
      startTime,
      getRemainingTime: () => 300000 - (Date.now() - startTime),
      emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
      dryRun: false,
      ruvectorEndpoint: process.env.RUVECTOR_SERVICE_URL,
    };

    const response = await sdkGeneratorHandler(body, context);

    log('info', 'SDK Generator completed', {
      requestId,
      statusCode: response.statusCode,
      duration: Date.now() - startTime,
    });

    res.writeHead(response.statusCode, {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Agent-ID': SDK_AGENT_ID,
      'X-Agent-Version': SDK_AGENT_VERSION,
    });
    res.end(response.body);
  } catch (error) {
    log('error', 'SDK Generator error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    sendError(res, 500, 'INTERNAL_ERROR', 'SDK generation failed');
  }
}

async function handleCLIGenerator(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();

  log('info', 'CLI Generator request received', { requestId });

  try {
    const body = await readBody(req);
    const input = JSON.parse(body);

    const result = await cliCommandGeneratorHandler(input, {
      verbose: false,
    });

    log('info', 'CLI Generator completed', {
      requestId,
      success: result.success,
      duration: Date.now() - startTime,
    });

    res.writeHead(result.success ? 200 : 400, {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Agent-ID': CLI_AGENT_ID,
      'X-Agent-Version': CLI_AGENT_VERSION,
    });

    res.end(JSON.stringify(result));
  } catch (error) {
    log('error', 'CLI Generator error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    sendError(res, 500, 'INTERNAL_ERROR', 'CLI generation failed');
  }
}

async function handleAPITranslator(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();

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

    log('info', 'API Translator completed', {
      requestId,
      success: result.success,
      duration: Date.now() - startTime,
    });

    res.writeHead(result.success ? 200 : 400, {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Agent-ID': TRANSLATOR_AGENT_ID,
      'X-Agent-Version': TRANSLATOR_AGENT_VERSION,
    });

    res.end(JSON.stringify(result));
  } catch (error) {
    log('error', 'API Translator error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    sendError(res, 500, 'INTERNAL_ERROR', 'API translation failed');
  }
}

async function handleVersionCompatibility(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestId = randomUUID();
  const startTime = Date.now();

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

    log('info', 'Version Compatibility completed', {
      requestId,
      success: result.success,
      verdict: result.verdict,
      duration: Date.now() - startTime,
    });

    res.writeHead(result.success ? 200 : 400, {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Agent-ID': VC_AGENT_ID,
      'X-Agent-Version': VC_AGENT_VERSION,
    });

    res.end(JSON.stringify(result));
  } catch (error) {
    log('error', 'Version Compatibility error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    sendError(res, 500, 'INTERNAL_ERROR', 'Compatibility analysis failed');
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

server.listen(PORT, () => {
  log('info', 'LLM-Forge service started', {
    port: PORT,
    environment: PLATFORM_ENV,
    agents: [
      SDK_AGENT_ID,
      CLI_AGENT_ID,
      TRANSLATOR_AGENT_ID,
      VC_AGENT_ID,
    ],
  });

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    LLM-FORGE SERVICE                       ║
╠════════════════════════════════════════════════════════════╣
║  Service:     ${SERVICE_NAME.padEnd(42)}║
║  Version:     ${SERVICE_VERSION.padEnd(42)}║
║  Environment: ${PLATFORM_ENV.padEnd(42)}║
║  Port:        ${String(PORT).padEnd(42)}║
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
║    POST /api/v1/agents/sdk-generator                       ║
║    POST /api/v1/agents/cli-generator                       ║
║    POST /api/v1/agents/api-translator                      ║
║    POST /api/v1/agents/version-compatibility               ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down gracefully');
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down gracefully');
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });
});

export { server };
