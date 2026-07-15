import { test } from "node:test";
import assert from "node:assert/strict";

import { recommendToday, type RecommendationTask } from "../src/lib/recommendation.ts";

const FIXED_TODAY = new Date(2026, 5, 11); // 2026-06-11 本地时间

function makeTask(overrides: Partial<RecommendationTask> = {}): RecommendationTask {
  return {
    id: "task-1",
    title: "示例任务",
    status: "todo",
    priorityManual: null,
    estimateMin: 60,
    dueAt: null,
    taskType: null,
    energyLevel: null,
    isBlocked: false,
    actualMin: 0,
    createdAt: "2026-06-01T00:00:00",
    projectId: null,
    goalId: null,
    project: null,
    goal: null,
    ...overrides,
  };
}

function scoreOf(task: RecommendationTask, availableMinutes = 120, energy: number | null = 3) {
  const results = recommendToday({ tasks: [task], availableMinutes, energy, today: FIXED_TODAY });
  assert.equal(results.length, 1, "应返回唯一一个任务");
  return results[0].scoreDetail;
}

test("long_term_value: 绑定 active 目标按 importance*20+10 计算并封顶 100", () => {
  const detail = scoreOf(
    makeTask({ goal: { id: "g1", title: "目标", importance: 5, status: "active" } }),
  );
  assert.equal(detail.longTermValue, 100); // 5*20+10=110 → clamp 100
});

test("long_term_value: 无目标任务默认 40", () => {
  const detail = scoreOf(makeTask({ goal: null }));
  assert.equal(detail.longTermValue, 40);
});

test("urgency: 无截止日期为 30", () => {
  assert.equal(scoreOf(makeTask({ dueAt: null })).urgency, 30);
});

test("urgency: 今天到期或逾期拉满 100", () => {
  assert.equal(scoreOf(makeTask({ dueAt: "2026-06-11T00:00:00" })).urgency, 100);
  assert.equal(scoreOf(makeTask({ dueAt: "2026-06-01T00:00:00" })).urgency, 100);
});

test("urgency: 7 天内按 100 - days*10 递减", () => {
  const detail = scoreOf(makeTask({ dueAt: "2026-06-14T00:00:00" })); // 3 天后
  assert.equal(detail.daysUntilDue, 3);
  assert.equal(detail.urgency, 70);
});

test("urgency: 30 天内为 40, 超过 30 天为 30", () => {
  assert.equal(scoreOf(makeTask({ dueAt: "2026-06-25T00:00:00" })).urgency, 40); // 14 天
  assert.equal(scoreOf(makeTask({ dueAt: "2026-08-01T00:00:00" })).urgency, 30); // >30 天
});

test("effort_penalty: 按估时与可用时间比例分档", () => {
  assert.equal(scoreOf(makeTask({ estimateMin: 40 }), 100).effortPenalty, 10); // ratio 0.4
  assert.equal(scoreOf(makeTask({ estimateMin: 100 }), 100).effortPenalty, 30); // ratio 1.0
  assert.equal(scoreOf(makeTask({ estimateMin: 140 }), 100).effortPenalty, 70); // ratio 1.4
  assert.equal(scoreOf(makeTask({ estimateMin: 200 }), 100).effortPenalty, 100); // ratio 2.0
});

test("effort_penalty: 估时缺省按 45 分钟处理", () => {
  const detail = scoreOf(makeTask({ estimateMin: null }), 120);
  assert.equal(detail.estimateMin, 45);
});

test("oversized: 估时超过可用时间 1.5 倍时标记", () => {
  assert.equal(scoreOf(makeTask({ estimateMin: 200 }), 100).oversized, true); // 200 > 150
  assert.equal(scoreOf(makeTask({ estimateMin: 140 }), 100).oversized, false); // 140 < 150
});

