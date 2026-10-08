import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
const output = process.env.LEXIDAY_TEST_OUTPUT || mkdtempSync(join(tmpdir(), 'lexiday-reading-ui-'));
const seed = JSON.parse(readFileSync(new URL('../src/db/seed.json', import.meta.url), 'utf8'));
const words = seed.map((w, i) => ({ ...w, id: `seed-${i}`, tags: ['测试'], source: 'private-test.docx', createdAt: 0, updatedAt: 0 }));
const forms = { borrow: 'borrowed', write: 'written', child: 'children', 'be prone to': 'was prone to' };
const testWords = Object.keys(forms);
words.forEach((w, i) => { if (i < testWords.length) w.word = testWords[i]; else if (testWords.includes(w.word)) w.word = `fixtureword${i}`; });
const state = { words, records: {}, days: [], attempts: words.slice(0, 79).map((w, i) => ({ id: `test-${i}`, sessionId: 'fixture', wordId: w.id, correct: false, time: i, type: 'en', rating: 1 })), settings: { theme: 'light', goal: 30, count: '10', mode: 'en', rareFirst: true, audio: false, audioVersion: 1, readingAuto: false }, reading: { version: 1, batches: [] } };
// Deliberately synthetic API responses test the interface and persistence, not model quality.
function mockArticle(targets) {
 return { title: 'Reading interface test', titleTranslation: '阅读界面测试', sentences: targets.map(w => ({ english: `The class discussed ${forms[w.word] || w.word} in today's lesson.`, translation: '全班在今天的课上讨论了这个词。', structure: 'The class（主语）+ discussed（谓语）+ 目标词（宾语）。', grammar: '一般过去时，主动语态；本句没有从句。', pattern: '主语 + discuss + 宾语 + 时间状语。', application: 'The class discussed the plan yesterday.', applicationTranslation: '全班昨天讨论了这个计划。' })), vocabulary: targets.map((w, sentence) => ({ wordId: w.id, sentence: sentence === 0 ? 999 : sentence, meaning: w.commonMeaning, partOfSpeech: '测试词', usage: '这是用来检查界面显示的测试说明。', contrast: '测试数据，不用于语言教学。', example: `Remember the word ${w.word}.`, exampleTranslation: '记住这个单词。' })) };
}
const browser = await chromium.launch({ executablePath: process.env.LEXIDAY_CHROME, headless: true, args: ['--no-sandbox'] });
try {
 const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
 const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
 let calls = 0; let releaseFirst; let announceFirst; let failureMode = false; let omitTargets = 0;
 const firstRequested = new Promise(resolve => { announceFirst = resolve; });
 const firstGate = new Promise(resolve => { releaseFirst = resolve; });
 await context.route('https://api.deepseek.com/chat/completions', async route => {
   calls++;
   const body = route.request().postDataJSON(); const targets = JSON.parse(body.messages[1].content).targetWords;
   assert.equal(targets.length, 20); assert(!route.request().postData().includes('private-test.docx'));
   if (calls === 1) { announceFirst(); await firstGate; }
   if (failureMode) { failureMode = false; await route.fulfill({ status: 429, contentType: 'application/json', body: '{}' }); return; }
   const data = JSON.parse(body.messages[1].content);
   if (data.previousDraft) assert.equal(data.missingWords[0].word, 'borrow');
   const response = mockArticle(targets);
   for (let i = 0; i < omitTargets; i++) response.sentences[i].english = 'This test sentence omits the target.';
   omitTargets = 0;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(response) } }] }) });
 });
 const navigate = async path => { await page.evaluate(p => { history.pushState(null, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path); };
 const readState = () => page.evaluate(() => new Promise((resolve, reject) => { const open = indexedDB.open('lexiday-v1'); open.onerror = () => reject(open.error); open.onsuccess = () => { const database = open.result; const r = database.transaction('state').objectStore('state').get('main'); r.onsuccess = () => { database.close(); resolve(r.result.value); }; r.onerror = () => reject(r.error); }; }));
 const restore = async data => {
   await navigate('/settings');
   await page.getByLabel('导入备份', { exact: true }).setInputFiles({ name: 'test-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, data })) });
   // The file is parsed asynchronously before the confirmation dialog is
   // mounted; wait for it explicitly to avoid a slow-runner race.
   await page.getByRole('button', { name: '确认操作', exact: true }).waitFor();
   await page.getByRole('button', { name: '确认操作', exact: true }).click();
   await page.getByText('备份已恢复', { exact: true }).waitFor();
 };
 const configure = async () => {
   await page.getByLabel('文章生成API密钥', { exact: true }).fill('test-only-not-a-real-key');
   await page.getByRole('checkbox', { name: '同意发送本批词汇并承担API调用费用' }).check();
   await page.getByRole('button', { name: '保存并启用生成', exact: true }).click();
   await page.getByText('配置已保存在本机，自动生成已开启。密钥是否可用将在首次生成时检查。', { exact: true }).waitFor();
 };
 const studyWord = async id => {
   await navigate(`/test/setup?word=${id}`);
   await page.getByRole('button', { name: /开始测试 ·/ }).click();
   await page.getByRole('button', { name: '暂时想不起来，显示答案', exact: true }).click();
   assert.equal(await page.locator('.rating-buttons').count(), 0);
   await page.getByRole('button', { name: '保存本题并结束本次测试', exact: true }).click();
   await page.waitForURL('**/test/result');
 };
 await page.goto('http://127.0.0.1:4173/settings');
 await page.getByRole('heading', { name: '我的设置' }).waitFor();
 await restore(state); await configure();
 assert.equal(calls, 0);
 await studyWord('seed-79'); await firstRequested;
 await studyWord('seed-80'); assert.equal((await readState()).attempts.length, 81);
 releaseFirst(); await navigate('/reading');
 await page.getByText('4 / 4 篇 · 已核对覆盖 80 / 80 词', { exact: true }).waitFor();
 assert.equal(calls, 4);
 const saved = await readState(); assert.equal(saved.attempts.length, 81); assert(!JSON.stringify(saved).includes('test-only-not-a-real-key'));
 assert.equal(saved.reading.batches[0].articles[0].vocabulary[0].sentence, 0);
 await page.getByRole('button', { name: '打开阅读' }).click(); const readerPath = new URL(page.url()).pathname;
 assert.equal(await page.getByRole('heading', { name: '阅读界面测试', exact: true }).count(), 0);
 assert.equal(await page.getByText('句子主干', { exact: true }).count(), 0);
 await page.getByRole('button', { name: '查看中文译文', exact: true }).click();
 await page.getByRole('heading', { name: '阅读界面测试', exact: true }).waitFor();
 await page.getByRole('button', { name: '查看中文译文', exact: true }).click();
 await page.getByRole('button', { name: '查看逐句语法与句式应用', exact: true }).click();
 await page.getByText('句子主干', { exact: true }).first().waitFor();
 await page.getByRole('button', { name: '查看逐句语法与句式应用', exact: true }).click();
 assert.equal(await page.getByRole('button', { name: '查看 borrow 的语境词义', exact: true }).first().innerText(), 'borrowed');
 await page.getByRole('button', { name: `查看 ${words[0].word} 的语境词义`, exact: true }).first().click();
 await page.getByText('搭配与使用限制', { exact: true }).waitFor();
 await page.screenshot({ path: `${output}/reading-word-390.png`, animations: 'disabled' });
 await page.getByRole('button', { name: 'Close', exact: true }).click();
 for (const width of [320, 390, 430, 1200]) {
   await page.setViewportSize({ width, height: 844 });
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
   await page.screenshot({ path: `${output}/reading-${width}.png`, fullPage: true, animations: 'disabled' });
   await navigate('/settings');
   await page.getByRole('heading', { name: 'DeepSeek · 阅读与拍照识词' }).waitFor();
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
   await page.screenshot({ path: `${output}/reading-settings-${width}.png`, fullPage: true, animations: 'disabled' });
   await navigate(readerPath);
 }
 // Partial restore must not auto-bill; an explicit failed retry must not loop.
 const partial = structuredClone(saved); const b = partial.reading.batches[0];
 b.articles = b.articles.slice(0, 1); b.status = 'paused'; b.autoEligible = false; delete b.runId;
 await restore(partial); await navigate('/reading');
 assert.equal(calls, 4); failureMode = true;
 await page.getByRole('button', { name: '继续生成剩余短文', exact: true }).click();
 await page.getByRole('alert').filter({ hasText: '过于频繁' }).waitFor();
 await page.waitForTimeout(500); assert.equal(calls, 5); assert.equal((await readState()).reading.batches[0].articles.length, 1);
 await page.getByRole('button', { name: '继续生成剩余短文', exact: true }).click();
 await page.getByText('4 / 4 篇 · 已核对覆盖 80 / 80 词', { exact: true }).waitFor();
 assert.equal(calls, 8); assert.equal((await readState()).attempts.length, 81);
 // An omitted word keeps all articles. Worse/failed repairs must preserve the old text.
 const missing = await readState();
 missing.reading.batches[0].articles[0].sentences[0].english = 'The factory found a new investor.';
 const untouched = structuredClone(missing.reading.batches[0].articles.slice(1));
 await restore(missing); await navigate('/reading');
 await page.getByText('4 / 4 篇 · 已核对覆盖 79 / 80 词', { exact: true }).waitFor();
 assert.equal(calls, 8);
 await page.getByRole('button', { name: '打开阅读' }).click();
 await page.getByLabel('本篇待核对词').waitFor();
 await page.setViewportSize({ width: 390, height: 844 });
 await page.screenshot({ path: `${output}/reading-unmatched-390.png`, animations: 'disabled' });
 await page.getByRole('button', { name: '查看本篇 20 词与应用', exact: true }).click();
 await page.locator('.reading-word-list button').filter({ hasText: 'borrow' }).click();
 await page.getByText('正文位置待核对，以下生成说明暂不能作为本句用法依据。可回到阅读页补全。', { exact: true }).waitFor();
 await page.getByRole('button', { name: 'Close', exact: true }).click();
 omitTargets = 3;
 await page.getByRole('button', { name: '补全本篇待核对词', exact: true }).click();
 await page.waitForFunction(() => !document.querySelector('[aria-label="本篇待核对词"] button')?.disabled);
 assert.equal(calls, 9);
 assert.equal((await readState()).reading.batches[0].articles[0].sentences[0].english, 'The factory found a new investor.');
 failureMode = true;
 await page.getByRole('button', { name: '补全本篇待核对词', exact: true }).click();
 await page.getByRole('alert').filter({ hasText: '过于频繁' }).waitFor();
 assert.equal(calls, 10); assert.equal((await readState()).reading.batches[0].articles.length, 4);
 await page.getByRole('button', { name: '补全本篇待核对词', exact: true }).click();
 await page.getByLabel('本篇待核对词').waitFor({ state: 'detached' });
 assert.equal(calls, 11);
 assert.deepEqual((await readState()).reading.batches[0].articles.slice(1), untouched);
 await navigate('/reading');
 await page.getByText('4 / 4 篇 · 已核对覆盖 80 / 80 词', { exact: true }).waitFor();
 await page.getByRole('button', { name: '打开阅读' }).click();
 await page.evaluate(() => navigator.serviceWorker.ready);
 await page.reload(); await page.getByRole('heading', { name: 'Reading interface test' }).waitFor();
 await page.waitForFunction(() => !!navigator.serviceWorker.controller);
 await context.setOffline(true); await page.reload();
 await page.getByRole('heading', { name: 'Reading interface test' }).waitFor();
 await page.getByRole('button', { name: '查看中文译文', exact: true }).click();
 await page.getByRole('heading', { name: '阅读界面测试', exact: true }).waitFor();
 await page.setViewportSize({ width: 390, height: 844 });
 await page.evaluate(() => document.documentElement.classList.add('dark'));
 await page.screenshot({ path: `${output}/reading-offline-dark-390.png`, fullPage: true, animations: 'disabled' });
 assert.equal(calls, 11); assert.deepEqual(errors, []);
 console.log(JSON.stringify({ output, automaticCalls: 4, concurrentLearningPreserved: 81, manualResumeCalls: 3, manualRepairAttempts: 3, unmatchedDraftPreserved: true, failedRetryDoesNotLoop: true, offlineReload: true, mobileWidths: [320, 390, 430, 1200], errors }, null, 2));
 await context.close();
} finally { await browser.close(); }
