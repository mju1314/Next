"use client";

import {
  generateDailyReviewDraftWithAi,
  polishRecommendationReasonWithAi,
  suggestTasksFromInboxWithAi,
  suggestTasksFromProjectWithAi,
} from "@/lib/client/ai-assist";
import { buildLocalReviewDraft, type DailyReviewContext } from "@/lib/client/local-review";
import type {
  AiReasonResult,
  AiTaskSuggestionResult,
  DailyFocus,
  DailyPlan,
  DailyReview,
  Goal,
  InboxItem,
  Project,
  Task,
  TaskSuggestion,
  TodayState,
  WorkSession,
} from "@/lib/client/types";
import { isoNow, localDateString } from "@/lib/dates";
import { recommendToday, type RecommendationTask, type TodayMode } from "@/lib/recommendation";
import {
  dailyPlanGenerateSchema,
  goalCreateSchema,
  goalUpdateSchema,
  inboxConvertGoalSchema,
  inboxConvertProjectSchema,
  inboxConvertTaskSchema,
  inboxCreateSchema,
  inboxUpdateSchema,
  projectCreateSchema,
  projectUpdateSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from "@/lib/schemas";

const STORAGE_KEY = "next-personal-execution-system.local-db.v1";
const INDEXED_DB_NAME = "next-personal-execution-system";
const INDEXED_DB_STORE = "kv";
const INDEXED_DB_RECORD_KEY = "local-db";
const BACKUP_VERSION = 1;
const MAX_FOCI = 4;

type StoredGoal = Goal & {
  domainId?: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredProject = Omit<Project, "lastActiveAt"> & {
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredTask = Omit<Task, "isBlocked"> & {
  isBlocked: boolean;
  updatedAt: string;
  scoreSnapshot?: string | null;
};

type StoredInboxItem = InboxItem & {
  source: string;
  createdAt: string;
  updatedAt: string;
};

type StoredDailyPlan = Omit<DailyPlan, "foci"> & {
  createdAt: string;
  updatedAt: string;
};

type StoredDailyFocus = Omit<DailyFocus, "task" | "parsedScoreDetail"> & {
  dailyPlanId: string;
  scoreDetail: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredWorkSession = Omit<WorkSession, "task"> & {
  createdAt: string;
};

type LocalDb = {
  version: number;
  goals: StoredGoal[];
  projects: StoredProject[];
  tasks: StoredTask[];
  inboxItems: StoredInboxItem[];
  dailyPlans: StoredDailyPlan[];
  dailyFoci: StoredDailyFocus[];
  workSessions: StoredWorkSession[];
  dailyReviews: DailyReview[];
  aiRecommendationLogs: unknown[];
};

type ImportStrategy = "skip" | "overwrite";

type ImportTableResult = {
  created: number;
  overwritten: number;
  skipped: number;
};

type ImportResult = {
  strategy: ImportStrategy;
  importedAt: string;
  tables: Record<string, ImportTableResult>;
};

const GOAL_STATUSES = new Set(["active", "paused", "completed", "archived"]);
const PROJECT_STATUSES = new Set(["active", "paused", "completed", "archived"]);
const TASK_STATUSES = new Set(["todo", "doing", "done", "skipped", "archived"]);
const INBOX_STATUSES = new Set(["unprocessed", "converted", "ignored", "archived"]);
const PLAN_STATUSES = new Set(["draft", "active", "reviewed"]);
const FOCUS_STATUSES = new Set(["planned", "doing", "done", "missed"]);
const REVIEW_SOURCES = new Set(["manual", "ai", "local"]);

function emptyDb(): LocalDb {
  return {
    version: BACKUP_VERSION,
    goals: [],
    projects: [],
    tasks: [],
    inboxItems: [],
    dailyPlans: [],
    dailyFoci: [],
    workSessions: [],
    dailyReviews: [],
    aiRecommendationLogs: [],
  };
}

function ensureBrowser() {
  if (typeof window === "undefined") {
    throw new Error("本地数据只能在手机或浏览器中读取");
  }
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeDb(value: unknown): LocalDb {
  if (!value || typeof value !== "object") {
    return emptyDb();
  }

  const input = value as Partial<LocalDb>;

  return {
    version: BACKUP_VERSION,
    goals: ensureArray<StoredGoal>(input.goals),
    projects: ensureArray<StoredProject>(input.projects),
    tasks: ensureArray<StoredTask>(input.tasks),
    inboxItems: ensureArray<StoredInboxItem>(input.inboxItems),
    dailyPlans: ensureArray<StoredDailyPlan>(input.dailyPlans),
    dailyFoci: ensureArray<StoredDailyFocus>(input.dailyFoci),
    workSessions: ensureArray<StoredWorkSession>(input.workSessions),
    dailyReviews: ensureArray<DailyReview>(input.dailyReviews),
    aiRecommendationLogs: ensureArray<unknown>(input.aiRecommendationLogs),
  };
}

function readLocalStorageDb(): LocalDb {
  ensureBrowser();
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return emptyDb();
  }

  try {
    return normalizeDb(JSON.parse(raw));
  } catch {
    return emptyDb();
  }
}

function writeLocalStorageDb(db: LocalDb) {
  ensureBrowser();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function openIndexedDb() {
  ensureBrowser();

  if (!window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = window.indexedDB.open(INDEXED_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
        db.createObjectStore(INDEXED_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
    request.onblocked = () => reject(new Error("IndexedDB 正被其他页面占用"));
  });
}

async function readIndexedDbRecord() {
  const db = await openIndexedDb();
  if (!db) {
    return null;
  }

  try {
    return await new Promise<unknown | null>((resolve, reject) => {
      const transaction = db.transaction(INDEXED_DB_STORE, "readonly");
      const store = transaction.objectStore(INDEXED_DB_STORE);
      const request = store.get(INDEXED_DB_RECORD_KEY);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 读取失败"));
    });
  } finally {
    db.close();
  }
}

async function writeIndexedDbRecord(dbValue: LocalDb) {
  const db = await openIndexedDb();
  if (!db) {
    return false;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(INDEXED_DB_STORE, "readwrite");
      const store = transaction.objectStore(INDEXED_DB_STORE);
      const request = store.put(dbValue, INDEXED_DB_RECORD_KEY);

      request.onerror = () => reject(request.error ?? new Error("IndexedDB 写入失败"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 写入失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 写入中断"));
    });
    return true;
  } finally {
    db.close();
  }
}

async function readDb(): Promise<LocalDb> {
  ensureBrowser();

  try {
    const indexedValue = await readIndexedDbRecord();
    if (indexedValue) {
      return normalizeDb(indexedValue);
    }

    const legacyDb = readLocalStorageDb();
    if (window.localStorage.getItem(STORAGE_KEY)) {
      const migrated = await writeIndexedDbRecord(legacyDb).catch(() => false);
      if (migrated) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    return legacyDb;
  } catch {
    return readLocalStorageDb();
  }
}

async function writeDb(db: LocalDb) {
  ensureBrowser();

  try {
    const wroteIndexedDb = await writeIndexedDbRecord(db);
    if (wroteIndexedDb) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
  } catch {
    // Fall through to localStorage for older WebViews or blocked IndexedDB.
  }

  writeLocalStorageDb(db);
}

async function updateDb<T>(mutate: (db: LocalDb) => T): Promise<T> {
  const db = await readDb();
  const result = mutate(db);
  await writeDb(db);

  return result;
}

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function definedEntries<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function sortCreatedDesc<T extends { createdAt?: string }>(items: T[]) {
  return [...items].sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
}

function parseScoreDetail(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

type ImportPayload = Pick<
  LocalDb,
  | "goals"
  | "projects"
  | "tasks"
  | "inboxItems"
  | "dailyPlans"
  | "dailyFoci"
  | "workSessions"
  | "dailyReviews"
  | "aiRecommendationLogs"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function backupTable<T>(input: Record<string, unknown>, key: keyof ImportPayload): T[] {
  const value = input[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`备份文件 ${key} 必须是数组`);
  }

  return value as T[];
}

function parseImportPayload(payload: unknown): ImportPayload {
  if (!isRecord(payload)) {
    throw new Error("备份文件格式不正确");
  }

  if (payload.version !== undefined && payload.version !== BACKUP_VERSION) {
    throw new Error(`备份文件版本不支持：${String(payload.version)}`);
  }

  return {
    goals: backupTable<StoredGoal>(payload, "goals"),
    projects: backupTable<StoredProject>(payload, "projects"),
    tasks: backupTable<StoredTask>(payload, "tasks"),
    inboxItems: backupTable<StoredInboxItem>(payload, "inboxItems"),
    dailyPlans: backupTable<StoredDailyPlan>(payload, "dailyPlans"),
    dailyFoci: backupTable<StoredDailyFocus>(payload, "dailyFoci"),
    workSessions: backupTable<StoredWorkSession>(payload, "workSessions"),
    dailyReviews: backupTable<DailyReview>(payload, "dailyReviews"),
    aiRecommendationLogs: backupTable<unknown>(payload, "aiRecommendationLogs"),
  };
}

function cloneDb(db: LocalDb): LocalDb {
  return {
    version: db.version,
    goals: [...db.goals],
    projects: [...db.projects],
    tasks: [...db.tasks],
    inboxItems: [...db.inboxItems],
    dailyPlans: [...db.dailyPlans],
    dailyFoci: [...db.dailyFoci],
    workSessions: [...db.workSessions],
    dailyReviews: [...db.dailyReviews],
    aiRecommendationLogs: [...db.aiRecommendationLogs],
  };
}

function applyImport(db: LocalDb, payload: ImportPayload, strategy: ImportStrategy) {
  return {
    goals: importRows("goals", db.goals, payload.goals, strategy),
    projects: importRows("projects", db.projects, payload.projects, strategy),
    tasks: importRows("tasks", db.tasks, payload.tasks, strategy),
    inboxItems: importRows("inboxItems", db.inboxItems, payload.inboxItems, strategy),
    dailyPlans: importRows("dailyPlans", db.dailyPlans, payload.dailyPlans, strategy),
    dailyFoci: importRows("dailyFoci", db.dailyFoci, payload.dailyFoci, strategy),
    workSessions: importRows("workSessions", db.workSessions, payload.workSessions, strategy),
    dailyReviews: importRows("dailyReviews", db.dailyReviews, payload.dailyReviews, strategy),
    aiRecommendationLogs: importRows(
      "aiRecommendationLogs",
      db.aiRecommendationLogs as { id: string }[],
      payload.aiRecommendationLogs as { id: string }[],
      strategy,
    ),
  };
}

function assertString(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`备份数据 ${path} 必须是非空字符串`);
  }
}

function assertNullableString(value: unknown, path: string) {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(`备份数据 ${path} 必须是字符串或 null`);
  }
}

function assertBoolean(value: unknown, path: string) {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`备份数据 ${path} 必须是布尔值`);
  }
}

function assertIntRange(value: unknown, path: string, min: number, max: number, optional = false) {
  if (optional && (value === undefined || value === null)) {
    return;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`备份数据 ${path} 必须是 ${min}-${max} 的整数`);
  }
}

function assertNumberRange(value: unknown, path: string, min: number, max: number, optional = false) {
  if (optional && (value === undefined || value === null)) {
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`备份数据 ${path} 必须是 ${min}-${max} 的数字`);
  }
}

