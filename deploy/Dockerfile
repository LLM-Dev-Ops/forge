# LLM-Forge Unified Service
# Multi-agent code generation, translation, and compatibility service
#
# ARCHITECTURE NOTES:
# - All agents run in ONE unified service
# - Stateless execution (no local state)
# - Persistence via ruvector-service only (no direct SQL)
# - Deterministic outputs for reproducibility

FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies (including git for GitHub-based npm dependencies)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY tsup.config.ts ./

# Install dependencies
RUN npm ci --include=dev

# Copy source code
COPY src/ ./src/
COPY templates/ ./templates/
COPY schemas/ ./schemas/

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# =============================================================================
# PRODUCTION IMAGE
# =============================================================================
FROM node:20-slim AS production

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r llmforge && useradd -r -g llmforge llmforge

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/schemas ./schemas

# Set ownership
RUN chown -R llmforge:llmforge /app

# Switch to non-root user
USER llmforge

# Environment variables (defaults - override in deployment)
ENV NODE_ENV=production
ENV PORT=8080
ENV SERVICE_NAME=llm-forge
ENV LOG_LEVEL=info

# Phase 2 - Operational Intelligence (Layer 1)
# RUVECTOR_SERVICE_URL and RUVECTOR_API_KEY must be provided at runtime
ENV AGENT_PHASE=phase2
ENV AGENT_LAYER=layer1

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + process.env.PORT + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 8080

# Start the service
CMD ["node", "dist/service/server.js"]
