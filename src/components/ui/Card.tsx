import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  highlight = false,
}: {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <section
      className={`rounded-card border bg-panel p-4 shadow-panel backdrop-blur-xl ${highlight ? "border-[#8ec5ff]" : "border-white/70"} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="grid gap-1.5">
      <h2 className="m-0 text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
      {subtitle ? <p className="m-0 text-xs leading-relaxed text-muted">{subtitle}</p> : null}
    </div>
  );
}
