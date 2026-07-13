/**
 * Simple in-memory cache with lazy expiration (TTL on read).
 *
 * TODO: Replace with Vercel KV or Redis for production.
 * In-memory cache only works in local dev — each Vercel serverless
 * cold start starts with an empty store.
 *
 * The interface (get/set/delete/clear) is intentionally minimal so
 * swapping to a KV-backed implementation later is a drop-in change.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// HMR-safe singleton: reuse across hot-reloads in dev
const globalStore = globalThis as unknown as {
  __searchCacheInstance?: SearchCache;
};

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
}

/** Shared search-result cache instance (30 min TTL used by callers). */
export const searchResultCache: SearchCache<unknown> =
  globalStore.__searchCacheInstance ??= new SearchCache();
