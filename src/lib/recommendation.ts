import { daysBetweenLocalDates, startOfLocalDay } from "@/lib/dates";

type GoalLike = {
  id: string;
  title: string;
  importance: number;
  status: string;
} | null;

type ProjectLike = {
  id: string;
  title: string;
  status: string;
  lastActiveAt: string | null;
} | null;

type WorkSessionLike = {
  startAt: string;
  endAt: string | null;
  durationMin: number | null;
  focusScore: number | null;
};

type DailyFocusLike = {
  status: string;
  createdAt: string;
  updatedAt: string;
  dailyPlan?: {
    date: string;
  } | null;
};

export type TodayMode = "progress" | "clear" | "deadline" | "low_energy";

export type RecommendationTask = {
  id: string;
  title: string;
  status: string;
  priorityManual: number | null;
  estimateMin: number | null;
  actualMin?: number | null;
  dueAt: string | null;
  taskType: string | null;
  energyLevel: string | null;
  isBlocked: boolean;
  createdAt: string;
  updatedAt?: string;
  projectId: string | null;
  goalId: string | null;
  project: ProjectLike;
  goal: GoalLike;
  inboxItems?: unknown[];
  workSessions?: WorkSessionLike[];
  dailyFoci?: DailyFocusLike[];
};

export type ScoreDetail = {
  score: number;
  longTermValue: number;
  urgency: number;
  impact: number;
  momentum: number;
  manualBoost: number;
  effortPenalty: number;
  fatiguePenalty: number;
  energyFit: number;
  moodFit: number;
  historyAdjustment: number;
  estimateMin: number;
  baseEstimateMin: number;
  availableMinutes: number;
  daysUntilDue: number | null;
  daysSinceProjectActive: number | null;
  oversized: boolean;
  todayMode: TodayMode | null;
  modeAdjustment: number;
  sizeRatio: number;
  sizeAdvice: "consider_split" | "split_recommended" | null;
};

export type RecommendationResult = {
  task: RecommendationTask;
  rank: number;
  reason: string;
  scoreDetail: ScoreDetail;
};

type Input = {
  tasks: RecommendationTask[];
  availableMinutes: number;
  energy: number | null;
  mood?: number | null;
  mode?: TodayMode;
  today?: Date;
};

type HistoryContext = {
  projectEstimateRatio: Map<string, number>;
  taskTypeEstimateRatio: Map<string, number>;
  recentCompletedProjectMomentum: Map<string, number>;
  recentLowFocusAverage: number | null;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isOpenTask(task: RecommendationTask) {
  return task.status === "todo" || task.status === "doing";
}

function isRelationAvailable(relation: GoalLike | ProjectLike) {
  return !relation || (relation.status !== "paused" && relation.status !== "archived");
}

function projectOpenCounts(tasks: RecommendationTask[]) {
  const counts = new Map<string, number>();

  for (const task of tasks) {
    if (!task.projectId || !isOpenTask(task) || task.isBlocked) {
      continue;
    }

    if (!isRelationAvailable(task.project) || !isRelationAvailable(task.goal)) {
      continue;
    }

    counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1);
  }

  return counts;
}

function urgencyScore(task: RecommendationTask, today: Date) {
  const dueAt = parseDate(task.dueAt);

  if (!dueAt) {
    return { urgency: 30, daysUntilDue: null };
  }

  const daysUntilDue = daysBetweenLocalDates(today, dueAt);

  if (daysUntilDue <= 0) {
    return { urgency: 100, daysUntilDue };
  }

  if (daysUntilDue <= 7) {
    return { urgency: 100 - daysUntilDue * 10, daysUntilDue };
  }

  if (daysUntilDue <= 30) {
    return { urgency: 40, daysUntilDue };
  }

  return { urgency: 30, daysUntilDue };
}

function endedRecentSessions(task: RecommendationTask, today: Date, windowDays: number) {
  return (task.workSessions ?? []).filter((session) => {
    const endAt = parseDate(session.endAt);

    if (!endAt) {
      return false;
    }

    const daysAgo = daysBetweenLocalDates(endAt, today);

    return daysAgo >= 0 && daysAgo <= windowDays;
  });
}

