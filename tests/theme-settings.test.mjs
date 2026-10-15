import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/", pretendToBeVisual: true,
});
for (const name of [
  "window", "document", "HTMLElement", "HTMLInputElement", "HTMLFormElement", "HTMLAnchorElement",
  "Element", "DocumentFragment", "Node", "Event", "CustomEvent", "MutationObserver",
  "getComputedStyle", "NodeFilter",
]) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const { createRoot } = await import("react-dom/client");
const { default: Settings } = await import("../src/screens/Settings.tsx");
const { db, loadState, saveState } = await import("../src/db/index.ts");

const styles = [["apricot", "暖杏手账"], ["paper", "墨白书页"], ["aurora", "极光蓝"]];
const clone = value => structuredClone(value);
const makeState = () => ({
  words: [{
    id: "alpha", word: "alpha", commonMeaning: "第一", phonetic: "", rareMeaning: "",
    usage: "", example: "", tags: ["保留标签"], source: "用户词表", createdAt: 1, updatedAt: 2,
  }],
  records: { alpha: {
    firstStudyDate: "1970-01-01",
    wordId: "alpha", correctCount: 3, wrongCount: 1, mastery: 3,
    lastReview: 100, nextReview: 200, lastResult: true,
    streakCorrect: 2, streakWrong: 0, lastWrong: 50, wrongType: "en", rareCorrect: 0, rareTotal: 0,
  } },
  attempts: [{ id: "saved-attempt", sessionId: "quiz", wordId: "alpha", time: 100, studyDate: "1970-01-01", correct: true, type: "en", rating: 3 }],
  days: [{ date: "2026-10-09", wordIds: ["alpha"] }],
  settings: { theme: "dark", appearance: "apricot", reviewDays: [1, 2, 4, 7, 15, 30], goal: 45, count: "all", mode: "spell", rareFirst: false, audio: false, audioVersion: 1, readingAuto: false },
  reading: { version: 1, batches: [] },
});
const styleButton = (element, name) => {
  const found = element.querySelector(`button[aria-label="${name}"]`);
  assert(found, `missing theme button: ${name}`);
  return found;
};
const button = (element, text) => {
  const found = [...element.querySelectorAll("button")].find(b => b.textContent === text);
  assert(found, `missing button: ${text}`);
  return found;
};
const click = async element => act(async () => element.click());
function selected(element, name) {
  for (const [, title] of styles)
    assert.equal(styleButton(element, title).getAttribute("aria-pressed"), String(title === name));
}
async function mount(initial = makeState(), beforeSave) {
  let state = clone(initial);
  let saves = 0;
  let cleared = 0;
  let paused = 0;
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element);
  const controls = { service: { configured: false, model: "deepseek-flash" }, serviceError: "", busy: false,
    pause() { paused++; }, run() {}, refreshService: async () => {} };
  function render() {
    root.render(createElement(Settings, {
      state, save: async next => {
        saves++;
        await beforeSave?.(saves);
        state = typeof next === "function" ? next(state) : next;
        render();
      }, clearSession() { cleared++; }, readingControls: controls,
    }));
  }
  await act(async () => render());
  return {
    element, get state() { return state; }, get saves() { return saves; },
    get cleared() { return cleared; }, get paused() { return paused; },
    async replace(next) { state = clone(next); await act(async () => render()); },
    async close() { await act(async () => root.unmount()); element.remove(); },
  };
}
async function importBackup(ui, state) {
  const input = ui.element.querySelector('input[aria-label="导入备份"]');
  Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => JSON.stringify({ version: 1, data: state }) }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  assert.match(document.querySelector('[role="alertdialog"]').textContent, /确认恢复备份/);
}

test("each theme can be selected and reopened without changing study data or brightness", async () => {
  const initial = makeState();
  const ui = await mount(initial);
  let finalState;
  try {
    selected(ui.element, "暖杏手账");
    for (const [id, name] of [styles[1], styles[2], styles[0]]) {
      await click(styleButton(ui.element, name));
      selected(ui.element, name);
      assert.deepEqual(ui.state, { ...initial, settings: { ...initial.settings, appearance: id } });
    }
    await click(styleButton(ui.element, "极光蓝"));
    finalState = clone(ui.state);
    assert.equal(ui.cleared, 0);
    assert.equal(ui.paused, 0);
  } finally { await ui.close(); }
  const reopened = await mount(finalState);
  try { selected(reopened.element, "极光蓝"); assert.deepEqual(reopened.state, finalState); }
  finally { await reopened.close(); }
});

test("brightness choices remain independent of the selected visual theme", async () => {
  const initial = makeState(); initial.settings.appearance = "paper";
  const ui = await mount(initial);
  try {
    for (const [mode, title] of [["light", "浅色"], ["system", "跟随系统"], ["dark", "深色"]]) {
      await click(button(ui.element, title));
      selected(ui.element, "墨白书页");
      assert.deepEqual(ui.state, { ...initial, settings: { ...initial.settings, theme: mode } });
    }
  } finally { await ui.close(); }
});

