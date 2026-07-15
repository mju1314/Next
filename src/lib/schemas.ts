import { z } from "zod";

const emptyToNull = (value: unknown) => (value === "" ? null : value);

export const idSchema = z.string().min(1);

export const goalCreateSchema = z.object({
  domainId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  title: z.string().trim().min(1, "目标标题不能为空"),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  importance: z.coerce.number().int().min(1).max(5).default(3),
  startDate: z.preprocess(emptyToNull, z.string().nullable().optional()),
  targetDate: z.preprocess(emptyToNull, z.string().nullable().optional()),
  status: z.enum(["active", "paused", "completed", "archived"]).default("active"),
  progress: z.coerce.number().min(0).max(100).default(0),
});

export const goalUpdateSchema = goalCreateSchema.partial();

export const projectCreateSchema = z.object({
  goalId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  title: z.string().trim().min(1, "项目标题不能为空"),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  status: z.enum(["active", "paused", "completed", "archived"]).default("active"),
  progress: z.coerce.number().min(0).max(100).default(0),
  startDate: z.preprocess(emptyToNull, z.string().nullable().optional()),
  targetDate: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

export const projectUpdateSchema = projectCreateSchema.partial();

export const taskCreateSchema = z.object({
  projectId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  goalId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  title: z.string().trim().min(1, "任务标题不能为空"),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  status: z.enum(["todo", "doing", "done", "skipped", "archived"]).default("todo"),
  priorityManual: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(5).nullable().optional()),
  estimateMin: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
  dueAt: z.preprocess(emptyToNull, z.string().nullable().optional()),
  taskType: z.preprocess(
    emptyToNull,
    z.enum(["deep_work", "admin", "learning", "health", "errand"]).nullable().optional(),
  ),
  energyLevel: z.preprocess(emptyToNull, z.enum(["low", "medium", "high"]).nullable().optional()),
  isBlocked: z.coerce.boolean().default(false),
});

export const taskUpdateSchema = taskCreateSchema.partial();

export const inboxCreateSchema = z.object({
  rawText: z.string().trim().min(1, "Inbox 内容不能为空"),
  source: z.enum(["manual", "voice", "ai", "imported"]).default("manual"),
});

export const inboxUpdateSchema = z.object({
  status: z.enum(["unprocessed", "ignored", "archived"]),
});

export const inboxConvertTaskSchema = z.object({
  title: z.string().trim().min(1, "任务标题不能为空"),
  projectId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  goalId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  estimateMin: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable().optional()),
});

export const inboxConvertProjectSchema = z.object({
  title: z.string().trim().min(1, "项目标题不能为空"),
  goalId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

export const inboxConvertGoalSchema = z.object({
  title: z.string().trim().min(1, "目标标题不能为空"),
  importance: z.coerce.number().int().min(1).max(5).default(3),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
});

export const dailyPlanGenerateSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须是 YYYY-MM-DD")
      .optional(),
    available_minutes: z.coerce.number().int().min(10).max(720).optional(),
    availableMinutes: z.coerce.number().int().min(10).max(720).optional(),
    energy: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(5).nullable().optional()),
    mood: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(5).nullable().optional()),
    mode: z.enum(["progress", "clear", "deadline", "low_energy"]).default("progress"),
    overwrite: z.coerce.boolean().default(false),
  })
  .transform((data) => ({
    date: data.date,
    availableMinutes: data.availableMinutes ?? data.available_minutes,
    energy: data.energy ?? null,
    mood: data.mood ?? null,
    mode: data.mode,
    overwrite: data.overwrite,
  }))
  .refine((data) => data.availableMinutes !== undefined, {
    message: "今日可用时间不能为空",
    path: ["available_minutes"],
  });

export const dailyFocusActionSchema = z.object({
  action: z.enum(["start", "complete", "skip"]),
  skipReason: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
});

export const dailyFocusAddSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
  })
  .transform((data, ctx) => {
    const taskId = data.taskId ?? data.task_id;

    if (!taskId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "任务不能为空", path: ["taskId"] });
      return z.NEVER;
    }

    return { taskId };
  });

export const workSessionStartSchema = z
  .object({
    task_id: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
  })
  .transform((data, ctx) => {
    const taskId = data.taskId ?? data.task_id;

    if (!taskId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "任务不能为空",
        path: ["task_id"],
      });

      return z.NEVER;
    }

    return { taskId };
  });

export const workSessionFinishSchema = z.object({
  status: z.enum(["done", "todo", "skipped"]).default("done"),
  focus_score: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(5).nullable().optional()),
  focusScore: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(5).nullable().optional()),
  note: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
});

export const aiInboxTaskSuggestionsSchema = z
  .object({
    inboxItemId: z.preprocess(emptyToNull, z.string().nullable().optional()),
    text: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    maxSuggestions: z.coerce.number().int().min(1).max(5).default(3),
  })
  .refine((data) => data.inboxItemId || data.text, {
    message: "需要提供 Inbox 条目或文本",
    path: ["text"],
  });

export const aiProjectTaskSuggestionsSchema = z
  .object({
    projectId: z.preprocess(emptyToNull, z.string().nullable().optional()),
    title: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    description: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    maxSuggestions: z.coerce.number().int().min(1).max(6).default(4),
  })
  .refine((data) => data.projectId || data.title, {
    message: "需要提供项目或项目标题",
    path: ["projectId"],
  });

export const aiRecommendationReasonSchema = z
  .object({
    focusId: z.preprocess(emptyToNull, z.string().nullable().optional()),
    taskTitle: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    reason: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    scoreDetail: z.unknown().optional(),
  })
  .refine((data) => data.focusId || data.taskTitle, {
    message: "需要提供推荐条目或任务标题",
    path: ["focusId"],
  });

export const dailyReviewSaveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须是 YYYY-MM-DD"),
  content: z.string().trim().min(1, "复盘内容不能为空"),
  source: z.enum(["manual", "ai", "local"]).default("manual"),
  metrics: z.unknown().optional(),
});

export const backupImportSchema = z.object({
  strategy: z.enum(["skip", "overwrite"]).default("skip"),
  backup: z.unknown(),
});
