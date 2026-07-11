# SciFlow AI 模块优化设计

> 速度 + 质量双提升，只改 SciFlow 端代码

## 背景

SciFlow AI 模块当前存在 4 个系统性问题：
1. **响应慢** — 对话、提取、生成都是阻塞式，用户干等
2. **幻觉/不准确** — 提取结果缺乏原文验证，AI 会编造数据
3. **内容太浅** — prompt 冗余但信息密度低，上下文不足
4. **格式错误** — 从文本提取 JSON 的方式失败率高

约束：只改 SciFlow 端代码（prompt、缓存、并行、上下文），不动 CCS 网关和模型配置。

---

## 1. 结构化输出升级

**目标**：JSON 解析失败率从 ~15% 降到 <2%

### 现状

`lib/llm/json-extractor.ts` 采用三级回退：
1. 检查 `tool_use` block
2. 从文本中正则提取 JSON（代码块 → 花括号匹配 → 原始文本）
3. 重试，附带 schema 示例

实际运行中，大部分模型走的是 Tier 2（文本提取），失败率高。

### 改为

强制使用 Anthropic 原生 `tool_use` 模式：

```
每个 LLM 模块定义 *_TOOL 常量（描述 + JSON Schema）
→ 调用时传 tools=[*_TOOL], tool_choice={ type: "tool", name: "..." }
→ 模型必须通过 tool_use 返回结构化数据
→ 直接从 tool_use block.input 提取，跳过文本正则
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `lib/llm/json-extractor.ts` | 重写 `extractStructuredOutput()`，tool_use 优先，文本回退为辅 |
| `lib/llm/extraction.ts` | 完善 `EXTRACTION_TOOL` 定义，调用时启用 `tool_choice` |
| `lib/llm/manuscript.ts` | 新增 `MANUSCRIPT_TOOL`，替换文本提取 |
| `lib/llm/reviewer.ts` | 新增 `REVIEW_TOOL`，替换文本提取 |
| `lib/llm/experiment-design.ts` | 新增 `DESIGN_TOOL`，替换文本提取 |
| `lib/llm/analysis.ts` | 新增 `ANALYSIS_TOOL`，替换文本提取 |
| `lib/llm/troubleshoot.ts` | 新增 `TROUBLESHOOT_TOOL`，替换文本提取 |

### 注意事项

- `tool_choice` 强制模式会增加 ~200ms 延迟（tool schema 传入），但省去了重试的 3-10s
- 如果模型不支持 `tool_choice`（非 Claude 模型），回退到当前逻辑
- 需要在 `client.ts` 中检测模型能力，动态决定是否启用强制模式

---

## 2. Prompt 优化

**目标**：prompt tokens 减 40%，幻觉率降低，输出更精准

### 2a. 精简 system prompt

当前每个模块的 system prompt 包含：
- 角色描述（冗长）
- 行为规则（重复）
- 完整 JSON 结构模板（~500 tokens）

改为：
- 角色描述压缩为一句话
- 行为规则合并去重
- JSON 结构交给 tool_use 的 tool description，不在 prompt 中重复

### 2b. 加 few-shot 示例

每个模块在 system prompt 中加 1 个精简的好例子（~200 tokens）：

| 模块 | 示例内容 |
|------|----------|
| extraction | 一段论文摘要 → 期望的提取结果 |
| experiment-design | 一个假设 → 期望的实验方案 |
| troubleshoot | 一个失败场景 → 期望的诊断 |
| analysis | 一组数据 → 期望的统计结果 |
| manuscript | 不需要（tool schema 足够） |
| reviewer | 不需要（tool schema 足够） |

### 2c. 防幻觉硬约束

在 extraction prompt 中新增：

```
HARD RULES:
- 每个字段必须有 evidence_quote（原文片段）
- 找不到原文支撑的字段设为 null，绝不猜测
- 浓度/剂量必须有单位
- 统计方法必须是原文明确提到的
- 样本量不确定时设为 null
```

在 reviewer prompt 中新增：

```
- 指出问题时必须引用具体段落或句子
- 不要给出泛泛的建议，要具体到可操作
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `lib/llm/extraction.ts` | 精简 system prompt + 加 few-shot + 防幻觉规则 |
| `lib/llm/manuscript.ts` | 精简 system prompt |
| `lib/llm/reviewer.ts` | 精简 system prompt + 引用规则 |
| `lib/llm/experiment-design.ts` | 精简 + few-shot |
| `lib/llm/analysis.ts` | 精简 + few-shot |
| `lib/llm/troubleshoot.ts` | 精简 + few-shot |
| `lib/llm/query-preprocessor.ts` | 精简 |

