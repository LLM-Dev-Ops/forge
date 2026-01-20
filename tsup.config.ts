import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    // Temporarily disabled for v1.0.0 - will be fixed in v1.0.1
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    target: 'node20',
    outDir: 'dist',
    tsconfig: 'tsconfig.json',
    shims: true,
  },
  // CLI build
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    // Temporarily disabled for v1.0.0 - will be fixed in v1.0.1
    dts: false,
    splitting: false,
    sourcemap: true,
    minify: false,
    target: 'node20',
    outDir: 'dist',
    tsconfig: 'tsconfig.json',
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // HTTP Service build (for Cloud Run deployment)
  {
    entry: {
      'service/server': 'src/service/server.ts',
    },
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: true,
    minify: false,
    target: 'node20',
    outDir: 'dist',
    tsconfig: 'tsconfig.json',
    shims: true,
  },
]);
