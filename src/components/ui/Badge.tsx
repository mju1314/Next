import type { ReactNode } from "react";

type Tone =
  | "default"
  | "active"
  | "todo"
  | "unprocessed"
  | "converted"
  | "done"
  | "completed"
  | "ignored"
  | "paused"
  | "skipped"
  | "missed"
  | "doing"
  | "archived";

const toneClass: Record<Tone, string> = {
  default: "bg-panel-muted text-[#3f4a5f]",
  active: "bg-[#dbeafe] text-[#1e40af]",
  todo: "bg-[#dbeafe] text-[#1e40af]",
  unprocessed: "bg-[#dbeafe] text-[#1e40af]",
  converted: "bg-[#dcfce7] text-[#166534]",
  done: "bg-[#dcfce7] text-[#166534]",
  completed: "bg-[#dcfce7] text-[#166534]",
  ignored: "bg-[#fef3c7] text-[#92400e]",
  paused: "bg-[#fef3c7] text-[#92400e]",
  skipped: "bg-[#fef3c7] text-[#92400e]",
  missed: "bg-[#fef3c7] text-[#92400e]",
  doing: "bg-[#e0e7ff] text-[#3730a3]",
  archived: "bg-[#e5e7eb] text-[#374151]",
};

export function Badge({ tone = "default", children }: { tone?: string; children: ReactNode }) {
  const cls = toneClass[(tone as Tone) in toneClass ? (tone as Tone) : "default"];

  return (
    <span
      className={`inline-flex min-h-[24px] items-center rounded-full px-2.5 text-xs font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}
