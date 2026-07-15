"use client";

import { FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export type TodayControlValues = {
  availableMinutes: string;
  energy: string;
  mood: string;
  mode: "progress" | "clear" | "deadline" | "low_energy";
};

export function TodayControls({
  values,
  busy,
  needsOverwrite,
  onChange,
  onSubmit,
  onOverwrite,
}: {
  values: TodayControlValues;
  busy: boolean;
  needsOverwrite: boolean;
  onChange: (next: TodayControlValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOverwrite: () => void;
}) {
  const minutePresets = ["30", "60", "90", "120", "180"];
  const modeOptions: { key: TodayControlValues["mode"]; label: string; hint: string }[] = [
    { key: "progress", label: "推进", hint: "价值/动量" },
    { key: "clear", label: "清理", hint: "小任务" },
    { key: "deadline", label: "截止", hint: "到期优先" },
    { key: "low_energy", label: "低能量", hint: "轻负担" },
  ];

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <div className="text-xs text-muted">今日模式</div>
        <div className="grid grid-cols-2 gap-2">
          {modeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange({ ...values, mode: option.key })}
              className={`grid min-h-[56px] content-center gap-0.5 rounded-[16px] border px-3 text-left transition-all ${
                values.mode === option.key
                  ? "border-primary bg-primary text-white shadow-[0_10px_22px_rgba(10,132,255,0.2)]"
                  : "border-white/75 bg-white/65 text-text hover:bg-white"
              }`}
            >
              <span className="text-sm font-black">{option.label}</span>
              <span className={`text-[11px] font-semibold ${values.mode === option.key ? "text-white/78" : "text-muted"}`}>
                {option.hint}
              </span>
            </button>
          ))}
        </div>
      </div>
      <Field label="可用时间">
        <input
          min="10"
          max="720"
          required
          type="number"
          inputMode="numeric"
          value={values.availableMinutes}
          onChange={(event) => onChange({ ...values, availableMinutes: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-5 gap-1.5 rounded-full border border-white/70 bg-white/45 p-1">
        {minutePresets.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => onChange({ ...values, availableMinutes: minutes })}
            className={`min-h-[34px] rounded-full text-xs font-bold transition-colors ${
              values.availableMinutes === minutes ? "bg-primary text-white" : "text-muted hover:bg-white/75"
            }`}
          >
            {minutes}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="精力">
          <select value={values.energy} onChange={(event) => onChange({ ...values, energy: event.target.value })}>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="心情">
          <select value={values.mood} onChange={(event) => onChange({ ...values, mood: event.target.value })}>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-2">
        <Button type="submit" variant="primary" block disabled={busy}>
          生成推荐
        </Button>
        {needsOverwrite ? (
          <Button variant="danger" block disabled={busy} onClick={onOverwrite}>
            覆盖今天
          </Button>
        ) : null}
      </div>
    </form>
  );
}
