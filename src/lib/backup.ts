import { Prisma } from "@prisma/client";
import { isoNow } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const BACKUP_VERSION = 1;

export type ImportStrategy = "skip" | "overwrite";

type BackupData = {
  domains?: unknown[];
  goals?: unknown[];
  projects?: unknown[];
  tasks?: unknown[];
  inboxItems?: unknown[];
  dailyPlans?: unknown[];
  dailyFoci?: unknown[];
  workSessions?: unknown[];
  dailyReviews?: unknown[];
  aiRecommendationLogs?: unknown[];
};

type BackupPayload = BackupData & {
  version?: unknown;
  exportedAt?: unknown;
};

type Delegate = {
  findUnique(args: { where: { id: string } }): Promise<unknown>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  upsert(args: {
    where: { id: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
};

const rowKeys = {
  domains: ["id", "name", "icon", "color", "sortOrder", "createdAt", "updatedAt"],
  goals: [
    "id",
    "domainId",
    "title",
    "description",
    "importance",
    "startDate",
    "targetDate",
    "status",
    "progress",
    "createdAt",
    "updatedAt",
  ],
  projects: [
    "id",
    "goalId",
    "title",
    "description",
    "status",
    "progress",
    "startDate",
    "targetDate",
    "lastActiveAt",
    "createdAt",
    "updatedAt",
  ],
  tasks: [
    "id",
    "projectId",
    "goalId",
    "title",
    "description",
    "status",
    "priorityManual",
    "estimateMin",
    "actualMin",
    "dueAt",
    "taskType",
    "energyLevel",
    "isBlocked",
    "scoreSnapshot",
    "createdAt",
    "updatedAt",
  ],
  inboxItems: [
    "id",
    "rawText",
    "source",
    "status",
    "convertedTaskId",
    "convertedProjectId",
    "convertedGoalId",
    "createdAt",
    "updatedAt",
  ],
  dailyPlans: ["id", "date", "availableMinutes", "mood", "energy", "status", "createdAt", "updatedAt"],
  dailyFoci: [
    "id",
    "dailyPlanId",
    "taskId",
    "rank",
    "plannedMinutes",
    "reason",
    "scoreDetail",
    "status",
    "createdAt",
    "updatedAt",
  ],
  workSessions: ["id", "taskId", "startAt", "endAt", "durationMin", "focusScore", "note", "createdAt"],
  dailyReviews: ["id", "date", "content", "source", "metricsSnapshot", "createdAt", "updatedAt"],
  aiRecommendationLogs: [
    "id",
    "kind",
    "action",
    "inputSummary",
    "outputSummary",
    "error",
    "errorDetail",
    "providerName",
    "model",
    "status",
    "durationMs",
    "createdAt",
  ],
} as const;

function ensureArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function pickRow(row: unknown, keys: readonly string[]) {
  if (!row || typeof row !== "object") {
    throw new Error("BACKUP_ROW_INVALID");
  }

  const input = row as Record<string, unknown>;
  const id = input.id;

  if (typeof id !== "string" || !id.trim()) {
    throw new Error("BACKUP_ROW_ID_INVALID");
  }

  return Object.fromEntries(keys.filter((key) => key in input).map((key) => [key, input[key]]));
}

function updateData(data: Record<string, unknown>) {
  const { id: _id, ...rest } = data;

  return rest;
}

async function importRows(
  delegate: Delegate,
  rows: unknown[],
  keys: readonly string[],
  strategy: ImportStrategy,
) {
  let created = 0;
  let overwritten = 0;
  let skipped = 0;

  for (const row of rows) {
    const data = pickRow(row, keys);
    const id = data.id as string;

    if (strategy === "overwrite") {
      const existing = await delegate.findUnique({ where: { id } });
      await delegate.upsert({ where: { id }, create: data, update: updateData(data) });
      existing ? overwritten++ : created++;
      continue;
    }

    const existing = await delegate.findUnique({ where: { id } });
    if (existing) {
      skipped++;
      continue;
    }

    await delegate.create({ data });
    created++;
  }

  return { created, overwritten, skipped };
}

function normalizePayload(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("BACKUP_PAYLOAD_INVALID");
  }

  const input = payload as BackupPayload;

  return {
    version: input.version,
    exportedAt: input.exportedAt,
    domains: ensureArray(input.domains),
    goals: ensureArray(input.goals),
    projects: ensureArray(input.projects),
    tasks: ensureArray(input.tasks),
    inboxItems: ensureArray(input.inboxItems),
    dailyPlans: ensureArray(input.dailyPlans),
    dailyFoci: ensureArray(input.dailyFoci),
    workSessions: ensureArray(input.workSessions),
    dailyReviews: ensureArray(input.dailyReviews),
    aiRecommendationLogs: ensureArray(input.aiRecommendationLogs),
  };
}

export async function exportBackup() {
  const [
    domains,
    goals,
    projects,
    tasks,
    inboxItems,
    dailyPlans,
    dailyFoci,
    workSessions,
    dailyReviews,
    aiRecommendationLogs,
  ] = await Promise.all([
    prisma.domain.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.goal.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.task.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.inboxItem.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.dailyPlan.findMany({ orderBy: { date: "asc" } }),
    prisma.dailyFocus.findMany({ orderBy: [{ dailyPlanId: "asc" }, { rank: "asc" }] }),
    prisma.workSession.findMany({ orderBy: { startAt: "asc" } }),
    prisma.dailyReview.findMany({ orderBy: { date: "asc" } }),
    prisma.aIRecommendationLog.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: isoNow(),
    counts: {
      domains: domains.length,
      goals: goals.length,
      projects: projects.length,
      tasks: tasks.length,
      inboxItems: inboxItems.length,
      dailyPlans: dailyPlans.length,
      dailyFoci: dailyFoci.length,
      workSessions: workSessions.length,
      dailyReviews: dailyReviews.length,
      aiRecommendationLogs: aiRecommendationLogs.length,
    },
    domains,
    goals,
    projects,
    tasks,
    inboxItems,
    dailyPlans,
    dailyFoci,
    workSessions,
    dailyReviews,
    aiRecommendationLogs,
  };
}

export async function importBackup(payload: unknown, strategy: ImportStrategy) {
  const backup = normalizePayload(payload);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const domains = await importRows(tx.domain as unknown as Delegate, backup.domains ?? [], rowKeys.domains, strategy);
    const goals = await importRows(tx.goal as unknown as Delegate, backup.goals ?? [], rowKeys.goals, strategy);
    const projects = await importRows(tx.project as unknown as Delegate, backup.projects ?? [], rowKeys.projects, strategy);
    const tasks = await importRows(tx.task as unknown as Delegate, backup.tasks ?? [], rowKeys.tasks, strategy);
    const inboxItems = await importRows(
      tx.inboxItem as unknown as Delegate,
      backup.inboxItems ?? [],
      rowKeys.inboxItems,
      strategy,
    );
    const dailyPlans = await importRows(
      tx.dailyPlan as unknown as Delegate,
      backup.dailyPlans ?? [],
      rowKeys.dailyPlans,
      strategy,
    );
    const dailyFoci = await importRows(tx.dailyFocus as unknown as Delegate, backup.dailyFoci ?? [], rowKeys.dailyFoci, strategy);
    const workSessions = await importRows(
      tx.workSession as unknown as Delegate,
      backup.workSessions ?? [],
      rowKeys.workSessions,
      strategy,
    );
    const dailyReviews = await importRows(
      tx.dailyReview as unknown as Delegate,
      backup.dailyReviews ?? [],
      rowKeys.dailyReviews,
      strategy,
    );
    const aiRecommendationLogs = await importRows(
      tx.aIRecommendationLog as unknown as Delegate,
      backup.aiRecommendationLogs ?? [],
      rowKeys.aiRecommendationLogs,
      strategy,
    );

    return {
      strategy,
      importedAt: isoNow(),
      tables: {
        domains,
        goals,
        projects,
        tasks,
        inboxItems,
        dailyPlans,
        dailyFoci,
        workSessions,
        dailyReviews,
        aiRecommendationLogs,
      },
    };
  });
}
