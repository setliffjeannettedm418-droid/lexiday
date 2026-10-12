import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { ExamReadingArticle } from "../../types";
import { examSource, parseExamText, type ExamSource } from "./engine";

const MAX_DOCUMENT_BYTES = 2_000_000;
export async function parseExamDocument(buffer: ArrayBuffer, source: ExamSource): Promise<ExamReadingArticle> {
  if (buffer.byteLength > MAX_DOCUMENT_BYTES || buffer.byteLength < 4 || new Uint8Array(buffer)[0] !== 0x50 || new Uint8Array(buffer)[1] !== 0x4b)
    throw new Error("阅读资料格式不正确或文件过大，未保存。");
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return parseExamText(result.value, source);
}
export async function loadExamDocument(id: string, signal: AbortSignal): Promise<ExamReadingArticle> {
  const source = examSource(id); if (!source) throw new Error("未找到这篇阅读。");
  let bytes: ArrayBuffer;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url: source.documentUrl, responseType: "arraybuffer", connectTimeout: 20000, readTimeout: 30000, disableRedirects: true });
    if (signal.aborted) throw new DOMException("已取消", "AbortError");
    if (response.status !== 200 || typeof response.data !== "string" || response.data.length > MAX_DOCUMENT_BYTES * 1.4)
      throw new Error("资料来源暂时无法读取，请稍后重试。");
    const binary = atob(response.data); bytes = Uint8Array.from(binary, character => character.charCodeAt(0)).buffer;
  } else {
    // Local development uses a fixed-origin proxy; production web remains subject to CORS.
    const url = import.meta.env?.DEV ? "/exam-source" + new URL(source.documentUrl).pathname : source.documentUrl;
    const response = await fetch(url, { signal, credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Error("资料来源暂时无法读取，请稍后重试。");
    bytes = await response.arrayBuffer();
  }
  if (signal.aborted) throw new DOMException("已取消", "AbortError");
  const article = await parseExamDocument(bytes, source);
  if (signal.aborted) throw new DOMException("已取消", "AbortError");
  return article;
}
