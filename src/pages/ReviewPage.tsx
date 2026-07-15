"use client";

import { FormEvent, useEffect, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { ErrorNotice, Notice } from "@/components/ui/Notice";
import { localData } from "@/lib/client/local-data";
import type { DailyReview } from "@/lib/client/types";

type ReviewDraftResponse = {
  date: string;
  draft: string;
  source: "ai" | "local";
  aiError: string | null;
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

type SavedReviewResponse = {
  date: string;
  review: DailyReview | null;
};

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function requestReviewDraft(date: string) {
  return localData.generateReviewDraft(date) as Promise<ReviewDraftResponse>;
}

function requestSavedReview(date: string) {
  return localData.getSavedReview(date) as Promise<SavedReviewResponse>;
}

function saveDailyReview(input: {
  date: string;
  content: string;
  source: "manual" | "ai" | "local";
  metrics?: ReviewDraftResponse["metrics"];
}) {
  return localData.saveReview(input);
}

export default function ReviewPage() {
  const [date, setDate] = useState(todayString());
  const [draft, setDraft] = useState<ReviewDraftResponse | null>(null);
  const [savedReview, setSavedReview] = useState<DailyReview | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoadingSaved(true);
    setError(null);
    setNotice(null);
    setDraft(null);

    requestSavedReview(date)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setSavedReview(result.review);
        setContent(result.review?.content ?? "");
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "读取已保存复盘失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSaved(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  async function generateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const nextDraft = await requestReviewDraft(date);
      setDraft(nextDraft);
      setContent(nextDraft.draft);
      setNotice("草稿已生成，可编辑后保存。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "生成复盘草稿失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveReview() {
    if (!content.trim()) {
      setError("复盘内容不能为空");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const review = await saveDailyReview({
        date,
        content,
        source: draft?.source ?? savedReview?.source ?? "manual",
        metrics: draft?.metrics,
      });
      setSavedReview(review);
      setDraft(null);
      setNotice("复盘已保存。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存复盘失败");
    } finally {
      setSaving(false);
    }
  }

  const hasContent = content.trim().length > 0;
  const savedChanged = savedReview ? content !== savedReview.content : hasContent;
  const savedAt = savedReview?.updatedAt.slice(0, 16).replace("T", " ");

  return (
    <>
      <AppHeader title="复盘" subtitle={savedReview ? "已保存，可继续编辑" : "生成、编辑并保存晚间复盘"} />

      <div className="grid gap-4 p-4">
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {draft?.aiError ? <Notice>AI 生成不可用，已使用本地草稿：{draft.aiError}</Notice> : null}
        {loadingSaved ? <Notice>正在读取已保存复盘...</Notice> : null}

        <Card className="grid gap-4" highlight>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="复盘控制台" subtitle="选择日期，生成草稿，编辑后保存为当天复盘。" />
            <div className="flex flex-wrap justify-end gap-2">
              {savedReview ? <Badge tone="done">已保存</Badge> : <Badge tone="unprocessed">未保存</Badge>}
              {draft ? <Badge tone="active">{draft.source === "ai" ? "AI 草稿" : "本地草稿"}</Badge> : null}
            </div>
          </div>

          <form className="grid gap-3 rounded-[18px] border border-white/70 bg-white/55 p-3" onSubmit={generateDraft}>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="复盘日期">
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={busy}>
                  {busy ? "生成中..." : "生成草稿"}
                </Button>
              </div>
            </div>
          </form>
        </Card>

        <Card className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="复盘编辑与保存" subtitle={savedAt ? `上次保存：${savedAt}` : "还没有保存记录。"} />
            <Button size="sm" variant="success" disabled={!hasContent || saving || !savedChanged} onClick={saveReview}>
              {saving ? "保存中..." : savedChanged ? "保存复盘" : "已是最新"}
            </Button>
          </div>

          {draft ? (
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              <span className="rounded-full bg-white/65 px-2 py-1">计划 {draft.metrics.plannedCount}</span>
              <span className="rounded-full bg-white/65 px-2 py-1">完成 {draft.metrics.doneCount}</span>
              <span className="rounded-full bg-white/65 px-2 py-1">跳过 {draft.metrics.missedCount}</span>
              <span className="rounded-full bg-white/65 px-2 py-1">执行 {draft.metrics.sessionCount} 段</span>
              <span className="rounded-full bg-white/65 px-2 py-1">累计 {draft.metrics.totalSessionMinutes} 分钟</span>
              <span className="rounded-full bg-white/65 px-2 py-1">专注 {draft.metrics.averageFocusScore ?? "-"}</span>
            </div>
          ) : null}

          {hasContent || savedReview || draft ? (
            <Field label="复盘内容">
              <textarea
                className="min-h-[420px] leading-relaxed"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>
          ) : (
            <Empty>选择日期后生成晚间复盘草稿。</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
