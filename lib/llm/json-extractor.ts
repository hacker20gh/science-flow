/**
 * 通用 JSON 提取工具
 *
 * 从 LLM 响应中提取结构化数据。
 * 优先使用 tool_use（Anthropic 原生），文本提取作为 fallback。
 */

import { z, toJSONSchema } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";

// ===== Tool 定义工具 =====

/**
 * 从 Zod schema 生成 Anthropic tool 定义。
 * 模块只需定义 Zod schema，自动生成 tool JSON Schema。
 */
export function createToolFromSchema(
  name: string,
  description: string,
  schema: z.ZodSchema,
): Tool {
  const jsonSchema = toJSONSchema(schema, { target: "jsonSchema7" });
  // 移除 additionalProperties，避免 LLM 返回额外字段时被 Zod 拒绝
  stripAdditionalProperties(jsonSchema);
  return {
    name,
    description,
    input_schema: jsonSchema as Tool["input_schema"],
  };
}

/**
 * 递归移除 JSON Schema 中的 additionalProperties 字段
 * toJSONSchema 默认添加 additionalProperties: false，会导致 LLM 返回额外字段时校验失败
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripAdditionalProperties(schema: any): void {
  if (schema && typeof schema === "object") {
    delete schema.additionalProperties;
    if (schema.properties) {
      for (const val of Object.values(schema.properties)) {
        stripAdditionalProperties(val);
      }
    }
    if (schema.items) stripAdditionalProperties(schema.items);
    if (schema.anyOf) schema.anyOf.forEach(stripAdditionalProperties);
    if (schema.oneOf) schema.oneOf.forEach(stripAdditionalProperties);
    if (schema.allOf) schema.allOf.forEach(stripAdditionalProperties);
  }
}

// ===== 结构化输出提取 =====

/**
 * 从 LLM 响应中提取结构化数据
 *
 * 优先级：
 * 1. tool_use block（如果存在）
 * 2. 文本中的 JSON 代码块
 * 3. 文本中的裸 JSON
 * 4. 重试一次（重新请求只输出 JSON）
 */
export async function extractStructuredOutput<T>(
  response: Message,
  schema: z.ZodSchema<T>,
  options?: { label?: string; retryFn?: () => Promise<unknown> }
): Promise<T> {
  const label = options?.label ?? "LLM";

  // 方法 1：从 tool_use block 提取（首选）
  for (const block of response.content) {
    if (block.type === "tool_use") {
      const parsed = schema.safeParse(block.input);
      if (parsed.success) return parsed.data;
      console.warn(`[${label}] tool_use validation failed, trying text fallback:`, parsed.error.flatten());
    }
  }

  // 方法 2：从文本中提取 JSON（fallback）
  for (const block of response.content) {
    if (block.type === "text") {
      const result = extractJSONFromText(block.text, schema);
      if (result !== null) {
        console.log(`[${label}] extracted JSON from text fallback`);
        return result;
      }
    }
    // thinking 块作为最后手段
    if (block.type === "thinking") {
      const text = (block as { thinking: string }).thinking;
      if (text) {
        const result = extractJSONFromText(text, schema);
        if (result !== null) {
          console.log(`[${label}] extracted JSON from thinking block`);
          return result;
        }
      }
    }
  }

  // 方法 3：重试
  if (options?.retryFn) {
    console.warn(`[${label}] extraction failed, retrying...`);
    try {
      const retryResponse = (await options.retryFn()) as Message;
      return extractStructuredOutput(retryResponse, schema, { label });
    } catch (retryError) {
      console.error(`[${label}] retry failed:`, (retryError as Error)?.message);
    }
  }

  throw new Error(`[${label}] 无法从 LLM 输出中提取结构化数据`);
}

/**
 * 从文本中提取 JSON（支持多种格式）
 */