test("momentum: 按项目最近推进天数分档", () => {
  const base = { id: "g", title: "目标", importance: 3, status: "active" };
  const recent = scoreOf(
    makeTask({
      projectId: "p1",
      project: { id: "p1", title: "项目", status: "active", lastActiveAt: "2026-06-10T00:00:00" },
      goal: base,
    }),
  );
  assert.equal(recent.momentum, 30); // 1 天前 < 3

  const mid = scoreOf(
    makeTask({
      projectId: "p1",
      project: { id: "p1", title: "项目", status: "active", lastActiveAt: "2026-06-07T00:00:00" },
      goal: base,
    }),
  );
  assert.equal(mid.momentum, 60); // 4 天前 >= 3

  const stale = scoreOf(
    makeTask({
      projectId: "p1",
      project: { id: "p1", title: "项目", status: "active", lastActiveAt: "2026-06-01T00:00:00" },
      goal: base,
    }),
  );
  assert.equal(stale.momentum, 80); // 10 天前 >= 7
});

test("momentum: 无推进记录默认 40, 高重要性目标 +20", () => {
  const normal = scoreOf(makeTask({ goal: { id: "g", title: "目标", importance: 3, status: "active" } }));
  assert.equal(normal.momentum, 40);

  const important = scoreOf(makeTask({ goal: { id: "g", title: "目标", importance: 5, status: "active" } }));
  assert.equal(important.momentum, 60); // 40 + 20
});

test("fatigue_penalty: 低精力遇到 high 能耗任务至少 70", () => {
  assert.equal(scoreOf(makeTask({ energyLevel: "high" }), 120, 2).fatiguePenalty, 70);
  assert.equal(scoreOf(makeTask({ energyLevel: "high" }), 120, 3).fatiguePenalty, 10);
});

test("评分公式: 受控输入计算出精确分数", () => {
  const detail = scoreOf(
    makeTask({
      estimateMin: 60,
      dueAt: "2026-06-14T00:00:00", // 3 天 → urgency 70
      priorityManual: 4, // manualBoost 80, impact +20
      projectId: "p1",
      project: { id: "p1", title: "项目", status: "active", lastActiveAt: "2026-06-01T00:00:00" }, // momentum 100
      goal: { id: "g", title: "目标", importance: 5, status: "active" }, // longTermValue 100
    }),
    120,
    3,
  );

  // 单项目唯一开放任务: impact = 50 + 20 + 10 + 20 = 100
  assert.equal(detail.longTermValue, 100);
  assert.equal(detail.urgency, 70);
  assert.equal(detail.impact, 100);
  assert.equal(detail.momentum, 100);
  assert.equal(detail.manualBoost, 80);
  assert.equal(detail.effortPenalty, 10);
  assert.equal(detail.fatiguePenalty, 10);

  // 0.3*100+0.2*70+0.2*100+0.1*100+0.05*80-0.15*10-0.1*10
  // = 30+14+20+10+4-1.5-1 = 75.5
  assert.equal(detail.score, 75.5);
});

test("候选过滤: 阻塞任务不进入推荐", () => {
  const results = recommendToday({
    tasks: [makeTask({ id: "blocked", isBlocked: true })],
    availableMinutes: 120,
    energy: 3,
    today: FIXED_TODAY,
  });
  assert.equal(results.length, 0);
});

test("候选过滤: paused/archived 目标或项目下的任务被排除", () => {
  const pausedGoal = recommendToday({
    tasks: [makeTask({ goal: { id: "g", title: "目标", importance: 3, status: "paused" } })],
    availableMinutes: 120,
    energy: 3,
    today: FIXED_TODAY,
  });
  assert.equal(pausedGoal.length, 0);

  const archivedProject = recommendToday({
    tasks: [
      makeTask({
        projectId: "p1",
        project: { id: "p1", title: "项目", status: "archived", lastActiveAt: null },
      }),
    ],
    availableMinutes: 120,
    energy: 3,
    today: FIXED_TODAY,
  });
  assert.equal(archivedProject.length, 0);
});

test("候选过滤: done/skipped 任务不进入推荐", () => {
  const results = recommendToday({
    tasks: [makeTask({ id: "a", status: "done" }), makeTask({ id: "b", status: "skipped" })],
    availableMinutes: 120,
    energy: 3,
    today: FIXED_TODAY,
  });
  assert.equal(results.length, 0);
});

