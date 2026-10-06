import test from "node:test";
import assert from "node:assert/strict";
import { photoPayload, parsePhotoCompletion, MAX_PHOTO_WORDS, type PhotoDraft } from "../src/features/import/photo";
import { mergeImport } from "../src/features/import/parser";
import { recognizePhotos, configureService, clearService, serviceStatus } from "../src/features/reading/service";
import type { State } from "../src/types";

const image = { id: "photo", dataUrl: "data:image/jpeg;base64,AA==", width: 100, height: 200 };
const word = { word: "retain", phonetic: "/rɪˈteɪn/", commonMeaning: "v. 保留", rareMeaning: "保留某状态或权利", usage: "retain control 保持控制", example: "She retained her job.\n她保住了工作。", needsReview: false, reviewNote: "" };
const envelope = (words: unknown[], extra: object = {}, finish = "stop") => JSON.stringify({ choices: [{ finish_reason: finish, message: { content: JSON.stringify({ words, warnings: [], hasMore: false, ...extra }) } }] });

test("photo requests use DeepSeek vision and send only chosen images, without file names or study data", () => {
  const request = photoPayload([image]);
  assert.equal(request.model, "deepseek-flash");
  assert.equal(request.response_format.type, "json_object");
  assert.equal(request.thinking.type, "disabled");
  assert.equal(request.messages[1].role, "user");
  assert.match(JSON.stringify(request.messages[1]), /data:image\/jpeg;base64,AA==/);
  assert.doesNotMatch(JSON.stringify(request), /photo-id|private-file|wordIds|records|attempts|Bearer/);
  assert.throws(() => photoPayload([]));
  assert.throws(() => photoPayload(Array(4).fill(image)));
  assert.throws(() => photoPayload([{ ...image, dataUrl: "https://example.com/private.jpg" }]));
  assert.throws(() => photoPayload([{ ...image, dataUrl: "data:text/html;base64,AA==" }]));
});

test("uncertain handwriting and missing meanings stay unselected; notes and extra-page warnings survive preview", () => {
  const parsed = parsePhotoCompletion(envelope([word, { ...word, word: "contain", needsReview: true, reviewNote: "开头字母不清晰" }, { ...word, word: "sustain", commonMeaning: "" }], { hasMore: true }));
  assert.deepEqual(parsed.drafts.map(d => d.selected), [true, false, false]);
  assert.equal(parsed.drafts[1].reviewNote, "开头字母不清晰");
  assert.equal(parsed.drafts[2].needsReview, true);
  assert.match(parsed.warnings.join(""), /还有未处理生词/);
  assert.deepEqual(parsed.drafts[0].tags, ["AI整理"]);
});

test("duplicate photo entries normalize apostrophes/case, merge details, and keep review requirements", () => {
  const parsed = parsePhotoCompletion(envelope([
    { ...word, word: "one’s own", usage: "on one's own 独立地" },
    { ...word, word: "ONE'S OWN", usage: "of one's own 自己的", needsReview: true, reviewNote: "请核对" },
    { ...word, word: "co?tain" },
  ]));
  assert.equal(parsed.drafts.length, 1);
  assert.equal(parsed.drafts[0].word, "one's own");
  assert.match(parsed.drafts[0].usage!, /on one's own/);
  assert.match(parsed.drafts[0].usage!, /of one's own/);
  assert.equal(parsed.drafts[0].selected, false);
  assert.match(parsed.warnings.join(""), /拼写无法确认/);
});

test("truncated, empty, malformed and refused AI results never become partial imports", () => {
  assert.throws(() => parsePhotoCompletion(envelope([word], {}, "length")), /未完整结束/);
  assert.throws(() => parsePhotoCompletion("{}"), /未完整结束/);
  assert.throws(() => parsePhotoCompletion("not-json"), /无效数据/);
  assert.throws(() => parsePhotoCompletion(envelope([{ word: "retain", commonMeaning: "保留" }])), /缺少必要字段/);
  assert.throws(() => parsePhotoCompletion(envelope(Array(MAX_PHOTO_WORDS + 1).fill(word))), /格式有误/);
  const refused = JSON.parse(envelope([word])); refused.choices[0].message.refusal = "refused";
  assert.throws(() => parsePhotoCompletion(JSON.stringify(refused)), /未完整结束/);
  const empty = parsePhotoCompletion(envelope([]));
  assert.equal(empty.drafts.length, 0);
  assert.match(empty.warnings.join(""), /没有识别到/);
});

test("photo imports use the assigned date and retain existing identity, attempts, reading and mastery", () => {
  const { needsReview: _review, reviewNote: _note, ...fields } = word;
  const old = { id: "existing", ...fields, tags: [], source: "old.docx", createdAt: 1, updatedAt: 2 };
  const state = { words: [old], records: { existing: { wordId: "existing", mastery: 4, correctCount: 5, wrongCount: 1 } }, days: [{ date: "2026-10-01", wordIds: [old.id] }], attempts: [{ id: "attempt", wordId: old.id }], settings: {}, reading: { version: 1, batches: [] } } as unknown as State;
  const drafts = parsePhotoCompletion(envelope([word, { ...word, word: "sustain" }, { ...word, word: "contain", needsReview: true }])).drafts;
  for (const policy of ["merge", "overwrite", "skip"]) {
    const saved = mergeImport(state, drafts, policy, "2026-10-06");
    assert.equal(saved.words.length, 2);
    assert.equal(saved.words[0].id, old.id);
    assert.deepEqual(saved.days[0], state.days[0]);
    assert.equal(saved.days[1].wordIds.length, policy === "skip" ? 1 : 2);
    assert.strictEqual(saved.records, state.records);
    assert.strictEqual(saved.attempts, state.attempts);
    assert.strictEqual(saved.reading, state.reading);
    assert.ok(!JSON.stringify(saved).includes("data:image"));
    assert.ok(!JSON.stringify(saved).includes("needsReview"));
  }
  assert.equal(state.words.length, 1);
  assert.equal(state.days.length, 1);
});

test("photo service reuses the existing DeepSeek key, forces Flash, respects cancellation and never retries", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    await configureService("test-key-not-a-real-secret", "deepseek-v4-pro");
    globalThis.fetch = async (_url, options) => {
      calls++;
      assert.equal(String(_url), "https://api.deepseek.com/chat/completions");
      assert.equal(JSON.parse(String(options?.body)).model, "deepseek-flash");
      assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer test-key-not-a-real-secret");
      return new Response(envelope([word]));
    };
    assert.equal((await recognizePhotos([image], "success", new AbortController().signal)).drafts[0].word, "retain");
    assert.equal((await serviceStatus()).model, "deepseek-v4-pro");
    const stopped = new AbortController(); stopped.abort();
    await assert.rejects(recognizePhotos([image], "before", stopped.signal), { name: "AbortError" });
    assert.equal(calls, 1);
    globalThis.fetch = async () => { calls++; return new Response("", { status: 429 }); };
    await assert.rejects(recognizePhotos([image], "rate-limit", new AbortController().signal), /过于频繁/);
    assert.equal(calls, 2);
    const pending = new AbortController();
    globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError"))));
    const waiting = recognizePhotos([image], "cancel", pending.signal);
    pending.abort(); await assert.rejects(waiting, { name: "AbortError" });
  } finally { globalThis.fetch = original; await clearService(); }
});
