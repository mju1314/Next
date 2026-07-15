import { callAiJson, callAiText, type AiCallMeta, type AiJsonSchema } from "@/lib/ai-provider";

export type AiSource = "ai" | "local";

export type TaskSuggestion = {
  title: string;
  description?: string | null;
  estimateMin?: number | null;
  priorityManual?: number | null;
  taskType?: "deep_work" | "admin" | "learning" | "health" | "errand" | null;
  energyLevel?: "low" | "medium" | "high" | null;
  reason?: string | null;
};

export type TaskSuggestionResult = {
  suggestions: TaskSuggestion[];
  source: AiSource;
  aiError?: string;
  aiErrorDetail?: string | null;
  aiMeta?: AiCallMeta;
};

export type ReasonPolishResult = {
  polishedReason: string;
  source: AiSource;
  aiError?: string;
  aiErrorDetail?: string | null;
  aiMeta?: AiCallMeta;
};

const TASK_TYPES = new Set(["deep_work", "admin", "learning", "health", "errand"]);
const ENERGY_LEVELS = new Set(["low", "medium", "high"]);

type TaskSuggestionPayload = {
  suggestions?: unknown[];
};

const taskSuggestionSchema: AiJsonSchema = {
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

function splitText(text: string) {
  return text
    .split(/[\n。；;，,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function localInboxSuggestions(text: string, maxSuggestions: number): TaskSuggestion[] {
  const chunks = splitText(text);
  const base = chunks.length > 0 ? chunks : [text.trim()];

  return base.slice(0, maxSuggestions).map((chunk) => ({
    title: chunk.length > 42 ? chunk.slice(0, 42) : chunk,
    description: text.trim(),
    estimateMin: 45,
    priorityManual: 3,
    taskType: "deep_work",
    energyLevel: "medium",
    reason: "本地兜底：从 Inbox 原文拆出可执行任务，需要确认后创建。",
  }));
}

function localProjectSuggestions(project: { title: string; description?: string | null }, maxSuggestions: number): TaskSuggestion[] {
  const verbs = ["明确交付标准", "拆出最小任务", "完成第一版产出", "复盘并调整下一步"];

  return verbs.slice(0, maxSuggestions).map((verb, index) => ({
    title: `${project.title}：${verb}`,
    description: project.description ?? `围绕“${project.title}”推进一个可验证的小步骤。`,
    estimateMin: index === 0 ? 30 : 45,
    priorityManual: index === 0 ? 4 : 3,
    taskType: "deep_work",
    energyLevel: index === 0 ? "medium" : "high",
    reason: "本地兜底：按项目推进顺序生成，需要确认后创建。",
  }));
}

export async function suggestTasksFromInbox(text: string, maxSuggestions = 3): Promise<TaskSuggestionResult> {
  const local = localInboxSuggestions(text, maxSuggestions);
  const { data, error, errorDetail, meta } = await callAiJson<TaskSuggestionPayload>(
    "你是个人执行系统的 Inbox 整理助手。把输入内容拆成 1-3 个可执行任务建议。不要写入数据库，不要编造不存在的上下文。所有任务必须能直接执行。",
    { text, maxSuggestions },
    taskSuggestionSchema,
    700,
    { action: "inbox_task_suggestions" },
  );

  const suggestions = normalizeSuggestions(data, maxSuggestions);
  return suggestions.length > 0
    ? { suggestions, source: "ai", aiMeta: meta }
    : { suggestions: local, source: "local", aiError: error ?? "AI 未返回有效任务建议", aiErrorDetail: errorDetail, aiMeta: meta };
}

export async function suggestTasksFromProject(
  project: { title: string; description?: string | null; goalTitle?: string | null },
  maxSuggestions = 4,
): Promise<TaskSuggestionResult> {
  const local = localProjectSuggestions(project, maxSuggestions);
  const { data, error, errorDetail, meta } = await callAiJson<TaskSuggestionPayload>(
    "你是个人执行系统的项目拆解助手。把项目拆成 2-4 个下一步任务建议，任务必须可独立执行且不要直接写数据库。优先给出最小可验证的下一步。",
    { project, maxSuggestions },
    taskSuggestionSchema,
    700,
    { action: "project_task_suggestions" },
  );

  const suggestions = normalizeSuggestions(data, maxSuggestions);
  return suggestions.length > 0
    ? { suggestions, source: "ai", aiMeta: meta }
    : { suggestions: local, source: "local", aiError: error ?? "AI 未返回有效任务建议", aiErrorDetail: errorDetail, aiMeta: meta };
}

export async function polishRecommendationReason(input: {
  taskTitle: string;
  reason?: string | null;
  scoreDetail?: unknown;
}): Promise<ReasonPolishResult> {
  const fallback = [
    `建议优先处理“${input.taskTitle}”。`,
    input.reason ? `核心依据：${input.reason}` : "核心依据来自本地规则评分与当前计划上下文。",
    "这只是解释润色，不改变本地推荐排序。",
  ].join("\n");
  const { text: aiText, error, errorDetail, meta } = await callAiText(
    "你是个人执行系统的推荐理由润色助手。只能润色解释，不改变排序、不新增事实、不要要求用户修改任务状态。输出 2-4 句中文短文。",
    input,
    400,
    undefined,
    { action: "recommendation_reason_polish" },
  );

  return aiText
    ? { polishedReason: aiText, source: "ai", aiMeta: meta }
    : { polishedReason: fallback, source: "local", aiError: error ?? undefined, aiErrorDetail: errorDetail, aiMeta: meta };
}
