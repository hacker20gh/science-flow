/**
 * Zotero Web API v3 客户端
 *
 * 直接调用 Zotero REST API，不引入额外依赖。
 * 认证方式：Zotero-API-Key header
 *
 * API 文档：https://www.zotero.org/support/dev/web_api/v3
 */

const ZOTERO_API_BASE = "https://api.zotero.org";

// Cache Zotero user IDs — they don't change for a given API key
const userIdCache = new Map<string, number>();

interface ZoteroCreator {
  creatorType: string;
  firstName?: string;
  lastName?: string;
  name?: string; // 单名作者
}

interface ZoteroItemData {
  key: string;
  version: number;
  itemType: string;
  title: string;
  creators: ZoteroCreator[];
  publicationTitle?: string;
  date?: string;
  DOI?: string;
  abstractNote?: string;
  url?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  ISSN?: string;
  tags?: Array<{ tag: string }>;
}

interface ZoteroItem {
  key: string;
  version: number;
  data: ZoteroItemData;
  meta: {
    numChildren?: number;
    itemType?: string;
  };
}

export interface ZoteroPaper {
  zoteroKey: string;
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  oaUrl?: string;
}

export interface ZoteroCollection {
  key: string;
  name: string;
  parentCollection?: string; // 父库 key，顶级库为空
  numItems: number;
}

/**
 * 获取 Zotero API Key 对应的用户 ID（带缓存）
 * 调用 /keys/current 端点
 */
export async function getZoteroUserId(apiKey: string): Promise<number> {
  if (userIdCache.has(apiKey)) return userIdCache.get(apiKey)!;
  const resp = await fetch(`${ZOTERO_API_BASE}/keys/current`, {
    headers: { "Zotero-API-Key": apiKey },
  });
  if (!resp.ok) throw new Error(`Zotero API key 无效 (${resp.status})`);
  const data = await resp.json();
  userIdCache.set(apiKey, data.userID);
  return data.userID;
}

/**
 * 获取用户的 Zotero 文献库（支持按 Collection 过滤）
 */
export async function getLibraryItems(
  apiKey: string,
  options?: { limit?: number; start?: number; q?: string; collectionKey?: string }
): Promise<{ items: ZoteroPaper[]; total: number }> {
  const userId = await getZoteroUserId(apiKey);
  const limit = options?.limit || 25;
  const start = options?.start || 0;

  // 根据是否指定了 collection 构建不同的 URL
  const basePath = options?.collectionKey
    ? `${ZOTERO_API_BASE}/users/${userId}/collections/${options.collectionKey}/items`
    : `${ZOTERO_API_BASE}/users/${userId}/items`;

  let url = `${basePath}?limit=${limit}&start=${start}&sort=date&direction=desc&itemType=-attachment%20%7C%7C%20note`;
  if (options?.q) {
    url += `&q=${encodeURIComponent(options.q)}`;
  }

  const resp = await fetch(url, {
    headers: { "Zotero-API-Key": apiKey },
  });
  if (!resp.ok) throw new Error(`Zotero API 错误 (${resp.status})`);

  const total = parseInt(resp.headers.get("Total-Results") || "0", 10);
  const items: ZoteroItem[] = await resp.json();

  return {
    items: items
      .filter((item) => item.data.itemType !== "attachment" && item.data.itemType !== "note")
      .map(mapZoteroItem),
    total,
  };
}

/**
 * 获取用户的 Zotero Collections（文献库/文件夹）
 */
export async function getCollections(apiKey: string): Promise<ZoteroCollection[]> {
  const userId = await getZoteroUserId(apiKey);
  const resp = await fetch(
    `${ZOTERO_API_BASE}/users/${userId}/collections?limit=100&sort=title`,
    { headers: { "Zotero-API-Key": apiKey } }
  );
  if (!resp.ok) throw new Error(`Zotero API 错误 (${resp.status})`);

  const collections: Array<{ key: string; data: { name: string; parentCollection?: string; numItems?: number } }> =
    await resp.json();

  return collections.map((c) => ({
    key: c.key,
    name: c.data.name,
    parentCollection: c.data.parentCollection || undefined,
    numItems: c.data.numItems || 0,
  }));
}

/**
 * 搜索用户的 Zotero 文献库
 */
export async function searchLibrary(
  apiKey: string,
  query: string,
  limit: number = 25
): Promise<{ items: ZoteroPaper[]; total: number }> {
  return getLibraryItems(apiKey, { limit, q: query });
}

/**
 * Zotero Item → SciFlow Paper 格式映射
 */
function mapZoteroItem(item: ZoteroItem): ZoteroPaper {
  const d = item.data;
  return {
    zoteroKey: d.key,
    title: d.title,
    authors: d.creators.map((c) => {
      if (c.name) return c.name; // 单名作者（如机构）
      return [c.lastName, c.firstName].filter(Boolean).join(", ");
    }),
    journal: d.publicationTitle || undefined,
    year: extractYear(d.date),
    doi: d.DOI || undefined,
    abstract: d.abstractNote || undefined,
    oaUrl: d.url || undefined,
  };
}

/**
 * 从日期字符串中提取年份
 * Zotero 日期格式多样："2024", "2024-07-17", "July 2024", "2024/01/15" 等
 */
function extractYear(date?: string): number | undefined {
  if (!date) return undefined;
  const match = date.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : undefined;
}
