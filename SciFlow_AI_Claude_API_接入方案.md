# SciFlow AI — LLM 接入方案（CCS 网关版）

> **日期**：2026-07-10
> **技术栈**：Next.js 15 (TypeScript) + CCS 代理网关
> **架构**：SciFlow AI → CCS（ccswitch）→ Claude / DeepSeek / GPT / Qwen 等

---

## 一、架构总览

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────────┐
│   SciFlow AI     │     │    CCS 代理    │     │     模型供应商         │
│   (Next.js)      │ ──→ │   (ccswitch)  │ ──→ │                      │
│                  │     │              │     │  Claude Sonnet 5      │
│  只调一个地址      │     │  管模型映射    │     │  Claude Opus 4.8      │
│  只用一个 Key     │     │  管 Key 轮转   │     │  DeepSeek V3 / R1    │
│  OpenAI 兼容格式  │     │  管限流降级    │     │  GPT-4o              │
│                  │     │              │     │  通义千问 / GLM        │
└─────────────────┘     └──────────────┘     └──────────────────────┘
```

**核心思路**：SciFlow AI 不直接对接任何模型供应商，只对接 CCS。CCS 对外暴露 **OpenAI 兼容格式**的接口。你在 CCS 里配好模型映射，SciFlow AI 这边只改 `.env` 就行，代码零改动。

### 好处

| 好处 | 说明 |
|------|------|
| **一个 endpoint 搞定** | SciFlow AI 只需配 `CCS_BASE_URL` + `CCS_API_KEY` |
| **换模型零代码改动** | 在 CCS 里改映射，SciFlow AI 完全无感 |
| **Key 集中管理** | 所有供应商的 API Key 存在 CCS，不暴露给 SciFlow AI |
| **降级容灾** | CCS 可配 fallback：Claude 限流自动切 DeepSeek |
| **统一日志** | 所有 LLM 调用在 CCS 一个地方看日志和用量 |

---

## 二、CCS 配置

在 CCS 里为 SciFlow AI 配置模型映射。你可以根据需要选择不同策略：

### 策略 A：统一模型（最简单）

```
# CCS 配置
sciflow → claude-sonnet-5    # 所有请求都走这一个模型
```

### 策略 B：按用途分模型（推荐）

```
# CCS 配置
sciflow-extraction → deepseek-chat          # 文献提取：便宜快速
sciflow-chat       → claude-sonnet-5        # AI 对话：质量平衡
sciflow-analysis   → claude-opus-4-8        # 深度分析：最强推理
```

### 策略 C：带降级的分模型

```
# CCS 配置（fallback）
sciflow-chat → claude-sonnet-5     # 首选
             → deepseek-chat       # Claude 不可用时降级
```

---

## 三、安装与初始化

### 安装依赖

```bash
npm install openai zod
```

> 只需要 `openai` SDK，因为它兼容所有 OpenAI 格式的 API（包括 CCS）。

### 环境变量

```env
# .env.local
CCS_BASE_URL=http://localhost:你的CCS端口/v1
CCS_API_KEY=你的CCS密钥
```

### 客户端初始化

```typescript
// lib/llm/client.ts
import OpenAI from "openai";

// 单例模式，复用连接
let client: OpenAI | null = null;

export function getLLMClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.CCS_BASE_URL,
      apiKey: process.env.CCS_API_KEY,
    });
  }
  return client;
}

// 模型名常量（对应 CCS 里配的映射名）
export const MODELS = {
  extraction: process.env.CCS_MODEL_EXTRACTION || "sciflow-extraction",
  chat: process.env.CCS_MODEL_CHAT || "sciflow-chat",
  analysis: process.env.CCS_MODEL_ANALYSIS || "sciflow-analysis",
} as const;
```

---

## 四、场景 1：文献信息提取（结构化 JSON）

### 核心提取函数

```typescript
// lib/llm/extraction.ts
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getLLMClient, MODELS } from "./client";