function latestEndedSessionDate(task: RecommendationTask) {
  return (task.workSessions ?? []).reduce<Date | null>((latest, session) => {
    const endAt = parseDate(session.endAt);

    if (!endAt) {
      return latest;
    }

    return !latest || endAt.getTime() > latest.getTime() ? endAt : latest;
  }, null);
}

function boundedEstimateRatio(actualMin: number, estimateMin: number) {
  return Math.max(0.75, Math.min(1.75, actualMin / estimateMin));
}

function weightedAverageRatio(items: { actualMin: number; estimateMin: number }[]) {
  const totals = items.reduce(
    (sum, item) => ({
      actualMin: sum.actualMin + item.actualMin,
      estimateMin: sum.estimateMin + item.estimateMin,
    }),
    { actualMin: 0, estimateMin: 0 },
  );

  if (totals.estimateMin <= 0) {
    return null;
  }

  return boundedEstimateRatio(totals.actualMin, totals.estimateMin);
}

function buildHistoryContext(tasks: RecommendationTask[], today: Date): HistoryContext {
  const ratiosByProject = new Map<string, { actualMin: number; estimateMin: number }[]>();
  const ratiosByTaskType = new Map<string, { actualMin: number; estimateMin: number }[]>();
  const recentCompletedProjectMomentum = new Map<string, number>();
  const recentFocusScores: number[] = [];

  for (const task of tasks) {
    for (const session of endedRecentSessions(task, today, 7)) {
      if (session.focusScore !== null) {
        recentFocusScores.push(session.focusScore);
      }
    }

    const estimateMin = task.estimateMin ?? null;
    const actualMin = task.actualMin ?? 0;

    if (task.status === "done" && estimateMin && estimateMin > 0 && actualMin > 0) {
      const item = { actualMin, estimateMin };

      if (task.projectId) {
        ratiosByProject.set(task.projectId, [...(ratiosByProject.get(task.projectId) ?? []), item]);
      }

      if (task.taskType) {
        ratiosByTaskType.set(task.taskType, [...(ratiosByTaskType.get(task.taskType) ?? []), item]);
      }
    }

    if (task.status === "done" && task.projectId) {
      const completedAt = latestEndedSessionDate(task) ?? parseDate(task.updatedAt ?? null);

      if (completedAt) {
        const daysAgo = daysBetweenLocalDates(completedAt, today);

        if (daysAgo >= 0 && daysAgo <= 14) {
          const boost = daysAgo <= 2 ? 12 : daysAgo <= 7 ? 8 : 4;
          recentCompletedProjectMomentum.set(
            task.projectId,
            Math.min(18, (recentCompletedProjectMomentum.get(task.projectId) ?? 0) + boost),
          );
        }
      }
    }
  }

  const toRatioMap = (source: Map<string, { actualMin: number; estimateMin: number }[]>) => {
    const result = new Map<string, number>();

    for (const [key, items] of source) {
      const ratio = weightedAverageRatio(items);

      if (ratio !== null) {
        result.set(key, ratio);
      }
    }

    return result;
  };

  return {
    projectEstimateRatio: toRatioMap(ratiosByProject),
    taskTypeEstimateRatio: toRatioMap(ratiosByTaskType),
    recentCompletedProjectMomentum,
    recentLowFocusAverage:
      recentFocusScores.length > 0
        ? recentFocusScores.reduce((total, score) => total + score, 0) / recentFocusScores.length
        : null,
  };
}