function assertStatus(value: unknown, allowed: Set<string>, path: string) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`备份数据 ${path} 状态不合法`);
  }
}

function assertDate(value: unknown, path: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`备份数据 ${path} 必须是 YYYY-MM-DD`);
  }
}

function assertExistingId(value: unknown, ids: Set<string>, path: string) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (typeof value !== "string" || !ids.has(value)) {
    throw new Error(`备份数据 ${path} 引用了不存在的数据`);
  }
}

function validateTable(
  tableName: string,
  rows: unknown[],
  validate: (row: Record<string, unknown>, path: string) => void,
) {
  const ids = new Set<string>();

  rows.forEach((row, index) => {
    const path = `${tableName}[${index}]`;
    if (!isRecord(row)) {
      throw new Error(`备份数据 ${path} 必须是对象`);
    }
    assertString(row.id, `${path}.id`);
    const idValue = row.id;
    if (typeof idValue !== "string") {
      throw new Error(`备份数据 ${path}.id 必须是非空字符串`);
    }
    if (ids.has(idValue)) {
      throw new Error(`备份数据 ${path}.id 重复`);
    }
    ids.add(idValue);
    validate(row, path);
  });

  return ids;
}

function validateUniqueField(rows: unknown[], field: string, tableName: string) {
  const values = new Set<string>();

  rows.forEach((row, index) => {
    if (!isRecord(row)) {
      return;
    }
    const value = row[field];
    if (typeof value !== "string") {
      return;
    }
    if (values.has(value)) {
      throw new Error(`备份数据 ${tableName}[${index}].${field} 重复`);
    }
    values.add(value);
  });
}

