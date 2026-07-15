import { randomUUID } from "crypto";
import { isoNow } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const MAX_TEXT_LENGTH = 12_000;

export type AIRecommendationLogInput = {
  kind: "ai" | "recommendation";
  action: string;
  inputSummary?: unknown;
  outputSummary?: unknown;
  error?: string | null;
  errorDetail?: string | null;
  providerName?: string | null;
  model?: string | null;
  status?: number | null;
  durationMs?: number | null;
};

function summarize(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);

  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}...` : text;
}

export async function writeAIRecommendationLog(input: AIRecommendationLogInput) {
  try {
    await prisma.aIRecommendationLog.create({
      data: {
        id: randomUUID(),
        kind: input.kind,
        action: input.action,
        inputSummary: summarize(input.inputSummary),
        outputSummary: summarize(input.outputSummary),
        error: input.error ?? null,
        errorDetail: summarize(input.errorDetail),
        providerName: input.providerName ?? null,
        model: input.model ?? null,
        status: input.status ?? null,
        durationMs: input.durationMs ?? null,
        createdAt: isoNow(),
      },
    });
  } catch (error) {
    console.warn("AIRecommendationLog write failed", error);
  }
}
