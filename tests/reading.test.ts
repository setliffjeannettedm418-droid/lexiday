import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import type { State, Word, ReadingArticle } from "../src/types";
import { queueReading, initializeReading, learnedWords, pendingWords, containsWord, validateArticle, coverage, validateReadingBackup, generationPayload } from "../src/features/reading/engine";
import { parseCompletion, responseError } from "../src/features/reading/service";

function fixture(count = 170): State {
  const words: Word[] = Array.from({ length: count }, (_, i) => ({ id: `w-${i}`, word: `target${i}`, phonetic: "", commonMeaning: `词义${i}`, rareMeaning: "语境义", usage: "搭配", example: "例句", tags: ["测试"], source: "private-input.docx", createdAt: 0, updatedAt: 0 }));
  return { words, attempts: [], days: [], records: {}, settings: { theme: "light", goal: 30, count: "20", mode: "mixed", rareFirst: true, audio: false, audioVersion: 1, readingAuto: true }, reading: { version: 1, batches: [] } };
}
function studied(state: State, count: number) {
  return { ...state, attempts: state.words.slice(0, count).map((w, i) => ({ id: `a-${i}`, sessionId: "test", wordId: w.id, time: i, correct: false, type: "en", rating: 1 })) };
}
function article(words: Word[]): ReadingArticle {
  return { title: "Test fixture", titleTranslation: "测试材料", sentences: words.map(w => ({ english: `We discussed ${w.word} in class.`, translation: "我们在课堂上讨论了这个词。", structure: "We（主语）+ discussed（谓语）+ 目标词（宾语）。", grammar: "一般过去时；in class 作状语。", pattern: "主语 + discussed + 宾语。", application: "We discussed the plan in class.", applicationTranslation: "我们在课堂上讨论了这个计划。" })), vocabulary: words.map((w, sentence) => ({ wordId: w.id, sentence, meaning: w.commonMeaning, partOfSpeech: "测试词", usage: w.usage, contrast: "仅供程序测试。", example: `Remember ${w.word}.`, exampleTranslation: "记住这个词。" })) };
}

test("79→80 snapshots once; imports and repeated/case-duplicate reviews do not add new words", () => {
  const base = fixture();
  assert.equal(learnedWords(base).length, 0);
  assert.equal(queueReading(studied(base, 79)).reading!.batches.length, 0);
  const queued = queueReading(studied(base, 80), false, 10);
  assert.equal(queued.reading!.batches.length, 1);
  assert.equal(queued.reading!.batches[0].autoEligible, true);
  queued.attempts.push({ ...queued.attempts[0], id: "repeat", time: 100 });
  queued.words.push({ ...base.words[0], id: "alias", word: " TARGET0 " });
  queued.attempts.push({ ...queued.attempts[0], id: "alias-attempt", wordId: "alias", time: 101 });
  assert.equal(learnedWords(queued).length, 80);
  assert.equal(queueReading(queued).reading!.batches.length, 1);
  queued.words[0].commonMeaning = "修改后的词义";
  queued.words[0].tags.push("新增");
  assert.equal(queued.reading!.batches[0].words[0].commonMeaning, "词义0");
  assert.deepEqual(queued.reading!.batches[0].words[0].tags, ["测试"]);
});

test("historical 161 words yield two manual batches and one remaining word, with no repeat migration", () => {
  const previous = studied(fixture(), 161); delete previous.reading;
  const migrated = initializeReading(previous);
  assert.equal(migrated.reading!.batches.length, 2);
  assert(migrated.reading!.batches.every(b => b.status === "pending" && !b.autoEligible));
  assert.equal(pendingWords(migrated).length, 1);
  assert.deepEqual(initializeReading(migrated), migrated);
});

test("coverage requires actual word boundaries, matching sentence anchors and complete analysis", () => {
  const batch = queueReading(studied(fixture(), 80)).reading!.batches[0];
  batch.articles = Array.from({ length: 4 }, (_, i) => validateArticle(article(batch.words.slice(i * 20, i * 20 + 20)), batch.words.slice(i * 20, i * 20 + 20)));
  assert.equal(coverage(batch), 80);
  assert.equal(containsWord("hopeful", "hope"), false);
  assert.equal(containsWord("HOPE,", "hope"), true);
  assert.equal(containsWord("look   after", "look after"), true);
  assert.equal(containsWord("state-of-the-art", "state-of-the-art"), true);
  const targets = batch.words.slice(0, 20);
  const wrong = article(targets); wrong.vocabulary[0].sentence = 1;
  assert.equal(validateArticle(wrong, targets).vocabulary[0].sentence, 0);
  const missing = article(targets); missing.sentences[0].grammar = "";
  assert.throws(() => validateArticle(missing, targets), /完整解析/);
  const incomplete = article(targets); incomplete.vocabulary.pop();
  assert.throws(() => validateArticle(incomplete, targets), /未完整覆盖/);
});

