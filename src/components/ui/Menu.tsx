"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger" | "success";
  disabled?: boolean;
};

const itemTone: Record<NonNullable<MenuItem["tone"]>, string> = {
  default: "text-text hover:bg-panel-muted",
  danger: "text-danger hover:bg-danger/10",
  success: "text-success hover:bg-success/10",
};

export function Menu({
  items,
  label = "⋯",
  disabled = false,
}: {
  items: MenuItem[];
  label?: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative flex shrink-0 flex-col items-end ${open ? "z-50" : "z-0"}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-panel-muted text-text transition-colors hover:bg-border/60 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>

      {open ? (
        <div
          role="menu"
          className="z-50 mt-1 min-w-[140px] overflow-hidden rounded-2xl border border-white/80 bg-white/95 py-1 shadow-[0_18px_44px_rgba(36,50,80,0.18)] backdrop-blur-xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${itemTone[item.tone ?? "default"]}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