---

## 3. 流式 + 并行加速

**目标**：用户感知等待时间减少 60%+，批量提取提速 40%

### 3a. 阻塞 API 改真流式

当前只有 `/api/manuscript` 和 `/api/manuscript/review` 用了 SSE，但只是阻塞完成后一次性 emit。

改为 token 级流式：

```ts
// 现在
const result = await generateExtraction(data);
emit({ type: "result", data: result });

// 改为
const stream = await client.messages.create({ ...params, stream: true });
for await (const event of stream) {
  if (event.type === "content_block_delta") {
    emit({ type: "text", content: event.delta.text });
  }
}
// 流结束后，从累积的完整文本中提取结构化数据
const result = extractStructuredOutput(fullText, schema);
emit({ type: "result", data: result });
```

涉及 API：

| API | 现在 | 改为 |
|-----|------|------|
| `/api/papers/extract` | 阻塞 | 流式 + 进度（"正在提取第 3/10 篇..."） |
| `/api/experiments/design` | 阻塞 | 流式 |
| `/api/experiments/troubleshoot` | 阻塞 | 流式 |
| `/api/analysis` | 阻塞 | 流式 |
| `/api/manuscript` | 伪流式 | 真流式（逐 section） |
| `/api/manuscript/review` | 伪流式 | 真流式（逐 reviewer） |

### 3b. 批量提取并行度 3→5

```ts
// lib/llm/extraction.ts
const CONCURRENCY = 3; // → 5
```

### 3c. 通用流式进度组件

新增 `components/ui/streaming-progress.tsx`：

```tsx
interface StreamingProgressProps {
  text: string;         // 实时 token 输出
  step?: string;        // 当前步骤描述
  current?: number;     // 当前进度
  total?: number;       // 总数
  onCancel?: () => void; // 取消回调
}
```

所有 AI 功能复用此组件，替换现有的 spinner + 静态文字。

### 改动文件

| 文件 | 改动 |
|------|------|
| `app/api/papers/extract/route.ts` | 改 SSE 流式 |
| `app/api/experiments/design/route.ts` | 改 SSE 流式 |
| `app/api/experiments/troubleshoot/route.ts` | 改 SSE 流式 |
| `app/api/analysis/route.ts` | 改 SSE 流式 |
| `app/api/manuscript/route.ts` | 改真流式 |
| `app/api/manuscript/review/route.ts` | 改真流式 |
| `lib/llm/extraction.ts` | CONCURRENCY 3→5 |
| `lib/llm/streaming.ts` | 增加 `streamLLMWithToolUse()` 工具函数 |
| `components/ui/streaming-progress.tsx` | 新增通用组件 |
| 各功能前端页面 | 接入 `StreamingProgress` |

---

## 4. 上下文构建增强

**目标**：AI 建议更相关、更个性化

### 4a. 上下文预算 4000→8000 token

`lib/llm/context-builder.ts` 中 `buildRichContext()` 扩展：

| 信息类型 | 现在 | 改为 |
|----------|------|------|
| 项目名+假设 | ✅ | ✅ |
| 最近提取 | 5 条 | 10 条 |
| 实验 | 5 条 | 10 条 |
| 矛盾检测 | ✅ | ✅ |
| 时间线 | 5 条 | 10 条 |
| 失败实验记录 | ❌ | ✅ 最近 3 条 |
| 未解决问题 | ❌ | ✅ 从 matrix gaps 推断 |
| 研究方向 | ❌ | ✅ 从假设推断 |

