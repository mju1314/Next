"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field } from "@/components/ui/Field";
import { ErrorNotice, Notice } from "@/components/ui/Notice";
import {
  DEFAULT_AI_CONFIG,
  callClientAiText,
  clearStoredAiConfig,
  getStoredAiConfig,
  saveStoredAiConfig,
} from "@/lib/client/ai-client";
import { localData } from "@/lib/client/local-data";

type BackupCounts = Record<string, number>;

type ImportTableResult = {
  created: number;
  overwritten: number;
  skipped: number;
};

type ImportResult = {
  strategy: "skip" | "overwrite";
  importedAt: string;
  tables: Record<string, ImportTableResult>;
};

const tableLabels: Record<string, string> = {
  domains: "领域",
  goals: "目标",
  projects: "项目",
  tasks: "任务",
  inboxItems: "Inbox",
  dailyPlans: "每日计划",
  dailyFoci: "今日推荐",
  workSessions: "执行记录",
  dailyReviews: "复盘",
};

const defaultWeights = [
  ["长期价值", "+0.30"],
  ["紧急度", "+0.20"],
  ["影响力", "+0.20"],
  ["解锁价值", "+0.15"],
  ["项目动量", "+0.10"],
  ["手动优先级", "+0.05"],
  ["工作量惩罚", "-0.15"],
  ["疲劳惩罚", "-0.10"],
  ["阻塞惩罚", "-0.20"],
] as const;

type AiForm = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  style: "responses" | "chat";
  timeoutMs: string;
};

function aiConfigToForm(config = DEFAULT_AI_CONFIG): AiForm {
  return {
    providerName: config.providerName,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    style: config.style,
    timeoutMs: String(config.timeoutMs),
  };
}

function backupCounts(backup: unknown): BackupCounts {
  if (!backup || typeof backup !== "object") {
    return {};
  }

  const input = backup as Record<string, unknown>;
  const counts = input.counts;

  if (counts && typeof counts === "object") {
    return counts as BackupCounts;
  }

  return Object.fromEntries(
    Object.keys(tableLabels).map((key) => [key, Array.isArray(input[key]) ? (input[key] as unknown[]).length : 0]),
  );
}

