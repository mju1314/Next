"use client";

import { useCallback, useEffect, useState } from "react";

import { localData } from "@/lib/client/local-data";
import type {
  Goal,
  InboxItem,
  Project,
  Task,
  TodayState,
  WorkSession,
} from "@/lib/client/types";

export type ExecutionData = {
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  inboxItems: InboxItem[];
  today: TodayState | null;
  activeSession: WorkSession | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  busy: string | null;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  setBusy: (value: string | null) => void;
  refresh: () => Promise<void>;
  /**
   * 包装一次异步操作：自动设置 busy、清空提示、成功后刷新并提示、失败时显示错误。
   */
  run: (
    busyKey: string,
    action: () => Promise<void>,
    options?: { success?: string; refresh?: boolean },
  ) => Promise<void>;
};

export function useExecutionData(): ExecutionData {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [today, setToday] = useState<TodayState | null>(null);
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextGoals, nextProjects, nextTasks, nextInbox, nextToday, nextActiveSession] = await Promise.all([
      localData.listGoals(),
      localData.listProjects(),
      localData.listTasks(),
      localData.listInboxItems(),
      localData.getToday(),
      localData.getActiveSession(),
    ]);

    setGoals(nextGoals);
    setProjects(nextProjects);
    setTasks(nextTasks);
    setInboxItems(nextInbox);
    setToday(nextToday);
    setActiveSession(nextActiveSession);
  }, []);

  useEffect(() => {
    refresh()
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "读取数据失败"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const run = useCallback(
    async (
      busyKey: string,
      action: () => Promise<void>,
      options?: { success?: string; refresh?: boolean },
    ) => {
      setBusy(busyKey);
      setError(null);
      setNotice(null);

      try {
        await action();

        if (options?.refresh !== false) {
          await refresh();
        }

        if (options?.success) {
          setNotice(options.success);
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "操作失败");
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  return {
    goals,
    projects,
    tasks,
    inboxItems,
    today,
    activeSession,
    loading,
    error,
    notice,
    busy,
    setError,
    setNotice,
    setBusy,
    refresh,
    run,
  };
}
