import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLFormElement",
  "Element",
  "DocumentFragment",
  "Node",
  "Event",
  "MutationObserver",
  "getComputedStyle",
])
  globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
const { createRoot } = await import("react-dom/client");
const { Setup } = await import("../src/screens/Quiz.tsx");
const { default: Home } = await import("../src/screens/Home.tsx");
const { today } = await import("../src/db/index.ts");

const words = Array.from({ length: 18 }, (_, i) => ({
  id: `date-word-${i}`,
  word: `word${i}`,
  commonMeaning: `词义${i}`,
  phonetic: "",
  rareMeaning: [0, 10, 14].includes(i) ? `僻义${i}` : "",
  usage: [2, 11].includes(i) ? `用法${i}` : "",
  example: "",
  tags: [],
  source: "fixture",
  createdAt: 0,
  updatedAt: 0,
}));
const ids = (indices) => indices.map((i) => words[i].id);
const state = {
  words,
  records: {},
  attempts: [],
  settings: {
    count: "20",
    mode: "en",
    rareFirst: true,
    audio: false,
    theme: "light",
    goal: 30,
  },
  days: [
    {
      date: "2026-09-30",
      wordIds: ids(Array.from({ length: 12 }, (_, i) => i)),
    },
    { date: "2026-10-01", wordIds: ids([10, 11, 12, 13]) },
    { date: "2026-10-03", wordIds: ids([14, 15]) },
  ],
};
async function mount(data = state, params = "scope=dates") {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const sessions = [];
  await act(async () =>
    root.render(
      createElement(Setup, {
        state: data,
        params: new URLSearchParams(params),
        start: (s) => sessions.push(s),
        go() {},
      }),
    ),
  );
  return {
    element,
    sessions,
    button: (text) =>
      [...element.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === text,
      ),
    start: () =>
      [...element.querySelectorAll("button")].find((b) =>
        b.textContent.startsWith("开始测试"),
      ),
    async close() {
      await act(async () => root.unmount());
      element.remove();
    },
  };
}
const click = async (element) => {
  assert(element);
  await act(async () => element.click());
};
const setDate = async (element, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const select = async (element, value) => {
  assert(element);
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

test("date setup interactions update unique counts, type eligibility and the actual question pool", async () => {
  const ui = await mount();
  try {
    assert.match(ui.element.textContent, /已选 1 天 · 去重后 2 词/);
    await click(ui.button("清空日期"));
    assert(ui.start().disabled);
    for (const date of ["2026-09-30", "2026-10-01"])
      await click(ui.element.querySelector(`input[aria-label="${date}"]`));
    assert.match(ui.element.textContent, /已选 2 天 · 去重后 14 词/);
    await click(ui.button("10 题"));
    assert.match(ui.start().textContent, /10 题/);
    await select(ui.element.querySelector('[aria-label="测试题型"]'), "rare");
    assert.match(ui.start().textContent, /2 题/);
    await click(ui.start());
    assert.deepEqual(
      ui.sessions
        .at(-1)
        .questions.map((q) => q.wordId)
        .sort(),
      ids([0, 10]),
    );
    await select(ui.element.querySelector('[aria-label="测试题型"]'), "usage");
    assert.match(ui.start().textContent, /2 题/);
    await click(ui.start());
    assert.deepEqual(
      ui.sessions
        .at(-1)
        .questions.map((q) => q.wordId)
        .sort(),
      ids([11, 2]),
    );
    await select(ui.element.querySelector('[aria-label="测试题型"]'), "en");
    await click(ui.start());
    assert.equal(ui.sessions.at(-1).questions.length, 10);
    assert.equal(
      new Set(ui.sessions.at(-1).questions.map((q) => q.wordId)).size,
      10,
    );
    const allowed = new Set(ids(Array.from({ length: 14 }, (_, i) => i)));
    assert(ui.sessions.at(-1).questions.every((q) => allowed.has(q.wordId)));
    await click(ui.button("全部"));
    await click(ui.start());
    assert.deepEqual(
      new Set(ui.sessions.at(-1).questions.map((q) => q.wordId)),
      allowed,
    );
    assert(ui.sessions.at(-1).autoReview);
    assert.equal(ui.sessions.at(-1).initialSize, 14);
    await click(ui.button("全选日期"));
    assert.match(ui.element.textContent, /已选 3 天 · 去重后 16 词/);
    await click(ui.element.querySelector('input[aria-label="2026-10-01"]'));
    await click(ui.start());
    assert(
      !ui.sessions
        .at(-1)
        .questions.some((q) => ids([12, 13]).includes(q.wordId)),
    );
  } finally {
    await ui.close();
  }
});

test("range controls include endpoints and disable starts for missing, reversed and empty ranges", async () => {
  const ui = await mount();
  try {
    await click(ui.button("日期范围"));
    const [from, to] = ui.element.querySelectorAll('input[type="date"]');
    await setDate(from, "2026-09-30");
    await setDate(to, "2026-10-01");
    assert.match(ui.element.textContent, /已选 2 天 · 去重后 14 词/);
    await click(ui.start());
    assert.equal(ui.sessions.at(-1).questions.length, 14);
    await setDate(from, "2026-10-03");
    assert(ui.start().disabled);
    assert.match(
      ui.element.querySelector('[role="alert"]').textContent,
      /开始日期不能晚于结束日期/,
    );
    await click(ui.start());
    assert.equal(ui.sessions.length, 1);
    await setDate(from, "");
    assert(ui.start().disabled);
    await setDate(from, "2026-10-02");
    await setDate(to, "2026-10-02");
    assert(ui.start().disabled);
    await setDate(from, "2026-10-03");
    await setDate(to, "2026-10-03");
    assert.match(ui.element.textContent, /已选 1 天 · 去重后 2 词/);
    await click(ui.start());
    assert.deepEqual(
      ui.sessions
        .at(-1)
        .questions.map((q) => q.wordId)
        .sort(),
      ids([14, 15]),
    );
    await click(ui.button("选日期（可多选）"));
    assert(ui.element.querySelector('input[aria-label="2026-10-03"]').checked);
    assert(!ui.element.querySelector('input[aria-label="2026-09-30"]').checked);
  } finally {
    await ui.close();
  }
});

test("no dated vocabulary explains the empty state; single-word testing bypasses date selection", async () => {
  const empty = await mount({ ...state, days: [] });
  try {
    assert(empty.start().disabled);
    assert.match(empty.element.textContent, /暂无有词汇的日期/);
  } finally {
    await empty.close();
  }
  const single = await mount(state, "scope=dates&word=date-word-4");
  try {
    assert.equal(single.element.querySelector(".quiz-date-filter"), null);
    assert.match(single.start().textContent, /1 题/);
    await click(single.start());
    assert.deepEqual(
      single.sessions[0].questions.map((q) => q.wordId),
      ids([4]),
    );
  } finally {
    await single.close();
  }
});

test("all seven scope controls select the intended pool without altering stored words or records", async () => {
  const data = { ...state, days: [...state.days, { date: today(), wordIds: ids([0, 1]) }], records: {
    [words[1].id]: { mastery: 1, wrongCount: 1, nextReview: Date.now() - 1000 },
    [words[2].id]: { mastery: 2, wrongCount: 0, nextReview: Date.now() + 86400000 },
    [words[4].id]: { mastery: 4, wrongCount: 0, nextReview: Date.now() - 1000 },
  }};
  const before = JSON.stringify(data);
  const ui = await mount(data, "scope=all");
  try {
    const control = ui.element.querySelector('[aria-label="测试范围"]');
    assert.deepEqual([...control.options].map(option => option.textContent), ["今日词汇", "按日期选词", "所有词汇", "错题", "未掌握", "熟词僻义", "到期复习"]);
    assert.equal(ui.element.querySelector('[aria-label="测试题型"]').options.length, 7);
    await click(ui.button("全部"));
    for (const [scope, expected] of [
      ["today", ids([0, 1])], ["all", ids(Array.from({ length: 18 }, (_, i) => i))],
      ["mistakes", ids([1])], ["weak", ids(Array.from({ length: 18 }, (_, i) => i).filter(i => i !== 4))],
      ["rare", ids([0, 10, 14])], ["due", ids([1, 4])],
    ]) {
      await select(control, scope);
      assert.equal(ui.element.querySelector(".quiz-date-filter"), null);
      await click(ui.start());
      assert.deepEqual(new Set(ui.sessions.at(-1).questions.map(q => q.wordId)), new Set(expected), scope);
    }
    await select(control, "dates");
    assert(ui.element.querySelector(".quiz-date-filter"));
    await click(ui.button("清空日期"));
    await click(ui.element.querySelector('input[aria-label="2026-09-30"]'));
    await click(ui.start());
    assert.deepEqual(new Set(ui.sessions.at(-1).questions.map(q => q.wordId)), new Set(ids(Array.from({ length: 12 }, (_, i) => i))));
    assert.equal(JSON.stringify(data), before);
  } finally { await ui.close(); }
});

test("home keeps import, date setup, due review, reading, stats and unfinished-session navigation", async () => {
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element); const routes = [];
  const session = { id: "saved-session", index: 3, completed: false, questions: [], answers: [] };
  const data = { ...state, days: [{ date: today(), wordIds: ids([0, 1]) }], records: { [words[1].id]: { nextReview: Date.now() - 1 } } };
  const render = async current => act(async () => root.render(createElement(Home, { state: data, session: current, go: path => routes.push(path) })));
  const button = text => [...element.querySelectorAll("button")].find(b => b.textContent.trim() === text);
  try {
    await render(session);
    for (const [label, route] of [["导入词表", "/import"], ["按日期选词", "/test/setup?scope=dates"], ["开始测试", "/test/setup"], ["学习统计", "/stats"], ["阅读书架", "/reading"], ["继续上次测试 · 第 4 题", "/test/session"]]) {
      await click(button(label)); assert.equal(routes.at(-1), route);
    }
    const goals = element.querySelectorAll(".home-goals button");
    assert.match(goals[0].textContent, /2词/); assert.match(goals[1].textContent, /1词/);
    await click(goals[1]); assert.equal(routes.at(-1), "/test/setup?scope=due");
    await click(element.querySelector(".home-reading-card")); assert.equal(routes.at(-1), "/reading");
    await render({ ...session, completed: true });
    assert.equal(element.querySelector(".home-resume"), null);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
