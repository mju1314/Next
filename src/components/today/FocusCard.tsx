"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { focusTone, statusLabel, taskMeta } from "@/lib/client/format";
import type { AiReasonResult, DailyFocus, ScoreDetail } from "@/lib/client/types";

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function timeFitLabel(detail: ScoreDetail) {
  const ratio = detail.estimateMin / detail.availableMinutes;

  if (detail.oversized || ratio > 1.5) {
    return "偏大";
  }

  if (ratio <= 0.5) {
    return "轻量";
  }

  if (ratio <= 1) {
    return "匹配";
  }

  return "略满";
}

function energyFitLabel(detail: ScoreDetail) {
  const energyFit = detail.energyFit ?? 0;

  if (energyFit > 0) {
    return `匹配 ${signed(energyFit)}`;
  }

  if (detail.fatiguePenalty >= 70 || energyFit < 0) {
    return `偏累 ${signed(energyFit || -detail.fatiguePenalty)}`;
  }

  return "正常";
}

function dueLabel(detail: ScoreDetail) {
  if (detail.daysUntilDue === null || detail.daysUntilDue === undefined) {
    return "无截止";
  }

  if (detail.daysUntilDue <= 0) {
    return "到期";
  }

  return `${detail.daysUntilDue} 天`;
}

function momentumLabel(detail: ScoreDetail) {
  if (detail.daysSinceProjectActive === null || detail.daysSinceProjectActive === undefined) {
    return "暂无记录";
  }

  return `${detail.daysSinceProjectActive} 天未推进`;
}

function todayModeLabel(mode: ScoreDetail["todayMode"]) {
  if (!mode) {
    return "默认";
  }

  if (mode === "clear") {
    return "清理";
  }

  if (mode === "deadline") {
    return "截止";
  }

  if (mode === "low_energy") {
    return "低能量";
  }

  return "推进";
}

function sizeAdvice(detail: ScoreDetail) {
  const ratio = detail.sizeRatio ?? detail.estimateMin / detail.availableMinutes;

  if (detail.sizeAdvice === "split_recommended" || ratio >= 0.8) {
    return {
      title: "任务偏大，建议先拆分",
      body: `预计 ${detail.estimateMin} 分钟，约占今日可用时间的 ${Math.round(ratio * 100)}%。先拆出一个 20-40 分钟的下一步会更稳。`,
      className: "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]",
    };
  }

  if (detail.sizeAdvice === "consider_split" || ratio >= 0.6) {
    return {
      title: "任务较大，可以考虑拆分",
      body: `预计 ${detail.estimateMin} 分钟，约占今日可用时间的 ${Math.round(ratio * 100)}%。如果启动阻力较高，先做最小可验证步骤。`,
      className: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    };
  }

  return null;
}

