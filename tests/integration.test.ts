import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createTestDatabase, type TestDb } from "./helpers/test-db.ts";

// 必须在导入任何依赖 prisma 单例的模块之前建库并设置 DATABASE_URL。
let testDb: TestDb;
let prisma: typeof import("../src/lib/prisma.ts").prisma;
let startWorkSession: typeof import("../src/lib/work-sessions.ts").startWorkSession;
let finishWorkSession: typeof import("../src/lib/work-sessions.ts").finishWorkSession;
let getActiveWorkSession: typeof import("../src/lib/work-sessions.ts").getActiveWorkSession;
let recommendToday: typeof import("../src/lib/recommendation.ts").recommendToday;

before(async () => {
  testDb = createTestDatabase();
  ({ prisma } = await import("../src/lib/prisma.ts"));
  ({ startWorkSession, finishWorkSession, getActiveWorkSession } = await import("../src/lib/work-sessions.ts"));
  ({ recommendToday } = await import("../src/lib/recommendation.ts"));
});

after(async () => {
  await prisma.$disconnect();
  testDb.cleanup();
});

beforeEach(async () => {
  // 按外键依赖顺序清空
  await prisma.workSession.deleteMany();
  await prisma.dailyFocus.deleteMany();
  await prisma.dailyPlan.deleteMany();
  await prisma.inboxItem.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.goal.deleteMany();
});

const NOW = "2026-06-11T10:00:00.000Z";

async function seedTask(overrides: Record<string, unknown> = {}) {
  return prisma.task.create({
    data: {
      id: randomUUID(),
      title: "集成测试任务",
      status: "todo",
      actualMin: 0,
      isBlocked: false,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    },
  });
}

test("Inbox 转 Task: 创建任务并标记条目为 converted", async () => {
  const inbox = await prisma.inboxItem.create({
    data: {
      id: randomUUID(),
      rawText: "写集成测试",
      source: "manual",
      status: "unprocessed",
      createdAt: NOW,
      updatedAt: NOW,
    },
  });

  // 模拟 convert-task route 的事务逻辑
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        id: randomUUID(),
        title: inbox.rawText,
        status: "todo",
        actualMin: 0,
        isBlocked: false,
        estimateMin: 45,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    const item = await tx.inboxItem.update({
      where: { id: inbox.id },
      data: { status: "converted", convertedTaskId: task.id, updatedAt: NOW },
    });
    return { task, item };
  });

  assert.equal(result.item.status, "converted");
  assert.equal(result.item.convertedTaskId, result.task.id);

  const taskCount = await prisma.task.count();
  assert.equal(taskCount, 1);
});

test("生成 DailyPlan: 持久化 1 主 + 备选, rank 升序", async () => {
  const goal = await prisma.goal.create({
    data: { id: randomUUID(), title: "目标", importance: 5, status: "active", progress: 0, createdAt: NOW, updatedAt: NOW },
  });
  await seedTask({ title: "主任务候选", priorityManual: 5, goalId: goal.id, dueAt: NOW });
  await seedTask({ title: "备选任务", estimateMin: 60 });

  const tasks = await prisma.task.findMany({ include: { goal: true, project: true } });
  const recommendations = recommendToday({ tasks, availableMinutes: 120, energy: 3, today: new Date(2026, 5, 11) });
  assert.ok(recommendations.length >= 1);

  const plan = await prisma.$transaction(async (tx) => {
    const dailyPlan = await tx.dailyPlan.create({
      data: { id: randomUUID(), date: "2026-06-11", availableMinutes: 120, energy: 3, mood: 3, status: "active", createdAt: NOW, updatedAt: NOW },
    });
    for (const rec of recommendations) {
      await tx.dailyFocus.create({
        data: {
          id: randomUUID(),
          dailyPlanId: dailyPlan.id,
          taskId: rec.task.id,
          rank: rec.rank,
          plannedMinutes: rec.scoreDetail.estimateMin,
          reason: rec.reason,
          scoreDetail: JSON.stringify(rec.scoreDetail),
          status: "planned",
          createdAt: NOW,
          updatedAt: NOW,
        },
      });
    }
    return tx.dailyPlan.findUniqueOrThrow({
      where: { id: dailyPlan.id },
      include: { foci: { orderBy: { rank: "asc" } } },
    });
  });

  assert.equal(plan.foci[0].rank, 1);
  assert.ok(plan.foci[0].reason && plan.foci[0].reason.length > 0, "主任务必须有推荐理由");
  assert.equal(plan.foci.length, recommendations.length);
});

