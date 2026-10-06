import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SaveState, State } from "../../types";
import { generateArticle, serviceStatus, type ReadingServiceStatus } from "./service";
import { newId } from "../../utils/id";
import { coverage, unmatchedWords } from "./engine";
export function useReading(state: State | null, save: SaveState, offline: boolean) {
  const latest = useRef(state); latest.current = state;
  const [service, setService] = useState<ReadingServiceStatus>({ configured: false, model: "deepseek-flash" });
  const [serviceError, setServiceError] = useState("");
  const running = useRef<{ id: string; runId: string; controller: AbortController } | null>(null);
  const attempted = useRef(new Set<string>());
  const [busy, setBusy] = useState(false); const [foreground, setForeground] = useState(true);
  const previousAuto = useRef(state?.settings.readingAuto);
  const refreshService = useCallback(async () => {
    try { setService(await serviceStatus()); setServiceError(""); }
    catch { setServiceError("无法读取生成服务配置，请重新设置密钥。"); setService({ configured: false, model: "deepseek-flash" }); }
  }, []);
  useEffect(() => { void refreshService(); }, [refreshService]);
  useEffect(() => {
    const changed = () => setForeground(document.visibilityState === "visible");
    changed(); document.addEventListener("visibilitychange", changed);
    return () => { document.removeEventListener("visibilitychange", changed); running.current?.controller.abort(); };
  }, []);
  const pause = useCallback(() => running.current?.controller.abort(), []);
  useEffect(() => {
    const active = running.current; const disabled = previousAuto.current && !state?.settings.readingAuto;
    previousAuto.current = state?.settings.readingAuto;
    if (active && (!state?.reading?.batches.some(b => b.id === active.id && b.runId === active.runId) || disabled)) active.controller.abort();
  }, [state]);
  const run = useCallback(async (id: string, repairIndex?: number) => {
    if (running.current) return;
    if (!service.configured) { toast.error("请先在设置中配置生成服务"); return; }
    if (offline) { toast.error("生成新文章需要联网，已保存的文章可离线阅读"); return; }
    const batch = latest.current?.reading?.batches.find(b => b.id === id);
    const repairing = repairIndex !== undefined;
    if (!batch || (!repairing && batch.articles.length === 4)) return;
    if (repairing && (!Number.isInteger(repairIndex) || repairIndex! < 0 || !batch.articles[repairIndex!] ||
      !unmatchedWords(batch.articles[repairIndex!], batch.words.slice(repairIndex! * 20, (repairIndex! + 1) * 20)).length)) return;
    const active = { id, runId: newId(), controller: new AbortController() };
    attempted.current.add(id); running.current = active; setBusy(true);
    try {
      await save(s => ({ ...s, reading: { version: 1, batches: (s.reading?.batches || []).map(b => b.id === id
        ? { ...b, status: "generating", runId: active.runId, model: service.model, error: undefined, autoEligible: false } : b) } }));
      const indexes = repairing ? [repairIndex!] : Array.from({ length: 4 - batch.articles.length }, (_, n) => batch.articles.length + n);
      for (const i of indexes) {
        if (active.controller.signal.aborted) throw new DOMException("已暂停", "AbortError");
        const article = await generateArticle(batch.words.slice(i * 20, (i + 1) * 20), service.model, `${active.runId}-${i}`, active.controller.signal, repairing ? batch.articles[i] : undefined);
        await save(s => ({ ...s, reading: { version: 1, batches: (s.reading?.batches || []).map(b => b.id === id && b.runId === active.runId && !active.controller.signal.aborted
          ? { ...b, articles: repairing ? b.articles.map((old, index) => index === i && (article.unmatchedWordIds?.length || 0) <= (old.unmatchedWordIds?.length || 0) ? article : old) : [...b.articles, article],
              status: repairing ? (b.articles.length === 4 ? "ready" : "paused") : i === 3 ? "ready" : "generating" } : b) } }));
      }
      if (!active.controller.signal.aborted) {
        const saved = latest.current?.reading?.batches.find(b => b.id === id);
        // Toast is informational; the book itself always displays freshly computed coverage.
        if (saved && coverage(saved) < saved.articles.length * 20) toast.info("文章已保存，有词汇待核对，可在阅读页补全对应短文。");
        else toast.success(repairing ? "本篇已更新并保存，可离线查看" : "80 词阅读材料已保存，可离线查看");
      }
    } catch (e) {
      const paused = active.controller.signal.aborted;
      const error = paused ? "已暂停。已完成短文已保存，继续时只生成剩余部分；已发出的请求可能仍会计费。" : e instanceof Error ? e.message : "生成失败，请手动重试。";
      try { await save(s => ({ ...s, reading: { version: 1, batches: (s.reading?.batches || []).map(b => b.id === id && b.runId === active.runId
        ? { ...b, status: paused ? "paused" : "failed", error, autoEligible: false } : b) } })); } catch { /* Local storage failures are reported by save(). */ }
      if (!paused) toast.error(error);
    } finally { if (running.current === active) { running.current = null; setBusy(false); } }
  }, [save, service, offline]);
  useEffect(() => {
    if (!state?.settings.readingAuto || !service.configured || offline || !foreground || busy || running.current) return;
    const next = state.reading?.batches.find(b => b.status === "pending" && b.autoEligible && !attempted.current.has(b.id));
    if (next) void run(next.id);
  }, [state, service.configured, offline, foreground, busy, run]);
  return { service, serviceError, refreshService, run, pause, busy };
}
