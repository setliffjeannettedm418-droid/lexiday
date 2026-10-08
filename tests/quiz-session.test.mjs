import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
for (const name of [
  "window", "document", "HTMLElement", "HTMLInputElement", "HTMLFormElement",
  "Element", "DocumentFragment", "Node", "Event", "MutationObserver", "getComputedStyle",
]) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = () => {};
const { createRoot } = await import("react-dom/client");
const { Quiz, Result } = await import("../src/screens/Quiz.tsx");
const { scheduler } = await import("../src/features/review/scheduler.ts");

const words = ["alpha", "beta"].map((word) => ({
  id: word, word, commonMeaning: `释义 ${word}`, phonetic: "", rareMeaning: "",
  usage: "", example: "", tags: [], source: "fixture", createdAt: 0, updatedAt: 0,
}));
const makeState = () => ({
  words, records: {}, attempts: [], days: [],
  settings: { theme: "light", goal: 30, count: "20", mode: "spell", rareFirst: true, audio: false },
});
const makeSession = (ids = ["alpha"]) => ({
  id: "original-session", autoReview: false, initialSize: ids.length,
  questions: ids.map((id) => ({ wordId: id, type: "spell", prompt: `释义 ${id}`, subtitle: "", options: [], answer: id })),
  index: 0, answers: [], completed: false,
});
const clone = (value) => JSON.parse(JSON.stringify(value));
const click = async (element) => { assert(element); await act(async () => element.click()); };
const button = (element, text) => [...element.querySelectorAll("button")].find((b) => b.textContent.includes(text));
async function type(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function mount(Component, props) {
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element);
  await act(async () => root.render(createElement(Component, props)));
  return {
    element,
    renderNow: (next) => root.render(createElement(Component, next)),
    render: async (next) => act(async () => root.render(createElement(Component, next))),
    close: async () => { await act(async () => root.unmount()); element.remove(); },
  };
}

test("a save finishing after pause cannot replace a new session or navigate away, and its attempt remains resumable", async () => {
  let state = makeState();
  const original = { ...makeSession(), selected: "alpha", rating: 3 };
  let session = original;
  const routes = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let saves = 0;
  const props = {
    state, session,
    update: (next) => { session = clone(next); },
    save: async (next) => { saves++; await gate; state = typeof next === "function" ? next(state) : next; },
    go: (path) => routes.push(path), speak: async () => {},
  };
  const ui = await mount(Quiz, props);
  await click(ui.element.querySelector(".rating-area .primary"));
  await click(ui.element.querySelector('[aria-label="暂停并返回测试设置"]'));
  await ui.close();
  session = { ...makeSession(["beta"]), id: "new-session" };
  const newSession = clone(session);
  await act(async () => { release(); await gate; });
  assert.deepEqual(session, newSession);
  assert.deepEqual(routes, ["/test/setup"]);
  assert.equal(state.attempts.length, 1);
  assert.equal(state.attempts[0].id, "original-session-0");
  assert.equal(state.records.alpha.correctCount, 1);

  // The interrupted question remains persisted; continuing it uses its attempt ID
  // to advance exactly once without saving the answer or mastery a second time.
  session = clone(original);
  const resumed = await mount(Quiz, { ...props, state, session });
  try {
    await click(resumed.element.querySelector(".rating-area .primary"));
    assert.equal(saves, 1);
    assert.equal(state.attempts.length, 1);
    assert.equal(state.records.alpha.correctCount, 1);
    assert.equal(session.completed, true);
    assert.deepEqual(session.answers, [{ wordId: "alpha", correct: true }]);
    assert.equal(routes.at(-1), "/test/result");
  } finally { await resumed.close(); }
});

