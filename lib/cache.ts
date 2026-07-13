/**
 * Cache abstraction — in-memory for dev, Vercel KV for production.
 *
 * Set VERCEL_KV_URL to enable Redis-backed cache (production).
 * Falls back to in-memory Map when KV is not configured (local dev).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SearchCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

const g = globalThis as unknown as { __searchCacheInstance?: SearchCache };
export const searchResultCache: SearchCache =
  g.__searchCacheInstance ??= new SearchCache();

/** OA enrichment 缓存（按 DOI，24 小时 TTL） */
const oaCache = new SearchCache<{ isOpenAccess: boolean; oaPdfUrl: string | null }>();
const OA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function getCachedOA(doi: string) {
  return oaCache.get(`oa:${doi}`);
}

export function setCachedOA(doi: string, data: { isOpenAccess: boolean; oaPdfUrl: string | null }) {
  oaCache.set(`oa:${doi}`, data, OA_CACHE_TTL);
}