function validateLocalDb(db: LocalDb) {
  const goalIds = validateTable("goals", db.goals, (row, path) => {
    assertString(row.title, `${path}.title`);
    assertStatus(row.status, GOAL_STATUSES, `${path}.status`);
    assertIntRange(row.importance, `${path}.importance`, 1, 5);
    assertNumberRange(row.progress, `${path}.progress`, 0, 100, true);
  });

  const projectIds = validateTable("projects", db.projects, (row, path) => {
    assertString(row.title, `${path}.title`);
    assertStatus(row.status, PROJECT_STATUSES, `${path}.status`);
    assertNumberRange(row.progress, `${path}.progress`, 0, 100, true);
    assertExistingId(row.goalId, goalIds, `${path}.goalId`);
  });

  const taskIds = validateTable("tasks", db.tasks, (row, path) => {
    assertString(row.title, `${path}.title`);
    assertStatus(row.status, TASK_STATUSES, `${path}.status`);
    assertIntRange(row.priorityManual, `${path}.priorityManual`, 1, 5, true);
    assertIntRange(row.estimateMin, `${path}.estimateMin`, 1, 720, true);
    assertIntRange(row.actualMin, `${path}.actualMin`, 0, Number.MAX_SAFE_INTEGER, true);
    assertBoolean(row.isBlocked, `${path}.isBlocked`);
    assertExistingId(row.projectId, projectIds, `${path}.projectId`);
    assertExistingId(row.goalId, goalIds, `${path}.goalId`);
  });

  validateTable("inboxItems", db.inboxItems, (row, path) => {
    assertString(row.rawText, `${path}.rawText`);
    assertStatus(row.status, INBOX_STATUSES, `${path}.status`);
    assertExistingId(row.convertedTaskId, taskIds, `${path}.convertedTaskId`);
    assertExistingId(row.convertedProjectId, projectIds, `${path}.convertedProjectId`);
    assertExistingId(row.convertedGoalId, goalIds, `${path}.convertedGoalId`);
  });

  const planIds = validateTable("dailyPlans", db.dailyPlans, (row, path) => {
    assertDate(row.date, `${path}.date`);
    assertIntRange(row.availableMinutes, `${path}.availableMinutes`, 10, 720);
    assertIntRange(row.energy, `${path}.energy`, 1, 5, true);
    assertIntRange(row.mood, `${path}.mood`, 1, 5, true);
    assertStatus(row.status, PLAN_STATUSES, `${path}.status`);
  });
  validateUniqueField(db.dailyPlans, "date", "dailyPlans");

  const focusRanksByPlan = new Map<string, Set<number>>();
  validateTable("dailyFoci", db.dailyFoci, (row, path) => {
    assertExistingId(row.dailyPlanId, planIds, `${path}.dailyPlanId`);
    assertExistingId(row.taskId, taskIds, `${path}.taskId`);
    assertIntRange(row.rank, `${path}.rank`, 1, MAX_FOCI);
    assertIntRange(row.plannedMinutes, `${path}.plannedMinutes`, 1, 720, true);
    assertStatus(row.status, FOCUS_STATUSES, `${path}.status`);
    assertNullableString(row.scoreDetail, `${path}.scoreDetail`);

    const dailyPlanId = String(row.dailyPlanId);
    const ranks = focusRanksByPlan.get(dailyPlanId) ?? new Set<number>();
    const rank = Number(row.rank);
    if (ranks.has(rank)) {
      throw new Error(`备份数据 ${path}.rank 在同一天计划内重复`);
    }
    ranks.add(rank);
    focusRanksByPlan.set(dailyPlanId, ranks);
  });

  validateTable("workSessions", db.workSessions, (row, path) => {
    assertExistingId(row.taskId, taskIds, `${path}.taskId`);
    assertString(row.startAt, `${path}.startAt`);
    assertNullableString(row.endAt, `${path}.endAt`);
    assertIntRange(row.durationMin, `${path}.durationMin`, 0, Number.MAX_SAFE_INTEGER, true);
    assertIntRange(row.focusScore, `${path}.focusScore`, 1, 5, true);
    assertNullableString(row.note, `${path}.note`);
  });

  validateTable("dailyReviews", db.dailyReviews, (row, path) => {
    assertDate(row.date, `${path}.date`);
    assertString(row.content, `${path}.content`);
    assertStatus(row.source, REVIEW_SOURCES, `${path}.source`);
    assertNullableString(row.metricsSnapshot, `${path}.metricsSnapshot`);
  });
  validateUniqueField(db.dailyReviews, "date", "dailyReviews");

  validateTable("aiRecommendationLogs", db.aiRecommendationLogs, () => undefined);
}

