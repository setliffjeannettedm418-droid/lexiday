import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { dictionaryCandidates, readingTokens } from "../src/features/reading/matcher";
import { cacheLookup, dictionaryBucket, lookupDictionary, lookupPayload, parseLookupCompletion, sameLookup, type LookupSelection } from "../src/features/reading/lookup";
import { initializeReading, validateArticle, validateReadingBackup } from "../src/features/reading/engine";
import type { ReadingArticle, ReadingLookup, ReadingWordExplanation, State, Word } from "../src/types";

const selection: LookupSelection = { surface: "bank", start: 4, sentence: "The bank stood beside the river.", translation: "银行位于河边。" };
const explanation: ReadingWordExplanation = { word: "bank", quote: selection.sentence, headword: "bank", phonetic: "/bæŋk/", partOfSpeech: "名词", meaning: "银行", usage: "the bank 是主语。", grammar: "bank 是主语的中心名词。", collocations: ["a bank account 银行账户"], contrast: "bank 也可以指河岸；结合上下文区分。", example: "She opened a bank account.", exampleTranslation: "她开立了银行账户。" };
const completion = (value: unknown) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
function fixture(): State {
  const words: Word[] = Array.from({ length: 80 }, (_, i) => ({ id: `w${i}`, word: `target${i}`, phonetic: "", commonMeaning: "测试词", rareMeaning: "", usage: "测试", example: "例句", tags: [], source: "private.docx", createdAt: 0, updatedAt: 0 }));
  const article: ReadingArticle = { title: "A new word", titleTranslation: "一个新词", sentences: [{ english: selection.sentence, translation: selection.translation, structure: "主谓结构", grammar: "一般过去时", pattern: "主语加谓语", application: "A tree stood beside the river.", applicationTranslation: "河边有一棵树。" }], vocabulary: words.slice(0, 20).map(w => ({ wordId: w.id, sentence: -1, partOfSpeech: "名词", meaning: "测试", usage: "测试", contrast: "测试", example: "Test.", exampleTranslation: "测试。" })) };
  return { words, records: {}, attempts: [], days: [], settings: { theme: "light", goal: 30, count: "20", mode: "en", rareFirst: false, audio: false }, reading: { version: 1, batches: [{ id: "batch", words, createdAt: 0, articles: [article], status: "paused", autoEligible: false }] } };
}

test("ordinary word taps keep exact offsets, apostrophes, hyphens and Unicode surfaces", () => {
  const text = "“Children’s well-being”—Ｆｉｎａｌｌｙ, they can't wait.";
  const tokens = readingTokens(text);
  assert.deepEqual(tokens.map(t => t.surface), ["Children’s", "well-being", "Ｆｉｎａｌｌｙ", "they", "can't", "wait"]);
  for (const token of tokens) assert.equal(text.slice(token.start, token.end), token.surface);
  assert(dictionaryCandidates("Children’s").includes("child"));
  assert(dictionaryCandidates("Written").includes("write"));
  assert(dictionaryCandidates("ＷＲＩＴＴＥＮ").includes("write"));
});

test("bundled dictionary integrity and real lookup work without external requests", async () => {
  const metadata = JSON.parse(fs.readFileSync("public/dictionary/metadata.json", "utf8"));
  let count = 0;
  for (const [name, expected] of Object.entries(metadata.shards)) {
    const bytes = fs.readFileSync(`public/dictionary/${name}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
    const shard = JSON.parse(bytes.toString()); count += Object.keys(shard).length;
    for (const word of Object.keys(shard)) assert.equal(dictionaryBucket(word) + ".json", name);
  }
  assert.equal(count, metadata.entries); assert(count > 300000);
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = (async (path: string) => {
    assert.match(path, /^\/dictionary\/[0-9a-f]{2}\.json$/);
    return new Response(fs.readFileSync("public" + path));
  }) as typeof fetch;
  try {
    assert.match((await lookupDictionary("bank"))!.meaning, /银行/);
    assert.match((await lookupDictionary("resilience"))!.meaning, /弹|恢复|复原/);
    assert(await lookupDictionary("children"));
    assert.equal(await lookupDictionary("lexidayunlistedword"), null);
    assert.equal(await lookupDictionary("__proto__"), null);
  } finally { globalThis.fetch = fetchBefore; }
});

test("context requests disclose only the selected word and sentence; incomplete or mismatched results are rejected", () => {
  const payload = lookupPayload({ ...selection, grammar: "private stored analysis" }, "deepseek-flash");
  const sent = JSON.parse(payload.messages[1].content);
  assert.deepEqual(Object.keys(sent).sort(), ["end", "selectedWord", "sentence", "sentenceTranslation", "start"]);
  assert.equal(sent.sentence.slice(sent.start, sent.end), "bank");
  assert(!JSON.stringify(payload).includes("private stored analysis"));
  assert.deepEqual(parseLookupCompletion(completion(explanation), selection), explanation);
  assert.throws(() => parseLookupCompletion(completion({ ...explanation, word: "river" }), selection));
  assert.throws(() => parseLookupCompletion(completion({ ...explanation, quote: "A different sentence." }), selection));
  assert.throws(() => parseLookupCompletion(completion({ ...explanation, grammar: "" }), selection));
  assert.throws(() => parseLookupCompletion('{"choices":[{"finish_reason":"length"}]}', selection));
});

test("per-occurrence caches survive upgrades and backups without changing learning counts or reusing other contexts", () => {
  const state = fixture();
  const entry: ReadingLookup = { surface: selection.surface, start: selection.start, sentence: selection.sentence, explanation, createdAt: 1 };
  const saved = cacheLookup(state, "batch", 0, entry);
  assert.equal(saved.attempts, state.attempts); assert.equal(saved.words, state.words);
  assert.equal(saved.reading!.batches[0].articles[0].lookups!.length, 1);
  assert.equal(state.reading!.batches[0].articles[0].lookups, undefined);
  assert.equal(cacheLookup(saved, "batch", 0, entry).reading!.batches[0].articles[0].lookups!.length, 1);
  const otherSentence = { ...selection, sentence: "The bank of the river was muddy." };
  assert.equal(sameLookup(entry, otherSentence), false);
  assert.equal(sameLookup(entry, { ...selection, start: 12 }), false);
  const restored = initializeReading(JSON.parse(JSON.stringify(saved)));
  validateReadingBackup(restored);
  assert.deepEqual(restored.reading!.batches[0].articles[0].lookups, [entry]);
  const changed = { ...restored.reading!.batches[0].articles[0], sentences: [{ ...restored.reading!.batches[0].articles[0].sentences[0], english: otherSentence.sentence }] };
  assert.deepEqual(validateArticle(changed, state.words.slice(0, 20)).lookups, []);
  assert.equal(cacheLookup(saved, "batch", 0, { ...entry, sentence: "not in article" }).reading!.batches[0].articles[0].lookups!.length, 1);
});