test("interrupted articles persist across database reopen; restore disables paid auto-resume", async () => {
  const { db, saveState, loadState } = await import("../src/db");
  const state = queueReading(studied(fixture(), 80));
  const batch = state.reading!.batches[0];
  batch.articles = [article(batch.words.slice(0, 20))]; batch.status = "generating"; batch.runId = "interrupted";
  await saveState(state); db.close(); await db.open();
  const loaded = await loadState();
  assert.equal(loaded.reading!.batches[0].status, "paused");
  assert.equal(loaded.reading!.batches[0].articles.length, 1);
  assert.equal(loaded.reading!.batches[0].autoEligible, false);
  validateReadingBackup(loaded);
  assert.equal(loaded.reading!.batches[0].runId, undefined);
  loaded.reading!.batches[0].status = "ready";
  assert.throws(() => validateReadingBackup(loaded), /缺少文章/);
  await db.delete();
});

test("generation sends only target vocabulary and rejects truncated or malformed completions", () => {
  const words = fixture().words.slice(0, 20);
  const payload = generationPayload(words, "deepseek-flash");
  const sent = JSON.parse(payload.messages[1].content);
  assert.equal(sent.targetWords.length, 20);
  assert.deepEqual(Object.keys(sent.targetWords[0]).sort(), ["commonMeaning", "id", "rareMeaning", "usage", "word"]);
  assert(!JSON.stringify(payload).includes("private-input.docx"));
  const response = { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(article(words)) } }] };
  assert.equal(parseCompletion(JSON.stringify(response), words).vocabulary.length, 20);
  response.choices[0].finish_reason = "length";
  assert.throws(() => parseCompletion(JSON.stringify(response), words), /未完整结束/);
  assert.throws(() => parseCompletion("not-json", words), /不是有效数据/);
  assert.match(responseError(401), /密钥/); assert.match(responseError(402), /余额/); assert.match(responseError(429), /频繁/);
});

test("a wrong or absent sentence number is repaired from the body; a genuinely absent word preserves the article", () => {
  const words = fixture().words.slice(0, 20);
  words[0].word = "borrow";
  const draft = article(words);
  draft.sentences[0].english = "The factory borrowed money to survive.";
  draft.vocabulary[0].sentence = 999;
  const located = validateArticle(draft, words);
  assert.equal(located.vocabulary[0].sentence, 0);
  assert.deepEqual(located.unmatchedWordIds, []);
  draft.sentences[0].english = "The factory found a new investor.";
  const saved = validateArticle(draft, words);
  assert.equal(saved.title, draft.title);
  assert.equal(saved.sentences.length, 20);
  assert.equal(saved.vocabulary[0].sentence, -1);
  assert.deepEqual(saved.unmatchedWordIds, [words[0].id]);
  const request = JSON.parse(generationPayload(words, "deepseek-flash", saved).messages[1].content);
  assert(request.previousDraft.includes("new investor"));
  assert.deepEqual(request.missingWords, [{ id: words[0].id, word: "borrow" }]);
  assert(!JSON.stringify(request).includes("private-input.docx"));
});

test("saved unmatched vocabulary survives backup/restore without fake completion", () => {
  const state = queueReading(studied(fixture(), 80));
  const b = state.reading!.batches[0];
  b.articles = Array.from({ length: 4 }, (_, i) => article(b.words.slice(i * 20, i * 20 + 20)));
  b.articles[0].sentences[0].english = "This sentence deliberately omits the target.";
  b.status = "ready";
  validateReadingBackup(state);
  assert.equal(coverage(b), 79);
  assert.deepEqual(b.articles[0].unmatchedWordIds, [b.words[0].id]);
  assert.equal(b.articles[0].vocabulary[0].sentence, -1);
  const restored = initializeReading(JSON.parse(JSON.stringify(state)));
  assert.equal(coverage(restored.reading!.batches[0]), 79);
  assert.equal(restored.reading!.batches[0].articles.length, 4);
});