// Zod Schema 定义输出格式
const ExtractionSchema = z.object({
  findings: z.array(z.object({
    drug_intervention: z.object({
      name: z.string().describe("Drug or intervention name"),
      concentration: z.string().nullable().describe("Concentration, e.g. '2 μM'"),
      duration: z.string().nullable().describe("Treatment duration, e.g. '24h'"),
    }),
    model_system: z.object({
      cell_line: z.string().nullable().describe("Cell line, e.g. 'Huh7'"),
      species: z.string().nullable().describe("Species, e.g. 'Human'"),
    }),
    pathway_changes: z.array(z.object({
      pathway: z.string().describe("Pathway name, e.g. 'NF-κB'"),
      direction: z.enum(["up", "down", "no_change"]),
      significance: z.string().nullable().describe("p-value, e.g. 'p<0.05'"),
      method: z.string().nullable().describe("Detection method, e.g. 'Western blot'"),
    })),
    phenotype_changes: z.array(z.object({
      phenotype: z.string().describe("Phenotype, e.g. 'Apoptosis'"),
      direction: z.enum(["up", "down", "no_change"]),
      significance: z.string().nullable(),
    })),
    key_conclusion: z.string().describe("One-sentence summary"),
    evidence_quote: z.string().describe("Exact quote from the paper"),
  })),
});

const EXTRACTION_SYSTEM_PROMPT = `You are a biomedical literature analysis expert.
Extract structured experimental findings from the paper.

Rules:
- Only extract findings explicitly stated in the paper
- If information is not available, use null
- For each finding, include the exact quote as evidence
- Do NOT infer or hallucinate findings not in the text
- Extract each experiment separately

Return valid JSON matching the schema.`;

// 单篇论文提取
export async function extractPaperInfo(paperText: string, paperTitle: string) {
  const client = getLLMClient();

  const response = await client.beta.chat.completions.parse({
    model: MODELS.extraction,
    max_tokens: 4096,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extract all experimental findings from this paper:\n\nTitle: ${paperTitle}\n\n${paperText}`,
      },
    ],
    response_format: zodResponseFormat(ExtractionSchema, "extraction"),
  });

  return response.choices[0].message.parsed;
}
```

### 批量提取（并发控制）

```typescript
// lib/llm/batch-extract.ts
import { extractPaperInfo } from "./extraction";

export async function batchExtractPapers(
  papers: Array<{ title: string; text: string }>,
  concurrency = 3  // 并发数，避免打爆 CCS
) {
  const results: Array<{ title: string; findings: any } | null> = [];
  const queue = [...papers];

  async function worker() {
    while (queue.length > 0) {
      const paper = queue.shift()!;
      try {
        const findings = await extractPaperInfo(paper.text, paper.title);
        results.push({ title: paper.title, findings });
      } catch (error) {
        console.error(`Failed to extract: ${paper.title}`, error);
        results.push(null);
      }
    }
  }

  // 启动 N 个并发 worker
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.filter(Boolean);
}
```

---

## 五、场景 2：AI 助手对话（SSE 流式输出）

### Next.js API Route

```typescript
// app/api/chat/route.ts
import { getLLMClient, MODELS } from "@/lib/llm/client";
import { buildSystemPrompt } from "@/lib/llm/prompts/chat";

export async function POST(req: Request) {
  const { message, projectContext, history } = await req.json();
  const client = getLLMClient();

  const systemPrompt = buildSystemPrompt(projectContext);

  // 创建流式响应
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const completion = await client.chat.completions.create({
          model: MODELS.chat,
          max_tokens: 4096,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message },
          ],
        });

        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`)
            );
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
      } catch (error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "AI 服务暂时不可用" })}\n\n`)
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

### System Prompt 设计

```typescript
// lib/llm/prompts/chat.ts
export function buildSystemPrompt(project: {
  name: string;
  papers: Array<{ title: string; keyFindings: string }>;
  experiments: Array<{ name: string; status: string; result?: string }>;
  currentHypothesis?: string;
  mechanismMatrix: string;
}) {
  return `You are SciFlow AI, a scientific research assistant embedded in the user's research project.

## Current Project: ${project.name}

## Current Hypothesis
${project.currentHypothesis || "No hypothesis stated yet"}

## Mechanism Matrix Summary
${project.mechanismMatrix}

## Literature (${project.papers.length} papers)
${project.papers.map(p => `- ${p.title}: ${p.keyFindings}`).join("\n")}

## Experiments
${project.experiments.map(e =>
  `- ${e.name} [${e.status}]${e.result ? `: ${e.result}` : ""}`
).join("\n")}

## Your Role
- Answer questions about the user's research with specific references to their papers and experiments
- When asked about contradictions, analyze the mechanism matrix and suggest possible explanations
- When asked to design experiments, reference the current hypothesis and existing data
- When asked to write, produce academic English with proper citations
- Be concise but precise. Use scientific terminology appropriately.
- When uncertain, say so — never hallucinate findings or citations.
- Respond in the same language the user uses (Chinese or English).`;
}
```

### 前端流式接收

```typescript
// components/chat/chat-panel.tsx
"use client";