function hydrateGoal(goal: StoredGoal): Goal {
  return goal;
}

function hydrateProject(db: LocalDb, project: StoredProject): Project {
  return {
    ...project,
    goal: project.goalId ? (db.goals.find((goal) => goal.id === project.goalId) ?? null) : null,
  };
}

function hydrateTask(db: LocalDb, task: StoredTask): Task {
  return {
    ...task,
    goal: task.goalId ? (db.goals.find((goal) => goal.id === task.goalId) ?? null) : null,
    project: task.projectId ? hydrateProject(db, db.projects.find((project) => project.id === task.projectId) ?? nullProject()) : null,
  };
}

function nullProject(): StoredProject {
  return {
    id: "",
    title: "",
    description: null,
    status: "archived",
    progress: 0,
    startDate: null,
    targetDate: null,
    lastActiveAt: null,
    goalId: null,
    createdAt: "",
    updatedAt: "",
  };
}

function hydrateFocus(db: LocalDb, focus: StoredDailyFocus): DailyFocus {
  const task = db.tasks.find((item) => item.id === focus.taskId);

  return {
    ...focus,
    parsedScoreDetail: parseScoreDetail(focus.scoreDetail),
    task: task ? hydrateTask(db, task) : hydrateTask(db, missingTask(focus.taskId)),
  };
}

function missingTask(taskId: string): StoredTask {
  return {
    id: taskId,
    title: "任务不存在",
    description: null,
    status: "archived",
    priorityManual: null,
    estimateMin: null,
    actualMin: 0,
    dueAt: null,
    taskType: null,
    energyLevel: null,
    isBlocked: false,
    projectId: null,
    goalId: null,
    createdAt: "",
    updatedAt: "",
  };
}

function hydratePlan(db: LocalDb, plan: StoredDailyPlan): DailyPlan {
  const foci = db.dailyFoci
    .filter((focus) => focus.dailyPlanId === plan.id)
    .sort((left, right) => left.rank - right.rank)
    .map((focus) => hydrateFocus(db, focus));

  return { ...plan, foci };
}

function hydrateSession(db: LocalDb, session: StoredWorkSession): WorkSession {
  const task = db.tasks.find((item) => item.id === session.taskId);

  return {
    ...session,
    task: task ? hydrateTask(db, task) : hydrateTask(db, missingTask(session.taskId)),
  };
}

function recommendationTasks(db: LocalDb): RecommendationTask[] {
  return db.tasks.map((task) => ({
    ...task,
    goal: task.goalId ? (db.goals.find((goal) => goal.id === task.goalId) ?? null) : null,
    project: task.projectId ? (db.projects.find((project) => project.id === task.projectId) ?? null) : null,
    inboxItems: db.inboxItems.filter((item) => item.convertedTaskId === task.id),
    workSessions: db.workSessions.filter((session) => session.taskId === task.id),
    dailyFoci: db.dailyFoci
      .filter((focus) => focus.taskId === task.id)
      .map((focus) => ({
        status: focus.status,
        createdAt: focus.createdAt,
        updatedAt: focus.updatedAt,
        dailyPlan: db.dailyPlans.find((plan) => plan.id === focus.dailyPlanId) ?? null,
      })),
  }));
}

function durationMinutes(startAt: string, endAt: string) {
  const durationMs = new Date(endAt).getTime() - new Date(startAt).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }

  return Math.ceil(durationMs / 60_000);
}

function activeSessionInDb(db: LocalDb) {
  return [...db.workSessions]
    .filter((session) => !session.endAt)
    .sort((left, right) => right.startAt.localeCompare(left.startAt))[0] ?? null;
}

function startWorkSessionInDb(db: LocalDb, input: { taskId: string; dailyFocusId?: string }) {
  if (activeSessionInDb(db)) {
    throw new Error("已有进行中的执行记录，请先结束当前任务");
  }

  const timestamp = isoNow();
  const task = db.tasks.find((item) => item.id === input.taskId);

  if (!task) {
    throw new Error("任务不存在");
  }

  if (["done", "skipped", "archived"].includes(task.status)) {
    throw new Error("当前任务状态不能开始执行，请先重新打开任务");
  }

  if (input.dailyFocusId) {
    const focus = db.dailyFoci.find((item) => item.id === input.dailyFocusId);

    if (!focus) {
      throw new Error("今日推荐不存在");
    }

    for (const other of db.dailyFoci) {
      if (other.dailyPlanId === focus.dailyPlanId && other.status === "doing" && other.id !== focus.id) {
        other.status = "planned";
        other.updatedAt = timestamp;
        const otherTask = db.tasks.find((item) => item.id === other.taskId);
        if (otherTask?.status === "doing") {
          otherTask.status = "todo";
          otherTask.updatedAt = timestamp;
        }
      }
    }

    focus.status = "doing";
    focus.updatedAt = timestamp;
  }

  task.status = "doing";
  task.updatedAt = timestamp;

  const session: StoredWorkSession = {
    id: id(),
    taskId: task.id,
    startAt: timestamp,
    endAt: null,
    durationMin: null,
    focusScore: null,
    note: null,
    createdAt: timestamp,
  };
  db.workSessions.push(session);

  return hydrateSession(db, session);
}