function calibratedEstimateMin(task: RecommendationTask, baseEstimateMin: number, context: HistoryContext) {
  let estimateMin = baseEstimateMin;
  const actualMin = task.actualMin ?? 0;

  if (actualMin > 0 && isOpenTask(task)) {
    estimateMin = Math.max(estimateMin, Math.min(actualMin, baseEstimateMin * 2));
  }

  const projectRatio = task.projectId ? context.projectEstimateRatio.get(task.projectId) : null;
  const taskTypeRatio = task.taskType ? context.taskTypeEstimateRatio.get(task.taskType) : null;
  const ratio = projectRatio ?? taskTypeRatio ?? null;

  if (ratio !== null && Math.abs(ratio - 1) >= 0.15) {
    estimateMin = Math.round(estimateMin * ratio);
  }

  return Math.max(15, estimateMin);
}

function momentumScore(task: RecommendationTask, today: Date, context: HistoryContext) {
  const lastActiveAt = parseDate(task.project?.lastActiveAt ?? null);
  let momentum = 40;
  let daysSinceProjectActive: number | null = null;

  if (lastActiveAt) {
    daysSinceProjectActive = Math.max(0, daysBetweenLocalDates(lastActiveAt, today));

    if (daysSinceProjectActive >= 7) {
      momentum = 80;
    } else if (daysSinceProjectActive >= 3) {
      momentum = 60;
    } else {
      momentum = 30;
    }
  }

  if ((task.goal?.importance ?? 0) >= 4 && (daysSinceProjectActive ?? 3) >= 3) {
    momentum += 20;
  }

  if (task.projectId) {
    momentum += context.recentCompletedProjectMomentum.get(task.projectId) ?? 0;
  }

  return {
    daysSinceProjectActive,
    momentum: clampScore(momentum),
  };
}

function scoreTask(
  task: RecommendationTask,
  availableMinutes: number,
  energy: number | null,
  mood: number | null,
  mode: TodayMode | null,
  openCounts: Map<string, number>,
  context: HistoryContext,
  today: Date,
) {
  const baseEstimateMin = task.estimateMin ?? 45;
  const estimateMin = calibratedEstimateMin(task, baseEstimateMin, context);
  const goalImportance = task.goal?.importance ?? 3;
  const longTermValue = task.goal ? clampScore(goalImportance * 20 + 10) : 40;
  const { urgency, daysUntilDue } = urgencyScore(task, today);
  const projectOpenTaskCount = task.projectId ? openCounts.get(task.projectId) ?? 0 : 0;
  const impact = clampScore(
    50 +
      ((task.priorityManual ?? 0) >= 4 ? 20 : 0) +
      (task.projectId && projectOpenTaskCount <= 3 ? 10 : 0) +
      (task.projectId && projectOpenTaskCount === 1 ? 20 : 0),
  );
  const { momentum, daysSinceProjectActive } = momentumScore(task, today, context);
  const manualBoost = (task.priorityManual ?? 0) * 20;
  const effortRatio = estimateMin / availableMinutes;
  let effortPenalty = 100;

  if (effortRatio <= 0.5) {
    effortPenalty = 10;
  } else if (effortRatio <= 1) {
    effortPenalty = 30;
  } else if (effortRatio <= 1.5) {
    effortPenalty = 70;
  }

  const fatiguePenalty = energy !== null && energy <= 2 && task.energyLevel === "high" ? 70 : 10;
  const energyFit = energyFitAdjustment(task, energy);
  const moodFit = moodFitAdjustment(task, mood);
  const historyAdjustment = historyAdjustmentScore(task, baseEstimateMin, today, context);
  const modeAdjustment = modeAdjustmentScore(task, {
    mode,
    estimateMin,
    longTermValue,
    urgency,
    momentum,
    daysUntilDue,
    fatiguePenalty,
  });
  const sizeRatio = Math.round((estimateMin / availableMinutes) * 100) / 100;
  const sizeAdvice =
    sizeRatio >= 0.8 ? "split_recommended" : sizeRatio >= 0.6 ? "consider_split" : null;
  const score =
    0.3 * longTermValue +
    0.2 * urgency +
    0.2 * impact +
    0.1 * momentum +
    0.05 * manualBoost -
    0.15 * effortPenalty -
    0.1 * fatiguePenalty -
    energyFit +
    moodFit +
    historyAdjustment +
    modeAdjustment;

  return {
    availableMinutes,
    daysSinceProjectActive,
    daysUntilDue,
    effortPenalty,
    estimateMin,
    baseEstimateMin,
    fatiguePenalty,
    energyFit,
    moodFit,
    historyAdjustment,
    impact,
    longTermValue,
    manualBoost,
    momentum,
    score: Math.round(score * 10) / 10,
    urgency,
    oversized: estimateMin > availableMinutes * 1.5,
    todayMode: mode,
    modeAdjustment,
    sizeRatio,
    sizeAdvice,
  } satisfies ScoreDetail;
}

