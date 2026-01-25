/**
 * Phase 2 - Operational Intelligence: Caching Layer
 *
 * Allowed for:
 * - Historical reads
 * - Lineage lookups
 *
 * TTL: 60-120 seconds
 *
 * @module phase2/cache
 */

import type { SignalEmitter } from './signals.js';

// =============================================================================
// CONSTANTS
// =============================================================================

export const CACHE_CONFIG = {
  MIN_TTL_MS: 60_000, // 60 seconds
  MAX_TTL_MS: 120_000, // 120 seconds
  DEFAULT_TTL_MS: 90_000, // 90 seconds (middle ground)
  MAX_ENTRIES: 1000,
  CLEANUP_INTERVAL_MS: 30_000, // Run cleanup every 30s
} as const;

export type CacheCategory = 'historical_read' | 'lineage_lookup';

// =============================================================================
// TYPES
// =============================================================================

interface CacheEntry<T> {
  key: string;
  value: T;
  category: CacheCategory;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  byCategory: Record<CacheCategory, number>;
}

// =============================================================================
// LRU CACHE
// =============================================================================

/**
 * Phase 2 compliant cache for historical reads and lineage lookups
 *
 * Features:
 * - TTL enforcement (60-120s)
 * - Category-based organization
 * - LRU eviction
 * - Signal emission for cache operations
 */
export class Phase2Cache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;
  private signalEmitter: SignalEmitter | null;

  constructor(signalEmitter?: SignalEmitter) {
    this.signalEmitter = signalEmitter || null;
    this.startCleanup();
  }

  // ---------------------------------------------------------------------------
  // Core Operations
  // ---------------------------------------------------------------------------

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;

    return entry.value;
  }

  /**
   * Set a value in cache with category and optional TTL
   *
   * @param key Cache key
   * @param value Value to cache
   * @param category Must be 'historical_read' or 'lineage_lookup'
   * @param ttlMs TTL in milliseconds (clamped to 60-120s range)
   */
  set(
    key: string,
    value: T,
    category: CacheCategory,
    ttlMs: number = CACHE_CONFIG.DEFAULT_TTL_MS
  ): void {
    // Enforce TTL bounds (60-120s)
    const clampedTtl = Math.max(
      CACHE_CONFIG.MIN_TTL_MS,
      Math.min(CACHE_CONFIG.MAX_TTL_MS, ttlMs)
    );

    const now = Date.now();

    // Evict if at capacity
    if (this.cache.size >= CACHE_CONFIG.MAX_ENTRIES) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      category,
      createdAt: now,
      expiresAt: now + clampedTtl,
      accessCount: 0,
      lastAccessedAt: now,
    };

    this.cache.set(key, entry);

    // Emit lineage signal for cache write
    if (this.signalEmitter) {
      this.signalEmitter.emitMemoryLineage({
        lineageType: 'write',
        sourceKeys: [],
        targetKey: `cache:${category}:${key}`,
        operation: 'cache_set',
        confidence: 1.0,
      });
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Historical Read Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get or fetch a historical read
   * Convenience method for caching historical data
   */
  async getOrFetchHistorical<R>(
    key: string,
    fetcher: () => Promise<R>,
    ttlMs?: number
  ): Promise<R> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached as unknown as R;
    }

    const value = await fetcher();
    this.set(key, value as unknown as T, 'historical_read', ttlMs);

    // Emit lineage signal for read
    if (this.signalEmitter) {
      this.signalEmitter.emitMemoryLineage({
        lineageType: 'read',
        sourceKeys: [`external:${key}`],
        targetKey: `cache:historical_read:${key}`,
        operation: 'historical_fetch',
        confidence: 1.0,
      });
    }

    return value;
  }

  /**
   * Get or fetch a lineage lookup
   * Convenience method for caching lineage data
   */
  async getOrFetchLineage<R>(
    key: string,
    fetcher: () => Promise<R>,
    ttlMs?: number
  ): Promise<R> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached as unknown as R;
    }

    const value = await fetcher();
    this.set(key, value as unknown as T, 'lineage_lookup', ttlMs);

    // Emit lineage signal
    if (this.signalEmitter) {
      this.signalEmitter.emitMemoryLineage({
        lineageType: 'read',
        sourceKeys: [`ruvector:lineage:${key}`],
        targetKey: `cache:lineage_lookup:${key}`,
        operation: 'lineage_fetch',
        confidence: 1.0,
      });
    }

    return value;
  }

  // ---------------------------------------------------------------------------
  // Eviction & Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    this.cache.forEach((entry, key) => {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    });

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        toDelete.push(key);
      }
    });

    for (const key of toDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CACHE_CONFIG.CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    this.cleanupInterval.unref();
  }

  /**
   * Stop periodic cleanup (for shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const byCategory: Record<CacheCategory, number> = {
      historical_read: 0,
      lineage_lookup: 0,
    };

    this.cache.forEach((entry) => {
      byCategory[entry.category]++;
    });

    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      entries: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: Math.round(hitRate * 10000) / 100, // percentage with 2 decimals
      byCategory,
    };
  }

  /**
   * Get entries by category
   */
  getByCategory(category: CacheCategory): Array<{ key: string; value: T }> {
    const results: Array<{ key: string; value: T }> = [];
    const now = Date.now();

    this.cache.forEach((entry) => {
      if (entry.category === category && now <= entry.expiresAt) {
        results.push({ key: entry.key, value: entry.value });
      }
    });

    return results;
  }
}

// =============================================================================
// GLOBAL INSTANCE
// =============================================================================

let globalCache: Phase2Cache | null = null;

/**
 * Initialize global Phase 2 cache
 */
export function initCache(signalEmitter?: SignalEmitter): Phase2Cache {
  globalCache = new Phase2Cache(signalEmitter);
  return globalCache;
}

/**
 * Get global cache instance
 */
export function getCache(): Phase2Cache | null {
  return globalCache;
}
