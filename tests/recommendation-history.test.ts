import { test } from "node:test";
import assert from "node:assert/strict";

import { recommendToday, type RecommendationTask } from "../src/lib/recommendation.ts";

const FIXED_TODAY = new Date(2026, 5, 11);

function makeTask(overrides: Partial<RecommendationTask> = {}): RecommendationTask {
  return {
    id: "task-1",
    title: "Task",
    status: "todo",
    priorityManual: null,
    estimateMin: 60,
    actualMin: 0,
    dueAt: null,
    taskType: null,
    energyLevel: null,
    isBlocked: false,
    createdAt: "2026-06-01T00:00:00",
    projectId: null,
    goalId: null,
    project: null,
    goal: null,
    ...overrides,
  };
}

function scoreOf(task: RecommendationTask, tasks: RecommendationTask[] = [task]) {
  const results = recommendToday({ tasks, availableMinutes: 240, energy: 3, today: FIXED_TODAY });
  const result = results.find((item) => item.task.id === task.id);

  assert.ok(result, "expected task to be recommended");

  return result.scoreDetail;
}

test("history loop calibrates estimate from open task actual minutes", () => {
  const detail = scoreOf(makeTask({ actualMin: 100, estimateMin: 60 }));

  assert.equal(detail.baseEstimateMin, 60);
  assert.equal(detail.estimateMin, 100);
});

test("history loop calibrates estimate from completed same-project history", () => {
  const target = makeTask({
    id: "target",
    projectId: "p1",
    project: { id: "p1", title: "Project", status: "active", lastActiveAt: null },
    estimateMin: 60,
  });
  const completed = makeTask({
    id: "done",
    status: "done",
    projectId: "p1",
    project: { id: "p1", title: "Project", status: "active", lastActiveAt: null },
    estimateMin: 60,
    actualMin: 120,
    updatedAt: "2026-06-10T00:00:00",
  });

  assert.equal(scoreOf(target, [target, completed]).estimateMin, 105);
});

test("history loop lowers score for recently skipped or unfinished foci", () => {
  const detail = scoreOf(
    makeTask({
      dailyFoci: [
        {
          status: "missed",
          createdAt: "2026-06-10T00:00:00",
          updatedAt: "2026-06-10T00:00:00",
          dailyPlan: { date: "2026-06-10" },
        },
        {
          status: "planned",
          createdAt: "2026-06-09T00:00:00",
          updatedAt: "2026-06-09T00:00:00",
          dailyPlan: { date: "2026-06-09" },
        },
      ],
    }),
  );

  assert.equal(detail.historyAdjustment, -10);
});

test("history loop adds momentum after recent same-project completion", () => {
  const target = makeTask({
    id: "target",
    projectId: "p1",
    project: { id: "p1", title: "Project", status: "active", lastActiveAt: "2026-06-10T00:00:00" },
  });
  const completed = makeTask({
    id: "done",
    status: "done",
    projectId: "p1",
    project: { id: "p1", title: "Project", status: "active", lastActiveAt: "2026-06-10T00:00:00" },
    estimateMin: 60,
    actualMin: 60,
    workSessions: [
      {
        startAt: "2026-06-10T08:00:00.000Z",
        endAt: "2026-06-10T09:00:00.000Z",
        durationMin: 60,
        focusScore: 4,
      },
    ],
  });

  assert.equal(scoreOf(target, [target, completed]).momentum, 42);
});

test("history loop suppresses high-energy tasks after low recent focus", () => {
  const highEnergyTask = makeTask({ id: "target", energyLevel: "high" });
  const lowFocusDone = makeTask({
    id: "done",
    status: "done",
    estimateMin: 60,
    actualMin: 60,
    workSessions: [
      {
        startAt: "2026-06-10T08:00:00.000Z",
        endAt: "2026-06-10T09:00:00.000Z",
        durationMin: 60,
        focusScore: 2,
      },
    ],
  });

  assert.equal(scoreOf(highEnergyTask, [highEnergyTask, lowFocusDone]).historyAdjustment, -8);
});
