import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
const output = mkdtempSync(join(tmpdir(), 'lexiday-lookup-ui-'));
const words = Array.from({ length: 80 }, (_, i) => ({ id: `w${i}`, word: `target${i}`, phonetic: '', commonMeaning: '界面测试词', rareMeaning: '', usage: '测试用法', example: '', tags: [], source: 'private-input.docx', createdAt: 0, updatedAt: 0 }));
const sentence = english => ({ english, translation: '这是界面测试的句子译文。', structure: '这是已有的句子主干测试说明。', grammar: '这是已有的句子语法测试说明。', pattern: '主语加谓语。', application: 'A tree grows.', applicationTranslation: '一棵树在生长。' });
const bankSentence = 'The bank approved a loan; they waited by the river bank.';
const articles = Array.from({ length: 4 }, (_, index) => ({ title: 'Words beyond the list', titleTranslation: '词表以外的单词', sentences: [
  sentence('Their resilience helped them rebuild.'), sentence(bankSentence), sentence('A sustainable plan will help.'), sentence('The lexidayunlistedword is a test token.'),
  ...words.slice(index * 20, index * 20 + 20).map(w => sentence(`We learned ${w.word} through a story.`)),
], vocabulary: words.slice(index * 20, index * 20 + 20).map((w, i) => ({ wordId: w.id, sentence: i + 4, meaning: '测试目标词', partOfSpeech: '测试词', usage: '已保存的目标词用法。', contrast: '测试目标词辨析。', example: 'A sample.', exampleTranslation: '一个示例。' })) }));
const state = { words, records: {}, days: [], attempts: [], settings: { theme: 'light', goal: 30, count: '10', mode: 'en', rareFirst: false, audio: false, audioVersion: 1, readingAuto: false }, reading: { version: 1, batches: [{ id: 'lookup-fixture', words, createdAt: 1, status: 'ready', articles, autoEligible: false }] } };
function explanation(data) {
  const river = data.selectedWord === 'bank' && data.start > 10;
  return { word: data.selectedWord, quote: data.sentence, headword: data.selectedWord, phonetic: '', partOfSpeech: '名词', meaning: data.selectedWord === 'resilience' ? '韧性；恢复能力' : river ? '河岸' : '银行',
    usage: data.selectedWord === 'resilience' ? 'Their resilience 是主语，强调他们在挫折后恢复的能力。' : river ? 'river bank 指河岸，位于介词 by 后的名词短语中。' : 'The bank 作主语，指批准贷款的银行。',
    grammar: river ? 'bank 是介词宾语短语的中心名词，river 作名词定语。' : '所选名词是主语的中心词。', collocations: ['show resilience 展现韧性'], contrast: '根据具体语境判断词义，不机械套用第一个释义。', example: 'She showed resilience after the setback.', exampleTranslation: '她在挫折之后表现出了韧性。' };
}
const browser = await chromium.launch({ executablePath: process.env.LEXIDAY_CHROME, headless: true, args: ['--no-sandbox'] });
try {
 const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
 const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
 let calls = 0, mode = 'success', release, announced;
 await context.route('https://api.deepseek.com/chat/completions', async route => {
   calls++; const body = route.request().postDataJSON(), data = JSON.parse(body.messages[1].content);
   assert.deepEqual(Object.keys(data).sort(), ['end', 'selectedWord', 'sentence', 'sentenceTranslation', 'start']);
   assert.equal(data.sentence.slice(data.start, data.end), data.selectedWord);
   assert(!route.request().postData().includes('private-input.docx'));
   const current = mode; mode = 'success';
   if (current === 'delay') { announced(); await new Promise(resolve => { release = resolve; }); }
   if (current === '429') { await route.fulfill({ status: 429, contentType: 'application/json', body: '{}' }); return; }
   const value = explanation(data); if (current === 'wrong') value.quote = 'An unrelated sentence.';
   try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }) }); } catch (e) { if (current !== 'delay') throw e; }
 });
 const navigate = async path => page.evaluate(p => { history.pushState(null, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
 const readState = () => page.evaluate(() => new Promise((resolve, reject) => { const open = indexedDB.open('lexiday-v1'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result; const r = db.transaction('state').objectStore('state').get('main'); r.onsuccess = () => { db.close(); resolve(r.result.value); }; }; }));
 const reader = '/reading/lookup-fixture';
 const openWord = async (word, index = 0) => page.getByRole('button', { name: `查词 ${word}`, exact: true }).nth(index).click();
 const close = async () => page.getByRole('button', { name: 'Close', exact: true }).click();
 const details = () => page.getByRole('button', { name: /^(查看本句用法与知识点|重新获取本句详解)$/ });
 await page.goto('http://127.0.0.1:4173/settings');
 await page.getByLabel('导入备份', { exact: true }).setInputFiles({ name: 'lookup-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, data: state })) });
 await page.getByRole('button', { name: '确认操作', exact: true }).click();
 await page.getByText('备份已恢复', { exact: true }).waitFor();
 await navigate(reader); await page.getByRole('heading', { name: 'Words beyond the list', exact: true }).waitFor();
 assert.equal((await page.locator('.reading-prose').innerText()).replace(/\s+/g, ' ').trim(), articles[0].sentences.map(s => s.english).join(' '));
 await openWord('resilience');
 await page.getByLabel('离线词义').filter({ hasText: /弹|恢复|复原/ }).waitFor();
 assert.equal(calls, 0); assert.equal(await page.getByText('这是界面测试的句子译文。', { exact: true }).count(), 0);
 await page.getByRole('button', { name: '查看本句译文', exact: true }).click();
 await page.getByText('这是界面测试的句子译文。', { exact: true }).waitFor();
 await page.screenshot({ path: `${output}/dictionary-390.png`, animations: 'disabled' });
 await close();
 await openWord('Words'); await page.getByRole('heading', { name: 'Words', exact: true }).waitFor(); await close();
 await page.getByRole('button', { name: '查看 target0 的语境词义', exact: true }).click();
 await page.getByText('已保存的目标词用法。', { exact: true }).waitFor(); await close();
 await navigate('/settings');
 await page.getByLabel('文章生成API密钥', { exact: true }).fill('test-only-not-a-real-key');
 await page.getByRole('checkbox', { name: '同意发送本批词汇并承担API调用费用' }).check();
 await page.getByRole('button', { name: '保存并启用生成', exact: true }).click();
 await page.getByText('配置已保存在本机，自动生成已开启。密钥是否可用将在首次生成时检查。', { exact: true }).waitFor();
 await navigate(reader); await openWord('resilience');
 assert.equal(calls, 0);
 await details().evaluate(button => { button.click(); button.click(); });
 await page.getByText('本句详解 · 可离线查看', { exact: true }).waitFor();
 assert.equal(calls, 1); await page.getByText('韧性；恢复能力', { exact: true }).waitFor();
 for (const width of [320, 390, 430, 1200]) {
   await page.setViewportSize({ width, height: 844 });
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
   assert.equal(await page.locator('.reading-lookup-sheet').evaluate(e => e.scrollWidth > e.clientWidth), false);
   if (width === 390) await page.screenshot({ path: `${output}/context-390.png`, animations: 'disabled' });
 }
 await close(); await openWord('resilience');
 await page.getByText('韧性；恢复能力', { exact: true }).waitFor(); assert.equal(calls, 1); await close();
 await openWord('bank', 0); mode = '429'; await details().click();
 await page.getByRole('alert').filter({ hasText: '过于频繁' }).waitFor();
 assert.equal(calls, 2); await page.getByLabel('离线词义').filter({ hasText: '银行' }).waitFor();
 await details().click(); await page.getByLabel('生词语境解析').getByText('银行', { exact: true }).waitFor(); assert.equal(calls, 3); await close();
 await openWord('bank', 1); assert.equal(await page.getByLabel('生词语境解析').count(), 0);
 mode = 'wrong'; await details().click();
 await page.getByRole('alert').filter({ hasText: '未对应当前单词' }).waitFor(); assert.equal(calls, 4);
 await details().click(); await page.getByLabel('生词语境解析').getByText('河岸', { exact: true }).waitFor(); assert.equal(calls, 5); await close();
 // Closing a slow request must not populate the next word's sheet or persist a stale result.
 await openWord('sustainable'); mode = 'delay'; const started = new Promise(resolve => { announced = resolve; });
 await details().click(); await started; await close(); await openWord('resilience'); release();
 await page.getByText('韧性；恢复能力', { exact: true }).waitFor();
 await page.waitForTimeout(300); assert.equal(calls, 6); await close();
 const saved = await readState();
 assert.equal(saved.reading.batches[0].articles[0].lookups.length, 3);
 assert.equal(saved.words.length, 80); assert.equal(saved.attempts.length, 0); assert.equal(saved.reading.batches.length, 1);
 assert(!JSON.stringify(saved).includes('test-only-not-a-real-key'));
 assert.deepEqual(saved.reading.batches[0].articles.slice(1), articles.slice(1).map(a => ({ ...a, unmatchedWordIds: [] })));
 // Reload under a controlling service worker: new dictionary entries and saved context work offline.
 await page.evaluate(async () => { await navigator.serviceWorker.ready; });
 await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
 await context.setOffline(true); await page.reload();
 await openWord('resilience'); await page.getByText('韧性；恢复能力', { exact: true }).waitFor(); assert.equal(calls, 6);
 await page.evaluate(() => document.documentElement.classList.add('dark'));
 await page.setViewportSize({ width: 390, height: 844 });
 await page.screenshot({ path: `${output}/offline-context-dark-390.png`, animations: 'disabled' });
 await close(); await openWord('sustainable');
 await page.getByLabel('离线词义').filter({ hasText: /持续|支撑|维持/ }).waitFor(); assert.equal(calls, 6); await close();
 await openWord('lexidayunlistedword');
 await page.getByText('本机词典暂未收录，可联网获取这个词在本句中的释义。', { exact: true }).waitFor();
 assert.equal(calls, 6); assert.deepEqual(errors, []);
 console.log('Reading lookup UI passed: ordinary/title taps, offline dictionary, manual context, double-tap dedupe, 429/mismatch handling, two senses in one sentence, abort, persistent offline cache, four widths.');
 console.log('Screenshots:', output);
 await context.close();
} finally { await browser.close(); }
