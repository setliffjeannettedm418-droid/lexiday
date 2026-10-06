import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
const output = process.env.LEXIDAY_TEST_OUTPUT || "outputs/photo-import"; mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.LEXIDAY_CHROME, headless: true, args: ["--no-sandbox"] });
const item = { word: "retain", phonetic: "/rɪˈteɪn/", commonMeaning: "v. 保留；保持", rareMeaning: "保留某种状态或权利", usage: "retain control 保持控制；retain information 记住信息", example: "She retained her job.\n她保住了工作。", needsReview: false, reviewNote: "" };
let calls = 0; const scripts = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.on("pageerror", e => scripts.push(e.message));
  await page.route("https://api.deepseek.com/chat/completions", async route => {
    calls++;
    const data = route.request().postDataJSON();
    assert.equal(data.model, "deepseek-flash");
    assert.equal(data.messages[1].content[1].type, "image_url");
    assert.match(data.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.ok(!JSON.stringify(data).includes("private-photo.png"));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ words: [item, { ...item, word: "lucid", commonMeaning: "adj. 清晰的；清醒的" }, { ...item, word: "sustain", needsReview: true, reviewNote: "中间字母较模糊，请核对" }], warnings: [], hasMore: false }) } }] }) });
  });
  const read = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("lexiday-v1"); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result; const get = db.transaction("state").objectStore("state").get("main"); get.onsuccess = () => { db.close(); resolve(get.result.value); }; get.onerror = () => reject(get.error); };
  }));
  await page.goto("http://127.0.0.1:4173/settings"); await page.getByRole("heading", { name: "我的设置" }).waitFor();
  const backup = { words: [{ ...item, id: "existing-retain", tags: [], source: "old.csv", createdAt: 1, updatedAt: 2 }], days: [{ date: "2026-10-01", wordIds: ["existing-retain"] }], records: { "existing-retain": { wordId: "existing-retain", mastery: 4, correctCount: 5, wrongCount: 1, nextReview: 9999999999999 } }, attempts: [], settings: { theme: "light", goal: 30, count: "10", mode: "en", rareFirst: true, audio: false, audioVersion: 1, readingAuto: false }, reading: { version: 1, batches: [] } };
  await page.getByLabel("导入备份", { exact: true }).setInputFiles({ name: "fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 1, data: backup })) });
  await page.getByRole("button", { name: "确认操作", exact: true }).click(); await page.getByText("备份已恢复", { exact: true }).waitFor();
  await page.getByLabel("文章生成API密钥", { exact: true }).fill("test-only-not-a-real-key");
  await page.getByRole("checkbox", { name: "同意发送本批词汇并承担API调用费用" }).check();
  await page.getByRole("button", { name: "保存并启用生成", exact: true }).click();
  await page.getByText("配置已保存在本机，自动生成已开启。密钥是否可用将在首次生成时检查。", { exact: true }).waitFor();
  // Client-side navigation keeps the deliberately memory-only browser key alive.
  await page.getByRole("button", { name: "首页", exact: true }).click(); await page.getByRole("button", { name: "导入词表", exact: true }).click();
  await page.getByRole("heading", { name: "拍下生词，直接整理" }).waitFor();
  assert.ok(await page.getByLabel("上传词表", { exact: true }).count());
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await noOverflow(); await page.screenshot({ path: `${output}/photo-import-390.png`, fullPage: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=", "base64");
  await page.getByLabel("选择生词照片", { exact: true }).setInputFiles({ name: "private-photo.png", mimeType: "image/png", buffer: png });
  await page.getByAltText("待识别生词照片 1").waitFor();
  await page.getByRole("button", { name: "识别并整理", exact: true }).click(); await page.getByRole("heading", { name: "确认你的词表" }).waitFor();
  assert.equal(calls, 1); assert.equal((await read()).words.length, 1);
  assert.equal(await page.getByRole("checkbox", { name: "选择 sustain", exact: true }).isChecked(), false);
  await page.getByLabel("commonMeaning 1", { exact: true }).fill("v. 保留；维持原状");
  await page.getByLabel("词表日期", { exact: true }).fill("2026-10-05");
  await noOverflow(); await page.screenshot({ path: `${output}/photo-preview-390.png`, fullPage: true });
  for (const width of [320, 430, 1200]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(); }
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: `${output}/photo-preview-dark.png`, fullPage: true });
  await page.getByRole("button", { name: "确认导入 2 个词", exact: true }).click(); await page.waitForURL(/\/words\?date=2026-10-05/);
  const saved = await read(); assert.equal(saved.words.length, 2);
  assert.equal(saved.records["existing-retain"].mastery, 4); assert.deepEqual(saved.attempts, []);
  assert.equal(saved.days.find(d => d.date === "2026-10-05").wordIds.length, 2);
  assert.ok(saved.words.find(w => w.id === "existing-retain").commonMeaning.includes("维持原状"));
  assert.ok(!JSON.stringify(saved).includes("data:image"));
  assert.deepEqual(scripts, []); console.log(JSON.stringify({ result: "passed", photos: 1, imported: 2, API_calls: calls, widths: [320,390,430,1200], output }));
} finally { await browser.close(); }
