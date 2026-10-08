import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'Element', 'DocumentFragment', 'Node', 'Event', 'MutationObserver', 'getComputedStyle']) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const { createRoot } = await import('react-dom/client');
const { default: ImportPage } = await import('../src/screens/Import.tsx');
const { parseFile, mergeImport } = await import('../src/features/import/parser.ts');
const { defaults } = await import('../src/db/index.ts');
const state = { words: [], records: {}, days: [], attempts: [], settings: defaults };
const file = (word, tags = []) => new File([JSON.stringify([{ word, commonMeaning: '测试释义', tags }])], word + '.json');
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function mount(save = async () => {}) {
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element); const routes = [];
  await act(async () => root.render(createElement(ImportPage, { state, save, go: p => routes.push(p) })));
  return { element, routes, async close() { await act(async () => root.unmount()); element.remove(); } };
}
async function upload(ui, selectedFile) {
  const input = ui.element.querySelector('[aria-label="上传词表"]');
  Object.defineProperty(input, 'files', { value: [selectedFile], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function drop(ui, selectedFile) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [selectedFile] } });
  await act(async () => ui.element.querySelector('.upload-zone').dispatchEvent(event));
}

test('JSON tag text and arrays import as deduplicated tag arrays', async () => {
  const drafts = await parseFile(file('apple', ' 考研，复习;考研 '));
  const imported = mergeImport(state, drafts, 'merge', '2026-10-08');
  assert.deepEqual(imported.words[0].tags, ['考研', '复习']);
  assert.deepEqual((await parseFile(file('pear', ['考研', ' 考研 ', ''])))[0].tags, ['考研']);
});

test('invalid import dates cannot create unreachable daily lists', () => {
  const draft = [{ word: 'apple', commonMeaning: '苹果', selected: true }];
  for (const date of ['', 'x', '2026-02-29', '0000-01-01']) assert.throws(() => mergeImport(state, draft, 'merge', date), /日期/);
  assert.equal(mergeImport(state, draft, 'merge', '2028-02-29').days[0].date, '2028-02-29');
});

test('skip duplicates leaves existing content and modification time untouched', () => {
  const imported = mergeImport(state, [{ word: 'apple', commonMeaning: '苹果', selected: true }], 'merge', '2026-10-08');
  imported.words[0].updatedAt = 123;
  const result = mergeImport(imported, [{ word: 'APPLE', commonMeaning: '新义', selected: true }], 'skip', '2026-10-09');
  assert.deepEqual(result.words, imported.words);
  assert.deepEqual(result.days, imported.days);
});

test('an older slow file cannot overwrite the latest import preview', async () => {
  const ui = await mount(); const gate = defer();
  const older = { name: 'older.json', size: 50, text: () => gate.promise };
  try {
    await drop(ui, older);
    await drop(ui, file('latest'));
    assert.match(ui.element.textContent, /latest.json/);
    await act(async () => gate.resolve(JSON.stringify([{ word: 'older', commonMeaning: '旧文件' }])));
    assert.match(ui.element.textContent, /latest.json/);
    assert.equal(ui.element.querySelector('textarea[aria-label="word 1"]').value, 'latest');
  } finally { await ui.close(); }
});

test('file selection clears the native input so the same file can be selected after an error', async () => {
  const ui = await mount();
  try {
    const input = ui.element.querySelector('[aria-label="上传词表"]'); let current = 'C:\\fakepath\\invalid.json';
    Object.defineProperty(input, 'value', { get: () => current, set: v => { current = v; }, configurable: true });
    await upload(ui, new File(['invalid'], 'invalid.json'));
    assert.equal(current, '');
    assert(ui.element.querySelector('[role=alert]'));
  } finally { await ui.close(); }
});

test('an import completing after leaving its screen saves data without forcing navigation', async () => {
  const gate = defer(); let saved;
  const ui = await mount(async update => { saved = update(state); await gate.promise; });
  await upload(ui, file('apple'));
  await act(async () => [...ui.element.querySelectorAll('button')].find(b => b.textContent.includes('确认导入')).click());
  assert.equal(saved.words[0].word, 'apple');
  await ui.close();
  await act(async () => gate.resolve());
  assert.deepEqual(ui.routes, []);
});

test('confirmation locks the preview until saving finishes and ignores repeated confirmation', async () => {
  const gate = defer(); let calls = 0;
  const ui = await mount(async () => { calls++; await gate.promise; });
  try {
    await upload(ui, file('apple'));
    const confirm = [...ui.element.querySelectorAll('button')].find(b => b.textContent.includes('确认导入'));
    await act(async () => { confirm.click(); confirm.click(); });
    assert.equal(calls, 1);
    assert(ui.element.querySelector('[aria-label="词表日期"]').matches(':disabled'));
    assert(ui.element.querySelector('[aria-label="word 1"]').matches(':disabled'));
    const cancel = [...ui.element.querySelectorAll('button')].find(b => b.textContent.includes('取消导入'));
    assert(cancel.matches(':disabled'));
    await act(async () => cancel.click());
    assert(ui.element.querySelector('[aria-label="word 1"]'));
    await act(async () => gate.resolve());
    assert.equal(ui.routes.length, 1);
  } finally { await ui.close(); }
});