function finishWorkSessionInDb(
  db: LocalDb,
  input: { sessionId: string; status: "done" | "todo" | "skipped"; focusScore?: number | null; note?: string | null; dailyFocusId?: string },
) {
  const session = db.workSessions.find((item) => item.id === input.sessionId);

  if (!session) {
    throw new Error("执行记录不存在");
  }

  if (session.endAt) {
    throw new Error("执行记录已经结束");
  }

  const timestamp = isoNow();
  const durationMin = durationMinutes(session.startAt, timestamp);
  session.endAt = timestamp;
  session.durationMin = durationMin;
  session.focusScore = input.focusScore ?? null;
  session.note = input.note ?? null;

  const task = db.tasks.find((item) => item.id === session.taskId);
  if (task) {
    task.status = input.status;
    task.actualMin = (task.actualMin ?? 0) + durationMin;
    task.updatedAt = timestamp;

    const project = task.projectId ? db.projects.find((item) => item.id === task.projectId) : null;
    if (project) {
      project.lastActiveAt = timestamp;
      project.updatedAt = timestamp;
    }
  }

  const nextFocusStatus = input.status === "done" ? "done" : input.status === "skipped" ? "missed" : "planned";
  for (const focus of db.dailyFoci) {
    if ((input.dailyFocusId && focus.id === input.dailyFocusId) || (!input.dailyFocusId && focus.taskId === session.taskId && focus.status === "doing")) {
      focus.status = nextFocusStatus;
      focus.updatedAt = timestamp;
    }
  }

  return hydrateSession(db, session);
}

function compressFocusRanks(db: LocalDb, dailyPlanId: string, timestamp = isoNow()) {
  db.dailyFoci
    .filter((focus) => focus.dailyPlanId === dailyPlanId)
    .sort((left, right) => left.rank - right.rank)
    .forEach((focus, index) => {
      const rank = index + 1;
      if (focus.rank !== rank) {
        focus.rank = rank;
        focus.updatedAt = timestamp;
      }
    });
}