test("排序: 高分任务排在前, 最多返回 4 个并标注 rank", () => {
  const high = makeTask({
    id: "high",
    priorityManual: 5,
    goal: { id: "g", title: "目标", importance: 5, status: "active" },
    dueAt: "2026-06-11T00:00:00",
  });
  const low = makeTask({ id: "low", priorityManual: 1, estimateMin: 200 });
  const extra = [2, 3, 4, 5].map((n) => makeTask({ id: `t${n}`, estimateMin: 90 }));

  const results = recommendToday({
    tasks: [low, high, ...extra],
    availableMinutes: 120,
    energy: 3,
    today: FIXED_TODAY,
  });

  assert.ok(results.length <= 4); // 主任务 + 最多 3 备选
  assert.equal(results[0].task.id, "high");
  assert.equal(results[0].rank, 1);
  assert.equal(results.at(-1)?.rank, results.length);
});

test("energy_fit: 高精力提高高能耗任务, 低精力提高低能耗任务", () => {
  const highEnergy = scoreOf(makeTask({ energyLevel: "high" }), 120, 5);
  const lowEnergy = scoreOf(makeTask({ energyLevel: "low" }), 120, 1);

  assert.equal(highEnergy.energyFit, 6);
  assert.equal(lowEnergy.energyFit, 6);
});

test("mood_fit: 低心情降低深度任务, 高心情提高深度任务", () => {
  const lowMood = recommendToday({
    tasks: [makeTask({ taskType: "deep_work" })],
    availableMinutes: 120,
    energy: 3,
    mood: 2,
    today: FIXED_TODAY,
  })[0].scoreDetail;
  const highMood = recommendToday({
    tasks: [makeTask({ taskType: "deep_work" })],
    availableMinutes: 120,
    energy: 3,
    mood: 5,
    today: FIXED_TODAY,
  })[0].scoreDetail;

  assert.equal(lowMood.moodFit, -6);
  assert.equal(highMood.moodFit, 4);
});

test("history_adjustment: 执行超时和低专注评分会降权", () => {
  const detail = scoreOf(
    makeTask({
      actualMin: 100,
      estimateMin: 60,
      workSessions: [
        {
          startAt: "2026-06-10T08:00:00.000Z",
          endAt: "2026-06-10T09:00:00.000Z",
          durationMin: 60,
          focusScore: 2,
        },
      ],
    }),
  );

  assert.equal(detail.historyAdjustment, -10); // 近期推进 +4, 超时 -8, 低专注 -6
});

test("组合选择: 备选优先保持项目和类型多样性", () => {
  const tasks = [
    makeTask({
      id: "p1-deep",
      title: "同项目深度任务",
      priorityManual: 5,
      projectId: "p1",
      taskType: "deep_work",
      project: { id: "p1", title: "项目1", status: "active", lastActiveAt: "2026-06-01T00:00:00" },
    }),
    makeTask({
      id: "p1-deep-2",
      title: "同项目同类型任务",
      priorityManual: 5,
      projectId: "p1",
      taskType: "deep_work",
      project: { id: "p1", title: "项目1", status: "active", lastActiveAt: "2026-06-01T00:00:00" },
    }),
    makeTask({
      id: "p2-admin",
      title: "不同项目行政任务",
      priorityManual: 3,
      projectId: "p2",
      taskType: "admin",
      project: { id: "p2", title: "项目2", status: "active", lastActiveAt: null },
    }),
  ];

  const results = recommendToday({ tasks, availableMinutes: 240, energy: 3, today: FIXED_TODAY });

  assert.equal(results[0].task.id, "p1-deep");
  assert.equal(results[1].task.id, "p2-admin");
});

test("组合选择: 有可选备选时不让总估时超过今日可用时间 1.5 倍", () => {
  const results = recommendToday({
    tasks: [
      makeTask({ id: "a", estimateMin: 100, priorityManual: 5 }),
      makeTask({ id: "b", estimateMin: 100, priorityManual: 4 }),
      makeTask({ id: "c", estimateMin: 40, priorityManual: 3 }),
    ],
    availableMinutes: 120,
    energy: 3,
    today: FIXED_TODAY,
  });

  const totalEstimate = results.reduce((total, item) => total + item.scoreDetail.estimateMin, 0);
  assert.ok(totalEstimate <= 180);
  assert.ok(results.some((item) => item.task.id === "c"));
});
