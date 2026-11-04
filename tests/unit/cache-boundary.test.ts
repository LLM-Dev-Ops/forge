import { afterEach, describe, expect, it } from 'vitest';

import { CACHE_CONFIG, Phase2Cache } from '../../src/phase2/cache.js';

describe('Phase2 cache capacity and category boundaries', () => {
  const caches: Phase2Cache[] = [];
  const make = (): Phase2Cache => {
    const cache = new Phase2Cache();
    caches.push(cache);
    return cache;
  };
  const fill = (cache: Phase2Cache): void => {
    for (let i = 0; i < CACHE_CONFIG.MAX_ENTRIES; i++) {
      cache.set(`key${i}`, i, 'historical_read');
    }
  };
  afterEach(() => {
    for (const cache of caches) cache.stopCleanup();
    caches.length = 0;
  });
  it('evicts an empty-string least-recently-used key', () => {
    const cache = make();
    cache.set('', 'oldest', 'historical_read');
    for (let i = 1; i < CACHE_CONFIG.MAX_ENTRIES; i++) cache.set(`key${i}`, i, 'historical_read');
    cache.set('overflow', 1, 'historical_read');
    expect(cache.has('')).toBe(false);
  });
  it('keeps capacity bounded after repeated overflow writes', () => {
    const cache = make();
    cache.set('', 'oldest', 'historical_read');
    fill(cache);
    cache.set('overflow', 1, 'historical_read');
    expect(cache.getStats().entries).toBe(CACHE_CONFIG.MAX_ENTRIES);
  });
  it('does not evict an unrelated entry when replacing a full-cache key', () => {
    const cache = make();
    fill(cache);
    cache.set(`key${CACHE_CONFIG.MAX_ENTRIES - 1}`, 'updated', 'historical_read');
    expect(cache.has('key0')).toBe(true);
  });
  it('does not shrink capacity when replacing an existing key', () => {
    const cache = make();
    fill(cache);
    cache.set(`key${CACHE_CONFIG.MAX_ENTRIES - 1}`, 'updated', 'historical_read');
    expect(cache.getStats().entries).toBe(CACHE_CONFIG.MAX_ENTRIES);
  });
  it('does not reuse lineage data as a historical read', async () => {
    const cache = make();
    cache.set('same', 'wrong-category', 'lineage_lookup');
    expect(await cache.getOrFetchHistorical('same', async () => 'history')).toBe('history');
  });
  it('does not reuse historical data as a lineage lookup', async () => {
    const cache = make();
    cache.set('same', 'wrong-category', 'historical_read');
    expect(await cache.getOrFetchLineage('same', async () => 'lineage')).toBe('lineage');
  });
});