function localInboxSuggestions(text: string, maxSuggestions: number): TaskSuggestion[] {
  const chunks = text
    .split(/[\n。；;，,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const base = chunks.length > 0 ? chunks : [text.trim()];

  return base.slice(0, maxSuggestions).map((chunk) => ({
    title: chunk.length > 42 ? chunk.slice(0, 42) : chunk,
    description: text.trim(),
    estimateMin: 45,
    priorityManual: 3,
    taskType: "deep_work",
    energyLevel: "medium",
    reason: "本地建议：从 Inbox 原文拆出可执行任务，需要确认后创建。",
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
    reason: "本地建议：按项目推进顺序生成，需要确认后创建。",
  }));
}

export const localData = {
  async listGoals() {
    return sortCreatedDesc((await readDb()).goals).map(hydrateGoal);
  },

  async listProjects() {
    const db = await readDb();
    return sortCreatedDesc(db.projects).map((project) => hydrateProject(db, project));
  },

  async listTasks() {
    const db = await readDb();
    return sortCreatedDesc(db.tasks).map((task) => hydrateTask(db, task));
  },

  async listInboxItems() {
    return sortCreatedDesc((await readDb()).inboxItems);
  },

  async getToday(date = localDateString()): Promise<TodayState> {
    const db = await readDb();
    const plan = db.dailyPlans.find((item) => item.date === date && item.status === "active");

    return {
      date,
      plan: plan ? hydratePlan(db, plan) : null,
      openTaskCount: db.tasks.filter((task) => ["todo", "doing"].includes(task.status) && !task.isBlocked).length,
      inboxCount: db.inboxItems.filter((item) => item.status === "unprocessed").length,
    };
  },

  async getActiveSession() {
    const db = await readDb();
    const session = activeSessionInDb(db);

    return session ? hydrateSession(db, session) : null;
  },

  async createGoal(input: unknown) {
    return updateDb((db) => {
      const data = goalCreateSchema.parse(input);
      const timestamp = isoNow();
      const goal: StoredGoal = {
        id: id(),
        domainId: data.domainId ?? null,
        title: data.title,
        description: data.description ?? null,
        importance: data.importance,
        startDate: data.startDate ?? null,
        targetDate: data.targetDate ?? null,
        status: data.status,
        progress: data.progress,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.goals.push(goal);
      return hydrateGoal(goal);
    });
  },

  async updateGoal(goalId: string, input: unknown) {
    return updateDb((db) => {
      const data = definedEntries(goalUpdateSchema.parse(input));
      const goal = db.goals.find((item) => item.id === goalId);
      if (!goal) {
        throw new Error("目标不存在");
      }
      Object.assign(goal, data, { updatedAt: isoNow() });
      return hydrateGoal(goal);
    });
  },

  async createProject(input: unknown) {
    return updateDb((db) => {
      const data = projectCreateSchema.parse(input);
      const timestamp = isoNow();
      const project: StoredProject = {
        id: id(),
        goalId: data.goalId ?? null,
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        progress: data.progress,
        startDate: data.startDate ?? null,
        targetDate: data.targetDate ?? null,
        lastActiveAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.projects.push(project);
      return hydrateProject(db, project);
    });
  },

  async updateProject(projectId: string, input: unknown) {
    return updateDb((db) => {
      const data = definedEntries(projectUpdateSchema.parse(input));
      const project = db.projects.find((item) => item.id === projectId);
      if (!project) {
        throw new Error("项目不存在");
      }
      Object.assign(project, data, { updatedAt: isoNow() });
      return hydrateProject(db, project);
    });
  },

  async createTask(input: unknown) {
    return updateDb((db) => {
      const data = taskCreateSchema.parse(input);
      const timestamp = isoNow();
      const task: StoredTask = {
        id: id(),
        projectId: data.projectId ?? null,
        goalId: data.goalId ?? null,
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        priorityManual: data.priorityManual ?? null,
        estimateMin: data.estimateMin ?? null,
        actualMin: 0,
        dueAt: data.dueAt ?? null,
        taskType: data.taskType ?? null,
        energyLevel: data.energyLevel ?? null,
        isBlocked: data.isBlocked,
        scoreSnapshot: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.tasks.push(task);
      return hydrateTask(db, task);
    });
  },

  async updateTask(taskId: string, input: unknown) {
    return updateDb((db) => {
      const data = definedEntries(taskUpdateSchema.parse(input));
      const task = db.tasks.find((item) => item.id === taskId);
      if (!task) {
        throw new Error("任务不存在");
      }
      Object.assign(task, data, { updatedAt: isoNow() });
      return hydrateTask(db, task);
    });
  },

  async reopenTask(taskId: string) {
    return localData.updateTask(taskId, { status: "todo" });
  },

  async createInbox(input: unknown) {
    return updateDb((db) => {
      const data = inboxCreateSchema.parse(input);
      const timestamp = isoNow();
      const item: StoredInboxItem = {
        id: id(),
        rawText: data.rawText,
        source: data.source,
        status: "unprocessed",
        convertedTaskId: null,
        convertedProjectId: null,
        convertedGoalId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.inboxItems.push(item);
      return item;
    });
  },

  async updateInbox(itemId: string, input: unknown) {
    return updateDb((db) => {
      const data = inboxUpdateSchema.parse(input);
      const item = db.inboxItems.find((entry) => entry.id === itemId);
      if (!item) {
        throw new Error("Inbox 条目不存在");
      }
      item.status = data.status;
      item.updatedAt = isoNow();
      return item;
    });
  },

  async convertInboxToTask(itemId: string, input: unknown) {
    return updateDb((db) => {
      const data = inboxConvertTaskSchema.parse(input);
      const item = db.inboxItems.find((entry) => entry.id === itemId);
      if (!item) {
        throw new Error("Inbox 条目不存在");
      }
      if (item.status === "converted") {
        throw new Error("该 Inbox 条目已转换，不能重复转换");
      }
      const timestamp = isoNow();
      const task: StoredTask = {
        id: id(),
        title: data.title,
        description: null,
        projectId: data.projectId ?? null,
        goalId: data.goalId ?? null,
        status: "todo",
        priorityManual: null,
        estimateMin: data.estimateMin ?? null,
        actualMin: 0,
        dueAt: null,
        taskType: null,
        energyLevel: null,
        isBlocked: false,
        scoreSnapshot: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.tasks.push(task);
      item.status = "converted";
      item.convertedTaskId = task.id;
      item.updatedAt = timestamp;
      return { task: hydrateTask(db, task), inboxItem: item };
    });
  },

  async convertInboxToProject(itemId: string, input: unknown) {
    return updateDb((db) => {
      const data = inboxConvertProjectSchema.parse(input);
      const item = db.inboxItems.find((entry) => entry.id === itemId);
      if (!item) {
        throw new Error("Inbox 条目不存在");
      }
      if (item.status === "converted") {
        throw new Error("该 Inbox 条目已转换，不能重复转换");
      }
      const timestamp = isoNow();
      const project: StoredProject = {
        id: id(),
        title: data.title,
        description: data.description ?? null,
        goalId: data.goalId ?? null,
        status: "active",
        progress: 0,
        startDate: null,
        targetDate: null,
        lastActiveAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.projects.push(project);
      item.status = "converted";
      item.convertedProjectId = project.id;
      item.updatedAt = timestamp;
      return { project: hydrateProject(db, project), inboxItem: item };
    });
  },

  async convertInboxToGoal(itemId: string, input: unknown) {
    return updateDb((db) => {
      const data = inboxConvertGoalSchema.parse(input);
      const item = db.inboxItems.find((entry) => entry.id === itemId);
      if (!item) {
        throw new Error("Inbox 条目不存在");
      }
      if (item.status === "converted") {
        throw new Error("该 Inbox 条目已转换，不能重复转换");
      }
      const timestamp = isoNow();
      const goal: StoredGoal = {
        id: id(),
        domainId: null,
        title: data.title,
        description: data.description ?? null,
        importance: data.importance,
        startDate: null,
        targetDate: null,
        status: "active",
        progress: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.goals.push(goal);
      item.status = "converted";
      item.convertedGoalId = goal.id;
      item.updatedAt = timestamp;
      return { goal: hydrateGoal(goal), inboxItem: item };
    });
  },

  async generateDailyPlan(input: unknown) {
    return updateDb((db) => {
      const data = dailyPlanGenerateSchema.parse(input);
      const date = data.date ?? localDateString();
      const availableMinutes = data.availableMinutes;
      if (availableMinutes === undefined) {
        throw new Error("今日可用时间不能为空");
      }
      const existing = db.dailyPlans.find((plan) => plan.date === date);

      if (existing && existing.status === "active" && db.dailyFoci.some((focus) => focus.dailyPlanId === existing.id) && !data.overwrite) {
        throw new Error("今天已经生成推荐，确认覆盖后再重新生成");
      }

      const recommendations = recommendToday({
        tasks: recommendationTasks(db),
        availableMinutes,
        energy: data.energy,
        mood: data.mood,
        mode: data.mode as TodayMode,
      });
      const timestamp = isoNow();
      const plan =
        existing ??
        ({
          id: id(),
          date,
          availableMinutes,
          energy: data.energy,
          mood: data.mood,
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        } satisfies StoredDailyPlan);

      if (!existing) {
        db.dailyPlans.push(plan);
      } else {
        plan.availableMinutes = availableMinutes;
        plan.energy = data.energy;
        plan.mood = data.mood;
        plan.status = "active";
        plan.updatedAt = timestamp;
      }

      db.dailyFoci = db.dailyFoci.filter((focus) => focus.dailyPlanId !== plan.id);

      for (const recommendation of recommendations) {
        const scoreDetail = JSON.stringify(recommendation.scoreDetail);
        db.dailyFoci.push({
          id: id(),
          dailyPlanId: plan.id,
          taskId: recommendation.task.id,
          rank: recommendation.rank,
          plannedMinutes: recommendation.scoreDetail.estimateMin,
          reason: recommendation.reason,
          scoreDetail,
          status: "planned",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        const task = db.tasks.find((item) => item.id === recommendation.task.id);
        if (task) {
          task.scoreSnapshot = scoreDetail;
          task.updatedAt = timestamp;
        }
      }

      return hydratePlan(db, plan);
    });
  },

  async addDailyFocus(taskId: string) {
    return updateDb((db) => {
      const date = localDateString();
      const plan = db.dailyPlans.find((item) => item.date === date && item.status === "active");
      if (!plan) {
        throw new Error("今天还没有生成推荐，请先生成今日计划");
      }
      const planFoci = db.dailyFoci.filter((focus) => focus.dailyPlanId === plan.id);
      if (planFoci.length >= MAX_FOCI) {
        throw new Error("今日推荐已满 4 条，请先跳过一个再加入");
      }
      if (planFoci.some((focus) => focus.taskId === taskId)) {
        throw new Error("该任务已经在今日推荐里");
      }
      const task = db.tasks.find((item) => item.id === taskId);
      if (!task) {
        throw new Error("任务不存在");
      }
      if (!["todo", "doing"].includes(task.status) || task.isBlocked) {
        throw new Error("该任务已完成、被阻塞或状态不可加入");
      }

      const [recommendation] = recommendToday({
        tasks: recommendationTasks(db).filter((item) => item.id === taskId),
        availableMinutes: plan.availableMinutes,
        energy: plan.energy,
        mood: plan.mood,
        mode: "progress",
      });
      const timestamp = isoNow();
      const scoreDetail = recommendation ? JSON.stringify(recommendation.scoreDetail) : null;
      const focus: StoredDailyFocus = {
        id: id(),
        dailyPlanId: plan.id,
        taskId,
        rank: Math.max(0, ...planFoci.map((item) => item.rank)) + 1,
        plannedMinutes: recommendation?.scoreDetail.estimateMin ?? task.estimateMin ?? null,
        reason: recommendation ? `${recommendation.reason}\n（手动加入今日）` : "手动加入今日推荐。",
        scoreDetail,
        status: "planned",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.dailyFoci.push(focus);
      if (scoreDetail) {
        task.scoreSnapshot = scoreDetail;
        task.updatedAt = timestamp;
      }
      return hydrateFocus(db, focus);
    });
  },

  async updateDailyFocus(focusId: string, action: "start" | "complete" | "skip") {
    return updateDb((db) => {
      const focus = db.dailyFoci.find((item) => item.id === focusId);
      if (!focus) {
        throw new Error("今日推荐不存在");
      }

      if (action === "start") {
        startWorkSessionInDb(db, { taskId: focus.taskId, dailyFocusId: focus.id });
      }

      if (action === "complete") {
        const session = [...db.workSessions]
          .filter((item) => item.taskId === focus.taskId && !item.endAt)
          .sort((left, right) => right.startAt.localeCompare(left.startAt))[0];
        if (!session) {
          throw new Error("请先开始任务，再完成任务");
        }
        finishWorkSessionInDb(db, { sessionId: session.id, status: "done", dailyFocusId: focus.id });
      }

      if (action === "skip") {
        const session = [...db.workSessions]
          .filter((item) => item.taskId === focus.taskId && !item.endAt)
          .sort((left, right) => right.startAt.localeCompare(left.startAt))[0];
        if (session) {
          finishWorkSessionInDb(db, { sessionId: session.id, status: "skipped", dailyFocusId: focus.id });
        } else {
          const task = db.tasks.find((item) => item.id === focus.taskId);
          if (task) {
            task.status = "skipped";
            task.updatedAt = isoNow();
          }
        }
        db.dailyFoci = db.dailyFoci.filter((item) => item.id !== focus.id);
        compressFocusRanks(db, focus.dailyPlanId);
        return null;
      }

      const updated = db.dailyFoci.find((item) => item.id === focusId);
      return updated ? hydrateFocus(db, updated) : null;
    });
  },

  async promoteFocus(focusId: string) {
    return updateDb((db) => {
      const target = db.dailyFoci.find((focus) => focus.id === focusId);
      if (!target) {
        throw new Error("今日推荐不存在");
      }
      if (target.rank === 1) {
        throw new Error("该任务已经是主任务");
      }
      const main = db.dailyFoci.find((focus) => focus.dailyPlanId === target.dailyPlanId && focus.rank === 1);
      const timestamp = isoNow();
      if (main) {
        main.rank = target.rank;
        main.updatedAt = timestamp;
      }
      target.rank = 1;
      target.updatedAt = timestamp;
      return hydrateFocus(db, target);
    });
  },

  async finishSession(sessionId: string, status: "done" | "todo" | "skipped") {
    return updateDb((db) => finishWorkSessionInDb(db, { sessionId, status }));
  },

  async getSavedReview(date: string) {
    const review = (await readDb()).dailyReviews.find((item) => item.date === date) ?? null;
    return { date, review };
  },

  async generateReviewDraft(date: string) {
    const db = await readDb();
    const context = buildReviewContext(db, date);
    const localDraft = buildLocalReviewDraft(context);
    const draft = await generateDailyReviewDraftWithAi(context, localDraft);

    return {
      date,
      draft: draft.draft,
      source: draft.source,
      aiError: draft.aiError ?? null,
      metrics: context.metrics,
    };
  },

  async saveReview(input: { date: string; content: string; source: "manual" | "ai" | "local"; metrics?: unknown }) {
    return updateDb((db) => {
      if (!input.content.trim()) {
        throw new Error("复盘内容不能为空");
      }
      const timestamp = isoNow();
      const existing = db.dailyReviews.find((review) => review.date === input.date);
      if (existing) {
        existing.content = input.content;
        existing.source = input.source;
        existing.metricsSnapshot = input.metrics ? JSON.stringify(input.metrics) : existing.metricsSnapshot;
        existing.updatedAt = timestamp;
        return existing;
      }
      const review: DailyReview = {
        id: id(),
        date: input.date,
        content: input.content,
        source: input.source,
        metricsSnapshot: input.metrics ? JSON.stringify(input.metrics) : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.dailyReviews.push(review);
      return review;
    });
  },

  async suggestTasksFromInbox(itemId: string, maxSuggestions = 3): Promise<AiTaskSuggestionResult> {
    const item = (await readDb()).inboxItems.find((entry) => entry.id === itemId);
    if (!item) {
      throw new Error("Inbox 条目不存在");
    }
    return suggestTasksFromInboxWithAi(item.rawText, localInboxSuggestions(item.rawText, maxSuggestions), maxSuggestions);
  },

  async suggestTasksFromProject(projectId: string, maxSuggestions = 4): Promise<AiTaskSuggestionResult> {
    const db = await readDb();
    const project = db.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const goalTitle = project.goalId ? db.goals.find((goal) => goal.id === project.goalId)?.title : null;

    return suggestTasksFromProjectWithAi(
      { title: project.title, description: project.description, goalTitle },
      localProjectSuggestions(project, maxSuggestions),
      maxSuggestions,
    );
  },

  async polishRecommendationReason(focusId: string): Promise<AiReasonResult> {
    const db = await readDb();
    const focus = db.dailyFoci.find((item) => item.id === focusId);
    if (!focus) {
      throw new Error("今日推荐不存在");
    }
    const task = db.tasks.find((item) => item.id === focus.taskId);
    const fallback = [
      `建议优先处理“${task?.title ?? "当前任务"}”。`,
      focus.reason ? `核心依据：${focus.reason}` : "核心依据来自本地规则评分与当前计划上下文。",
      "这只是解释润色，不改变本地推荐排序。",
    ].join("\n");

    return polishRecommendationReasonWithAi({
      taskTitle: task?.title ?? "当前任务",
      reason: focus.reason,
      scoreDetail: parseScoreDetail(focus.scoreDetail),
      fallback,
    });
  },

  async exportBackup() {
    const db = await readDb();
    return {
      version: BACKUP_VERSION,
      exportedAt: isoNow(),
      counts: {
        domains: 0,
        goals: db.goals.length,
        projects: db.projects.length,
        tasks: db.tasks.length,
        inboxItems: db.inboxItems.length,
        dailyPlans: db.dailyPlans.length,
        dailyFoci: db.dailyFoci.length,
        workSessions: db.workSessions.length,
        dailyReviews: db.dailyReviews.length,
        aiRecommendationLogs: db.aiRecommendationLogs.length,
      },
      domains: [],
      goals: db.goals,
      projects: db.projects,
      tasks: db.tasks,
      inboxItems: db.inboxItems,
      dailyPlans: db.dailyPlans,
      dailyFoci: db.dailyFoci,
      workSessions: db.workSessions,
      dailyReviews: db.dailyReviews,
      aiRecommendationLogs: db.aiRecommendationLogs,
    };
  },

  async importBackup(payload: unknown, strategy: ImportStrategy): Promise<ImportResult> {
    return updateDb((db) => {
      const input = parseImportPayload(payload);
      const nextDb = cloneDb(db);
      applyImport(nextDb, input, strategy);
      validateLocalDb(nextDb);
      const tables = applyImport(db, input, strategy);

      return {
        strategy,
        importedAt: isoNow(),
        tables,
      };
    });
  },
};

function importRows<T extends { id: string }>(
  tableName: string,
  target: T[],
  rows: T[],
  strategy: ImportStrategy,
): ImportTableResult {
  let created = 0;
  let overwritten = 0;
  let skipped = 0;

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row.id !== "string" || !row.id.trim()) {
      throw new Error(`备份数据 ${tableName}[${index}].id 必须是非空字符串`);
    }

    const existingIndex = target.findIndex((item) => item.id === row.id);

    if (existingIndex >= 0 && strategy === "skip") {
      skipped++;
      continue;
    }

    if (existingIndex >= 0) {
      target[existingIndex] = row;
      overwritten++;
      continue;
    }

    target.push(row);
    created++;
  }

  return { created, overwritten, skipped };
}

function buildReviewContext(db: LocalDb, date: string): DailyReviewContext {
  const plan = db.dailyPlans.find((item) => item.date === date) ?? null;
  const foci = plan
    ? db.dailyFoci
        .filter((focus) => focus.dailyPlanId === plan.id)
        .sort((left, right) => left.rank - right.rank)
        .map((focus) => hydrateFocus(db, focus))
    : [];
  const sessions = db.workSessions
    .filter((session) => session.startAt.slice(0, 10) === date)
    .sort((left, right) => left.startAt.localeCompare(right.startAt))
    .map((session) => hydrateSession(db, session));
  const totalSessionMinutes = sessions.reduce((total, session) => total + (session.durationMin ?? 0), 0);
  const scoredSessions = sessions.filter((session) => session.focusScore !== null);
  const averageFocusScore =
    scoredSessions.length > 0
      ? Number((scoredSessions.reduce((total, session) => total + (session.focusScore ?? 0), 0) / scoredSessions.length).toFixed(1))
      : null;

  return {
    date,
    plan: plan
      ? {
          id: plan.id,
          availableMinutes: plan.availableMinutes,
          mood: plan.mood,
          energy: plan.energy,
          foci,
        }
      : null,
    sessions,
    metrics: {
      plannedCount: foci.length,
      doneCount: foci.filter((focus) => focus.status === "done").length,
      missedCount: foci.filter((focus) => focus.status === "missed").length,
      openCount: foci.filter((focus) => ["planned", "doing"].includes(focus.status)).length,
      sessionCount: sessions.length,
      totalSessionMinutes,
      averageFocusScore,
    },
  };
}
