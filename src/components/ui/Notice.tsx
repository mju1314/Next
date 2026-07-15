import type { ReactNode } from "react";

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-3 text-sm text-[#1e3a8a]">
      {children}
    </div>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-danger">
      {children}
    </div>
  );
}
