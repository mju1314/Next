"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";

import type { AiCallMeta } from "@/lib/client/types";

export type ClientAiProviderStyle = "responses" | "chat";

export type ClientAiConfig = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  style: ClientAiProviderStyle;
  timeoutMs: number;
};

export type ClientAiTextResult = {
  text: string | null;
  error: string | null;
  errorDetail?: string | null;
  meta?: AiCallMeta;
};

export type ClientAiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
  description?: string;
};

export type ClientAiJsonResult<T> = ClientAiTextResult & {
  data: T | null;
};

type ResponsesOutput = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ text?: unknown }> }>;
};

type ChatOutput = {
  choices?: Array<{ message?: { content?: unknown } }>;
};

const STORAGE_KEY = "next-personal-execution-system.ai-config.v1";

export const DEFAULT_AI_CONFIG: ClientAiConfig = {
  providerName: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5",
  style: "responses",
  timeoutMs: 20_000,
};

function ensureBrowser() {
  if (typeof window === "undefined") {
    throw new Error("AI 配置只能在手机或浏览器中读取");
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function endpoint(baseUrl: string, path: string) {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

function normalizeConfig(input: Partial<ClientAiConfig> | null | undefined): ClientAiConfig {
  const timeoutMs = Number(input?.timeoutMs);

  return {
    providerName: input?.providerName?.trim() || DEFAULT_AI_CONFIG.providerName,
    baseUrl: input?.baseUrl?.trim() || DEFAULT_AI_CONFIG.baseUrl,
    apiKey: input?.apiKey?.trim() || "",
    model: input?.model?.trim() || DEFAULT_AI_CONFIG.model,
    style: input?.style === "chat" ? "chat" : "responses",
    timeoutMs: Number.isFinite(timeoutMs) ? Math.min(120_000, Math.max(1_000, Math.round(timeoutMs))) : DEFAULT_AI_CONFIG.timeoutMs,
  };
}

export function getStoredAiConfig() {
  ensureBrowser();
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return DEFAULT_AI_CONFIG;
  }

  try {
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export function saveStoredAiConfig(input: Partial<ClientAiConfig>) {
  ensureBrowser();
  const config = normalizeConfig(input);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

  return config;
}

export function clearStoredAiConfig() {
  ensureBrowser();
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getActiveAiConfig() {
  const config = getStoredAiConfig();

  return config.apiKey ? config : null;
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

function jsonFormatForResponses(jsonSchema: ClientAiJsonSchema) {
  return {
    type: "json_schema",
    name: jsonSchema.name,
    description: jsonSchema.description,
    schema: jsonSchema.schema,
    strict: jsonSchema.strict ?? true,
  };
}

function jsonFormatForChat(jsonSchema: ClientAiJsonSchema) {
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
  config: ClientAiConfig,
  instructions: string,
  input: unknown,
  maxOutputTokens: number,
  jsonSchema?: ClientAiJsonSchema,
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

function callMeta(config: ClientAiConfig, endpointUrl: string, startedAt: number, status?: number): AiCallMeta {
  return {
    providerName: config.providerName,
    model: config.model,
    style: config.style,
    durationMs: Date.now() - startedAt,
    status,
    endpoint: endpointUrl,
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "AI 请求超时";
  }

  return error instanceof Error ? error.message : "AI 请求失败";
}

function errorDetail(payload: unknown) {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    return payload.trim().slice(0, 1_000) || null;
  }

  try {
    return JSON.stringify(payload).slice(0, 1_000);
  } catch {
    return null;
  }
}

function timeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new DOMException("AI 请求超时", "AbortError")), timeoutMs);
    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timer));
  });
}

async function postJson(config: ClientAiConfig, endpointUrl: string, body: unknown) {
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };

  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("CapacitorHttp")) {
    const response = await timeout(
      CapacitorHttp.post({
        url: endpointUrl,
        headers,
        data: body,
        responseType: "json",
      }),
      config.timeoutMs,
    );

    return { status: response.status, payload: response.data };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text().catch(() => null);

    return { status: response.status, payload };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function callClientAiText(
  instructions: string,
  input: unknown,
  maxOutputTokens = 700,
  jsonSchema?: ClientAiJsonSchema,
): Promise<ClientAiTextResult> {
  const config = getActiveAiConfig();

  if (!config) {
    return { text: null, error: null };
  }

  const startedAt = Date.now();
  const endpointUrl = endpoint(config.baseUrl, config.style === "chat" ? "/chat/completions" : "/responses");

  try {
    const response = await postJson(config, endpointUrl, requestBody(config, instructions, input, maxOutputTokens, jsonSchema));
    const meta = callMeta(config, endpointUrl, startedAt, response.status);

    if (response.status < 200 || response.status >= 300) {
      return {
        text: null,
        error: `AI 请求失败：HTTP ${response.status}`,
        errorDetail: errorDetail(response.payload),
        meta,
      };
    }

    const text = responseText(response.payload);

    return text ? { text, error: null, meta } : { text: null, error: "AI 未返回文本", errorDetail: errorDetail(response.payload), meta };
  } catch (error) {
    return { text: null, error: errorMessage(error), meta: callMeta(config, endpointUrl, startedAt) };
  }
}

export async function callClientAiJson<T>(
  instructions: string,
  input: unknown,
  jsonSchema: ClientAiJsonSchema,
  maxOutputTokens = 700,
): Promise<ClientAiJsonResult<T>> {
  const result = await callClientAiText(instructions, input, maxOutputTokens, jsonSchema);

  if (!result.text) {
    return { ...result, data: null };
  }

  try {
    return { ...result, data: JSON.parse(result.text) as T };
  } catch {
    return { ...result, data: null, error: "AI 返回的 JSON 无法解析", errorDetail: result.text.slice(0, 1_000) };
  }
}