function extractJSONFromText<T>(text: string, schema: z.ZodSchema<T>): T | null {
  // 尝试1：```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const parsed = tryParseJSON(codeBlockMatch[1], schema);
    if (parsed !== null) return parsed;
  }

  // 尝试2：找到第一个 { 开始，用括号匹配找到完整 JSON
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          const jsonStr = text.slice(firstBrace, i + 1);
          const parsed = tryParseJSON(jsonStr, schema);
          if (parsed !== null) return parsed;
          break;
        }
      }
    }
  }

  // 尝试3：整个文本就是 JSON
  const wholeTextParsed = tryParseJSON(text, schema);
  if (wholeTextParsed !== null) return wholeTextParsed;

  return null;
}

/**
 * 尝试解析 JSON 并用 Zod 校验
 */
function tryParseJSON<T>(text: string, schema: z.ZodSchema<T>): T | null {
  try {
    const cleaned = text.trim();
    const json = JSON.parse(cleaned);
    const parsed = schema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * 创建重试函数：要求 LLM 按指定 schema 输出 JSON
 */
export function createRetryFunction(
  client: Anthropic | null,
  params: {
    model: string;
    maxTokens: number;
    system: string;
    userMessage: string;
    originalContent: string | unknown[];
    schema?: z.ZodSchema;
    feature?: string;
  }
): () => Promise<unknown> {
  return async () => {
    const messages: Array<{ role: "user"; content: string }> = [];

    if (typeof params.originalContent === "string") {
      messages.push({ role: "user", content: params.originalContent });
    } else {
      for (const item of params.originalContent) {
        messages.push({
          role: "user",
          content: typeof item === "string" ? item : JSON.stringify(item),
        });
      }
    }

    // 生成示例 JSON 供模型参考（给出完整的字段结构）
    const exampleJSON = params.schema
      ? `\n\nYou MUST return a JSON object with EXACTLY this structure (same field names, same nesting):\n${JSON.stringify(getExampleFromSchema(params.schema), null, 2)}\n\nDo NOT add extra fields. Do NOT rename fields. Do NOT wrap in markdown code blocks.`
      : "";

    messages.push({
      role: "user",
      content: `Return ONLY a valid JSON object matching the required schema. No text before or after. No markdown code blocks. No explanations.${exampleJSON}`,
    });

    const system = params.system + "\n\nIMPORTANT: Return ONLY a valid JSON object. No text before or after. No markdown code blocks. The JSON MUST match the schema exactly.";

    // 优先使用统一 LLM 接口（自动选择 OpenAI 兼容 API 或 CCS）
    try {
      const { callExtractionLLM } = await import("./client");
      return await callExtractionLLM({
        model: params.model,
        maxTokens: params.maxTokens,
        system,
        messages,
        feature: params.feature,
      });
    } catch {
      // 降级：直接使用 Anthropic 客户端
      if (!client) throw new Error("No LLM client available");
      const response = await client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        system,
        messages,
        ...(params.feature ? { _sciflowFeature: params.feature } : {}),
      } as never) as Message;
      return response;
    }
  };
}

/**
 * 从 Zod schema 生成示例 JSON（用于重试时告诉模型期望的结构）
 */
function getExampleFromSchema(schema: z.ZodSchema): unknown {
  // 用 Zod 的 _def 来推断结构
  // 简单处理：如果 schema 有 shape，返回空值版本
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (schema as any)._def;
    if (def?.typeName === "ZodObject" && def?.shape) {
      const example: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(def.shape)) {
        example[key] = getExampleValue(val as z.ZodSchema);
      }
      return example;
    }
    if (def?.typeName === "ZodArray") {
      return [getExampleValue(def.type)];
    }
    return {};
  } catch {
    return {};
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getExampleValue(schema: z.ZodSchema): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (schema as any)._def;
    if (def?.typeName === "ZodObject" && def?.shape) {
      const example: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(def.shape)) {
        example[key] = getExampleValue(val as z.ZodSchema);
      }
      return example;
    }
    if (def?.typeName === "ZodArray") {
      return [getExampleValue(def.type)];
    }
    if (def?.typeName === "ZodString") return "string";
    if (def?.typeName === "ZodNumber") return 0;
    if (def?.typeName === "ZodBoolean") return false;
    if (def?.typeName === "ZodNullable") {
      return getExampleValue(def.innerType);
    }
    return null;
  } catch {
    return null;
  }
}
