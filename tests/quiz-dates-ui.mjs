import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve("playwright", {
    paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()],
  }),
);
const output =
  process.env.LEXIDAY_TEST_OUTPUT ||
  mkdtempSync(join(tmpdir(), "lexiday-dates-"));
const browser = await chromium.launch({
  executablePath: process.env.LEXIDAY_CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const words = Array.from({ length: 18 }, (_, i) => ({
  id: `date-word-${i}`,
  word: `dateword${i}`,
  commonMeaning: `日期测试词${i}`,
  phonetic: "",
  rareMeaning: [0, 10, 14].includes(i) ? `僻义${i}` : "",
  usage: [2, 11].includes(i) ? `搭配${i}` : "",
  example: "",
  tags: [],
  source: "date-ui-fixture",
  createdAt: 0,
  updatedAt: 0,
}));
const ids = (indices) => indices.map((i) => words[i].id);
const first = Array.from({ length: 12 }, (_, i) => i);
const state = {
  words,
  records: {},
  attempts: [],
  settings: {
    theme: "light",
    goal: 30,
    count: "20",
    mode: "en",
    rareFirst: true,
    audio: false,
    audioVersion: 1,
    readingAuto: false,
  },
  days: [
    { date: "2026-09-30", wordIds: ids(first) },
    { date: "2026-10-01", wordIds: ids([10, 11, 12, 13]) },
    { date: "2026-10-03", wordIds: ids([14, 15]) },
    { date: "2026-09-29", wordIds: [] },
  ],
};
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Shanghai",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const navigate = async (path) => {
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await page.waitForURL(`**${path}`);
  };
  const session = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("lexiday-session")));
  const readState = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("lexiday-v1");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const r = db.transaction("state").objectStore("state").get("main");
            r.onsuccess = () => {
              db.close();
              resolve(r.result.value);
            };
          };
        }),
    );
  const chooseScope = async (name) => {
    await page.getByRole("combobox", { name: "测试范围", exact: true }).selectOption({ label: name });
  };
  const chooseDates = async (dates) => {
    await page.getByRole("button", { name: "清空日期", exact: true }).click();
    for (const date of dates)
      await page.getByRole("checkbox", { name: date, exact: true }).check();
  };
  const start = () => page.getByRole("button", { name: /^开始测试 ·/ });
  const summary = (days, words) =>
    page
      .getByText(`已选 ${days} 天 · 去重后 ${words} 词`, { exact: true })
      .waitFor();
  await page.goto("http://127.0.0.1:4173/settings");
  const restore = async (data) => {
    await page
      .getByLabel("导入备份", { exact: true })
      .setInputFiles({
        name: "date-fixture.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ version: 1, data })),
      });
    await page.getByRole("button", { name: "确认操作", exact: true }).click();
    await page.getByText("备份已恢复", { exact: true }).waitFor();
  };
  await restore(state);
  const legacySession = {
    id: "legacy-unfinished",
    questions: [
      {
        wordId: words[16].id,
        type: "spell",
        prompt: "旧测试",
        subtitle: "",
        options: [],
        answer: words[16].word,
      },
    ],
    index: 0,
    answers: [],
    completed: false,
  };
  await page.evaluate(
    (s) => localStorage.setItem("lexiday-session", JSON.stringify(s)),
    legacySession,
  );
  await page.goto("http://127.0.0.1:4173/test/setup");
  await chooseScope("按日期选词");
  await summary(1, 2);
  assert.equal(
    await page
      .getByRole("checkbox", { name: "2026-09-29", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "清空日期", exact: true }).click();
  await summary(0, 0);
  assert(await start().isDisabled());
  await page.getByRole("checkbox", { name: "2026-09-30", exact: true }).check();
  await page.getByRole("checkbox", { name: "2026-10-01", exact: true }).check();
  await summary(2, 14);
  assert.deepEqual(await session(), legacySession); // Editing settings never replaces an unfinished test.
  await page.getByRole("button", { name: "10 题", exact: true }).click();
  assert.match(await start().innerText(), /10 题/);
  await page.getByRole("combobox", { name: "测试题型", exact: true }).selectOption({ label: "熟词僻义" });
  assert.match(await start().innerText(), /2 题/);
  await page.getByRole("combobox", { name: "测试题型", exact: true }).selectOption({ label: "固定搭配" });
  assert.match(await start().innerText(), /2 题/);
  await page.getByRole("combobox", { name: "测试题型", exact: true }).selectOption({ label: "英译中" });
  for (const width of [320, 390, 430, 1200]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    if (width === 390)
      await page.screenshot({
        path: `${output}/quiz-dates-390.png`,
        fullPage: true,
      });
  }
  await start().click();
  await page.getByLabel("暂停并返回测试设置").waitFor();
  let saved = await session();
  assert.equal(saved.questions.length, 10);
  assert.equal(new Set(saved.questions.map((q) => q.wordId)).size, 10);
  assert(
    saved.questions.every((q) => ids([...first, 12, 13]).includes(q.wordId)),
  );
  await page.reload();
  await page.getByLabel("暂停并返回测试设置").waitFor();
  assert.deepEqual(await session(), saved);
  await page.getByLabel("暂停并返回测试设置").click();
  await chooseScope("按日期选词");
  await chooseDates(["2026-10-03"]);
  await page.getByRole("button", { name: /继续未完成的测试/ }).click();
  await page.getByLabel("暂停并返回测试设置").waitFor();
  assert.deepEqual(await session(), saved);
  await page.getByLabel("暂停并返回测试设置").click();
  await chooseScope("按日期选词");
  await page.getByRole("button", { name: "日期范围", exact: true }).click();
  await page.getByLabel("开始日期", { exact: true }).fill("2026-09-30");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-01");
  await summary(2, 14);
  await page.getByRole("button", { name: "全部", exact: true }).click();
  assert.match(await start().innerText(), /14 题/);
  await page.getByLabel("开始日期", { exact: true }).fill("2026-10-03");
  await page
    .getByRole("alert")
    .filter({ hasText: "开始日期不能晚于结束日期" })
    .waitFor();
  assert(await start().isDisabled());
  await page.getByLabel("开始日期", { exact: true }).fill("");
  assert(await start().isDisabled());
  await page.getByLabel("开始日期", { exact: true }).fill("2026-10-02");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-02");
  await summary(0, 0);
  assert(await start().isDisabled());
  await page.getByLabel("开始日期", { exact: true }).fill("2026-09-30");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-03");
  await summary(3, 16);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  for (const width of [320, 390, 430, 1200]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    for (const input of await page.locator(".quiz-date-range input").all())
      assert.equal(
        await input.evaluate((e) => e.scrollWidth > e.clientWidth),
        false,
      );
    if (width === 390)
      await page.screenshot({
        path: `${output}/quiz-range-dark-390.png`,
        fullPage: true,
      });
  }
  await page
    .getByRole("button", { name: "选日期（可多选）", exact: true })
    .click();
  await summary(3, 16);
  await chooseDates(["2026-09-30", "2026-10-03"]);
  await summary(2, 14); // Middle day is excluded in multi-select mode.
  await page.getByRole("button", { name: "全选日期", exact: true }).click();
  await summary(3, 16);
  await chooseDates(["2026-10-03"]);
  await summary(1, 2);
  await start().click();
  await page.getByLabel("暂停并返回测试设置").waitFor();
  assert.deepEqual(
    (await session()).questions.map((q) => q.wordId).sort(),
    ids([14, 15]),
  );
  for (let index = 0; index < 2; index++) {
    await page
      .getByRole("button", { name: "暂时想不起来，显示答案", exact: true })
      .click();
    await page.getByRole("button", { name: /^不会/ }).click();
    await page.getByRole("button", { name: /^(下一题|保存并继续)$/ }).click();
    await page.waitForFunction(
      (index) =>
        JSON.parse(localStorage.getItem("lexiday-session")).index === index + 1,
      index,
    );
  }
  saved = await session();
  assert.equal(saved.questions.length, 4);
  assert(saved.questions.every((q) => ids([14, 15]).includes(q.wordId))); // Automatic reinforcement stays within this date pool.
  const data = await readState();
  assert.equal(data.attempts.length, 2);
  assert(data.attempts.every((a) => ids([14, 15]).includes(a.wordId)));
  assert.deepEqual(data.days, state.days);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel("暂停并返回测试设置").waitFor();
  assert.deepEqual(await session(), saved);
  await page.getByLabel("暂停并返回测试设置").click();
  await chooseScope("按日期选词");
  await summary(1, 2);
  await context.setOffline(false);
  await navigate("/test/setup?word=date-word-4");
  assert.equal(await page.locator(".quiz-date-filter").count(), 0);
  assert.match(await start().innerText(), /1 题/);
  await navigate("/settings");
  await restore({ ...state, days: [] });
  await navigate("/test/setup");
  await chooseScope("按日期选词");
  await page
    .getByText("暂无有词汇的日期，请先导入词表并指定日期。", { exact: true })
    .waitFor();
  assert(await start().isDisabled());
  await chooseScope("所有词汇");
  assert.match(await start().innerText(), /18 题/);
  assert.deepEqual(errors, []);
  console.log(
    "Date quiz UI passed: assigned dates, single/multiple/range, unique counts, mode/limit, invalid/empty dates, legacy resume, refresh/offline, scoped reinforcement, four widths/light-dark.",
  );
  console.log("Screenshots:", output);
  await context.close();
} finally {
  await browser.close();
}