test("date 唯一约束: 同一天不能创建两个计划", async () => {
  await prisma.dailyPlan.create({
    data: { id: randomUUID(), date: "2026-06-11", availableMinutes: 120, status: "active", createdAt: NOW, updatedAt: NOW },
  });

  await assert.rejects(
    prisma.dailyPlan.create({
      data: { id: randomUUID(), date: "2026-06-11", availableMinutes: 90, status: "active", createdAt: NOW, updatedAt: NOW },
    }),
  );
});

test("开始并完成 WorkSession: 任务变 done, actual_min 累计", async () => {
  const task = await seedTask();

  const session = await startWorkSession({ taskId: task.id });
  assert.equal(session.endAt, null);

  const afterStart = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(afterStart.status, "doing");

  // 进行中的 session 可被恢复
  const active = await getActiveWorkSession();
  assert.equal(active?.id, session.id);

  const finished = await finishWorkSession({ sessionId: session.id, status: "done", focusScore: 4 });
  assert.ok(finished.endAt, "结束时间应写入");
  assert.ok((finished.durationMin ?? 0) >= 0);

  const doneTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(doneTask.status, "done");
  assert.equal(doneTask.actualMin, finished.durationMin);
});

test("同时只允许一个进行中的 WorkSession", async () => {
  const task1 = await seedTask({ title: "任务1" });
  const task2 = await seedTask({ title: "任务2" });

  await startWorkSession({ taskId: task1.id });
  await assert.rejects(startWorkSession({ taskId: task2.id }), /已有进行中的执行记录/);
});

test("完成任务后项目 last_active_at 更新", async () => {
  const project = await prisma.project.create({
    data: { id: randomUUID(), title: "项目", status: "active", progress: 0, lastActiveAt: null, createdAt: NOW, updatedAt: NOW },
  });
  const task = await seedTask({ projectId: project.id });

  const before = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
  assert.equal(before.lastActiveAt, null);

  const session = await startWorkSession({ taskId: task.id });
  await finishWorkSession({ sessionId: session.id, status: "done" });

  const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
  assert.ok(after.lastActiveAt, "完成任务后 last_active_at 应被写入");
});

test("done 任务不能开始新的 WorkSession", async () => {
  const task = await seedTask({ status: "done" });
  await assert.rejects(startWorkSession({ taskId: task.id }), /不能开始执行/);
});

// ---- 手动置顶 / 替换 ----

async function seedPlanWithFoci(taskRanks: { task: { id: string }; rank: number; status?: string }[]) {
  const plan = await prisma.dailyPlan.create({
    data: { id: randomUUID(), date: "2026-06-11", availableMinutes: 120, energy: 3, status: "active", createdAt: NOW, updatedAt: NOW },
  });
  for (const item of taskRanks) {
    await prisma.dailyFocus.create({
      data: {
        id: randomUUID(),
        dailyPlanId: plan.id,
        taskId: item.task.id,
        rank: item.rank,
        status: item.status ?? "planned",
        reason: `rank ${item.rank}`,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
  }
  return plan;
}

// 复刻 promote route 的「整组删除后按新 rank 重建」逻辑
async function promote(focusId: string) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.dailyFocus.findUniqueOrThrow({ where: { id: focusId } });
    const foci = await tx.dailyFocus.findMany({ where: { dailyPlanId: target.dailyPlanId }, orderBy: { rank: "asc" } });
    const currentMain = foci.find((focus) => focus.rank === 1);
    const remapped = foci.map((focus) => {
      if (focus.id === target.id) return { ...focus, rank: 1 };
      if (currentMain && focus.id === currentMain.id) return { ...focus, rank: target.rank };
      return focus;
    });
    await tx.dailyFocus.deleteMany({ where: { dailyPlanId: target.dailyPlanId } });
    for (const focus of remapped) {
      await tx.dailyFocus.create({
        data: {
          id: focus.id,
          dailyPlanId: focus.dailyPlanId,
          taskId: focus.taskId,
          rank: focus.rank,
          status: focus.status,
          reason: focus.reason,
          createdAt: focus.createdAt,
          updatedAt: NOW,
        },
      });
    }
  });
}

