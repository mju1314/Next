"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Sheet } from "@/components/layout/Sheet";
import { FocusCard } from "@/components/today/FocusCard";
import { RunningStrip } from "@/components/today/RunningStrip";
import { TodayControls, TodayControlValues } from "@/components/today/TodayControls";
import { GoalForm, GoalFormValues } from "@/components/forms/GoalForm";
import { InboxForm } from "@/components/forms/InboxForm";
import { ProjectForm, ProjectFormValues } from "@/components/forms/ProjectForm";
import { TaskForm, TaskFormValues } from "@/components/forms/TaskForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { ErrorNotice, Notice } from "@/components/ui/Notice";
import { elapsedMinutesSince, statusLabel, taskMeta } from "@/lib/client/format";
import { localData } from "@/lib/client/local-data";
import { useExecutionData } from "@/lib/client/useExecutionData";
import type { AiReasonResult, DailyFocus } from "@/lib/client/types";

type CreateKind = "task" | "inbox" | "goal" | "project" | "addFocus" | null;

export default function TodayPage() {
  const data = useExecutionData();
  const { goals, projects, today, activeSession, busy, error, notice, run, setError, setNotice } = data;

  const [todayControls, setTodayControls] = useState<TodayControlValues>({
    availableMinutes: "120",
    energy: "3",
    mood: "3",
    mode: "progress",
  });
  const [needsOverwrite, setNeedsOverwrite] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [polishedReasons, setPolishedReasons] = useState<Record<string, AiReasonResult>>({});
  const [createKind, setCreateKind] = useState<CreateKind>(null);

  const mainFocus = today?.plan?.foci[0] ?? null;
  const alternatives = today?.plan?.foci.slice(1) ?? [];
  const doingFocus = today?.plan?.foci.find((focus) => focus.status === "doing") ?? null;
  const activeFocus = activeSession
    ? today?.plan?.foci.find((focus) => focus.taskId === activeSession.taskId) ?? null
    : null;
  const runningFocus = doingFocus ?? activeFocus;
  const runningTask = activeSession?.task ?? runningFocus?.task ?? null;

  useEffect(() => {
    if (!activeSession) {
      setElapsedMinutes(0);
      return;
    }

    const updateElapsed = () => setElapsedMinutes(elapsedMinutesSince(activeSession.startAt));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 30_000);

    return () => window.clearInterval(timer);
  }, [activeSession?.id, activeSession?.startAt]);

  async function generateToday(overwrite = false) {
    setNeedsOverwrite(false);
    await run(
      "today",
      async () => {
        try {
          await localData.generateDailyPlan({
            availableMinutes: todayControls.availableMinutes,
            energy: todayControls.energy,
            mood: todayControls.mood,
            mode: todayControls.mode,
            overwrite,
          });
        } catch (nextError) {
          const message = nextError instanceof Error ? nextError.message : "生成今日推荐失败";
          if (message.includes("已经生成推荐")) {
            setNeedsOverwrite(true);
          }
          throw nextError;
        }
      },
      { success: overwrite ? "今天推荐已覆盖" : "今天推荐已生成" },
    );
  }

  function submitToday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void generateToday(false);
  }

  function updateFocus(focus: DailyFocus, action: "start" | "complete" | "skip") {
    void run(
      `${focus.id}-${action}`,
      () => localData.updateDailyFocus(focus.id, action).then(() => undefined),
      { success: action === "start" ? "已开始任务" : action === "complete" ? "任务已完成" : "任务已跳过" },
    );
  }

  function promoteFocus(focus: DailyFocus) {
    void run(
      `${focus.id}-promote`,
      () => localData.promoteFocus(focus.id).then(() => undefined),
      { success: "已设为主任务" },
    );
  }

  async function addFocus(taskId: string) {
    await run(
      `add-focus-${taskId}`,
      () => localData.addDailyFocus(taskId).then(() => undefined),
      { success: "已加入今日推荐" },
    );
    setCreateKind(null);
  }

  function finishActiveSession(status: "done" | "todo") {
    if (!activeSession) {
      return;
    }

    void run(
      `session-${activeSession.id}-${status}`,
      () => localData.finishSession(activeSession.id, status).then(() => undefined),
      { success: status === "done" ? "任务已完成" : "本次执行已停止" },
    );
  }

  async function polishReason(focus: DailyFocus) {
    await run(
      `ai-reason-${focus.id}`,
      async () => {
        const result = await localData.polishRecommendationReason(focus.id);
        setPolishedReasons((current) => ({ ...current, [focus.id]: result }));
        setNotice(result.source === "ai" ? "AI 已润色推荐理由" : "已生成本地兜底推荐解释");
      },
      { refresh: false },
    );
  }

  async function submitTask(values: TaskFormValues) {
    await run(
      "task",
      () => localData.createTask(values).then(() => undefined),
      { success: "任务已创建" },
    );
    setCreateKind(null);
  }

  async function submitInbox(rawText: string) {
    await run(
      "inbox",
      () => localData.createInbox({ rawText }).then(() => undefined),
      { success: "Inbox 已保存" },
    );
    setCreateKind(null);
  }

  async function submitGoal(values: GoalFormValues) {
    await run(
      "goal",
      () => localData.createGoal(values).then(() => undefined),
      { success: "目标已创建" },
    );
    setCreateKind(null);
  }

  async function submitProject(values: ProjectFormValues) {
    await run(
      "project",
      () => localData.createProject(values).then(() => undefined),
      { success: "项目已创建" },
    );
    setCreateKind(null);
  }

  const headerSubtitle = useMemo(() => {
    if (!today) {
      return "个人执行系统";
    }
    return `${today.date} · 待办 ${today.openTaskCount} · Inbox ${today.inboxCount}`;
  }, [today]);

  const focusTaskIds = useMemo(
    () => new Set((today?.plan?.foci ?? []).map((focus) => focus.taskId)),
    [today],
  );

  const eligibleTasks = useMemo(
    () =>
      data.tasks.filter(
        (task) => (task.status === "todo" || task.status === "doing") && !focusTaskIds.has(task.id),
      ),
    [data.tasks, focusTaskIds],
  );

  const canAddFocus = Boolean(today?.plan) && (today?.plan?.foci.length ?? 0) < 4;

  if (data.loading) {
    return (
      <>
        <AppHeader title="今日" subtitle="个人执行系统" />
        <div className="p-4">
          <Notice>正在读取本地数据...</Notice>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title="今日"
        subtitle={headerSubtitle}
        action={
          <Button size="sm" variant="secondary" onClick={() => setCreateKind("task")}>
            ＋ 创建
          </Button>
        }
      />

      <div className="grid gap-4 p-4">
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        {notice ? <Notice>{notice}</Notice> : null}

        {today ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[18px] border border-white/70 bg-white/70 p-3 shadow-[0_8px_22px_rgba(36,50,80,0.05)]">
              <div className="text-[11px] font-semibold text-muted">待办</div>
              <div className="mt-1 text-2xl font-black leading-none">{today.openTaskCount}</div>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/70 p-3 shadow-[0_8px_22px_rgba(36,50,80,0.05)]">
              <div className="text-[11px] font-semibold text-muted">收集</div>
              <div className="mt-1 text-2xl font-black leading-none">{today.inboxCount}</div>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/70 p-3 shadow-[0_8px_22px_rgba(36,50,80,0.05)]">
              <div className="text-[11px] font-semibold text-muted">推荐</div>
              <div className="mt-1 text-2xl font-black leading-none">{today.plan?.foci.length ?? 0}</div>
            </div>
          </div>
        ) : null}

        {runningTask ? (
          <RunningStrip
            task={runningTask}
            activeSession={activeSession}
            elapsedMinutes={elapsedMinutes}
            busy={busy}
            onStop={() => finishActiveSession("todo")}
            onComplete={() => finishActiveSession("done")}
          />
        ) : null}

        <div className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3 px-1">
            <div className="grid gap-1">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">下一步行动</span>
              <h1 className="m-0 text-[28px] font-black leading-none">今日推荐</h1>
            </div>
            {today?.plan ? (
              <Badge tone="active">
                {today.plan.availableMinutes} 分钟 · 精力 {today.plan.energy ?? "-"}
              </Badge>
            ) : null}
          </div>

          {mainFocus ? (
            <FocusCard
              focus={mainFocus}
              variant="main"
              hasActiveSession={Boolean(activeSession)}
              busy={busy}
              polished={polishedReasons[mainFocus.id]}
              onStart={() => updateFocus(mainFocus, "start")}
              onComplete={() => updateFocus(mainFocus, "complete")}
              onSkip={() => updateFocus(mainFocus, "skip")}
              onPolish={() => void polishReason(mainFocus)}
              onPromote={() => promoteFocus(mainFocus)}
            />
          ) : (
            <Empty>
              {data.tasks.length === 0
                ? "还没有任务。先创建一个任务，之后这里会直接显示今天最值得开始的行动。"
                : "还没有生成今天推荐。保留下方默认状态，点一次生成推荐即可看到主任务。"}
            </Empty>
          )}
        </div>

        {alternatives.length > 0 ? (
          <div className="grid gap-3">
            <div className="px-1 text-xs font-bold uppercase tracking-[0.18em] text-muted">备选任务</div>
            {alternatives.map((focus) => (
              <FocusCard
                key={focus.id}
                focus={focus}
                variant="alternative"
                hasActiveSession={Boolean(activeSession)}
                busy={busy}
                polished={polishedReasons[focus.id]}
                onStart={() => updateFocus(focus, "start")}
                onComplete={() => updateFocus(focus, "complete")}
                onSkip={() => updateFocus(focus, "skip")}
                onPolish={() => void polishReason(focus)}
                onPromote={() => promoteFocus(focus)}
              />
            ))}
          </div>
        ) : null}

        <Card className="grid gap-4">
          <CardTitle title="生成计划" subtitle="可用时间、精力和心情会影响今日排序。" />
          <TodayControls
            values={todayControls}
            busy={busy === "today"}
            needsOverwrite={needsOverwrite}
            onChange={setTodayControls}
            onSubmit={submitToday}
            onOverwrite={() => void generateToday(true)}
          />
        </Card>

        {today?.plan ? (
          <Button
            variant="secondary"
            block
            className="min-h-[48px]"
            disabled={!canAddFocus}
            onClick={() => setCreateKind("addFocus")}
          >
            {canAddFocus ? "＋ 加入今日任务" : "今日推荐已满 4 条，先跳过一个再加入"}
          </Button>
        ) : null}
      </div>

      <Sheet
        open={createKind === "task"}
        onClose={() => setCreateKind(null)}
        title="新建任务"
      >
        <TaskForm goals={goals} projects={projects} busy={busy === "task"} onSubmit={submitTask} />
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4 text-xs text-muted">
          <span className="w-full">也可以快速创建：</span>
          <Button size="sm" variant="secondary" onClick={() => setCreateKind("inbox")}>
            写 Inbox
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCreateKind("goal")}>
            新建目标
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCreateKind("project")}>
            新建项目
          </Button>
        </div>
      </Sheet>

      <Sheet open={createKind === "inbox"} onClose={() => setCreateKind(null)} title="写入 Inbox">
        <InboxForm busy={busy === "inbox"} onSubmit={submitInbox} />
      </Sheet>

      <Sheet open={createKind === "goal"} onClose={() => setCreateKind(null)} title="新建目标">
        <GoalForm busy={busy === "goal"} onSubmit={submitGoal} />
      </Sheet>

      <Sheet open={createKind === "project"} onClose={() => setCreateKind(null)} title="新建项目">
        <ProjectForm goals={goals} busy={busy === "project"} onSubmit={submitProject} />
      </Sheet>

      <Sheet open={createKind === "addFocus"} onClose={() => setCreateKind(null)} title="加入今日任务">
        {eligibleTasks.length === 0 ? (
          <Empty>没有可加入的任务。所有待办任务都已在今日推荐里，或先去创建/处理任务。</Empty>
        ) : (
          <div className="grid gap-2">
            {eligibleTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                disabled={busy === `add-focus-${task.id}`}
                onClick={() => void addFocus(task.id)}
                className="grid min-h-[72px] gap-2 rounded-[18px] border border-white/75 bg-white/75 p-3 text-left shadow-[0_8px_22px_rgba(36,50,80,0.06)] transition-colors hover:border-primary disabled:opacity-60"
              >
                <span className="font-bold break-words">{task.title}</span>
                <span className="flex flex-wrap gap-2 text-xs text-muted">
                  <Badge tone={task.status}>{statusLabel(task.status)}</Badge>
                  {taskMeta(task).map((meta) => (
                    <span key={meta}>{meta}</span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
