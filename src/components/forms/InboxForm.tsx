"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export function InboxForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (rawText: string) => Promise<void>;
}) {
  const [rawText, setRawText] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(rawText);
    setRawText("");
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <Field label="原始想法">
        <textarea
          required
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder="先记下来，之后再整理成任务"
        />
      </Field>
      <Button type="submit" variant="primary" block disabled={busy}>
        保存 Inbox
      </Button>
    </form>
  );
}