test("a pending save cannot advance a replaced session even if the Quiz component stays mounted", async () => {
  let session = { ...makeSession(), selected: "alpha", rating: 3 };
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const updates = []; const routes = [];
  const props = { state: makeState(), session, update: (s) => updates.push(s), save: async () => gate, go: (p) => routes.push(p), speak: async () => {} };
  const ui = await mount(Quiz, props);
  try {
    await click(ui.element.querySelector(".rating-area .primary"));
    session = { ...makeSession(["beta"]), id: "replacement-session" };
    await ui.render({ ...props, session });
    await act(async () => { release(); await gate; });
    assert.equal(updates.length, 0);
    assert.equal(routes.length, 0);
    assert.match(ui.element.querySelector("h1").textContent, /beta/);
  } finally { await ui.close(); }
});

test("spelling drafts and submitted answers survive remounts, and the next question starts empty", async () => {
  let session = makeSession(["alpha", "beta"]);
  let state = makeState();
  let ui;
  const props = () => ({
    state, session,
    update: (next) => { session = clone(next); ui.renderNow(props()); },
    save: async (next) => { state = typeof next === "function" ? next(state) : next; },
    go() {}, speak: async () => {},
  });
  ui = await mount(Quiz, props());
  await type(ui.element.querySelector('[aria-label="英文拼写"]'), "alpah");
  assert.equal(session.spelling, "alpah");
  await ui.close();
  ui = await mount(Quiz, props());
  assert.equal(ui.element.querySelector('[aria-label="英文拼写"]').value, "alpah");
  await click(button(ui.element, "确认答案"));
  assert.equal(session.selected, "alpah");
  await ui.close();
  ui = await mount(Quiz, props());
  try {
    const input = ui.element.querySelector('[aria-label="英文拼写"]');
    assert(input.disabled);
    assert.equal(input.value, "alpah");
    assert.match(ui.element.textContent, /回答错误/);
    await click(button(ui.element, "不会"));
    await click(ui.element.querySelector(".rating-area .primary"));
    assert.equal(session.index, 1);
    assert.equal(session.spelling, undefined);
    assert.equal(session.selected, undefined);
    assert.equal(ui.element.querySelector('[aria-label="英文拼写"]').value, "");
    assert(!ui.element.querySelector('[aria-label="英文拼写"]').disabled);
    assert.equal(state.attempts[0].correct, false);
  } finally { await ui.close(); }
});

test("legacy submitted spelling sessions without a draft still display their saved answer", async () => {
  const ui = await mount(Quiz, { state: makeState(), session: { ...makeSession(), selected: "alpah" }, update() {}, save: async () => {}, go() {}, speak: async () => {} });
  try {
    assert.equal(ui.element.querySelector('[aria-label="英文拼写"]').value, "alpah");
    assert(ui.element.querySelector('[aria-label="英文拼写"]').disabled);
  } finally { await ui.close(); }
});

test("retry preserves automatic reinforcement on and off and records the new initial size", async () => {
  for (const autoReview of [true, false]) {
    let state = { ...makeState(), records: { alpha: scheduler.review(undefined, "alpha", false, 1, "spell") } };
    let session = { ...makeSession(), autoReview, completed: true, answers: [{ wordId: "alpha", correct: false }] };
    const result = await mount(Result, { state, session, start: (next) => { session = next; }, go() {} });
    await click(button(result.element, "复习本次错题与薄弱词"));
    assert.equal(session.autoReview, autoReview);
    assert.equal(session.initialSize, 1);
    await result.close();
    session = { ...session, selected: session.questions[0].answer, rating: 3 };
    const quiz = await mount(Quiz, {
      state, session, update: (next) => { session = next; },
      save: async (next) => { state = typeof next === "function" ? next(state) : next; },
      go() {}, speak: async () => {},
    });
    try {
      await click(quiz.element.querySelector(".rating-area .primary"));
      assert.equal(state.records.alpha.mastery, 2);
      assert.equal(session.completed, !autoReview);
      assert.equal(session.questions.length, autoReview ? 2 : 1);
      assert.equal(session.initialSize, 1);
    } finally { await quiz.close(); }
  }
});