test("置顶: 把备选提为主任务后与原主任务交换 rank", async () => {
  const t1 = await seedTask({ title: "原主任务" });
  const t2 = await seedTask({ title: "备选2" });
  const t3 = await seedTask({ title: "备选3" });
  await seedPlanWithFoci([
    { task: t1, rank: 1 },
    { task: t2, rank: 2 },
    { task: t3, rank: 3 },
  ]);

  const alt = await prisma.dailyFocus.findFirstOrThrow({ where: { taskId: t2.id } });
  await promote(alt.id);

  const newMain = await prisma.dailyFocus.findFirstOrThrow({ where: { rank: 1 } });
  const demoted = await prisma.dailyFocus.findFirstOrThrow({ where: { taskId: t1.id } });
  assert.equal(newMain.taskId, t2.id);
  assert.equal(demoted.rank, 2);

  // rank 仍然唯一且完整
  const ranks = (await prisma.dailyFocus.findMany({ orderBy: { rank: "asc" } })).map((f) => f.rank);
  assert.deepEqual(ranks, [1, 2, 3]);
});

test("置顶: 保留每条 focus 的状态不丢失", async () => {
  const t1 = await seedTask({ title: "原主任务" });
  const t2 = await seedTask({ title: "备选2" });
  await seedPlanWithFoci([
    { task: t1, rank: 1, status: "planned" },
    { task: t2, rank: 2, status: "planned" },
  ]);

  const alt = await prisma.dailyFocus.findFirstOrThrow({ where: { taskId: t2.id } });
  await promote(alt.id);

  const promoted = await prisma.dailyFocus.findFirstOrThrow({ where: { taskId: t2.id } });
  assert.equal(promoted.rank, 1);
  assert.equal(promoted.status, "planned");
});

// 复刻 add-focus route 的核心规则
const MAX_FOCI = 4;
async function addFocus(taskId: string) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.dailyPlan.findUniqueOrThrow({ where: { date: "2026-06-11" }, include: { foci: true } });
    if (plan.foci.length >= MAX_FOCI) throw new Error("PLAN_FULL");
    if (plan.foci.some((f) => f.taskId === taskId)) throw new Error("ALREADY_IN_PLAN");
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: { goal: true, project: true } });
    if (!["todo", "doing"].includes(task.status) || task.isBlocked) throw new Error("TASK_NOT_ELIGIBLE");
    const [rec] = recommendToday({ tasks: [task], availableMinutes: plan.availableMinutes, energy: plan.energy });
    const nextRank = Math.max(0, ...plan.foci.map((f) => f.rank)) + 1;
    return tx.dailyFocus.create({
      data: {
        id: randomUUID(),
        dailyPlanId: plan.id,
        taskId: task.id,
        rank: nextRank,
        reason: rec ? `${rec.reason}\n（手动加入今日）` : "手动加入今日推荐。",
        status: "planned",
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
  });
}

test("加入今日: 把任务追加到下一个 rank", async () => {
  const t1 = await seedTask({ title: "已在计划" });
  const extra = await seedTask({ title: "手动加入" });
  await seedPlanWithFoci([{ task: t1, rank: 1 }]);

  const focus = await addFocus(extra.id);
  assert.equal(focus.rank, 2);
  assert.ok(focus.reason?.includes("手动加入今日"));

  const count = await prisma.dailyFocus.count();
  assert.equal(count, 2);
});