### 4b. 上下文缓存

```ts
const contextCache = new Map<string, { data: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export async function buildRichContext(projectId: string): Promise<string> {
  const cached = contextCache.get(projectId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }
  // ... 原有逻辑
  contextCache.set(projectId, { data: context, ts: Date.now() });
  return context;
}

// 写操作时失效
export function invalidateContextCache(projectId: string) {
  contextCache.delete(projectId);
}
```

### 4c. 提取上下文增强

提取时，将项目中已有的提取结果作为"参考格式"传入 prompt：

```
以下是该项目中其他论文的提取结果示例，请保持一致的格式和粒度：
[最近 2 条提取结果的 JSON]
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `lib/llm/context-builder.ts` | 扩展信息类型 + 缓存 |
| `lib/llm/extraction.ts` | prompt 加参考格式 |
| `app/api/chat/route.ts` | 调用 `invalidateContextCache()` 的写操作 |

---

## 5. 缓存策略

**目标**：重复操作从 10s → <100ms

### 5a. 提取结果缓存

文献提取是目前最慢的操作之一。提取结果已存在 DB 的 `Extraction` 表中。

```ts
// app/api/papers/extract/route.ts
// 提取前检查
const existing = await prisma.extraction.findMany({
  where: { paperId: paper.id }
});
if (existing.length > 0 && !forceReExtract) {
  return { paperId: paper.id, cached: true, extractions: existing };
}
```

前端在"提取"按钮旁加"强制重新提取"选项。

### 5b. 搜索缓存增强

```ts
// app/api/papers/search/route.ts
// 现在：5 分钟内存缓存
// 改为：30 分钟 + DB 持久化

const SEARCH_CACHE_TTL = 30 * 60 * 1000;

// 命中内存缓存 → 直接返回
// 未命中 → 查 SearchHistory 表（已有 resultSnapshot 字段）
// DB 也没有 → 调 API，结果同时存内存 + DB
```

### 5c. LLM 响应缓存（可选）

对相同 input 缓存 LLM 响应：

```ts
import { createHash } from "crypto";

const llmCache = new Map<string, { data: any; ts: number }>();
const LLM_CACHE_TTL = 24 * 60 * 60 * 1000;

function getCacheKey(systemPrompt: string, userMessage: string): string {
  return createHash("sha256")
    .update(systemPrompt + userMessage)
    .digest("hex")
    .slice(0, 16);
}
```

主要用于：同一 PDF 重复上传、同一论文重复提取的场景。

### 改动文件

| 文件 | 改动 |
|------|------|
| `app/api/papers/extract/route.ts` | 提取前查 DB 缓存 |
| `app/api/papers/search/route.ts` | 搜索缓存 5min→30min + DB |
| `lib/llm/client.ts` | 新增 LLM 响应缓存层（可选） |
| `app/(dashboard)/project/[projectId]/papers/page.tsx` | 加"强制重新提取"按钮 |

---

## 预期效果总结

| 指标 | 现在 | 优化后 |
|------|------|--------|
| JSON 解析失败率 | ~15% | <2% |
| prompt tokens | ~2000/次 | ~1200/次 |
| 用户感知等待（提取 10 篇） | ~60s 阻塞 | 流式进度 + ~35s |
| 对话首次响应 | ~3s | ~1s（缓存命中） |
| 重复搜索 | ~5s | <100ms |
| 重复提取 | ~10s/篇 | <100ms |
| 幻觉率 | 未量化 | 预计降 50%+ |

---

## 实施顺序

1. **结构化输出升级**（影响所有模块，基础性改动）
2. **Prompt 优化**（与第 1 步同步做，改同一组文件）
3. **缓存策略**（独立改动，风险低）
4. **流式 + 并行**（改动较大，需要前后端同步）
5. **上下文增强**（增量改动，可随时插入）

建议 1+2 一起做，3 独立做，4 最后做。
