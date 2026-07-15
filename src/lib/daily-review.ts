import { callAiText } from "@/lib/ai-provider";
import { prisma } from "@/lib/prisma";

type ReviewTask = {
  id: string;
  title: string;
  status: string;
  project?: { title: string } | null;
  goal?: { title: string } | null;
};

type ReviewFocus = {
  id: string;
  rank: number;
  status: string;
  plannedMinutes: number | null;
  reason: string | null;
  task: ReviewTask;
};

type ReviewSession = {
  id: string;
  startAt: string;
  endAt: string | null;
  durationMin: number | null;
  focusScore: number | null;
  note: string | null;
  task: ReviewTask;
};

export type DailyReviewContext = {
  date: string;
  plan: {
    id: string;
    availableMinutes: number;
    mood: number | null;
    energy: number | null;
    foci: ReviewFocus[];
  } | null;
  sessions: ReviewSession[];
  metrics: {
    plannedCount: number;
    doneCount: number;
    missedCount: number;
    openCount: number;
    sessionCount: number;
    totalSessionMinutes: number;
    averageFocusScore: number | null;
  };
};

type DraftResult = {
  draft: string;
  source: "ai" | "local";
  aiError?: string;
};

function dayRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);

  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function minutesLabel(minutes: number) {
  if (minutes <= 0) {
    return "0 分钟";
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return `${rest} 分钟`;
  }

  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

function taskLabel(task: ReviewTask) {
  const relation = [task.project?.title, task.goal?.title].filter(Boolean).join(" / ");

  return relation ? `${task.title}（${relation}）` : task.title;
}

function listItems(items: string[], emptyText: string) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${emptyText}`;
}

export async function getDailyReviewContext(date: string): Promise<DailyReviewContext> {
  const range = dayRange(date);
  const [plan, sessions] = await Promise.all([
    prisma.dailyPlan.findUnique({
      where: { date },
      include: {
        foci: {
          include: { task: { include: { project: true, goal: true } } },
          orderBy: { rank: "asc" },
        },
      },
    }),
    prisma.workSession.findMany({
      where: {
        startAt: {
          gte: range.startAt,
          lt: range.endAt,
        },
      },
      include: { task: { include: { project: true, goal: true } } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const totalSessionMinutes = sessions.reduce((total, session) => total + (session.durationMin ?? 0), 0);
  const scoredSessions = sessions.filter((session) => session.focusScore !== null);
  const averageFocusScore =
    scoredSessions.length > 0
      ? Number(
          (
            scoredSessions.reduce((total, session) => total + (session.focusScore ?? 0), 0) / scoredSessions.length
          ).toFixed(1),
        )
      : null;
  const foci = plan?.foci ?? [];

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

export function buildLocalReviewDraft(context: DailyReviewContext) {
  const completedTasks = context.sessions
    .filter((session) => session.endAt)
    .map((session) => `${taskLabel(session.task)}：${minutesLabel(session.durationMin ?? 0)}`);
  const missedFoci =
    context.plan?.foci
      .filter((focus) => focus.status === "missed")
      .map((focus) => `${taskLabel(focus.task)}${focus.reason ? `；原推荐理由：${focus.reason}` : ""}`) ?? [];
  const openFoci =
    context.plan?.foci
      .filter((focus) => ["planned", "doing"].includes(focus.status))
      .map((focus) => `${taskLabel(focus.task)}（${focus.status === "doing" ? "仍在执行" : "未开始"}）`) ?? [];
  const notes = context.sessions
    .filter((session) => session.note)
    .map((session) => `${taskLabel(session.task)}：${session.note}`);
  const nextTasks = [...missedFoci, ...openFoci].slice(0, 3);
  const scoreText =
    context.metrics.averageFocusScore === null ? "暂无专注评分" : `平均专注评分 ${context.metrics.averageFocusScore}/5`;

  return [
    `# ${context.date} 晚间复盘草稿`,
    "",
    "## 今日概况",
    `今天计划 ${context.metrics.plannedCount} 个重点，完成 ${context.metrics.doneCount} 个，跳过 ${context.metrics.missedCount} 个，仍有 ${context.metrics.openCount} 个未闭环。`,
    `执行记录 ${context.metrics.sessionCount} 段，累计 ${minutesLabel(context.metrics.totalSessionMinutes)}，${scoreText}。`,
    context.plan
      ? `计划可用时间 ${context.plan.availableMinutes} 分钟，精力 ${context.plan.energy ?? "-"}，心情 ${context.plan.mood ?? "-"}。`
      : "今天还没有生成 Today 计划，复盘主要基于执行记录。",
    "",
    "## 已推进",
    listItems(completedTasks, "暂无已结束的执行记录。"),
    "",
    "## 偏差与阻力",
    listItems([...missedFoci, ...openFoci], "暂无明显偏差，可以补充今天的主观阻力。"),
    "",
    "## 记录摘记",
    listItems(notes, "暂无执行备注。"),
    "",
    "## 明日建议",
    listItems(nextTasks, "先生成明日 Today，再选择一个最小可执行任务。"),
  ].join("\n");
}

export async function generateDailyReviewDraft(context: DailyReviewContext): Promise<DraftResult> {
  const localDraft = buildLocalReviewDraft(context);
  const { text: aiDraft, error } = await callAiText(
    "你是个人执行系统的晚间复盘助手。只根据输入数据写中文复盘草稿，不编造事实，不替用户决定任务状态。输出包含：今日概况、完成、偏差、可学习点、明日建议。保持简洁、可编辑。",
    context,
    900,
    undefined,
    { action: "daily_review_draft" },
  );

  return aiDraft ? { draft: aiDraft, source: "ai" } : { draft: localDraft, source: "local", aiError: error ?? undefined };
}
