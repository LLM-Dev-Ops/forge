/**
 * Cloud Function Entry Point — forge-agents
 *
 * Single Cloud Function exposing all 4 agents:
 *   POST /v1/forge/sdk              → SDK Generator Agent
 *   POST /v1/forge/cli              → CLI Command Generator Agent
 *   POST /v1/forge/api-translation  → API Translation Agent
 *   POST /v1/forge/version-compat   → Version Compatibility Agent
 *   GET  /health                    → Health check
 *
 * Deploy:
 *   gcloud functions deploy forge-agents \
 *     --runtime nodejs20 --trigger-http --region us-central1 \
 *     --project agentics-dev --entry-point handler \
 *     --memory 512MB --timeout 120s --no-allow-unauthenticated
 *
 * @module service/cloud-function
 */

import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

// Agent handlers — imported directly from agent modules (no server.ts side effects)
import {
  handler as sdkGeneratorHandler,
  AGENT_ID as SDK_AGENT_ID,
  AGENT_VERSION as SDK_AGENT_VERSION,
} from '../agents/sdk-generator/index.js';

import { handleGenerate as cliGeneratorHandler } from '../agents/cli-command-generator/index.js';
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
// TYPES
// =============================================================================

/** Cloud Functions extend IncomingMessage with pre-parsed body and path */
interface CFRequest extends IncomingMessage {
  body?: unknown;
  rawBody?: Buffer;
  path?: string;
}

interface AgentInfo {
  id: string;
  version: string;
  layer: string;
}

interface AgentResult {
  status: number;
  data: unknown;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SERVICE = 'forge-agents';

const AGENT_MAP: Record<string, AgentInfo> = {
  sdk: { id: SDK_AGENT_ID, version: SDK_AGENT_VERSION, layer: 'FORGE_SDK' },
  cli: { id: CLI_AGENT_ID, version: CLI_AGENT_VERSION, layer: 'FORGE_CLI' },
  'api-translation': {
    id: TRANSLATOR_AGENT_ID,
    version: TRANSLATOR_AGENT_VERSION,
    layer: 'FORGE_API_TRANSLATION',
  },
  'version-compat': {
    id: VC_AGENT_ID,
    version: VC_AGENT_VERSION,
    layer: 'FORGE_VERSION_COMPAT',
  },
};

const ROUTE_TO_AGENT: Record<string, string> = {
  '/v1/forge/sdk': 'sdk',
  '/v1/forge/cli': 'cli',
  '/v1/forge/api-translation': 'api-translation',
  '/v1/forge/version-compat': 'version-compat',
};

// =============================================================================
// HELPERS
// =============================================================================

async function readBody(req: CFRequest): Promise<string> {
  // Cloud Functions pre-parse the body; use it directly
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  // Fallback: read raw stream (standalone / test environments)
  const chunks: Buffer[] = [];
  for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function getPath(req: CFRequest): string {
  return req.path || req.url?.split('?')[0] || '/';
}

function sendJSON(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Service': SERVICE,
  });
  res.end(body);
}

function buildExecutionMetadata(traceId: string) {
  return {
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    service: SERVICE,
    execution_id: randomUUID(),
  };
}

// =============================================================================
// AGENT ROUTE HANDLERS
// =============================================================================

async function routeSDK(body: string, requestId: string): Promise<AgentResult> {
  const startTime = Date.now();
  const context = {
    requestId,
    startTime,
    getRemainingTime: () => 120000 - (Date.now() - startTime),
    emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
    dryRun: false,
    ruvectorEndpoint: process.env.RUVECTOR_SERVICE_URL,
  };
  const response = await sdkGeneratorHandler(body, context);
  return { status: response.statusCode, data: JSON.parse(response.body) };
}

async function routeCLI(body: string): Promise<AgentResult> {
  const input = JSON.parse(body);
  const result = await cliGeneratorHandler(input, { verbose: false });
  return { status: result.success ? 200 : 400, data: result };
}