function modeAdjustmentScore(
  task: RecommendationTask,
  detail: {
    mode: TodayMode | null;
    estimateMin: number;
    longTermValue: number;
    urgency: number;
    momentum: number;
    daysUntilDue: number | null;
    fatiguePenalty: number;
  },
) {
  if (detail.mode === "progress") {
    return Math.round(
      0.08 * detail.longTermValue +
        0.12 * detail.momentum +
        (task.projectId ? 6 : 0) +
        (task.goalId ? 4 : 0),
    );
  }

  if (detail.mode === "clear") {
    const sizeBoost =
      detail.estimateMin <= 30 ? 22 : detail.estimateMin <= 45 ? 16 : detail.estimateMin <= 60 ? 8 : -8;
    const inboxBoost = (task.inboxItems?.length ?? 0) > 0 ? 10 : 0;
    const looseEndBoost = !task.projectId && !task.goalId ? 6 : 0;

    return sizeBoost + inboxBoost + looseEndBoost;
  }

  if (detail.mode === "deadline") {
    if (detail.daysUntilDue === null) {
      return -10;
    }

    const deadlineBoost =
      detail.daysUntilDue <= 0 ? 34 : detail.daysUntilDue <= 3 ? 26 : detail.daysUntilDue <= 7 ? 16 : 4;

    return Math.round(deadlineBoost + 0.08 * detail.urgency);
  }

  if (detail.mode === "low_energy") {
    const energyBoost =
    task.energyLevel === "low"
      ? 22
      : task.energyLevel === "medium"
        ? 8
        : task.energyLevel === "high"
          ? -22
          : 4;
    const sizeBoost = detail.estimateMin <= 30 ? 10 : detail.estimateMin <= 45 ? 6 : detail.estimateMin > 90 ? -10 : 0;
    const fatigueBoost = detail.fatiguePenalty >= 70 ? -10 : 0;

    return energyBoost + sizeBoost + fatigueBoost;
  }

  return 0;
}

function energyFitAdjustment(task: RecommendationTask, energy: number | null) {
  if (energy === null || !task.energyLevel) {
    return 0;
  }

  if (task.energyLevel === "high") {
    return energy >= 4 ? 6 : 0;
  }

  if (task.energyLevel === "medium") {
    if (energy >= 3 && energy <= 4) {
      return 4;
    }

    return energy <= 1 ? -4 : 0;
  }

  return energy <= 2 ? 6 : energy >= 4 ? -3 : 2;
}

function moodFitAdjustment(task: RecommendationTask, mood: number | null) {
  if (mood === null) {
    return 0;
  }

  if (mood <= 2) {
    if (task.taskType === "admin" || task.taskType === "errand" || task.taskType === "health") {
      return 5;
    }

    return task.taskType === "deep_work" || task.energyLevel === "high" ? -6 : 0;
  }

  if (mood >= 4) {
    return task.taskType === "deep_work" || task.taskType === "learning" ? 4 : 0;
  }

  return 0;
}

function recentIncompleteFocusCount(task: RecommendationTask, today: Date) {
  return (task.dailyFoci ?? []).filter((focus) => {
    if (focus.status !== "missed" && focus.status !== "planned") {
      return false;
    }

    const focusDate = parseDate(focus.dailyPlan?.date ?? focus.updatedAt ?? focus.createdAt);

    if (!focusDate) {
      return false;
    }

    const daysAgo = daysBetweenLocalDates(focusDate, today);

    return daysAgo >= 1 && daysAgo <= 7;
  }).length;
}

