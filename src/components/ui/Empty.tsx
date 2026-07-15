import type { ReactNode } from "react";

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-white/80 bg-white/[0.56] p-5 text-sm leading-relaxed text-muted shadow-[0_12px_34px_rgba(36,50,80,0.05)] backdrop-blur-xl">
      {children}
    </div>
  );
}