async function routeAPITranslation(
  body: string,
  requestId: string
): Promise<AgentResult> {
  const input = JSON.parse(body);
  const translator = new APITranslator({
    emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
  });
  const result = await translator.translate({ ...input, requestId });
  return { status: result.success ? 200 : 400, data: result };
}

async function routeVersionCompat(
  body: string,
  requestId: string
): Promise<AgentResult> {
  const input = JSON.parse(body);
  const agent = new VersionCompatibilityAgent({
    emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
  });
  const result = await agent.analyze({ ...input, requestId });
  return { status: result.success ? 200 : 400, data: result };
}

type RouteFn = (body: string, requestId: string) => Promise<AgentResult>;

const ROUTE_HANDLERS: Record<string, RouteFn> = {
  sdk: routeSDK,
  cli: (body: string, _requestId: string) => routeCLI(body),
  'api-translation': routeAPITranslation,
  'version-compat': routeVersionCompat,
};

// =============================================================================
// CLOUD FUNCTION HANDLER
// =============================================================================

/**
 * Cloud Function entry point.
 *
 * Routes requests to the appropriate agent, wraps every response with
 * execution_metadata and layers_executed per the forge-agents contract.
 */
export async function handler(
  req: CFRequest,
  res: ServerResponse
): Promise<void> {
  const method = req.method || 'GET';
  const path = getPath(req);
  const traceId =
    (req.headers['x-correlation-id'] as string) || randomUUID();
  const routeStart = Date.now();

  // CORS headers
  res.setHeader(
    'Access-Control-Allow-Origin',
    process.env.CORS_ORIGINS || '*'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Correlation-Id'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  // Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Health ────────────────────────────────────────────────────────────
  if (path === '/health' && method === 'GET') {
    const metadata = buildExecutionMetadata(traceId);
    sendJSON(res, 200, {
      status: 'healthy',
      service: SERVICE,
      timestamp: metadata.timestamp,
      agents: Object.entries(AGENT_MAP).map(([name, info]) => ({
        name,
        agent_id: info.id,
        version: info.version,
        status: 'available',
      })),
      execution_metadata: metadata,
      layers_executed: [
        {
          layer: 'HEALTH_CHECK',
          status: 'completed',
          duration_ms: Date.now() - routeStart,
        },
      ],
    });
    return;
  }

  // ── Agent routing ─────────────────────────────────────────────────────
  const agentKey = ROUTE_TO_AGENT[path];

  if (!agentKey || method !== 'POST') {
    const metadata = buildExecutionMetadata(traceId);
    sendJSON(res, 404, {
      error: {
        code: 'NOT_FOUND',
        message: `Route not found: ${method} ${path}`,
      },
      execution_metadata: metadata,
      layers_executed: [
        { layer: 'AGENT_ROUTING', status: 'completed' },
      ],
    });
    return;
  }

  const agentInfo = AGENT_MAP[agentKey]!;
  const routeFn = ROUTE_HANDLERS[agentKey]!;
  const metadata = buildExecutionMetadata(traceId);
  const requestId = randomUUID();

  try {
    const body = await readBody(req);
    const agentStart = Date.now();
    const result = await routeFn(body, requestId);
    const agentDuration = Date.now() - agentStart;

    const response = {
      ...(typeof result.data === 'object' && result.data !== null
        ? (result.data as Record<string, unknown>)
        : { data: result.data }),
      execution_metadata: metadata,
      layers_executed: [
        { layer: 'AGENT_ROUTING', status: 'completed' },
        {
          layer: agentInfo.layer,
          status: 'completed',
          duration_ms: agentDuration,
        },
      ],
    };

    sendJSON(res, result.status, response);
  } catch (error) {
    const totalDuration = Date.now() - routeStart;
    sendJSON(res, 500, {
      error: {
        code: 'INTERNAL_ERROR',
        message:
          error instanceof Error ? error.message : 'Agent execution failed',
      },
      execution_metadata: metadata,
      layers_executed: [
        { layer: 'AGENT_ROUTING', status: 'completed' },
        {
          layer: agentInfo.layer,
          status: 'failed',
          duration_ms: totalDuration,
        },
      ],
    });
  }
}