function historyAdjustmentScore(
  task: RecommendationTask,
  baseEstimateMin: number,
  today: Date,
  context: HistoryContext,
) {
  const recentSessions = endedRecentSessions(task, today, 14);
  const scoredSessions = recentSessions.filter((session) => session.focusScore !== null);
  const incompleteCount = recentIncompleteFocusCount(task, today);
  let adjustment = 0;

  if (task.status === "doing") {
    adjustment += 6;
  }

  if (recentSessions.some((session) => daysBetweenLocalDates(parseDate(session.endAt) ?? today, today) <= 2)) {
    adjustment += 4;
  }

  if ((task.actualMin ?? 0) > baseEstimateMin * 1.25) {
    adjustment -= 8;
  }

  if (incompleteCount > 0) {
    adjustment -= Math.min(10, incompleteCount * 5);
  }

  if (scoredSessions.length > 0) {
    const averageFocus =
      scoredSessions.reduce((total, session) => total + (session.focusScore ?? 0), 0) / scoredSessions.length;

    if (averageFocus >= 4) {
      adjustment += 5;
    } else if (averageFocus <= 2) {
      adjustment -= 6;
    }
  }

  if (task.energyLevel === "high" && context.recentLowFocusAverage !== null && context.recentLowFocusAverage <= 2.5) {
    adjustment -= 8;
  }

  return Math.max(-20, Math.min(20, Math.round(adjustment)));
}

function fitDelta(detail: ScoreDetail) {
  return Math.abs(detail.availableMinutes - detail.estimateMin);
}

function createdAtTime(task: RecommendationTask) {
  return parseDate(task.createdAt)?.getTime() ?? 0;
}

function reasonFor(task: RecommendationTask, detail: ScoreDetail, rank: number) {
  const relation = task.goal
    ? `它属于目标「${task.goal.title}」，长期价值评分为 ${detail.longTermValue}。`
    : `它还没有绑定目标，长期价值按默认值 ${detail.longTermValue} 计算。`;
  const project = task.project
    ? `它会推进项目「${task.project.title}」，当前项目${
        detail.daysSinceProjectActive === null ? "暂无推进记录" : `已 ${detail.daysSinceProjectActive} 天未推进`
      }。`
    : "它还没有绑定项目，因此按独立任务处理。";
  const due =
    detail.daysUntilDue === null
      ? "它没有截止日期，紧急度按默认值 30 计算。"
      : detail.daysUntilDue <= 0
        ? "它今天到期或已经逾期，紧急度拉满。"
        : `它距离截止还有 ${detail.daysUntilDue} 天，紧急度评分为 ${detail.urgency}。`;
  const fit = detail.oversized
    ? `预计 ${detail.estimateMin} 分钟，超过今天可用时间 ${detail.availableMinutes} 分钟的 1.5 倍，已通过努力成本降权。`
    : `预计 ${detail.estimateMin} 分钟，与今天可用时间 ${detail.availableMinutes} 分钟匹配。`;
  const contextReasons = [
    detail.todayMode
      ? `今日模式为「${todayModeLabel(detail.todayMode)}」，模式调整 ${signedScore(detail.modeAdjustment)}。`
      : null,
    detail.energyFit !== 0 ? `精力匹配调整 ${signedScore(detail.energyFit)}。` : null,
    detail.moodFit !== 0 ? `心情匹配调整 ${signedScore(detail.moodFit)}。` : null,
    detail.historyAdjustment !== 0 ? `历史执行反馈调整 ${signedScore(detail.historyAdjustment)}。` : null,
  ].filter(Boolean);

  return [
    rank === 1 ? `推荐主任务：${task.title}` : `备选任务：${task.title}`,
    relation,
    project,
    due,
    fit,
    contextReasons.length > 0 ? contextReasons.join("") : null,
    `主要分数：长期价值 ${detail.longTermValue}，紧急度 ${detail.urgency}，影响力 ${detail.impact}，动量 ${detail.momentum}，努力成本惩罚 ${detail.effortPenalty}。`,
  ]
    .filter(Boolean)
    .join("\n");
}

