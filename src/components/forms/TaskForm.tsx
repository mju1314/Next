"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, FieldRow } from "@/components/ui/Field";
import type { Goal, Project } from "@/lib/client/types";

export type TaskFormValues = {
  title: string;
  description: string;
  estimateMin: string;
  priorityManual: string;
  projectId: string;
  goalId: string;
  dueAt: string;
  taskType: string;
  energyLevel: string;
  status: string;
  isBlocked: boolean;
};

const initial: TaskFormValues = {
  title: "",
  description: "",
  estimateMin: "45",
  priorityManual: "3",
  projectId: "",
  goalId: "",
  dueAt: "",
  taskType: "",
  energyLevel: "",
  status: "todo",
  isBlocked: false,
};

export function TaskForm({
  goals,
  projects,
  busy,
  defaultProjectId,
  defaultGoalId,
  initialValues,
  submitLabel = "创建任务",
  onSubmit,
}: {
  goals: Goal[];
  projects: Project[];
  busy: boolean;
  defaultProjectId?: string;
  defaultGoalId?: string;
  initialValues?: Partial<TaskFormValues>;
  submitLabel?: string;
  onSubmit: (values: TaskFormValues) => Promise<void>;
}) {
  const initialForm = {
    ...initial,
    projectId: defaultProjectId ?? "",
    goalId: defaultGoalId ?? "",
    ...initialValues,
  };
  const [form, setForm] = useState<TaskFormValues>({
    ...initialForm,
  });

  useEffect(() => {
    setForm(initialForm);
  }, [
    defaultGoalId,
    defaultProjectId,
    initialValues?.description,
    initialValues?.dueAt,
    initialValues?.energyLevel,
    initialValues?.estimateMin,
    initialValues?.goalId,
    initialValues?.isBlocked,
    initialValues?.priorityManual,
    initialValues?.projectId,
    initialValues?.status,
    initialValues?.taskType,
    initialValues?.title,
  ]);

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(form);
    setForm(initialForm);
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <Field label="标题">
        <input
          required
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="例如：梳理 Today 页面状态"
        />
      </Field>
      <Field label="描述">
        <textarea
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder="补充背景、完成标准或注意事项"
        />
      </Field>
      <FieldRow>
        <Field label="项目">
          <select value={form.projectId} onChange={(event) => set("projectId", event.target.value)}>
            <option value="">不绑定项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="目标">
          <select value={form.goalId} onChange={(event) => set("goalId", event.target.value)}>
            <option value="">不绑定目标</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="预计分钟">
          <input
            min="1"
            type="number"
            value={form.estimateMin}
            onChange={(event) => set("estimateMin", event.target.value)}
          />
        </Field>
        <Field label="手动优先级">
          <select
            value={form.priorityManual}
            onChange={(event) => set("priorityManual", event.target.value)}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="截止日期">
          <input type="date" value={form.dueAt} onChange={(event) => set("dueAt", event.target.value)} />
        </Field>
        <Field label="任务类型">
          <select value={form.taskType} onChange={(event) => set("taskType", event.target.value)}>
            <option value="">未设置</option>
            <option value="deep_work">深度工作</option>
            <option value="admin">事务</option>
            <option value="learning">学习</option>
            <option value="health">健康</option>
            <option value="errand">跑腿</option>
          </select>
        </Field>
      </FieldRow>
      <Field label="精力要求">
        <select value={form.energyLevel} onChange={(event) => set("energyLevel", event.target.value)}>
          <option value="">未设置</option>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
        </select>
      </Field>
      <FieldRow>
        <Field label="状态">
          <select value={form.status} onChange={(event) => set("status", event.target.value)}>
            <option value="todo">待办</option>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
            <option value="skipped">已跳过</option>
            <option value="archived">已归档</option>
          </select>
        </Field>
        <Field label="阻塞">
          <label className="flex min-h-[46px] items-center gap-2 rounded-2xl border border-border bg-white px-3 text-sm font-semibold text-text">
            <input
              type="checkbox"
              checked={form.isBlocked}
              onChange={(event) => set("isBlocked", event.target.checked)}
            />
            暂时不可执行
          </label>
        </Field>
      </FieldRow>
      <Button type="submit" variant="primary" block disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