function ScoreBreakdown({ detail }: { detail: ScoreDetail }) {
  const items = [
    { label: "今日模式", value: todayModeLabel(detail.todayMode), hint: `调整 ${signed(detail.modeAdjustment ?? 0)}` },
    { label: "长期价值", value: detail.longTermValue, hint: "目标重要性" },
    { label: "紧急度", value: detail.urgency, hint: dueLabel(detail) },
    { label: "时间匹配", value: timeFitLabel(detail), hint: `${detail.estimateMin}/${detail.availableMinutes} 分钟` },
    { label: "精力匹配", value: energyFitLabel(detail), hint: `疲劳惩罚 ${detail.fatiguePenalty}` },
    { label: "项目动量", value: detail.momentum, hint: momentumLabel(detail) },
  ];

  return (
    <div className="grid gap-2 rounded-lg border border-white/70 bg-white/[0.72] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">本地评分</span>
        <span className="rounded-full bg-[#1f2937] px-2.5 py-1 text-xs font-black text-white">总分 {detail.score}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 rounded-md border border-border/70 bg-[#f8fafc] p-2">
            <div className="truncate text-[11px] font-bold text-muted">{item.label}</div>
            <div className="mt-1 truncate text-sm font-black text-[#172033]">{item.value}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted">{item.hint}</div>
          </div>
        ))}
      </div>
      {(detail.moodFit ?? 0) !== 0 || (detail.historyAdjustment ?? 0) !== 0 ? (
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted">
          {(detail.moodFit ?? 0) !== 0 ? <span>心情 {signed(detail.moodFit ?? 0)}</span> : null}
          {(detail.historyAdjustment ?? 0) !== 0 ? <span>历史反馈 {signed(detail.historyAdjustment ?? 0)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function FocusActions({
  isMain,
  focus,
  hasActiveSession,
  busy,
  onStart,
  onComplete,
  onSkip,
  onPolish,
  onPromote,
}: {
  isMain: boolean;
  focus: DailyFocus;
  hasActiveSession: boolean;
  busy: string | null;
  onStart: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onPolish: () => void;
  onPromote: () => void;
}) {
  if (isMain) {
    return (
      <div className="grid gap-2 pt-1">
        <Button
          variant="primary"
          disabled={hasActiveSession || focus.status !== "planned" || busy === `${focus.id}-start`}
          onClick={onStart}
          block
        >
          开始执行
        </Button>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="success"
            size="sm"
            disabled={focus.status === "done" || busy === `${focus.id}-complete`}
            onClick={onComplete}
          >
            完成
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={focus.status === "missed" || busy === `${focus.id}-skip`}
            onClick={onSkip}
          >
            跳过
          </Button>
          <Button variant="secondary" size="sm" disabled={busy === `ai-reason-${focus.id}`} onClick={onPolish}>
            润色
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      <Button
        variant="primary"
        size="sm"
        disabled={hasActiveSession || focus.status !== "planned" || busy === `${focus.id}-start`}
        onClick={onStart}
      >
        开始
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={focus.status !== "planned" || busy === `${focus.id}-promote`}
        onClick={onPromote}
      >
        设为主任务
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={focus.status === "missed" || busy === `${focus.id}-skip`}
        onClick={onSkip}
      >
        跳过
      </Button>
      <Button variant="secondary" size="sm" disabled={busy === `ai-reason-${focus.id}`} onClick={onPolish}>
        润色
      </Button>
    </div>
  );
}

export function FocusCard({
  focus,
  variant,
  hasActiveSession,
  busy,
  polished,
  onStart,
  onComplete,
  onSkip,
  onPolish,
  onPromote,
}: {
  focus: DailyFocus;
  variant: "main" | "alternative";
  hasActiveSession: boolean;
  busy: string | null;
  polished?: AiReasonResult;
  onStart: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onPolish: () => void;
  onPromote: () => void;
}) {
  const isMain = variant === "main";
  const rankLabel = isMain ? "主任务" : `备选 ${focus.rank - 1}`;
  const splitAdvice = focus.parsedScoreDetail ? sizeAdvice(focus.parsedScoreDetail) : null;

  return (
    <article
      className={`grid gap-3 rounded-card border p-4 backdrop-blur-xl ${
        isMain
          ? "border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(233,244,255,0.88))] shadow-panel"
          : "border-white/70 bg-panel shadow-[0_12px_34px_rgba(36,50,80,0.06)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{rankLabel}</span>
        <Badge tone={focusTone(focus.status)}>{statusLabel(focus.status)}</Badge>
      </div>

      <div className={`${isMain ? "text-[24px] leading-tight" : "text-[16px] leading-snug"} font-black break-words`}>
        {focus.task.title}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted">
        {taskMeta(focus.task).map((meta) => (
          <span key={meta}>{meta}</span>
        ))}
        {focus.parsedScoreDetail ? <span>评分 {focus.parsedScoreDetail.score}</span> : null}
      </div>

      {focus.parsedScoreDetail ? (
        <details
          className="rounded-lg border border-white/70 bg-white/[0.62] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
          open={isMain}
        >
          <summary className="cursor-pointer select-none text-xs font-bold uppercase tracking-[0.14em] text-muted">
            评分与时间
          </summary>
          <div className="mt-3">
            <ScoreBreakdown detail={focus.parsedScoreDetail} />
          </div>
        </details>
      ) : null}

      {splitAdvice ? (
        <div className={`grid gap-1 rounded-lg border p-3 text-[13px] leading-relaxed ${splitAdvice.className}`}>
          <strong>{splitAdvice.title}</strong>
          <p className="m-0">{splitAdvice.body}</p>
        </div>
      ) : null}

      {focus.reason ? (
        <details className="rounded-lg border border-white/70 bg-white/[0.62] p-3 text-[13px] leading-relaxed text-[#2f3b52] shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
          <summary className="cursor-pointer select-none text-xs font-bold uppercase tracking-[0.14em] text-muted">
            本地依据
          </summary>
          <div className={`mt-2 whitespace-pre-line ${isMain ? "" : "max-h-[120px] overflow-auto"}`}>{focus.reason}</div>
        </details>
      ) : null}

      {polished ? (
        <div className="grid gap-1 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-[13px] leading-relaxed text-[#14532d]">
          <strong>润色解释</strong>
          <p className="m-0">{polished.polishedReason}</p>
          <span className="text-xs font-semibold text-muted">
            {polished.source === "local" ? "本地兜底" : "AI 生成"}
          </span>
        </div>
      ) : null}

      <FocusActions
        isMain={isMain}
        focus={focus}
        hasActiveSession={hasActiveSession}
        busy={busy}
        onStart={onStart}
        onComplete={onComplete}
        onSkip={onSkip}
        onPolish={onPolish}
        onPromote={onPromote}
      />
    </article>
  );
}
