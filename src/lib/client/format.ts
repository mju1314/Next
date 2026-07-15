import type { Task, TaskSuggestion } from "@/lib/client/types";

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "进行中",
    archived: "已归档",
    completed: "已完成",
    converted: "已转换",
    doing: "执行中",
    done: "完成",
    ignored: "已忽略",
    missed: "已跳过",
    paused: "暂停",
    planned: "已计划",
    skipped: "跳过",
    todo: "待办",
    unprocessed: "待处理",
  };

  return labels[status] ?? status;
}

export function focusTone(status: string) {
  if (status === "doing") {
    return "doing";
  }

  if (status === "done") {
    return "done";
  }

  if (status === "missed") {
    return "skipped";
  }

  return "todo";
}

export function taskMeta(task: Task) {
  return [
    `${task.estimateMin ?? 45} 分钟`,
    task.priorityManual ? `优先级 ${task.priorityManual}` : null,
    task.dueAt ? `截止 ${task.dueAt.slice(0, 10)}` : null,
    task.project ? `项目：${task.project.title}` : null,
    task.goal ? `目标：${task.goal.title}` : null,
  ].filter(Boolean) as string[];
}

export function suggestionMeta(suggestion: TaskSuggestion) {
  return [
    suggestion.estimateMin ? `${suggestion.estimateMin} 分钟` : null,
    suggestion.priorityManual ? `优先级 ${suggestion.priorityManual}` : null,
    suggestion.taskType ? `类型 ${suggestion.taskType}` : null,
    suggestion.energyLevel ? `精力 ${suggestion.energyLevel}` : null,
  ].filter(Boolean) as string[];
}

export function elapsedMinutesSince(startAt: string) {
  const durationMs = Date.now() - new Date(startAt).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }

  return Math.floor(durationMs / 60_000);
}

export function formatElapsed(minutes: number) {
  if (minutes <= 0) {
    return "少于 1 分钟";
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) {
    return `${restMinutes} 分钟`;
  }

  return restMinutes === 0 ? `${hours} 小时` : `${hours} 小时 ${restMinutes} 分钟`;
}
