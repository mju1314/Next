"use client";

import { useMemo, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Sheet } from "@/components/layout/Sheet";
import { GoalForm, GoalFormValues } from "@/components/forms/GoalForm";
import { ProjectForm, ProjectFormValues } from "@/components/forms/ProjectForm";
import { TaskForm, TaskFormValues } from "@/components/forms/TaskForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { ErrorNotice, Notice } from "@/components/ui/Notice";
import { statusLabel, suggestionMeta, taskMeta } from "@/lib/client/format";
import { localData } from "@/lib/client/local-data";
import { useExecutionData } from "@/lib/client/useExecutionData";
import type { AiTaskSuggestionResult, Goal, Project, Task, TaskSuggestion } from "@/lib/client/types";

type CreateKind = "task" | "goal" | "project" | null;

type TaskTab = "active" | "done" | "skipped" | "archived";
type TaskQuickFilter = "all" | "highPriority" | "dueSoon" | "blocked" | "unassigned" | "noEstimate";

const TASK_TABS: { key: TaskTab; label: string; statuses: string[] }[] = [
  { key: "active", label: "进行中", statuses: ["todo", "doing"] },
  { key: "done", label: "已完成", statuses: ["done"] },
  { key: "skipped", label: "已跳过", statuses: ["skipped"] },
  { key: "archived", label: "已归档", statuses: ["archived"] },
];

const TASK_QUICK_FILTERS: { key: TaskQuickFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "highPriority", label: "高优先级" },
  { key: "dueSoon", label: "临近截止" },
  { key: "blocked", label: "阻塞" },
  { key: "unassigned", label: "未归属" },
  { key: "noEstimate", label: "未估时" },
];

type GpTab = "active" | "paused" | "completed" | "archived";

const GP_TABS: { key: GpTab; label: string; statuses: string[] }[] = [
  { key: "active", label: "进行中", statuses: ["active"] },
  { key: "paused", label: "暂停", statuses: ["paused"] },
  { key: "completed", label: "已完成", statuses: ["completed"] },
  { key: "archived", label: "已归档", statuses: ["archived"] },
];

function dueDays(task: Task) {
  if (!task.dueAt) {
    return null;
  }

  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function matchesQuickFilter(task: Task, filter: TaskQuickFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "highPriority") {
    return (task.priorityManual ?? 0) >= 4;
  }

  if (filter === "dueSoon") {
    const days = dueDays(task);
    return days !== null && days <= 7;
  }

  if (filter === "blocked") {
    return Boolean(task.isBlocked);
  }

  if (filter === "unassigned") {
    return !task.projectId && !task.goalId;
  }

  return !task.estimateMin;
}

function dueTone(task: Task) {
  const days = dueDays(task);

  if (days === null) {
    return null;
  }

  if (days < 0) {
    return "已逾期";
  }

  if (days === 0) {
    return "今天截止";
  }

  return `${days} 天后截止`;
}

