"use client";

import { callClientAiJson, callClientAiText, type ClientAiJsonSchema } from "@/lib/client/ai-client";
import type { AiReasonResult, AiTaskSuggestionResult, TaskSuggestion } from "@/lib/client/types";
import type { DailyReviewContext } from "@/lib/client/local-review";

type TaskSuggestionPayload = {
  suggestions?: unknown[];
};

const TASK_TYPES = new Set(["deep_work", "admin", "learning", "health", "errand"]);
const ENERGY_LEVELS = new Set(["low", "medium", "high"]);

const taskSuggestionSchema: ClientAiJsonSchema = {
  name: "task_suggestions",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      suggestions: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", minLength: 1, maxLength: 120 },
            description: { type: ["string", "null"] },
            estimateMin: { type: ["integer", "null"], minimum: 5, maximum: 480 },
            priorityManual: { type: ["integer", "null"], minimum: 1, maximum: 5 },
            taskType: {
              type: ["string", "null"],
              enum: ["deep_work", "admin", "learning", "health", "errand", null],
            },
            energyLevel: {
              type: ["string", "null"],
              enum: ["low", "medium", "high", null],
            },
            reason: { type: ["string", "null"] },
          },
          required: ["title", "description", "estimateMin", "priorityManual", "taskType", "energyLevel", "reason"],
        },
      },
    },
    required: ["suggestions"],
  },
};

function clampInt(value: unknown, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function normalizeSuggestion(value: unknown): TaskSuggestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim() : "";

  if (!title) {
    return null;
  }

  const taskType = typeof item.taskType === "string" && TASK_TYPES.has(item.taskType) ? item.taskType : null;
  const energyLevel =
    typeof item.energyLevel === "string" && ENERGY_LEVELS.has(item.energyLevel) ? item.energyLevel : null;

  return {
    title: title.slice(0, 120),
    description: typeof item.description === "string" && item.description.trim() ? item.description.trim() : null,
    estimateMin: clampInt(item.estimateMin, 5, 480),
    priorityManual: clampInt(item.priorityManual, 1, 5),
    taskType: taskType as TaskSuggestion["taskType"],
    energyLevel: energyLevel as TaskSuggestion["energyLevel"],
    reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : null,
  };
}

function normalizeSuggestions(value: unknown, maxSuggestions: number) {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { suggestions?: unknown })?.suggestions)
      ? (value as { suggestions: unknown[] }).suggestions
      : [];

  return list.map(normalizeSuggestion).filter((item): item is TaskSuggestion => Boolean(item)).slice(0, maxSuggestions);
}

export async function suggestTasksFromInboxWithAi(
  text: string,
  fallback: TaskSuggestion[],
  maxSuggestions = 3,
): Promise<AiTaskSuggestionResult> {
  const { data, error, errorDetail, meta } = await callClientAiJson<TaskSuggestionPayload>(
    "你是个人执行系统的 Inbox 整理助手。把输入内容拆成 1-3 个可执行任务建议。不要写入数据库，不要编造不存在的上下文。所有任务必须能直接执行。",
    { text, maxSuggestions },
    taskSuggestionSchema,
    700,
  );
  const suggestions = normalizeSuggestions(data, maxSuggestions);

  return suggestions.length > 0
    ? { suggestions, source: "ai", aiMeta: meta, requiresConfirmation: true }
    : {
        suggestions: fallback,
        source: "local",
        aiError: error ?? undefined,
        aiErrorDetail: errorDetail,
        aiMeta: meta,
        requiresConfirmation: true,
      };
}

export async function suggestTasksFromProjectWithAi(
  project: { title: string; description?: string | null; goalTitle?: string | null },
  fallback: TaskSuggestion[],
  maxSuggestions = 4,
): Promise<AiTaskSuggestionResult> {
  const { data, error, errorDetail, meta } = await callClientAiJson<TaskSuggestionPayload>(
    "你是个人执行系统的项目拆解助手。把项目拆成 2-4 个下一步任务建议，任务必须可独立执行且不要直接写数据库。优先给出最小可验证的下一步。",
    { project, maxSuggestions },
    taskSuggestionSchema,
    700,
  );
  const suggestions = normalizeSuggestions(data, maxSuggestions);

  return suggestions.length > 0
    ? { suggestions, source: "ai", aiMeta: meta, requiresConfirmation: true }
    : {
        suggestions: fallback,
        source: "local",
        aiError: error ?? undefined,
        aiErrorDetail: errorDetail,
        aiMeta: meta,
        requiresConfirmation: true,
      };
}

export async function polishRecommendationReasonWithAi(input: {
  taskTitle: string;
  reason?: string | null;
  scoreDetail?: unknown;
  fallback: string;
}): Promise<AiReasonResult> {
  const { text, error, errorDetail, meta } = await callClientAiText(
    "你是个人执行系统的推荐理由润色助手。只能润色解释，不改变排序、不新增事实、不要要求用户修改任务状态。输出 2-4 句中文短文。",
    {
      taskTitle: input.taskTitle,
      reason: input.reason,
      scoreDetail: input.scoreDetail,
    },
    400,
  );

  return text
    ? { polishedReason: text, source: "ai", aiMeta: meta }
    : { polishedReason: input.fallback, source: "local", aiError: error ?? undefined, aiErrorDetail: errorDetail, aiMeta: meta };
}

export async function generateDailyReviewDraftWithAi(
  context: DailyReviewContext,
  fallback: string,
): Promise<{ draft: string; source: "ai" | "local"; aiError?: string; aiErrorDetail?: string | null }> {
  const { text, error, errorDetail } = await callClientAiText(
    "你是个人执行系统的晚间复盘助手。只根据输入数据写中文复盘草稿，不编造事实，不替用户决定任务状态。输出包含：今日概况、完成、偏差、可学习点、明日建议。保持简洁、可编辑。",
    context,
    900,
  );

  return text ? { draft: text, source: "ai" } : { draft: fallback, source: "local", aiError: error ?? undefined, aiErrorDetail: errorDetail };
}
