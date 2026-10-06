import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLFormElement", "HTMLCanvasElement", "Element", "DocumentFragment", "Node", "Event", "MutationObserver", "getComputedStyle"]) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.Image = class {
  naturalWidth = 800; naturalHeight = 1200;
  set src(value) { if (value) queueMicrotask(() => this.onload?.()); }
};
URL.createObjectURL = () => "blob:test-photo"; URL.revokeObjectURL = () => {};
HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,AA==";
const { createRoot } = await import("react-dom/client");
const { default: ImportPage } = await import("../src/screens/Import.tsx");
const { configureService, clearService } = await import("../src/features/reading/service.ts");
const entry = { word: "retain", phonetic: "", commonMeaning: "v. 保留", rareMeaning: "保留某状态", usage: "retain control 保持控制", example: "She retained her job. 她保住了工作。", needsReview: false, reviewNote: "" };
const response = () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ words: [entry, { ...entry, word: "contain", needsReview: true, reviewNote: "开头字母不清晰" }], warnings: [], hasMore: false }) } }] }));
const initial = () => ({ words: [], days: [], records: {}, attempts: [], settings: { theme: "light", goal: 30, count: "10", mode: "en", rareFirst: true, audio: false }, reading: { version: 1, batches: [] } });
async function mount() {
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element); let current = initial(); const routes = []; let saves = 0;
  await act(async () => root.render(createElement(ImportPage, { state: current,
    save: async next => { saves++; current = typeof next === "function" ? next(current) : next; }, go: p => routes.push(p),
  })));
  return { element, root, routes, state: () => current, saves: () => saves,
    button: text => [...element.querySelectorAll("button")].find(b => b.textContent.includes(text)),
    close: async () => { await act(async () => root.unmount()); element.remove(); },
  };
}
async function click(button) { assert.ok(button); await act(async () => button.click()); }
async function pick(ui) {
  const input = ui.element.querySelector('[aria-label="选择生词照片"]');
  Object.defineProperty(input, "files", { value: [new File(["test"], "private-list.jpg", { type: "image/jpeg" })], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
async function edit(input, value) {
  await act(async () => {
    const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

test("photo preview is editable and saves only on confirmation; file import and date controls remain", async () => {
  await configureService("test-key-not-a-real-secret", "deepseek-flash");
  const original = globalThis.fetch; globalThis.fetch = async () => response();
  const ui = await mount();
  try {
    const camera = ui.element.querySelector('[aria-label="拍摄生词照片"]');
    assert.equal(camera.getAttribute("capture"), "environment");
    assert.ok(ui.element.querySelector('[aria-label="上传词表"]'));
    await pick(ui); await click(ui.button("识别并整理"));
    assert.equal(ui.saves(), 0); assert.equal(ui.state().words.length, 0);
    assert.ok(ui.element.textContent.includes("待核对"));
    assert.equal(ui.element.querySelector('[aria-label="选择 contain"]').getAttribute("aria-checked"), "false");
    await edit(ui.element.querySelector('[aria-label="commonMeaning 1"]'), "v. 保存、保留");
    await edit(ui.element.querySelector('[aria-label="词表日期"]'), "2026-10-04");
    await click(ui.button("确认导入 1 个词"));
    assert.equal(ui.saves(), 1);
    assert.equal(ui.state().words.length, 1);
    assert.equal(ui.state().words[0].commonMeaning, "v. 保存、保留");
    assert.equal(ui.state().words[0].usage, entry.usage);
    assert.equal(ui.state().days[0].date, "2026-10-04");
    assert.deepEqual(ui.routes, ["/words?date=2026-10-04"]);
    assert.deepEqual(ui.state().attempts, []);
  } finally { await ui.close(); globalThis.fetch = original; await clearService(); }
});

test("cancelled recognition ignores a late successful response, keeps photos, and does not retry", async () => {
  await configureService("test-key-not-a-real-secret", "deepseek-flash");
  const original = globalThis.fetch; let resolveResponse; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise(resolve => { resolveResponse = resolve; }); };
  const ui = await mount();
  try {
    await pick(ui); await click(ui.button("识别并整理"));
    assert.ok(ui.element.querySelector('[aria-label="上传词表"]').disabled);
    await click(ui.button("取消识别"));
    await act(async () => resolveResponse(response()));
    assert.equal(calls, 1); assert.equal(ui.saves(), 0);
    assert.equal(ui.element.querySelectorAll(".photo-thumbnails img").length, 1);
    assert.ok(ui.element.textContent.includes("已取消等待"));
    assert.ok(ui.element.querySelector('[aria-label="上传词表"]'));
    assert.ok(!ui.element.textContent.includes("确认你的词表"));
  } finally { await ui.close(); globalThis.fetch = original; await clearService(); }
});

test("leaving the photo page aborts an in-flight request without storing draft words", async () => {
  await configureService("test-key-not-a-real-secret", "deepseek-flash");
  const original = globalThis.fetch; let signal;
  globalThis.fetch = async (_url, options) => { signal = options.signal; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")))); };
  const ui = await mount();
  try {
    await pick(ui); await click(ui.button("识别并整理")); await ui.close();
    assert.equal(signal.aborted, true); assert.equal(ui.saves(), 0);
  } finally { globalThis.fetch = original; await clearService(); }
});
