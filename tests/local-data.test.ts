import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { localData } from "../src/lib/client/local-data.ts";

const STORAGE_KEY = "next-personal-execution-system.local-db.v1";
const INDEXED_DB_RECORD_KEY = "local-db";
const NOW = "2026-06-27T08:00:00.000Z";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

function asyncSuccess<T extends { result?: unknown; onsuccess?: (() => void) | null }>(request: T, result?: unknown) {
  setTimeout(() => {
    request.result = result;
    request.onsuccess?.();
  }, 0);
}

class MemoryObjectStore {
  constructor(private readonly values: Map<string, unknown>) {}

  get(key: string) {
    const request: { result?: unknown; onsuccess?: (() => void) | null; onerror?: (() => void) | null; error?: Error } = {};
    asyncSuccess(request, this.values.get(key));
    return request;
  }

  put(value: unknown, key: string) {
    const request: { result?: unknown; onsuccess?: (() => void) | null; onerror?: (() => void) | null; error?: Error } = {};
    this.values.set(key, value);
    asyncSuccess(request, key);
    return request;
  }
}

class MemoryTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: Error | null = null;

  constructor(private readonly values: Map<string, unknown>) {
    setTimeout(() => this.oncomplete?.(), 0);
  }

  objectStore() {
    return new MemoryObjectStore(this.values);
  }
}

class MemoryDatabase {
  readonly objectStoreNames = {
    contains: () => true,
  };

  constructor(private readonly values: Map<string, unknown>) {}

  createObjectStore() {
    return new MemoryObjectStore(this.values);
  }

  transaction() {
    return new MemoryTransaction(this.values);
  }

  close() {
    return undefined;
  }
}

function createMemoryIndexedDb() {
  const values = new Map<string, unknown>();
  const database = new MemoryDatabase(values);

  return {
    values,
    indexedDB: {
      open: () => {
        const request: {
          result?: MemoryDatabase;
          onsuccess?: (() => void) | null;
          onerror?: (() => void) | null;
          onupgradeneeded?: (() => void) | null;
          onblocked?: (() => void) | null;
          error?: Error;
        } = {};
        setTimeout(() => {
          request.result = database;
          request.onupgradeneeded?.();
          request.onsuccess?.();
        }, 0);
        return request;
      },
    },
  };
}

function installBrowserStorage() {
  const localStorage = new MemoryStorage();
  const indexedDb = createMemoryIndexedDb();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage, indexedDB: indexedDb.indexedDB },
    configurable: true,
  });
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => `id-${Math.random().toString(16).slice(2)}` },
    configurable: true,
  });
  return { localStorage, indexedDb: indexedDb.values };
}

function validBackup() {
  return {
    version: 1,
    goals: [
      {
        id: "goal-1",
        title: "目标",
        status: "active",
        importance: 4,
        progress: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    projects: [
      {
        id: "project-1",
        goalId: "goal-1",
        title: "项目",
        status: "active",
        progress: 0,
        lastActiveAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    tasks: [
      {
        id: "task-1",
        projectId: "project-1",
        goalId: "goal-1",
        title: "导入任务",
        status: "todo",
        priorityManual: 4,
        estimateMin: 45,
        actualMin: 0,
        dueAt: null,
        taskType: "deep_work",
        energyLevel: "medium",
        isBlocked: false,
        scoreSnapshot: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    inboxItems: [
      {
        id: "inbox-1",
        rawText: "原始想法",
        source: "manual",
        status: "converted",
        convertedTaskId: "task-1",
        convertedProjectId: null,
        convertedGoalId: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    dailyPlans: [
      {
        id: "plan-1",
        date: "2026-06-27",
        availableMinutes: 120,
        energy: 3,
        mood: 3,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    dailyFoci: [
      {
        id: "focus-1",
        dailyPlanId: "plan-1",
        taskId: "task-1",
        rank: 1,
        plannedMinutes: 45,
        reason: "测试导入",
        scoreDetail: null,
        status: "planned",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    workSessions: [],
    dailyReviews: [],
    aiRecommendationLogs: [],
  };
}

beforeEach(() => {
  installBrowserStorage();
});

test("localData importBackup imports a valid graph and hydrates today focus", async () => {
  const result = await localData.importBackup(validBackup(), "skip");

  assert.equal(result.tables.goals.created, 1);
  assert.equal(result.tables.tasks.created, 1);
  assert.equal(result.tables.dailyFoci.created, 1);

  const today = await localData.getToday("2026-06-27");
  assert.equal(today.plan?.foci[0]?.task.title, "导入任务");
  assert.equal(today.plan?.foci[0]?.task.project?.title, "项目");
});

test("localData importBackup rejects broken foreign keys and does not write partial data", async () => {
  const backup = validBackup();
  backup.tasks[0].projectId = "missing-project";

  await assert.rejects(
    localData.importBackup(backup, "skip"),
    /tasks\[0\]\.projectId 引用了不存在的数据/,
  );

  assert.equal((await localData.listTasks()).length, 0);
  assert.equal(window.localStorage.getItem(STORAGE_KEY), null);
});

test("localData importBackup rejects duplicate daily plan dates", async () => {
  const backup = validBackup();
  backup.dailyPlans.push({
    ...backup.dailyPlans[0],
    id: "plan-2",
  });

  await assert.rejects(localData.importBackup(backup, "skip"), /dailyPlans\[1\]\.date 重复/);
});

test("localData importBackup overwrites duplicate ids when requested", async () => {
  await localData.importBackup(validBackup(), "skip");

  const backup = validBackup();
  backup.tasks[0].title = "覆盖后的任务";
  const result = await localData.importBackup(backup, "overwrite");

  assert.equal(result.tables.tasks.overwritten, 1);
  assert.equal((await localData.listTasks())[0]?.title, "覆盖后的任务");
});

test("localData migrates legacy localStorage data into IndexedDB", async () => {
  const { localStorage, indexedDb } = installBrowserStorage();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validBackup()));

  assert.equal((await localData.listTasks())[0]?.title, "导入任务");
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  assert.ok(indexedDb.get(INDEXED_DB_RECORD_KEY));
});

test("localData covers inbox conversion and local work session flow", async () => {
  const inbox = await localData.createInbox({ rawText: "完成本地数据测试" });
  const converted = await localData.convertInboxToTask(inbox.id, { title: "完成本地数据测试", estimateMin: 30 });
  const plan = await localData.generateDailyPlan({ date: "2026-06-27", availableMinutes: 120 });
  const focus = plan.foci.find((item) => item.taskId === converted.task.id);

  assert.ok(focus);

  await localData.updateDailyFocus(focus.id, "start");
  const session = await localData.getActiveSession();

  assert.ok(session);

  await localData.finishSession(session.id, "done");

  const [task] = await localData.listTasks();
  assert.equal(task.status, "done");
  assert.ok((task.actualMin ?? 0) >= 0);
});