test("加入今日: 已满 4 条时拒绝", async () => {
  const tasks = await Promise.all([1, 2, 3, 4].map((n) => seedTask({ title: `任务${n}` })));
  await seedPlanWithFoci(tasks.map((task, index) => ({ task, rank: index + 1 })));
  const extra = await seedTask({ title: "第五个" });

  await assert.rejects(addFocus(extra.id), /PLAN_FULL/);
});

test("加入今日: 已在计划里的任务不能重复加入", async () => {
  const t1 = await seedTask({ title: "已在计划" });
  await seedPlanWithFoci([{ task: t1, rank: 1 }]);

  await assert.rejects(addFocus(t1.id), /ALREADY_IN_PLAN/);
});

test("加入今日: done 或阻塞的任务不可加入", async () => {
  const t1 = await seedTask({ title: "主任务" });
  await seedPlanWithFoci([{ task: t1, rank: 1 }]);

  const doneTask = await seedTask({ title: "已完成", status: "done" });
  const blockedTask = await seedTask({ title: "阻塞", isBlocked: true });

  await assert.rejects(addFocus(doneTask.id), /TASK_NOT_ELIGIBLE/);
  await assert.rejects(addFocus(blockedTask.id), /TASK_NOT_ELIGIBLE/);
});

// 复刻 skip route 的「删除 focus + 压缩 rank」逻辑 (无进行中 session 的情形)
async function skipFocus(focusId: string) {
  const focus = await prisma.dailyFocus.findUniqueOrThrow({ where: { id: focusId } });
  await prisma.task.update({ where: { id: focus.taskId }, data: { status: "skipped", updatedAt: NOW } });
  await prisma.$transaction(async (tx) => {
    await tx.dailyFocus.delete({ where: { id: focusId } });
    const remaining = await tx.dailyFocus.findMany({ where: { dailyPlanId: focus.dailyPlanId }, orderBy: { rank: "asc" } });
    for (let index = 0; index < remaining.length; index++) {
      const targetRank = index + 1;
      if (remaining[index].rank !== targetRank) {
        await tx.dailyFocus.update({ where: { id: remaining[index].id }, data: { rank: targetRank, updatedAt: NOW } });
      }
    }
  });
}

test("跳过: 删除该 focus 并把剩余 rank 压缩为连续", async () => {
  const tasks = await Promise.all([1, 2, 3, 4].map((n) => seedTask({ title: `任务${n}` })));
  await seedPlanWithFoci(tasks.map((task, index) => ({ task, rank: index + 1 })));

  // 跳过 rank 2
  const second = await prisma.dailyFocus.findFirstOrThrow({ where: { taskId: tasks[1].id } });
  await skipFocus(second.id);

  const remaining = await prisma.dailyFocus.findMany({ orderBy: { rank: "asc" } });
  assert.equal(remaining.length, 3);
  assert.deepEqual(remaining.map((f) => f.rank), [1, 2, 3]); // 无空洞
  assert.ok(!remaining.some((f) => f.taskId === tasks[1].id)); // 被跳过的已移除

  const skippedTask = await prisma.task.findUniqueOrThrow({ where: { id: tasks[1].id } });
  assert.equal(skippedTask.status, "skipped");
});

test("跳过后腾出空位, 满 4 条可重新加入新任务", async () => {
  const tasks = await Promise.all([1, 2, 3, 4].map((n) => seedTask({ title: `任务${n}` })));
  await seedPlanWithFoci(tasks.map((task, index) => ({ task, rank: index + 1 })));
  const extra = await seedTask({ title: "新任务" });

  // 满 4 条时加入被拒
  await assert.rejects(addFocus(extra.id), /PLAN_FULL/);

  // 跳过一个腾位置
  const first = await prisma.dailyFocus.findFirstOrThrow({ where: { rank: 1 } });
  await skipFocus(first.id);

  // 现在可以加入, 且 rank 在 1..4 范围内 (不触发 CHECK 约束)
  const focus = await addFocus(extra.id);
  assert.ok(focus.rank >= 1 && focus.rank <= 4);

  const count = await prisma.dailyFocus.count();
  assert.equal(count, 4);
});
