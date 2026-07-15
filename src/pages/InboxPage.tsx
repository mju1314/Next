"use client";

import { useMemo, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Sheet } from "@/components/layout/Sheet";
import { InboxForm } from "@/components/forms/InboxForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { ErrorNotice, Notice } from "@/components/ui/Notice";
import { statusLabel, suggestionMeta } from "@/lib/client/format";
import { localData } from "@/lib/client/local-data";
import { useExecutionData } from "@/lib/client/useExecutionData";
import type { AiTaskSuggestionResult, InboxItem, TaskSuggestion } from "@/lib/client/types";

type InboxFilter = "unprocessed" | "converted" | "ignored" | "all";
type ConvertedFilter = "all" | "task" | "project" | "goal";

const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "unprocessed", label: "待处理" },
  { key: "converted", label: "已转换" },
  { key: "ignored", label: "已忽略" },
  { key: "all", label: "全部" },
];

const CONVERTED_FILTERS: { key: ConvertedFilter; label: string }[] = [
  { key: "all", label: "全部去向" },
  { key: "task", label: "任务" },
  { key: "project", label: "项目" },
  { key: "goal", label: "目标" },
];

function convertedKind(item: InboxItem): Exclude<ConvertedFilter, "all"> | null {
  if (item.convertedTaskId) {
    return "task";
  }

  if (item.convertedProjectId) {
    return "project";
  }

  if (item.convertedGoalId) {
    return "goal";
  }

  return null;
}

function convertedLabel(item: InboxItem) {
  const kind = convertedKind(item);

  if (kind === "task" && item.convertedTaskId) {
    return `任务 ${item.convertedTaskId.slice(0, 8)}`;
  }

  if (kind === "project" && item.convertedProjectId) {
    return `项目 ${item.convertedProjectId.slice(0, 8)}`;
  }

  if (kind === "goal" && item.convertedGoalId) {
    return `目标 ${item.convertedGoalId.slice(0, 8)}`;
  }

  return null;
}