export default function SettingsPage() {
  const [backup, setBackup] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [strategy, setStrategy] = useState<"skip" | "overwrite">("skip");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiForm, setAiForm] = useState<AiForm>(() => aiConfigToForm());
  const counts = useMemo(() => backupCounts(backup), [backup]);
  const previewTotal = useMemo(() => Object.values(counts).reduce((total, count) => total + count, 0), [counts]);
  const importSummary = useMemo(() => {
    if (!importResult) {
      return null;
    }

    return Object.values(importResult.tables).reduce(
      (total, result) => ({
        created: total.created + result.created,
        overwritten: total.overwritten + result.overwritten,
        skipped: total.skipped + result.skipped,
      }),
      { created: 0, overwritten: 0, skipped: 0 },
    );
  }, [importResult]);

  useEffect(() => {
    setAiForm(aiConfigToForm(getStoredAiConfig()));
  }, []);

  function updateAiForm<K extends keyof AiForm>(key: K, value: AiForm[K]) {
    setAiForm((current) => ({ ...current, [key]: value }));
  }

  function saveAiConfig() {
    setError(null);
    setNotice(null);
    const saved = saveStoredAiConfig({
      providerName: aiForm.providerName,
      baseUrl: aiForm.baseUrl,
      apiKey: aiForm.apiKey,
      model: aiForm.model,
      style: aiForm.style,
      timeoutMs: Number(aiForm.timeoutMs),
    });
    setAiForm(aiConfigToForm(saved));
    setNotice(saved.apiKey ? "AI 配置已保存" : "AI 配置已保存，未填写 API Key 时会使用本地建议");
  }

  async function testAiConfig() {
    setBusy("ai-test");
    setError(null);
    setNotice(null);

    try {
      saveAiConfig();
      const result = await callClientAiText("只回复 OK。", "ping", 20);
      if (!result.text) {
        throw new Error(result.error ?? "未配置 API Key，当前会使用本地建议");
      }
      setNotice(`AI 连接成功：${result.text.slice(0, 40)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "AI 连接测试失败");
    } finally {
      setBusy(null);
    }
  }

  function resetAiConfig() {
    clearStoredAiConfig();
    setAiForm(aiConfigToForm());
    setNotice("AI 配置已清空");
    setError(null);
  }

  async function exportJson() {
    setBusy("export");
    setError(null);
    setNotice(null);

    try {
      const payload = await localData.exportBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `next-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("JSON 备份已导出");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "导出备份失败");
    } finally {
      setBusy(null);
    }
  }

  async function loadBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setNotice(null);
    setImportResult(null);

    if (!file) {
      setBackup(null);
      setFileName("");
      return;
    }

    try {
      const text = await file.text();
      setBackup(JSON.parse(text));
      setFileName(file.name);
      setNotice("备份文件已读取，请确认导入策略后再导入");
    } catch {
      setBackup(null);
      setFileName("");
      setError("备份文件不是有效 JSON");
    }
  }

  async function importJson() {
    if (!backup) {
      setError("请先选择 JSON 备份文件");
      return;
    }

    setBusy("import");
    setError(null);
    setNotice(null);

    try {
      const result = await localData.importBackup(backup, strategy);
      setImportResult(result);
      setNotice("JSON 备份导入完成");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "导入备份失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AppHeader title="我的" subtitle="备份与稳定性" />

      <div className="grid gap-4 p-4">
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        {notice ? <Notice>{notice}</Notice> : null}

        <Card className="grid gap-4" highlight>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="AI 配置" subtitle={aiForm.apiKey ? "已配置，AI 功能会优先联网生成。" : "未配置时使用本地建议。"} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={busy === "ai-test"} onClick={testAiConfig}>
                {busy === "ai-test" ? "测试中..." : "测试连接"}
              </Button>
              <Button variant="primary" size="sm" onClick={saveAiConfig}>
                保存配置
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-[18px] border border-white/70 bg-white/55 p-3">
            <Field label="服务商">
              <input value={aiForm.providerName} onChange={(event) => updateAiForm("providerName", event.target.value)} />
            </Field>
            <Field label="Base URL">
              <input value={aiForm.baseUrl} onChange={(event) => updateAiForm("baseUrl", event.target.value)} />
            </Field>
            <Field label="API Key">
              <input
                autoComplete="off"
                type="password"
                value={aiForm.apiKey}
                onChange={(event) => updateAiForm("apiKey", event.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="模型">
                <input value={aiForm.model} onChange={(event) => updateAiForm("model", event.target.value)} />
              </Field>
              <Field label="接口类型">
                <select value={aiForm.style} onChange={(event) => updateAiForm("style", event.target.value as AiForm["style"])}>
                  <option value="responses">Responses</option>
                  <option value="chat">Chat Completions</option>
                </select>
              </Field>
              <Field label="超时毫秒">
                <input
                  inputMode="numeric"
                  value={aiForm.timeoutMs}
                  onChange={(event) => updateAiForm("timeoutMs", event.target.value)}
                />
              </Field>
            </div>
          </div>

          <Button variant="secondary" block onClick={resetAiConfig}>
            清空 AI 配置
          </Button>
        </Card>

        <Card className="grid gap-4" highlight>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="数据备份" subtitle="导出和恢复本地 SQLite 数据，适合迁移或手动留档。" />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" disabled={busy === "export"} onClick={exportJson}>
                {busy === "export" ? "导出中..." : "导出 JSON"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[18px] border border-white/70 bg-white/65 p-3">
              <div className="text-[11px] font-semibold text-muted">备份格式</div>
              <div className="mt-1 text-xl font-black leading-none">JSON</div>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/65 p-3">
              <div className="text-[11px] font-semibold text-muted">导入策略</div>
              <div className="mt-1 text-xl font-black leading-none">{strategy === "skip" ? "跳过" : "覆盖"}</div>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/65 p-3">
              <div className="text-[11px] font-semibold text-muted">预览数据</div>
              <div className="mt-1 text-xl font-black leading-none">{backup ? previewTotal : "-"}</div>
            </div>
          </div>
        </Card>

        <Card className="grid gap-4">
          <CardTitle title="JSON 导入" subtitle="导入不会自动清空数据库；重复数据按下方策略处理。" />

          <div className="grid gap-3 rounded-[18px] border border-white/70 bg-white/55 p-3">
            <Field label="选择备份文件">
              <input accept="application/json,.json" onChange={loadBackupFile} type="file" />
            </Field>
            <Field label="重复 ID 处理策略">
              <select value={strategy} onChange={(event) => setStrategy(event.target.value as "skip" | "overwrite")}>
                <option value="skip">跳过已有数据（推荐）</option>
                <option value="overwrite">覆盖同 ID 数据</option>
              </select>
            </Field>
          </div>

          {backup ? (
            <div className="grid gap-3 rounded-[18px] border border-white/75 bg-white/70 p-4 shadow-[0_12px_28px_rgba(36,50,80,0.07)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="break-words text-sm">{fileName}</strong>
                <span className="rounded-full bg-white/65 px-2 py-1 text-xs font-semibold text-muted">
                  共 {previewTotal} 条
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                {Object.entries(tableLabels).map(([key, label]) => (
                  <span key={key} className="rounded-full bg-white/65 px-2 py-1">
                    {label} {counts[key] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <Empty>还没有选择备份文件，导入前会先显示各表数量预览。</Empty>
          )}
          <Button variant="success" block disabled={!backup || busy === "import"} onClick={importJson}>
            {busy === "import" ? "导入中..." : "确认导入"}
          </Button>
          {importResult ? (
            <div className="grid gap-3 rounded-[18px] border border-white/75 bg-white/70 p-4 shadow-[0_12px_28px_rgba(36,50,80,0.07)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">导入结果：{importResult.strategy === "skip" ? "跳过重复" : "覆盖重复"}</strong>
                {importSummary ? (
                  <span className="rounded-full bg-white/65 px-2 py-1 text-xs font-semibold text-muted">
                    创建 {importSummary.created} · 覆盖 {importSummary.overwritten} · 跳过 {importSummary.skipped}
                  </span>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                {Object.entries(importResult.tables).map(([key, result]) => (
                  <div className="flex items-center justify-between gap-2 text-xs" key={key}>
                    <span>{tableLabels[key] ?? key}</span>
                    <span className="text-muted">
                      创建 {result.created} · 覆盖 {result.overwritten} · 跳过 {result.skipped}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="grid gap-4">
          <CardTitle title="默认设置与算法权重" subtitle="首版只展示默认值，不在这里调整推荐算法。" />
          <div className="grid gap-3 rounded-[18px] border border-white/75 bg-white/70 p-4 shadow-[0_12px_28px_rgba(36,50,80,0.07)]">
            <div className="flex items-center justify-between gap-2 rounded-[14px] bg-white/65 px-3 py-2 text-sm">
              <span className="text-muted">默认每日可用时间</span>
              <strong>120 分钟</strong>
            </div>
            <div className="grid gap-1.5">
              {defaultWeights.map(([label, value]) => (
                <div className="flex items-center justify-between gap-2 rounded-[14px] bg-white/55 px-3 py-2 text-xs" key={label}>
                  <span className="text-muted">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
