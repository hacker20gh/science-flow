/**
 * API 数据预取 + 内存缓存
 *
 * 用法：
 *   import { cachedFetch, prefetchProjectData } from "@/lib/api-cache";
 *
 *   // 页面中使用（替代 fetch）
 *   const data = await cachedFetch(`/api/projects/${id}/timeline`);
 *
 *   // 侧边栏中预取（hover 时调用）
 *   prefetchProjectData(projectId);
 */

// 内存缓存（页面刷新后清空）
const cache = new Map<string, { data: unknown; timestamp: number }>();
const STALE_MS = 60_000; // 60 秒内视为新鲜

/**
 * 带缓存的 fetch。相同 URL 在 STALE_MS 内直接返回缓存。
 * stale 后仍返回旧数据，同时在后台刷新。
 */
export async function cachedFetch<T = unknown>(url: string): Promise<T> {
  const cached = cache.get(url);
  const now = Date.now();

  // 缓存命中且未过期
  if (cached && now - cached.timestamp < STALE_MS) {
    return cached.data as T;
  }

  // 缓存过期：先返回旧数据，后台刷新
  if (cached) {
    // fire-and-forget 后台刷新
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) cache.set(url, { data, timestamp: Date.now() });
      })
      .catch(() => {});
    return cached.data as T;
  }

  // 无缓存：正常 fetch
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const data = await res.json();
  cache.set(url, { data, timestamp: now });
  return data as T;
}

/**
 * 预取项目的核心数据。在侧边栏 hover 时调用。
 * fire-and-forget，不返回值。
 */
export function prefetchProjectData(projectId: string): void {
  const urls = [
    `/api/projects/${projectId}/timeline?pageSize=50`,
    `/api/projects/${projectId}/papers`,
    `/api/projects/${projectId}/experiments`,
    `/api/projects/${projectId}/extractions?take=100`,
    `/api/projects/${projectId}/hypotheses`,
    `/api/projects/${projectId}`,
  ];

  for (const url of urls) {
    if (!cache.has(url)) {
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) cache.set(url, { data, timestamp: Date.now() });
        })
        .catch(() => {});
    }
  }
}

/**
 * 清除指定项目的所有缓存（数据变更后调用）
 */
export function invalidateProjectCache(projectId: string): void {
  const prefix = `/api/projects/${projectId}`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
