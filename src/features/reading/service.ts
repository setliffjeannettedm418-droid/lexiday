import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Word, ReadingArticle } from "../../types";
import { generationPayload, validateArticle } from "./engine";
import { lookupPayload, parseLookupCompletion, type LookupSelection } from "./lookup";
export const MODELS = { "deepseek-flash": "DeepSeek Flash", "deepseek-v4-pro": "DeepSeek V4 Pro" };
export interface ReadingServiceStatus { configured: boolean; model: string }
const NativeReading = registerPlugin<{
  status(): Promise<ReadingServiceStatus>; configure(options: { key: string; model: string }): Promise<void>;
  clear(): Promise<void>; generate(options: { id: string; body: string }): Promise<{ body: string }>;
  cancel(options: { id: string }): Promise<void>;
}>("NativeReading");
// The browser fallback deliberately keeps the key in memory only.
let webKey = ""; let webModel = "deepseek-flash";
export async function serviceStatus(): Promise<ReadingServiceStatus> {
  return Capacitor.isNativePlatform() ? NativeReading.status() : { configured: !!webKey, model: webModel };
}
export async function configureService(key: string, model: string) {
  if (!(model in MODELS)) throw new Error("请选择支持的模型");
  if (key && !/^[\x21-\x7E]{12,512}$/.test(key.trim())) throw new Error("密钥格式不正确，请完整复制 API 密钥");
  if (Capacitor.isNativePlatform()) await NativeReading.configure({ key: key.trim(), model });
  else { if (key.trim()) webKey = key.trim(); if (!webKey) throw new Error("请填写 API 密钥"); webModel = model; }
}
export async function clearService() { if (Capacitor.isNativePlatform()) await NativeReading.clear(); webKey = ""; }
export function responseError(status: number) {
  if (status === 401 || status === 403) return "API 密钥无效或无访问权限，请检查设置。";
  if (status === 402) return "AI 服务余额不足，请在官方平台检查账户。";
  if (status === 429) return "AI 服务请求过于频繁，请稍后手动重试。";
  if (status >= 500) return "AI 服务暂时不可用，请稍后手动重试。";
  return "生成请求未被接受，请检查模型设置后手动重试。";
}
export function parseCompletion(body: string, words: Word[]) {
  if (body.length > 4_000_000) throw new Error("生成结果过大，已停止处理。");
  let data; try { data = JSON.parse(body); } catch { throw new Error("AI 服务返回的内容不是有效数据，请手动重试。"); }
  const choice = data?.choices?.[0];
  if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string")
    throw new Error("文章生成未完整结束，未保存这篇短文。已完成部分不受影响；请手动重试。");
  let value; try { value = JSON.parse(choice.message.content); } catch { throw new Error("文章格式不完整，未保存这篇短文。请手动重试。"); }
  return validateArticle(value, words);
}
async function completion(payload: unknown, id: string, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("已暂停", "AbortError");
  const body = JSON.stringify(payload); let response: string;
  if (Capacitor.isNativePlatform()) {
    const cancel = () => { void NativeReading.cancel({ id }).catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    try { response = (await NativeReading.generate({ id, body })).body; }
    finally { signal.removeEventListener("abort", cancel); }
  } else {
    if (!webKey) throw new Error("请先在设置中配置生成服务。");
    const request = new AbortController(); const cancel = () => request.abort();
    signal.addEventListener("abort", cancel, { once: true }); const timeout = setTimeout(cancel, 240000);
    try {
      const r = await fetch("https://api.deepseek.com/chat/completions", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${webKey}` }, body,
        signal: request.signal, redirect: "error", credentials: "omit" });
      if (!r.ok) throw new Error(responseError(r.status)); response = await r.text();
    } catch (e) {
      if (signal.aborted) throw new DOMException("已暂停", "AbortError");
      if (e instanceof TypeError || request.signal.aborted) throw new Error("网络失败或请求超时。网页版还可能受跨域限制，请使用 Android 版。请求可能已计费，请手动决定是否重试。");
      throw e;
    } finally { clearTimeout(timeout); signal.removeEventListener("abort", cancel); }
  }
  if (signal.aborted) throw new DOMException("已暂停", "AbortError");
  return response;
}
export async function generateArticle(words: Word[], model: string, id: string, signal: AbortSignal, previous?: ReadingArticle) {
  return parseCompletion(await completion(generationPayload(words, model, previous), id, signal), words);
}
export async function explainReadingWord(selection: LookupSelection, model: string, id: string, signal: AbortSignal) {
  return parseLookupCompletion(await completion(lookupPayload(selection, model), id, signal), selection);
}