export default function TasksPage() {
  const data = useExecutionData();
  const { goals, projects, tasks, busy, error, notice, loading, run, setNotice } = data;

  const [createKind, setCreateKind] = useState<CreateKind>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<TaskTab>("active");
  const [quickFilter, setQuickFilter] = useState<TaskQuickFilter>("all");
  const [taskQuery, setTaskQuery] = useState("");
  const [gpTab, setGpTab] = useState<GpTab>("active");
  const [projectSuggestions, setProjectSuggestions] = useState<Record<string, AiTaskSuggestionResult>>({});

  const tabCounts = TASK_TABS.reduce<Record<TaskTab, number>>(
    (acc, tab) => {
      acc[tab.key] = tasks.filter((task) => tab.statuses.includes(task.status)).length;
      return acc;
    },
    { active: 0, done: 0, skipped: 0, archived: 0 },
  );

  const currentTab = TASK_TABS.find((tab) => tab.key === activeTab) ?? TASK_TABS[0];
  const tasksInCurrentTab = useMemo(
    () => tasks.filter((task) => currentTab.statuses.includes(task.status)),
    [currentTab.statuses, tasks],
  );
  const quickFilterCounts = useMemo(
    () =>
      TASK_QUICK_FILTERS.reduce<Record<TaskQuickFilter, number>>(
        (acc, filter) => {
          acc[filter.key] = tasksInCurrentTab.filter((task) => matchesQuickFilter(task, filter.key)).length;
          return acc;
        },
        { all: 0, blocked: 0, dueSoon: 0, highPriority: 0, noEstimate: 0, unassigned: 0 },
      ),
    [tasksInCurrentTab],
  );
  const visibleTasks = useMemo(() => {
    const normalizedQuery = taskQuery.trim().toLowerCase();

    return tasksInCurrentTab.filter((task) => {
      if (!matchesQuickFilter(task, quickFilter)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        task.title,
        task.description,
        task.status,
        statusLabel(task.status),
        task.taskType,
        task.energyLevel,
        task.isBlocked ? "阻塞" : null,
        task.project?.title,
        task.goal?.title,
        ...taskMeta(task),
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [quickFilter, taskQuery, tasksInCurrentTab]);

  function changeTaskStatus(task: Task, status: string, success: string) {
    void run(
      `task-status-${task.id}`,
      () => localData.updateTask(task.id, { status }).then(() => undefined),
      { success },
    );
  }

  function reopenTask(task: Task) {
    void run(
      `task-status-${task.id}`,
      () => localData.reopenTask(task.id).then(() => undefined),
      { success: "任务已重新打开" },
    );
  }

  function taskMenuItems(task: Task): MenuItem[] {
    const edit: MenuItem = { label: "编辑", tone: "default", onSelect: () => setEditingTask(task) };
    const reopen: MenuItem = { label: "重新打开", tone: "default", onSelect: () => reopenTask(task) };
    const archive: MenuItem = {
      label: "归档",
      tone: "default",
      onSelect: () => changeTaskStatus(task, "archived", "任务已归档"),
    };

    if (task.status === "archived") {
      return [edit, reopen];
    }

    if (task.status === "done" || task.status === "skipped") {
      return [edit, reopen, archive];
    }

    return [
      edit,
      { label: "标记完成", tone: "success", onSelect: () => changeTaskStatus(task, "done", "任务已完成") },
      { label: "跳过", tone: "default", onSelect: () => changeTaskStatus(task, "skipped", "任务已跳过") },
      archive,
    ];
  }

  async function submitTask(values: TaskFormValues) {
    await run(
      "task",
      () => localData.createTask(values).then(() => undefined),
      { success: "任务已创建" },
    );
    setCreateKind(null);
  }

  async function submitTaskEdit(values: TaskFormValues) {
    if (!editingTask) {
      return;
    }

    await run(
      `task-edit-${editingTask.id}`,
      () => localData.updateTask(editingTask.id, values).then(() => undefined),
      { success: "任务已更新" },
    );
    setEditingTask(null);
  }

  async function submitGoal(values: GoalFormValues) {
    await run(
      "goal",
      () => localData.createGoal(values).then(() => undefined),
      { success: "目标已创建" },
    );
    setCreateKind(null);
  }

  async function submitGoalEdit(values: GoalFormValues) {
    if (!editingGoal) {
      return;
    }

    await run(
      `goal-edit-${editingGoal.id}`,
      () => localData.updateGoal(editingGoal.id, values).then(() => undefined),
      { success: "目标已更新" },
    );
    setEditingGoal(null);
  }

  async function submitProject(values: ProjectFormValues) {
    await run(
      "project",
      () => localData.createProject(values).then(() => undefined),
      { success: "项目已创建" },
    );
    setCreateKind(null);
  }

  async function submitProjectEdit(values: ProjectFormValues) {
    if (!editingProject) {
      return;
    }

    await run(
      `project-edit-${editingProject.id}`,
      () => localData.updateProject(editingProject.id, values).then(() => undefined),
      { success: "项目已更新" },
    );
    setEditingProject(null);
  }

  const gpTabCounts = GP_TABS.reduce<Record<GpTab, number>>(
    (acc, tab) => {
      acc[tab.key] =
        goals.filter((goal) => tab.statuses.includes(goal.status)).length +
        projects.filter((project) => tab.statuses.includes(project.status)).length;
      return acc;
    },
    { active: 0, paused: 0, completed: 0, archived: 0 },
  );

  const currentGpTab = GP_TABS.find((tab) => tab.key === gpTab) ?? GP_TABS[0];
  const visibleGoals = goals.filter((goal) => currentGpTab.statuses.includes(goal.status));
  const visibleProjects = projects.filter((project) => currentGpTab.statuses.includes(project.status));
  const editingTaskValues = editingTask
    ? {
        title: editingTask.title,
        description: editingTask.description ?? "",
        estimateMin: editingTask.estimateMin?.toString() ?? "",
        priorityManual: editingTask.priorityManual?.toString() ?? "",
        projectId: editingTask.projectId ?? "",
        goalId: editingTask.goalId ?? "",
        dueAt: editingTask.dueAt?.slice(0, 10) ?? "",
        taskType: editingTask.taskType ?? "",
        energyLevel: editingTask.energyLevel ?? "",
        status: editingTask.status,
        isBlocked: editingTask.isBlocked ?? false,
      }
    : undefined;
  const editingGoalValues = editingGoal
    ? {
        title: editingGoal.title,
        description: editingGoal.description ?? "",
        importance: editingGoal.importance.toString(),
        status: editingGoal.status,
        progress: (editingGoal.progress ?? 0).toString(),
        startDate: editingGoal.startDate?.slice(0, 10) ?? "",
        targetDate: editingGoal.targetDate?.slice(0, 10) ?? "",
      }
    : undefined;
  const editingProjectValues = editingProject
    ? {
        title: editingProject.title,
        description: editingProject.description ?? "",
        goalId: editingProject.goalId ?? "",
        status: editingProject.status,
        progress: (editingProject.progress ?? 0).toString(),
        startDate: editingProject.startDate?.slice(0, 10) ?? "",
        targetDate: editingProject.targetDate?.slice(0, 10) ?? "",
      }
    : undefined;

  function changeGoalStatus(goal: Goal, status: string, success: string) {
    void run(
      `goal-status-${goal.id}`,
      () => localData.updateGoal(goal.id, { status }).then(() => undefined),
      { success },
    );
  }

  function changeProjectStatus(project: Project, status: string, success: string) {
    void run(
      `project-status-${project.id}`,
      () => localData.updateProject(project.id, { status }).then(() => undefined),
      { success },
    );
  }

  function goalMenuItems(goal: Goal): MenuItem[] {
    const edit: MenuItem = { label: "编辑", tone: "default", onSelect: () => setEditingGoal(goal) };

    if (goal.status === "archived") {
      return [
        edit,
        { label: "重新激活", tone: "default", onSelect: () => changeGoalStatus(goal, "active", "目标已重新激活") },
      ];
    }

    return [edit, { label: "归档", tone: "default", onSelect: () => changeGoalStatus(goal, "archived", "目标已归档") }];
  }

  function projectMenuItems(project: Project): MenuItem[] {
    const edit: MenuItem = { label: "编辑", tone: "default", onSelect: () => setEditingProject(project) };

    if (project.status === "archived") {
      return [
        edit,
        { label: "重新激活", tone: "default", onSelect: () => changeProjectStatus(project, "active", "项目已重新激活") },
      ];
    }

    return [edit, { label: "归档", tone: "default", onSelect: () => changeProjectStatus(project, "archived", "项目已归档") }];
  }

  async function suggestProjectTasks(project: Project) {
    await run(
      `ai-project-${project.id}`,
      async () => {
        const result = await localData.suggestTasksFromProject(project.id);
        setProjectSuggestions((current) => ({ ...current, [project.id]: result }));
        setNotice(result.source === "ai" ? "AI 已生成项目拆解建议" : "已生成本地兜底项目拆解建议");
      },
      { refresh: false },
    );
  }

  function createProjectSuggestedTask(project: Project, suggestion: TaskSuggestion) {
    void run(
      `create-project-${project.id}-${suggestion.title}`,
      () =>
        localData
          .createTask({
            title: suggestion.title,
            description: suggestion.description ?? "",
            estimateMin: suggestion.estimateMin ?? 45,
            priorityManual: suggestion.priorityManual ?? "",
            taskType: suggestion.taskType ?? "",
            energyLevel: suggestion.energyLevel ?? "",
            projectId: project.id,
            goalId: project.goalId ?? "",
          })
          .then(() => undefined),
      { success: "已根据项目拆解建议创建任务" },
    );
  }

  return (
    <>
      <AppHeader
        title="任务"
        subtitle={`${tabCounts.active} 个进行中`}
        action={
          <Button size="sm" variant="primary" onClick={() => setCreateKind("task")}>
            ＋ 新建
          </Button>
        }
      />

      <div className="grid gap-4 p-4">
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {loading ? <Notice>正在读取本地数据...</Notice> : null}

        <Card className="grid gap-4" highlight>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="任务" subtitle={`当前显示 ${visibleTasks.length} / ${tasksInCurrentTab.length} 个`} />
            {(taskQuery.trim() || quickFilter !== "all") ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setTaskQuery("");
                  setQuickFilter("all");
                }}
              >
                清除筛选
              </Button>
            ) : null}
          </div>

          <div className="grid gap-2">
            <input
              type="search"
              value={taskQuery}
              onChange={(event) => setTaskQuery(event.target.value)}
              placeholder="搜索任务、描述、项目或目标"
              aria-label="搜索任务"
            />
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-max gap-2 rounded-full border border-white/70 bg-white/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                {TASK_QUICK_FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setQuickFilter(filter.key)}
                    className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all ${
                      quickFilter === filter.key
                        ? "bg-primary text-white shadow-[0_8px_18px_rgba(10,132,255,0.22)]"
                        : "text-muted hover:bg-white/75 hover:text-text"
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span
                      className={`rounded-full px-1.5 text-[11px] leading-5 ${
                        quickFilter === filter.key ? "bg-white/25" : "bg-white/70 text-muted"
                      }`}
                    >
                      {quickFilterCounts[filter.key]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max gap-2 rounded-full border border-white/70 bg-white/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            {TASK_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all ${
                  activeTab === tab.key
                    ? "bg-primary text-white shadow-[0_8px_18px_rgba(10,132,255,0.22)]"
                    : "text-muted hover:bg-white/75 hover:text-text"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 text-[11px] leading-5 ${
                    activeTab === tab.key ? "bg-white/25" : "bg-white/70 text-muted"
                  }`}
                >
                  {tabCounts[tab.key]}
                </span>
              </button>
            ))}
            </div>
          </div>

          {!loading && visibleTasks.length === 0 ? (
            <Empty>
              {tasks.length === 0
                ? "还没有任务。"
                : taskQuery.trim() || quickFilter !== "all"
                  ? "当前筛选没有匹配的任务。"
                  : `「${currentTab.label}」暂无任务。`}
            </Empty>
          ) : null}
          <div className="grid gap-2">
            {visibleTasks.map((task) => (
              <article
                key={task.id}
                className="menu-stack-scope grid gap-3 rounded-[20px] border border-white/75 bg-white/75 p-3 shadow-[0_10px_24px_rgba(36,50,80,0.06)] backdrop-blur-xl transition-all hover:bg-white/85 sm:p-4"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <div className="break-words text-[15px] font-bold leading-snug">{task.title}</div>
                    {task.description ? (
                      <p className="m-0 line-clamp-2 break-words text-[13px] leading-relaxed text-muted">
                        {task.description}
                      </p>
                    ) : null}
                  </div>
                  <Menu items={taskMenuItems(task)} disabled={busy === `task-status-${task.id}`} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={task.status}>{statusLabel(task.status)}</Badge>
                  {task.isBlocked ? <Badge tone="archived">阻塞</Badge> : null}
                  {dueTone(task) ? (
                    <span className="rounded-full bg-white/70 px-2 py-1 font-semibold text-text">{dueTone(task)}</span>
                  ) : null}
                  {(task.priorityManual ?? 0) >= 4 ? (
                    <span className="rounded-full bg-white/70 px-2 py-1 font-semibold text-text">
                      优先级 {task.priorityManual}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-white/65 px-2 py-1">{task.estimateMin ?? 45} 分钟</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  {task.project ? (
                    <span className="rounded-full bg-white/65 px-2 py-1">项目：{task.project.title}</span>
                  ) : null}
                  {task.goal ? (
                    <span className="rounded-full bg-white/65 px-2 py-1">目标：{task.goal.title}</span>
                  ) : null}
                  {!task.project && !task.goal ? (
                    <span className="rounded-full bg-white/65 px-2 py-1">未归属</span>
                  ) : null}
                  {task.taskType ? (
                    <span className="rounded-full bg-white/65 px-2 py-1">类型 {task.taskType}</span>
                  ) : null}
                  {task.energyLevel ? (
                    <span className="rounded-full bg-white/65 px-2 py-1">精力 {task.energyLevel}</span>
                  ) : null}
                  </div>
              </article>
            ))}
          </div>
        </Card>

        <Card className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle title="目标与项目" subtitle="创建、归档和关联关系已接入 API。" />
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
              <Button size="sm" variant="secondary" className="w-full" onClick={() => setCreateKind("goal")}>
                ＋ 目标
              </Button>
              <Button size="sm" variant="secondary" className="w-full" onClick={() => setCreateKind("project")}>
                ＋ 项目
              </Button>
            </div>
          </div>

          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max gap-2 rounded-full border border-white/70 bg-white/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              {GP_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setGpTab(tab.key)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all ${
                    gpTab === tab.key
                      ? "bg-primary text-white shadow-[0_8px_18px_rgba(10,132,255,0.22)]"
                      : "text-muted hover:bg-white/75 hover:text-text"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 text-[11px] leading-5 ${
                      gpTab === tab.key ? "bg-white/25" : "bg-white/70 text-muted"
                    }`}
                  >
                    {gpTabCounts[tab.key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {!loading && visibleGoals.length === 0 && visibleProjects.length === 0 ? (
            <Empty>
              {goals.length === 0 && projects.length === 0
                ? "还没有目标或项目。"
                : `「${currentGpTab.label}」暂无目标或项目。`}
            </Empty>
          ) : null}

          <div className="grid gap-2">
            {visibleGoals.map((goal) => (
              <article
                key={goal.id}
                className="menu-stack-scope grid gap-3 rounded-[20px] border border-white/75 bg-white/75 p-3 shadow-[0_10px_24px_rgba(36,50,80,0.06)] backdrop-blur-xl transition-all hover:bg-white/85 sm:p-4"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <div className="break-words text-[15px] font-bold leading-snug">{goal.title}</div>
                    {goal.description ? (
                      <p className="m-0 line-clamp-2 break-words text-[13px] leading-relaxed text-muted">
                        {goal.description}
                      </p>
                    ) : null}
                  </div>
                  <Menu items={goalMenuItems(goal)} disabled={busy === `goal-status-${goal.id}`} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={goal.status}>{statusLabel(goal.status)}</Badge>
                  <span className="rounded-full bg-white/65 px-2 py-1">重要性 {goal.importance}</span>
                  <span className="rounded-full bg-white/65 px-2 py-1">进度 {goal.progress ?? 0}%</span>
                  {goal.targetDate ? (
                    <span className="rounded-full bg-white/65 px-2 py-1">
                      目标日 {goal.targetDate.slice(0, 10)}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-white/65 px-2 py-1">
                    项目 {projects.filter((project) => project.goalId === goal.id).length}
                  </span>
                </div>
              </article>
            ))}

            {visibleProjects.map((project) => (
              <article
                key={project.id}
                className="menu-stack-scope grid gap-3 rounded-[20px] border border-white/75 bg-white/75 p-3 shadow-[0_10px_24px_rgba(36,50,80,0.06)] backdrop-blur-xl transition-all hover:bg-white/85 sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <div className="break-words text-[15px] font-bold leading-snug">{project.title}</div>
                    {project.description ? (
                      <p className="m-0 line-clamp-2 break-words text-[13px] leading-relaxed text-muted">
                        {project.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge tone={project.status}>{statusLabel(project.status)}</Badge>
                      <span className="rounded-full bg-white/65 px-2 py-1">进度 {project.progress ?? 0}%</span>
                      {project.targetDate ? (
                        <span className="rounded-full bg-white/65 px-2 py-1">
                          目标日 {project.targetDate.slice(0, 10)}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-white/65 px-2 py-1">
                        {project.goal ? `目标：${project.goal.title}` : "未绑定目标项目"}
                      </span>
                    </div>
                  </div>
                  <Menu items={projectMenuItems(project)} disabled={busy === `project-status-${project.id}`} />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:flex sm:items-start sm:gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={busy === `ai-project-${project.id}`}
                      onClick={() => void suggestProjectTasks(project)}
                    >
                      AI 拆任务
                    </Button>
                </div>

                {projectSuggestions[project.id] ? (
                  <div className="grid gap-2 border-t border-dashed border-border/80 pt-3">
                    <div className="text-xs font-semibold text-muted">
                      {projectSuggestions[project.id].source === "ai"
                        ? "AI 生成，需确认后写入"
                        : "本地兜底，AI 失败不影响使用"}
                    </div>
                    {projectSuggestions[project.id].suggestions.map((suggestion, index) => (
                      <div
                        key={`${suggestion.title}-${index}`}
                        className="grid gap-2 rounded-2xl border border-white/75 bg-white/65 p-3 shadow-[0_8px_20px_rgba(36,50,80,0.05)]"
                      >
                        <strong className="break-words">{suggestion.title}</strong>
                        <div className="flex flex-wrap gap-2 text-xs text-muted">
                          {suggestionMeta(suggestion).map((meta) => (
                            <span key={meta} className="rounded-full bg-white/70 px-2 py-1">
                              {meta}
                            </span>
                          ))}
                        </div>
                        {suggestion.reason ? (
                          <p className="m-0 text-[13px] leading-relaxed text-muted">{suggestion.reason}</p>
                        ) : null}
                        <Button
                          variant="success"
                          size="sm"
                          disabled={busy === `create-project-${project.id}-${suggestion.title}`}
                          onClick={() => createProjectSuggestedTask(project, suggestion)}
                        >
                          确认创建
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </Card>
      </div>

      <Sheet open={createKind === "task"} onClose={() => setCreateKind(null)} title="新建任务">
        <TaskForm goals={goals} projects={projects} busy={busy === "task"} onSubmit={submitTask} />
      </Sheet>
      <Sheet open={Boolean(editingTask)} onClose={() => setEditingTask(null)} title="编辑任务">
        {editingTaskValues ? (
          <TaskForm
            goals={goals}
            projects={projects}
            busy={busy === `task-edit-${editingTask?.id}`}
            initialValues={editingTaskValues}
            submitLabel="保存修改"
            onSubmit={submitTaskEdit}
          />
        ) : null}
      </Sheet>
      <Sheet open={createKind === "goal"} onClose={() => setCreateKind(null)} title="新建目标">
        <GoalForm busy={busy === "goal"} onSubmit={submitGoal} />
      </Sheet>
      <Sheet open={Boolean(editingGoal)} onClose={() => setEditingGoal(null)} title="编辑目标">
        {editingGoalValues ? (
          <GoalForm
            busy={busy === `goal-edit-${editingGoal?.id}`}
            initialValues={editingGoalValues}
            submitLabel="保存修改"
            onSubmit={submitGoalEdit}
          />
        ) : null}
      </Sheet>
      <Sheet open={createKind === "project"} onClose={() => setCreateKind(null)} title="新建项目">
        <ProjectForm goals={goals} busy={busy === "project"} onSubmit={submitProject} />
      </Sheet>
      <Sheet open={Boolean(editingProject)} onClose={() => setEditingProject(null)} title="编辑项目">
        {editingProjectValues ? (
          <ProjectForm
            goals={goals}
            busy={busy === `project-edit-${editingProject?.id}`}
            initialValues={editingProjectValues}
            submitLabel="保存修改"
            onSubmit={submitProjectEdit}
          />
        ) : null}
      </Sheet>
    </>
  );
}
