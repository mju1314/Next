import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { isoNow } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export class WorkSessionError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function durationMinutes(startAt: string, endAt: string) {
  const durationMs = new Date(endAt).getTime() - new Date(startAt).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }

  return Math.ceil(durationMs / 60_000);
}

type Tx = Prisma.TransactionClient;

async function activeSession(tx: Tx) {
  return tx.workSession.findFirst({
    where: { endAt: null },
    include: { task: { include: { goal: true, project: true } } },
    orderBy: { startAt: "desc" },
  });
}

export async function getActiveWorkSession() {
  return prisma.workSession.findFirst({
    where: { endAt: null },
    include: { task: { include: { goal: true, project: true } } },
    orderBy: { startAt: "desc" },
  });
}

export async function startWorkSession(input: { taskId: string; dailyFocusId?: string }) {
  const timestamp = isoNow();

  return prisma.$transaction(async (tx) => {
    const existing = await activeSession(tx);

    if (existing) {
      throw new WorkSessionError("已有进行中的执行记录，请先结束当前任务", 409);
    }

    const task = await tx.task.findUnique({
      where: { id: input.taskId },
      include: { goal: true, project: true },
    });

    if (!task) {
      throw new WorkSessionError("任务不存在", 404);
    }

    if (["done", "skipped", "archived"].includes(task.status)) {
      throw new WorkSessionError("当前任务状态不能开始执行，请先重新打开任务", 409);
    }

    if (input.dailyFocusId) {
      const focus = await tx.dailyFocus.findUnique({
        where: { id: input.dailyFocusId },
        select: { id: true, dailyPlanId: true },
      });

      if (!focus) {
        throw new WorkSessionError("今日推荐不存在", 404);
      }

      const otherDoingFoci = await tx.dailyFocus.findMany({
        where: {
          dailyPlanId: focus.dailyPlanId,
          status: "doing",
          id: { not: focus.id },
        },
        select: { taskId: true },
      });

      await tx.dailyFocus.updateMany({
        where: {
          dailyPlanId: focus.dailyPlanId,
          status: "doing",
          id: { not: focus.id },
        },
        data: { status: "planned", updatedAt: timestamp },
      });

      if (otherDoingFoci.length > 0) {
        await tx.task.updateMany({
          where: {
            id: { in: otherDoingFoci.map((item) => item.taskId) },
            status: "doing",
          },
          data: { status: "todo", updatedAt: timestamp },
        });
      }

      await tx.dailyFocus.update({
        where: { id: focus.id },
        data: { status: "doing", updatedAt: timestamp },
      });
    }

    await tx.task.update({
      where: { id: task.id },
      data: { status: "doing", updatedAt: timestamp },
    });

    return tx.workSession.create({
      data: {
        id: randomUUID(),
        taskId: task.id,
        startAt: timestamp,
        createdAt: timestamp,
      },
      include: { task: { include: { goal: true, project: true } } },
    });
  });
}

export async function finishWorkSession(input: {
  sessionId: string;
  status: "done" | "todo" | "skipped";
  focusScore?: number | null;
  note?: string | null;
  dailyFocusId?: string;
}) {
  const timestamp = isoNow();

  return prisma.$transaction(async (tx) => {
    const session = await tx.workSession.findUnique({
      where: { id: input.sessionId },
      include: { task: true },
    });

    if (!session) {
      throw new WorkSessionError("执行记录不存在", 404);
    }

    if (session.endAt) {
      throw new WorkSessionError("执行记录已经结束", 409);
    }

    const durationMin = durationMinutes(session.startAt, timestamp);
    const nextFocusStatus = input.status === "done" ? "done" : input.status === "skipped" ? "missed" : "planned";

    const updatedSession = await tx.workSession.update({
      where: { id: session.id },
      data: {
        endAt: timestamp,
        durationMin,
        focusScore: input.focusScore ?? null,
        note: input.note ?? null,
      },
      include: { task: { include: { goal: true, project: true } } },
    });

    await tx.task.update({
      where: { id: session.taskId },
      data: {
        status: input.status,
        actualMin: { increment: durationMin },
        updatedAt: timestamp,
      },
    });

    if (session.task.projectId) {
      await tx.project.update({
        where: { id: session.task.projectId },
        data: { lastActiveAt: timestamp, updatedAt: timestamp },
      });
    }

    if (input.dailyFocusId) {
      await tx.dailyFocus.update({
        where: { id: input.dailyFocusId },
        data: { status: nextFocusStatus, updatedAt: timestamp },
      });
    } else {
      await tx.dailyFocus.updateMany({
        where: { taskId: session.taskId, status: "doing" },
        data: { status: nextFocusStatus, updatedAt: timestamp },
      });
    }

    return updatedSession;
  });
}
