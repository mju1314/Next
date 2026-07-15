"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, FieldRow } from "@/components/ui/Field";
import type { Goal } from "@/lib/client/types";

export type ProjectFormValues = {
  title: string;
  description: string;
  goalId: string;
  status: string;
  progress: string;
  startDate: string;
  targetDate: string;
};

const initial: ProjectFormValues = {
  title: "",
  description: "",
  goalId: "",
  status: "active",
  progress: "0",
  startDate: "",
  targetDate: "",
};

export function ProjectForm({
  goals,
  busy,
  initialValues,
  submitLabel = "创建项目",
  onSubmit,
}: {
  goals: Goal[];
  busy: boolean;
  initialValues?: Partial<ProjectFormValues>;
  submitLabel?: string;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
}) {
  const initialForm = { ...initial, ...initialValues };
  const [form, setForm] = useState<ProjectFormValues>(initialForm);

  useEffect(() => {
    setForm(initialForm);
  }, [
    initialValues?.description,
    initialValues?.goalId,
    initialValues?.progress,
    initialValues?.startDate,
    initialValues?.status,
    initialValues?.targetDate,
    initialValues?.title,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(form);
    setForm(initialForm);
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <FieldRow>
        <Field label="标题">
          <input
            required
            value={form.title}
            onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
            placeholder="例如：Milestone 2 Today"
          />
        </Field>
        <Field label="目标">
          <select
            value={form.goalId}
            onChange={(event) => setForm((c) => ({ ...c, goalId: event.target.value }))}
          >
            <option value="">不绑定目标</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>
      <Field label="描述">
        <textarea
          value={form.description}
          onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
          placeholder="补充项目背景、交付物或推进标准"
        />
      </Field>
      <FieldRow>
        <Field label="状态">
          <select
            value={form.status}
            onChange={(event) => setForm((c) => ({ ...c, status: event.target.value }))}
          >
            <option value="active">进行中</option>
            <option value="paused">暂停</option>
            <option value="completed">已完成</option>
            <option value="archived">已归档</option>
          </select>
        </Field>
        <Field label="进度">
          <input
            min="0"
            max="100"
            type="number"
            value={form.progress}
            onChange={(event) => setForm((c) => ({ ...c, progress: event.target.value }))}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="开始日期">
          <input
            type="date"
            value={form.startDate}
            onChange={(event) => setForm((c) => ({ ...c, startDate: event.target.value }))}
          />
        </Field>
        <Field label="目标日期">
          <input
            type="date"
            value={form.targetDate}
            onChange={(event) => setForm((c) => ({ ...c, targetDate: event.target.value }))}
          />
        </Field>
      </FieldRow>
      <Button type="submit" variant="secondary" block disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