function signedScore(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function todayModeLabel(mode: TodayMode) {
  const labels: Record<TodayMode, string> = {
    clear: "清理模式",
    deadline: "截止模式",
    low_energy: "低能量模式",
    progress: "推进模式",
  };

  return labels[mode];
}

type ScoredRecommendation = {
  task: RecommendationTask;
  scoreDetail: ScoreDetail;
};

function isDifferentProject(candidate: ScoredRecommendation, selected: ScoredRecommendation[]) {
  return !candidate.task.projectId || !selected.some((item) => item.task.projectId === candidate.task.projectId);
}

function isDifferentTaskType(candidate: ScoredRecommendation, selected: ScoredRecommendation[]) {
  return !candidate.task.taskType || !selected.some((item) => item.task.taskType === candidate.task.taskType);
}

function totalEstimatedMinutes(items: ScoredRecommendation[]) {
  return items.reduce((total, item) => total + item.scoreDetail.estimateMin, 0);
}

function selectDailySet(scored: ScoredRecommendation[], availableMinutes: number) {
  const selected: ScoredRecommendation[] = [];
  const maxTotalMinutes = availableMinutes * 1.5;

  function canFit(candidate: ScoredRecommendation) {
    return selected.length === 0 || totalEstimatedMinutes([...selected, candidate]) <= maxTotalMinutes;
  }

  function addCandidate(candidate: ScoredRecommendation) {
    if (selected.length >= 4 || selected.some((item) => item.task.id === candidate.task.id)) {
      return false;
    }

    selected.push(candidate);
    return true;
  }

  for (const candidate of scored) {
    if (canFit(candidate) && addCandidate(candidate)) {
      break;
    }
  }

  for (const candidate of scored) {
    if (selected.length >= 4) {
      break;
    }

    if (canFit(candidate) && isDifferentProject(candidate, selected) && isDifferentTaskType(candidate, selected)) {
      addCandidate(candidate);
    }
  }

  for (const candidate of scored) {
    if (selected.length >= 4) {
      break;
    }

    if (canFit(candidate)) {
      addCandidate(candidate);
    }
  }

  if (selected.length === 0 && scored[0]) {
    selected.push(scored[0]);
  }

  return selected;
}

export function recommendToday(input: Input) {
  const today = startOfLocalDay(input.today ?? new Date());
  const mode = input.mode ?? null;
  const openCounts = projectOpenCounts(input.tasks);
  const historyContext = buildHistoryContext(input.tasks, today);
  const scored = input.tasks
    .filter((task) => isOpenTask(task))
    .filter((task) => !task.isBlocked)
    .filter((task) => isRelationAvailable(task.project))
    .filter((task) => isRelationAvailable(task.goal))
    .map((task) => ({
      task,
      scoreDetail: scoreTask(
        task,
        input.availableMinutes,
        input.energy,
        input.mood ?? null,
        mode,
        openCounts,
        historyContext,
        today,
      ),
    }))
    .sort((left, right) => {
      if (right.scoreDetail.score !== left.scoreDetail.score) {
        return right.scoreDetail.score - left.scoreDetail.score;
      }

      if (fitDelta(left.scoreDetail) !== fitDelta(right.scoreDetail)) {
        return fitDelta(left.scoreDetail) - fitDelta(right.scoreDetail);
      }

      const leftDays = left.scoreDetail.daysSinceProjectActive ?? -1;
      const rightDays = right.scoreDetail.daysSinceProjectActive ?? -1;

      if (rightDays !== leftDays) {
        return rightDays - leftDays;
      }

      return createdAtTime(left.task) - createdAtTime(right.task);
    });
  const selected = selectDailySet(scored, input.availableMinutes);

  return selected.map((item, index) => ({
    ...item,
    rank: index + 1,
    reason: reasonFor(item.task, item.scoreDetail, index + 1),
  })) satisfies RecommendationResult[];
}
