"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 h-full w-full bg-black/40"
        onClick={onClose}
      />
      <div className="relative mx-auto flex max-h-[88vh] w-full max-w-app flex-col rounded-t-2xl bg-bg pb-safe">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <strong className="text-base">{title}</strong>
          <button
            type="button"
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-muted text-muted"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
