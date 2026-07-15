"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatElapsed } from "@/lib/client/format";
import type { Task, WorkSession } from "@/lib/client/types";

export function RunningStrip({
  task,
  activeSession,
  elapsedMinutes,
  busy,
  onStop,
  onComplete,
}: {
  task: Task;
  activeSession: WorkSession | null;
  elapsedMinutes: number;
  busy: string | null;
  onStop: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+76px)] z-20 grid gap-3 rounded-[22px] border border-white/80 bg-white/[0.88] p-3 shadow-[0_14px_34px_rgba(36,50,80,0.14)] backdrop-blur-2xl">
      <div className="flex min-w-0 items-start gap-3">
        <Badge tone="doing">执行中</Badge>
        <div className="grid min-w-0 flex-1 gap-1">
          <strong className="break-words text-[15px] leading-snug">{task.title}</strong>
          {activeSession ? (
            <span className="text-sm font-semibold text-muted">已进行 {formatElapsed(elapsedMinutes)}</span>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          disabled={!activeSession || busy === `session-${activeSession.id}-todo`}
          onClick={onStop}
        >
          停止
        </Button>
        <Button
          variant="success"
          disabled={!activeSession || busy === `session-${activeSession.id}-done`}
          onClick={onComplete}
        >
          完成
        </Button>
      </div>
    </div>
  );
}
