import type { ReactNode } from "react";

export function AppHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-[#fbfcff]/[0.72] backdrop-blur-2xl">
      <div className="mx-auto flex max-w-app items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="grid gap-0.5">
          <strong className="text-[22px] font-black leading-tight tracking-[-0.03em]">{title}</strong>
          {subtitle ? <span className="text-xs font-medium text-muted">{subtitle}</span> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
