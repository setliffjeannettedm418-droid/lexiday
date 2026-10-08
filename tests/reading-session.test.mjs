import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/", pretendToBeVisual: true,
});
for (const name of ["window", "document", "HTMLElement", "HTMLInputElement", "Element", "DocumentFragment", "Node", "Event", "CustomEvent", "MutationObserver", "getComputedStyle", "NodeFilter"])
  globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const { createRoot } = await import("react-dom/client");
const { default: Reading } = await import("../src/screens/Reading.tsx");
const { configureService, clearService } = await import("../src/features/reading/service.ts");
const oldSentence = "Their resilience helped them rebuild.";
const sentence = english => ({ english, translation: "译文", structure: "结构", grammar: "语法", pattern: "句式", application: "A test.", applicationTranslation: "测试" });

async function mount({ busy = false, networkGate, saveGate } = {}) {
  const words = Array.from({ length: 80 }, (_, i) => ({ id: `w${i}`, word: `target${i}`, phonetic: "", commonMeaning: "测试词", rareMeaning: "", usage: "", example: "", tags: [], source: "fixture", createdAt: 0, updatedAt: 0 }));
  const article = { title: "A test", titleTranslation: "测试", sentences: [sentence(oldSentence)], vocabulary: words.slice(0, 20).map(w => ({ wordId: w.id, sentence: -1, meaning: "测试词", partOfSpeech: "名词", usage: "用法", contrast: "辨析", example: "A test.", exampleTranslation: "测试" })), unmatchedWordIds: words.slice(0, 20).map(w => w.id) };
  let state = { words, records: {}, attempts: [], days: [], settings: { theme: "light", goal: 30, count: "20", mode: "en", rareFirst: false, audio: false }, reading: { version: 1, batches: [{ id: "batch", words, createdAt: 0, articles: [article], status: busy ? "generating" : "paused", autoEligible: false }] } };
  let controls = { service: { configured: true, model: "deepseek-flash" }, serviceError: "", run() {}, pause() {}, busy, refreshService: async () => {} };
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    if (String(path).startsWith("/dictionary/")) return new Response("{}");
    assert.equal(path, "https://api.deepseek.com/chat/completions");
    const data = JSON.parse(JSON.parse(options.body).messages[1].content);
    requests.push(data);
    if (networkGate) await networkGate;
    const explanation = { word: data.selectedWord, quote: data.sentence, headword: data.selectedWord, phonetic: "", partOfSpeech: "名词", meaning: "韧性", usage: "本句作主语", grammar: "主语中心词", collocations: [], contrast: "恢复力", example: "They showed resilience.", exampleTranslation: "他们展现韧性。" };
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(explanation) } }] }));
  };
  await configureService("test-only-not-a-real-key", "deepseek-flash");
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element);
  function render() {
    root.render(createElement(Reading, { state, save: async next => {
      if (saveGate) await saveGate;
      state = typeof next === "function" ? next(state) : next;
      render();
    }, go() {}, speak() {}, controls, id: "batch" }));
  }
  await act(async () => render());
  return {
    requests,
    article: () => state.reading.batches[0].articles[0],
    sheet: () => document.querySelector(".reading-lookup-sheet"),
    async open() { await act(async () => element.querySelector('[aria-label="查词 resilience"]').click()); },
    async explain() { await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "查看本句用法与知识点").click()); },
    async replace(sentences) {
      state = { ...state, reading: { version: 1, batches: [{ ...state.reading.batches[0], status: "paused", articles: [{ ...article, sentences: sentences.map(sentence) }] }] } };
      controls = { ...controls, busy: false };
      await act(async () => render());
    },
    async close() { await act(async () => root.unmount()); element.remove(); globalThis.fetch = originalFetch; await clearService(); },
  };
}

test("repairing an article closes a lookup for the replaced text before another request", async () => {
  const view = await mount({ busy: true });
  try {
    await view.open();
    assert.equal(view.sheet().querySelector("blockquote").textContent, oldSentence);
    await view.replace(["The city grew stronger after the storm."]);
    assert.equal(!!view.sheet(), false);
    assert.equal(view.requests.length, 0);
  } finally { await view.close(); }
});

test("saving a context explanation keeps its lookup panel open and available offline", async () => {
  const view = await mount();
  try {
    await view.open(); await view.explain();
    assert.equal(view.requests.length, 1);
    assert.equal(view.article().lookups.length, 1);
    assert.match(view.sheet().textContent, /可离线查看/);
    assert.match(view.sheet().textContent, /韧性/);
  } finally { await view.close(); }
});

test("a late response cannot write into a replacement article even if its sentence survives", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const view = await mount({ networkGate: gate });
  try {
    await view.open(); await view.explain();
    assert.equal(view.requests.length, 1);
    await view.replace([oldSentence, "This is a newly generated ending."]);
    await act(async () => { release(); await gate; });
    assert.equal(view.article().lookups, undefined);
    assert.equal(!!view.sheet(), false);
  } finally { release(); await view.close(); }
});

test("a queued lookup save rechecks the article after replacement", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const view = await mount({ saveGate: gate });
  try {
    await view.open(); await view.explain();
    assert.equal(view.requests.length, 1);
    await view.replace([oldSentence, "This is a newly generated ending."]);
    await act(async () => { release(); await gate; });
    assert.equal(view.article().lookups, undefined);
    assert.equal(!!view.sheet(), false);
  } finally { release(); await view.close(); }
});