import { useState, useRef } from "react";

export function ChatPanel({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function sendMessage(text: string) {
    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          projectId,
          history: messages,
        }),
        signal: abortController.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.type === "text") {
            assistantText += data.text;
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                last.content = assistantText;
              } else {
                updated.push({ role: "assistant", content: assistantText });
              }
              return [...updated];
            });
          } else if (data.type === "error") {
            assistantText += `\n\n⚠️ ${data.message}`;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Chat error:", err);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block p-3 rounded-lg max-w-[80%] ${
              msg.role === "user"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-900"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t flex gap-2">
        <input
          className="flex-1 p-2 border rounded"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !isStreaming) {
              sendMessage(e.currentTarget.value);
              e.currentTarget.value = "";
            }
          }}
          placeholder="Ask about your research..."
          disabled={isStreaming}
        />
        {isStreaming && (
          <button onClick={stopStreaming} className="px-3 py-2 bg-red-500 text-white rounded">
            停止
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## 六、场景 3：深度分析（矛盾解释、排障诊断）

```typescript
// lib/llm/analysis.ts
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getLLMClient, MODELS } from "./client";

const ConflictAnalysisSchema = z.object({
  possible_explanations: z.array(z.object({
    factor: z.string().describe("The differing factor, e.g. 'concentration'"),
    explanation: z.string().describe("How this factor could explain the contradiction"),
    evidence_strength: z.enum(["strong", "moderate", "weak"]),
    supporting_papers: z.array(z.string()),
  })),
  recommended_experiment: z.object({
    description: z.string().describe("Experiment to resolve the contradiction"),
    variables: z.array(z.string()),
    expected_outcomes: z.array(z.string()),
  }),
  confidence: z.number().min(0).max(1),
});

export async function analyzeContradiction(params: {
  finding1: { paper: string; result: string; conditions: string };
  finding2: { paper: string; result: string; conditions: string };
  mechanismMatrix: string;
}) {
  const client = getLLMClient();

  const response = await client.beta.chat.completions.parse({
    model: MODELS.analysis,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are an expert biomedical researcher analyzing contradictory findings.
Your goal is to identify the most likely explanations and recommend experiments to resolve the conflict.
Base your analysis on the provided mechanism matrix and known biological mechanisms.`,
      },
      {
        role: "user",
        content: `## Contradictory Findings

**Finding 1** (${params.finding1.paper}):
- Result: ${params.finding1.result}
- Conditions: ${params.finding1.conditions}

**Finding 2** (${params.finding2.paper}):
- Result: ${params.finding2.result}
- Conditions: ${params.finding2.conditions}

## Mechanism Matrix Context
${params.mechanismMatrix}

Analyze the possible explanations for this contradiction and recommend an experiment to resolve it.`,
      },
    ],
    response_format: zodResponseFormat(ConflictAnalysisSchema, "conflict_analysis"),
  });

  return response.choices[0].message.parsed;
}
```

---

## 七、过程助手（Process Assistant）

过程助手需要在用户操作的关键节点自动弹出指导。通过一个统一的 API 端点实现：

```typescript
// app/api/process-assistant/route.ts
import { getLLMClient, MODELS } from "@/lib/llm/client";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const AssistantResponseSchema = z.object({
  should_show: z.boolean().describe("Whether to show the assistant card"),
  title: z.string().describe("Card title, e.g. '⚠️ 样本量提醒'"),
  message: z.string().describe("The advice message in markdown"),
  actions: z.array(z.object({
    label: z.string().describe("Button text, e.g. '自动更新为 n=5'"),
    action: z.string().describe("Action identifier for the frontend"),
    primary: z.boolean().describe("Whether this is the recommended action"),
  })),
  learn_more_slug: z.string().nullable().describe("Knowledge base article slug, if applicable"),
});

