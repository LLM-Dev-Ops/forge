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

import {
  type PipelineContext,
  type PipelineArtifact,
  createPipelineArtifact,
} from '../types/pipeline-context.js';

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
  artifacts: PipelineArtifact[];
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

async function routeSDK(
  body: string,
  requestId: string,
  pipelineContext?: PipelineContext
): Promise<AgentResult> {
  const startTime = Date.now();
  const context = {
    requestId,
    startTime,
    getRemainingTime: () => 120000 - (Date.now() - startTime),
    emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
    dryRun: false,
    ruvectorEndpoint: process.env.RUVECTOR_SERVICE_URL,
    pipelineContext,
  };
  const response = await sdkGeneratorHandler(body, context);
  const data = JSON.parse(response.body) as Record<string, unknown>;

  // Build typed artifacts from SDK generation output
  const artifacts: PipelineArtifact[] = [];
  if (data.success && data.artifacts) {
    artifacts.push(
      createPipelineArtifact('forge_scaffold', {
        sdk_artifacts: data.artifacts,
        compatibility: data.compatibility,
      })
    );
  }

  return { status: response.statusCode, data, artifacts };
}

async function routeCLI(
  body: string,
  _requestId: string,
  pipelineContext?: PipelineContext
): Promise<AgentResult> {
  const input = JSON.parse(body);
  const result = await cliGeneratorHandler(input, {
    verbose: false,
    pipelineContext,
  });

  // Build typed artifacts from CLI generation output
  const artifacts: PipelineArtifact[] = [];
  if (result.success && result.result) {
    artifacts.push(
      createPipelineArtifact('cli_wrapper', {
        program: result.result.program,
        files: result.result.files,
        framework: result.result.framework,
      })
    );
  }

  return { status: result.success ? 200 : 400, data: result, artifacts };
}

async function routeAPITranslation(
  body: string,
  requestId: string,
  pipelineContext?: PipelineContext
): Promise<AgentResult> {
  const input = JSON.parse(body);
  const translator = new APITranslator({
    emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
  });
  const result = await translator.translate({ ...input, requestId });

  // Build typed artifacts from translation output
  const artifacts: PipelineArtifact[] = [];
  if (result.success && result.result) {
    artifacts.push(
      createPipelineArtifact('api_translation', {
        direction: result.result.direction,
        mappings: result.result.mappings,
        restEndpoints: result.result.restEndpoints,
        sdkMethods: result.result.sdkMethods,
        cliCommands: result.result.cliCommands,
      })
    );
  }

  return { status: result.success ? 200 : 400, data: result, artifacts };
}

async function routeVersionCompat(
  body: string,
  requestId: string,
  pipelineContext?: PipelineContext
): Promise<AgentResult> {
  const input = JSON.parse(body);
  const agent = new VersionCompatibilityAgent({
    emitEvents: process.env.FEATURE_EMIT_EVENTS === 'true',
  });
  const result = await agent.analyze({ ...input, requestId });

  // Build typed artifacts from version compat output
  const artifacts: PipelineArtifact[] = [];
  if (result.success) {
    artifacts.push(
      createPipelineArtifact('version_report', {
        verdict: result.verdict,
        summary: result.summary,
        changes: result.changes,
        versionRecommendation: result.versionRecommendation,
      })
    );
  }

  return { status: result.success ? 200 : 400, data: result, artifacts };
}

type RouteFn = (
  body: string,
  requestId: string,
  pipelineContext?: PipelineContext
) => Promise<AgentResult>;

const ROUTE_HANDLERS: Record<string, RouteFn> = {
  sdk: routeSDK,
  cli: routeCLI,
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

    // Extract pipeline_context from request body (if present)
    let pipelineContext: PipelineContext | undefined;
    try {
      const parsed =
        typeof req.body === 'object' && req.body !== null
          ? (req.body as Record<string, unknown>)
          : JSON.parse(body);
      if (parsed.pipeline_context && typeof parsed.pipeline_context === 'object') {
        pipelineContext = parsed.pipeline_context as PipelineContext;
      }
      // Use trace_id from pipeline context if available
      if (pipelineContext?.execution_metadata?.trace_id) {
        metadata.trace_id = pipelineContext.execution_metadata.trace_id;
      }
    } catch {
      // Body parse failure is handled by the agent route handler
    }

    const agentStart = Date.now();
    const result = await routeFn(body, requestId, pipelineContext);
    const agentDuration = Date.now() - agentStart;

    // Build response: backwards-compatible spread + new envelope fields
    const response = {
      ...(typeof result.data === 'object' && result.data !== null
        ? (result.data as Record<string, unknown>)
        : { data: result.data }),
      // Pipeline envelope fields
      result: result.data,
      artifacts: result.artifacts,
      execution_metadata: {
        ...metadata,
        agent: agentInfo.id,
        domain: 'forge',
        ...(pipelineContext ? { pipeline_context: pipelineContext } : {}),
      },
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
      result: null,
      artifacts: [],
      execution_metadata: {
        ...metadata,
        agent: agentInfo.id,
        domain: 'forge',
      },
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
