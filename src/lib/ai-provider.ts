import { writeAIRecommendationLog } from "@/lib/ai-recommendation-log";

export type AiProviderStyle = "responses" | "chat";

export type AiProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  style: AiProviderStyle;
  providerName: string;
  timeoutMs: number;
};

export type AiCallMeta = {
  providerName: string;
  model: string;
  style: AiProviderStyle;
  durationMs: number;
  status?: number;
  endpoint: string;
};

export type AiTextResult = {
  text: string | null;
  error: string | null;
  errorDetail?: string | null;
  meta?: AiCallMeta;
};

export type AiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
  description?: string;
};

export type AiJsonResult<T> = AiTextResult & {
  data: T | null;
};

type AiCallOptions = {
  action?: string;
};

type ResponsesOutput = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ text?: unknown }> }>;
};

type ChatOutput = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function endpoint(baseUrl: string, path: string) {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

function envValue(...keys: string[]) {
  return keys.map((key) => process.env[key]?.trim()).find((value): value is string => Boolean(value));
}

function envNumber(defaultValue: number, ...keys: string[]) {
  const raw = envValue(...keys);
  const parsed = raw ? Number(raw) : NaN;

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(120_000, Math.max(1_000, Math.round(parsed)));
}

export function getAiProviderConfig(): AiProviderConfig | null {
  const apiKey = envValue("AI_API_KEY", "OPENAI_API_KEY");

  if (!apiKey) {
    return null;
  }

  const providerName = envValue("AI_PROVIDER", "OPENAI_PROVIDER") ?? "openai";
  const style = (envValue("AI_API_STYLE", "OPENAI_API_STYLE") ?? "responses").toLowerCase();

  return {
    providerName,
    apiKey,
    baseUrl: envValue("AI_BASE_URL", "OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
    model: envValue("AI_MODEL", "OPENAI_MODEL") ?? "gpt-5",
    style: style === "chat" ? "chat" : "responses",
    timeoutMs: envNumber(20_000, "AI_TIMEOUT_MS", "OPENAI_TIMEOUT_MS"),
  };
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const outputText = (payload as ResponsesOutput).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const responseOutput = (payload as ResponsesOutput).output;
  const responseTextValue = responseOutput
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text)
    .find((item): item is string => typeof item === "string" && item.trim().length > 0);

  if (responseTextValue?.trim()) {
    return responseTextValue.trim();
  }

  const chatText = (payload as ChatOutput).choices
    ?.map((choice) => choice.message?.content)
    .find((item): item is string => typeof item === "string" && item.trim().length > 0);

  return chatText?.trim() ?? null;
}

function jsonFormatForResponses(jsonSchema: AiJsonSchema) {
  return {
    type: "json_schema",
    name: jsonSchema.name,
    description: jsonSchema.description,
    schema: jsonSchema.schema,
    strict: jsonSchema.strict ?? true,
  };
}

function jsonFormatForChat(jsonSchema: AiJsonSchema) {
  return {
    type: "json_schema",
    json_schema: {
      name: jsonSchema.name,
      description: jsonSchema.description,
      schema: jsonSchema.schema,
      strict: jsonSchema.strict ?? true,
    },
  };
}

function requestBody(
  config: AiProviderConfig,
  instructions: string,
  input: unknown,
  maxOutputTokens: number,
  jsonSchema?: AiJsonSchema,
) {
  if (config.style === "chat") {
    return {
      model: config.model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: typeof input === "string" ? input : JSON.stringify(input) },
      ],
      max_tokens: maxOutputTokens,
      ...(jsonSchema ? { response_format: jsonFormatForChat(jsonSchema) } : {}),
    };
  }

  return {
    model: config.model,
    instructions,
    input: typeof input === "string" ? input : JSON.stringify(input),
    max_output_tokens: maxOutputTokens,
    ...(jsonSchema ? { text: { format: jsonFormatForResponses(jsonSchema) } } : {}),
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "AI 请求超时";
  }

  return error instanceof Error ? error.message : "AI 请求失败";
}

function callMeta(config: AiProviderConfig, endpointUrl: string, startedAt: number, status?: number): AiCallMeta {
  return {
    providerName: config.providerName,
    model: config.model,
    style: config.style,
    durationMs: Date.now() - startedAt,
    status,
    endpoint: endpointUrl,
  };
}

async function responseErrorDetail(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text.trim()) {
    return null;
  }

  return text.trim().slice(0, 1_000);
}

export async function callAiText(
  instructions: string,
  input: unknown,
  maxOutputTokens = 700,
  jsonSchema?: AiJsonSchema,
  options: AiCallOptions = {},
): Promise<AiTextResult> {
  const config = getAiProviderConfig();

  if (!config) {
    return { text: null, error: "未配置 AI_API_KEY 或 OPENAI_API_KEY" };
  }

  const startedAt = Date.now();
  const endpointUrl = endpoint(config.baseUrl, config.style === "chat" ? "/chat/completions" : "/responses");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody(config, instructions, input, maxOutputTokens, jsonSchema)),
      signal: controller.signal,
    });
    const meta = callMeta(config, endpointUrl, startedAt, response.status);

    if (!response.ok) {
      const result = {
        text: null,
        error: `${config.providerName} 请求失败：${response.status}`,
        errorDetail: await responseErrorDetail(response),
        meta,
      };
      await logAiCall(options.action ?? "text", input, result);
      return result;
    }

    const payload = await response.json();
    const result = { text: responseText(payload), error: null, meta };
    await logAiCall(options.action ?? "text", input, result);
    return result;
  } catch (error) {
    const result = {
      text: null,
      error: errorMessage(error),
      errorDetail: error instanceof Error ? error.stack ?? error.message : null,
      meta: callMeta(config, endpointUrl, startedAt),
    };
    await logAiCall(options.action ?? "text", input, result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function logAiCall(action: string, input: unknown, result: AiTextResult) {
  await writeAIRecommendationLog({
    kind: "ai",
    action,
    inputSummary: input,
    outputSummary: result.text,
    error: result.error,
    errorDetail: result.errorDetail,
    providerName: result.meta?.providerName,
    model: result.meta?.model,
    status: result.meta?.status,
    durationMs: result.meta?.durationMs,
  });
}

export async function callAiJson<T>(
  instructions: string,
  input: unknown,
  jsonSchema: AiJsonSchema,
  maxOutputTokens = 700,
  options: AiCallOptions = {},
): Promise<AiJsonResult<T>> {
  const result = await callAiText(instructions, input, maxOutputTokens, jsonSchema, options);

  if (!result.text) {
    return { ...result, data: null };
  }

  try {
    return { ...result, data: JSON.parse(result.text) as T };
  } catch (error) {
    return {
      ...result,
      data: null,
      error: "AI 结构化 JSON 解析失败",
      errorDetail: error instanceof Error ? error.message : null,
    };
  }
}