test("rapid theme and brightness clicks save once and retain learning changes made while storage is pending", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ui = await mount(makeState(), () => gate);
  try {
    await act(async () => {
      styleButton(ui.element, "墨白书页").click();
      styleButton(ui.element, "极光蓝").click();
      button(ui.element, "浅色").click();
    });
    assert.equal(ui.saves, 1);
    selected(ui.element, "暖杏手账");
    for (const [, name] of styles) assert(styleButton(ui.element, name).disabled);
    for (const title of ["浅色", "深色", "跟随系统"]) assert(button(ui.element, title).disabled);
    const newer = clone(ui.state);
    newer.attempts.push({ ...newer.attempts[0], id: "concurrent-attempt", time: 150 });
    newer.records.alpha.correctCount++;
    newer.settings.goal = 60;
    await ui.replace(newer);
    await act(async () => { release(); await gate; });
    assert.deepEqual(ui.state, { ...newer, settings: { ...newer.settings, appearance: "paper" } });
    selected(ui.element, "墨白书页");
    assert(!styleButton(ui.element, "极光蓝").disabled);
    assert.equal(ui.cleared, 0);
  } finally { release(); await ui.close(); }
});

test("a failed theme save keeps the previous selection and allows a successful retry", async () => {
  const initial = makeState();
  const ui = await mount(initial, calls => { if (calls === 1) throw new Error("storage unavailable"); });
  try {
    await click(styleButton(ui.element, "极光蓝"));
    assert.deepEqual(ui.state, initial);
    selected(ui.element, "暖杏手账");
    assert.match(ui.element.querySelector('[role="status"]').textContent, /失败|未保存|重试/);
    assert(!styleButton(ui.element, "极光蓝").disabled);
    await click(styleButton(ui.element, "极光蓝"));
    selected(ui.element, "极光蓝");
    assert.equal(ui.saves, 2);
    assert.deepEqual(ui.state, { ...initial, settings: { ...initial.settings, appearance: "aurora" } });
    assert(!/失败|未保存|重试/.test(ui.element.querySelector('[role="status"]')?.textContent || ""));
  } finally { await ui.close(); }
});

test("exported backups include the chosen style and restore it with study records and brightness", async () => {
  const initial = makeState(); initial.settings.appearance = "aurora";
  const ui = await mount(initial);
  const previousCreate = URL.createObjectURL;
  const previousRevoke = URL.revokeObjectURL;
  const previousClick = HTMLAnchorElement.prototype.click;
  let exportedBlob;
  let downloadedName;
  URL.createObjectURL = blob => { exportedBlob = blob; return "blob:test-backup"; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () { downloadedName = this.download; };
  try {
    await click(button(ui.element, "导出全部数据"));
    assert.equal(downloadedName, "lexiday-backup.json");
    const exported = JSON.parse(await exportedBlob.text());
    assert.equal(exported.version, 1);
    assert.deepEqual(exported.data, initial);
    await click(styleButton(ui.element, "墨白书页"));
    const beforeRestore = clone(ui.state);
    await importBackup(ui, exported.data);
    assert.deepEqual(ui.state, beforeRestore, "import preview must not overwrite the current data");
    await click(button(document, "确认操作"));
    selected(ui.element, "极光蓝");
    assert.deepEqual(ui.state, initial);
    assert.equal(ui.cleared, 1);
    assert.equal(ui.paused, 1);
  } finally {
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
    HTMLAnchorElement.prototype.click = previousClick;
    await ui.close();
  }
});

test("legacy and unsupported backup styles restore safely as apricot without losing records", async () => {
  for (const appearance of [undefined, null, "unknown-style", { id: "paper" }]) {
    const backup = makeState();
    if (appearance === undefined) delete backup.settings.appearance;
    else backup.settings.appearance = appearance;
    const initial = makeState(); initial.settings.appearance = "aurora";
    const ui = await mount(initial);
    try {
      await importBackup(ui, backup);
      await click(button(document, "确认操作"));
      selected(ui.element, "暖杏手账");
      assert.deepEqual(ui.state, { ...backup, settings: { ...backup.settings, appearance: "apricot" } });
      assert.equal(ui.state.settings.theme, "dark");
      assert.equal(ui.cleared, 1);
    } finally { await ui.close(); }
  }
});

test("IndexedDB reopening preserves valid styles and migrates legacy or unknown styles without deleting learning data", async () => {
  for (const appearance of ["apricot", "paper", "aurora", undefined, null, "unsupported-style"]) {
    const initial = makeState();
    if (appearance === undefined) delete initial.settings.appearance;
    else initial.settings.appearance = appearance;
    await saveState(initial);
    db.close();
    await db.open();
    const loaded = await loadState();
    const expectedStyle = styles.some(([id]) => id === appearance) ? appearance : "apricot";
    const expected = { ...initial, settings: { ...initial.settings, appearance: expectedStyle } };
    assert.deepEqual(loaded, expected);
    assert.deepEqual((await db.state.get("main")).value, expected);
    assert.deepEqual(await loadState(), expected, "a second load must not reset the selected style");
  }
});

test.after(async () => { await db.delete(); dom.window.close(); });