export default function InboxPage() {
  const data = useExecutionData();
  const { inboxItems, busy, error, notice, loading, run, setNotice } = data;

  const [createOpen, setCreateOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("unprocessed");
  const [convertedFilter, setConvertedFilter] = useState<ConvertedFilter>("all");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Record<string, AiTaskSuggestionResult>>({});

  const counts = useMemo(
    () => ({
      all: inboxItems.length,
      converted: inboxItems.filter((item) => item.status === "converted").length,
      ignored: inboxItems.filter((item) => item.status === "ignored").length,
      unprocessed: inboxItems.filter((item) => item.status === "unprocessed").length,
    }),
    [inboxItems],
  );

  const convertedCounts = useMemo(
    () => ({
      all: inboxItems.filter((item) => item.status === "converted").length,
      goal: inboxItems.filter((item) => convertedKind(item) === "goal").length,
      project: inboxItems.filter((item) => convertedKind(item) === "project").length,
      task: inboxItems.filter((item) => convertedKind(item) === "task").length,
    }),
    [inboxItems],
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return inboxItems.filter((item) => {
      if (activeFilter !== "all" && item.status !== activeFilter) {
        return false;
      }

      if (activeFilter === "converted" && convertedFilter !== "all" && convertedKind(item) !== convertedFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [item.rawText, item.status, statusLabel(item.status), convertedLabel(item)]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [activeFilter, convertedFilter, inboxItems, query]);

  async function submitInbox(rawText: string) {
    await run(
      "inbox",
      () => localData.createInbox({ rawText }).then(() => undefined),
      { success: "Inbox 已保存" },
    );
    setCreateOpen(false);
  }

  function convertInbox(item: InboxItem) {
    void run(
      item.id,
      () => localData.convertInboxToTask(item.id, { title: item.rawText, estimateMin: 45 }).then(() => undefined),
      { success: "Inbox 已转换为任务" },
    );
  }

  function convertInboxToProject(item: InboxItem) {
    void run(
      item.id,
      () => localData.convertInboxToProject(item.id, { title: item.rawText }).then(() => undefined),
      { success: "Inbox 已转换为项目" },
    );
  }

  function convertInboxToGoal(item: InboxItem) {
    void run(
      item.id,
      () => localData.convertInboxToGoal(item.id, { title: item.rawText }).then(() => undefined),
      { success: "Inbox 已转换为目标" },
    );
  }

  function setInboxStatus(item: InboxItem, status: "ignored" | "unprocessed") {
    void run(
      item.id,
      () => localData.updateInbox(item.id, { status }).then(() => undefined),
      { success: status === "ignored" ? "Inbox 已忽略" : "Inbox 已恢复" },
    );
  }

  async function suggestTasks(item: InboxItem) {
    await run(
      `ai-inbox-${item.id}`,
      async () => {
        const result = await localData.suggestTasksFromInbox(item.id);
        setSuggestions((current) => ({ ...current, [item.id]: result }));
        setNotice(result.source === "ai" ? "AI 已生成任务建议" : "已生成本地兜底任务建议");
      },
      { refresh: false },
    );
  }

  function createSuggestedTask(item: InboxItem, suggestion: TaskSuggestion) {
    void run(
      `create-inbox-${item.id}`,
      () =>
        localData.convertInboxToTask(item.id, { title: suggestion.title, estimateMin: suggestion.estimateMin ?? 45 }).then(() => {
          setSuggestions((current) => {
            const next = { ...current };
            delete next[item.id];
            return next;
          });
        }),
      { success: "已根据建议创建任务" },
    );
  }

  return (
    <>
      <AppHeader
        title="收集"
        subtitle={`待处理 ${counts.unprocessed} 条`}
        action={
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            ＋ 记录
          </Button>
        }
      />

      <div className="grid gap-4 p-4">
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        {notice ? <Notice>{notice}</Notice> : null}

        {loading ? <Notice>正在读取本地数据...</Notice> : null}

        <Card className="grid gap-4" highlight>
          <CardTitle title="收集箱" subtitle="把想法先放进来，再整理成任务、项目或目标。" />

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[18px] border border-white/70 bg-white/65 p-3">
              <div className="text-[11px] font-semibold text-muted">待处理</div>
              <div className="mt-1 text-2xl font-black leading-none">{counts.unprocessed}</div>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/65 p-3">
              <div className="text-[11px] font-semibold text-muted">已转换</div>
              <div className="mt-1 text-2xl font-black leading-none">{counts.converted}</div>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/65 p-3">
              <div className="text-[11px] font-semibold text-muted">已忽略</div>
              <div className="mt-1 text-2xl font-black leading-none">{counts.ignored}</div>
            </div>
          </div>

          <div className="grid gap-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索收集内容"
              aria-label="搜索收集内容"
            />

            <div className="flex flex-wrap gap-2 rounded-full border border-white/70 bg-white/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              {INBOX_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all ${
                    activeFilter === filter.key
                      ? "bg-primary text-white shadow-[0_8px_18px_rgba(10,132,255,0.22)]"
                      : "text-muted hover:bg-white/75 hover:text-text"
                  }`}
                >
                  <span>{filter.label}</span>
                  <span
                    className={`rounded-full px-1.5 text-[11px] leading-5 ${
                      activeFilter === filter.key ? "bg-white/25" : "bg-white/70 text-muted"
                    }`}
                  >
                    {counts[filter.key]}
                  </span>
                </button>
              ))}
            </div>

            {activeFilter === "converted" ? (
              <div className="flex flex-wrap gap-2">
                {CONVERTED_FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setConvertedFilter(filter.key)}
                    className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
                      convertedFilter === filter.key
                        ? "bg-text text-white"
                        : "border border-white/70 bg-white/65 text-muted hover:bg-white hover:text-text"
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span className={convertedFilter === filter.key ? "text-white/80" : "text-muted"}>
                      {convertedCounts[filter.key]}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {!loading && inboxItems.length === 0 ? <Empty>还没有 Inbox 条目。</Empty> : null}
          {!loading && inboxItems.length > 0 && visibleItems.length === 0 ? <Empty>当前视图没有匹配的条目。</Empty> : null}

          <div className="grid gap-3">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 rounded-[22px] border border-white/75 bg-white/70 p-4 shadow-[0_12px_28px_rgba(36,50,80,0.07)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/85"
              >
                <div className="grid gap-2">
                  <div className="break-words text-[15px] font-bold leading-snug">{item.rawText}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={item.status}>{statusLabel(item.status)}</Badge>
                    {convertedLabel(item) ? <span className="rounded-full bg-white/65 px-2 py-1">{convertedLabel(item)}</span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    disabled={item.status !== "unprocessed" || busy === item.id}
                    onClick={() => convertInbox(item)}
                  >
                    转任务
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={item.status !== "unprocessed" || busy === item.id}
                    onClick={() => convertInboxToProject(item)}
                  >
                    转项目
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={item.status !== "unprocessed" || busy === item.id}
                    onClick={() => convertInboxToGoal(item)}
                  >
                    转目标
                  </Button>
                  {item.status === "ignored" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy === item.id}
                      onClick={() => setInboxStatus(item, "unprocessed")}
                    >
                      恢复
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={item.status !== "unprocessed" || busy === item.id}
                      onClick={() => setInboxStatus(item, "ignored")}
                    >
                      忽略
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={item.status !== "unprocessed" || busy === `ai-inbox-${item.id}`}
                    onClick={() => void suggestTasks(item)}
                  >
                    AI 拆解
                  </Button>
                </div>

                {suggestions[item.id] ? (
                  <div className="grid gap-2 border-t border-dashed border-border/80 pt-3">
                    <div className="text-xs font-semibold text-muted">
                      {suggestions[item.id].source === "ai" ? "AI 生成，需确认后写入" : "本地兜底，AI 失败不影响使用"}
                    </div>
                    {suggestions[item.id].suggestions.map((suggestion, index) => (
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
                          disabled={busy === `create-inbox-${item.id}`}
                          onClick={() => createSuggestedTask(item, suggestion)}
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

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="写入 Inbox">
        <InboxForm busy={busy === "inbox"} onSubmit={submitInbox} />
      </Sheet>
    </>
  );
}