export async function POST(req: Request) {
  const { trigger, context } = await req.json();
  const client = getLLMClient();

  const response = await client.beta.chat.completions.parse({
    model: MODELS.extraction,  // 过程助手用便宜模型就够
    max_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `You are SciFlow AI's process assistant. You proactively help researchers design better experiments.

When given a trigger event and project context, determine if you should show advice.
Only show advice when it would genuinely help — don't nag.

Common triggers:
- sample_size_check: User set n < 5 for a biological experiment
- missing_control: Experiment lacks required control groups
- concentration_warning: Concentration exceeds literature safe range
- stat_method_suggest: Recommend appropriate statistical test
- writing_guide: Help structure a paper section

Respond in the same language the user uses.`,
      },
      {
        role: "user",
        content: `## Trigger: ${trigger.type}

## Context
${JSON.stringify(context, null, 2)}

Should I show advice? If yes, provide the card content.`,
      },
    ],
    response_format: zodResponseFormat(AssistantResponseSchema, "assistant"),
  });

  const result = response.choices[0].message.parsed;
  return Response.json(result);
}
```

---

## 八、错误处理与降级

```typescript
// lib/llm/error-handler.ts

interface LLMError {
  status?: number;
  message: string;
  type?: string;
}

export async function safeLLMCall<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const status = error.status || error.statusCode;

    if (status === 429) {
      // 限流：等待后重试一次
      const retryAfter = parseInt(error.headers?.["retry-after"] || "30");
      console.warn(`LLM rate limited, retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return fn();
    }

    if (status === 400) {
      console.error("LLM request error:", error.message);
      return fallback;
    }

    if (status >= 500) {
      console.error("LLM server error:", status);
      return fallback;
    }

    // 网络错误等
    console.error("LLM call failed:", error.message);
    return fallback;
  }
}
```

---

## 九、成本优化

### Prompt Caching（CCS 支持的话）

如果 CCS 代理的模型支持 Prompt Caching（Claude 系列支持），可以在 system prompt 上加缓存：

```typescript
// 对于支持 cache_control 的模型（通过 CCS 透传）
const response = await client.chat.completions.create({
  model: MODELS.chat,
  messages: [
    {
      role: "system",
      content: [
        {
          type: "text",
          text: largeSystemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
    { role: "user", content: userMessage },
  ],
});
```

> 注意：Prompt Caching 是否生效取决于 CCS 是否透传 `cache_control` 字段。如果不支持，忽略即可。

### 模型分级策略

| 任务 | 模型 | 单次成本 | 月频次 | 月成本 |
|------|------|---------|--------|--------|
| 文献提取 | DeepSeek V3 | ~$0.001/篇 | 40 篇 | ~$0.04 |
| 过程助手 | DeepSeek V3 | ~$0.002/次 | 50 次 | ~$0.10 |
| AI 对话 | Claude Sonnet 5 | ~$0.02/次 | 100 次 | ~$2.00 |
| 深度分析 | Claude Opus 4.8 | ~$0.08/次 | 10 次 | ~$0.80 |
| **月总计** | | | | **~$3.00** |

> 实际成本取决于你 CCS 里配的模型和各供应商的定价。

---

## 十、项目文件结构

```
lib/llm/
├── client.ts              # CCS 客户端初始化 + 模型名常量
├── prompts/
│   ├── extraction.ts      # 文献提取 system prompt
│   ├── chat.ts            # AI 助手 system prompt 构建
│   ├── analysis.ts        # 深度分析 system prompt
│   └── assistant.ts       # 过程助手 system prompt
├── extraction.ts          # 提取逻辑
├── batch-extract.ts       # 批量提取
├── analysis.ts            # 深度分析
└── error-handler.ts       # 统一错误处理

app/api/
├── chat/route.ts          # AI 助手 SSE 流式接口
├── process-assistant/     # 过程助手接口
│   └── route.ts
├── papers/
│   ├── search/route.ts    # 文献搜索（调学术 API，不走 LLM）
│   └── extract/route.ts   # 信息提取
├── experiments/
│   ├── design/route.ts    # 实验设计
│   └── troubleshoot/      # 排障诊断
│       └── route.ts
└── analysis/route.ts      # 深度分析

.env.local                 # 只需配 CCS 的地址和 Key
```

---

## 十一、关键注意事项

### 1. 防幻觉（最重要）

| 策略 | 实现方式 |
|------|---------|
| **原文引用** | 每个提取结果附带 `evidence_quote`（原文片段） |
| **Structured Output** | 用 `zodResponseFormat` 保证返回格式正确 |
| **置信度评分** | LLM 对每个提取给出 0-1 置信度 |
| **用户可编辑** | 所有提取结果都可被用户修正 |
| **交叉验证** | 多篇文献支持同一结论 → 置信度提升 |

### 2. CCS 透传兼容性

CCS 作为代理层，有些高级特性可能不支持透传：

| 特性 | 是否依赖 CCS 透传 | 降级方案 |
|------|-----------------|---------|
| 基本文本生成 | ✅ 所有代理都支持 | — |
| 流式输出 (stream) | ✅ 所有代理都支持 | — |
| JSON Mode | ✅ 大多数支持 | 用 prompt 约束输出格式 |
| Structured Output (zodResponseFormat) | ⚠️ 看 CCS 版本 | 用 JSON Mode + 后处理验证 |
| Prompt Caching (cache_control) | ⚠️ 可能不透传 | 忽略，不影响功能 |
| Thinking (extended thinking) | ⚠️ Claude 专属 | 去掉，用 prompt 引导推理 |

### 3. 中英文混合

- 接受中文提问，用中文回答日常对话
- 论文输出必须是学术英语
- System prompt 中明确指示语言切换规则

### 4. 切换模型只需改 `.env`

```env
# 想全部换成 DeepSeek？
CCS_MODEL_EXTRACTION=deepseek-chat
CCS_MODEL_CHAT=deepseek-chat
CCS_MODEL_ANALYSIS=deepseek-reasoner

# 想全部换成 Claude？
CCS_MODEL_EXTRACTION=claude-haiku-4-5
CCS_MODEL_CHAT=claude-sonnet-5
CCS_MODEL_ANALYSIS=claude-opus-4-8

# 想混合用？
CCS_MODEL_EXTRACTION=deepseek-chat      # 便宜的做提取
CCS_MODEL_CHAT=claude-sonnet-5          # 好的做对话
CCS_MODEL_ANALYSIS=deepseek-reasoner    # 推理强的做分析
```

**SciFlow AI 的代码完全不用动。**
