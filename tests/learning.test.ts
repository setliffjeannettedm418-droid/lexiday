import test from "node:test";
import assert from "node:assert/strict";
import { scheduler } from "../src/features/review/scheduler";
import { question } from "../src/features/quiz/engine";
import {
  fromRows,
  fromWordCards,
  mergeImport,
  parseFile,
} from "../src/features/import/parser";
import seed from "../src/db/seed.json";
import type { State, Word } from "../src/types";
import "fake-indexeddb/auto";
const words = seed.map((w, i) => ({
  ...w,
  id: String(i),
  createdAt: 0,
  updatedAt: 0,
  tags: [],
})) as Word[];
const state: State = {
  words,
  records: {},
  days: [],
  attempts: [],
  settings: {
    theme: "light",
    goal: 30,
    count: "20",
    mode: "mixed",
    rareFirst: true,
    audio: false,
  },
};
test("wrong + mastered never grants mastery; three confident correct answers progress 2/3/4", () => {
  let r = scheduler.review(undefined, "1", false, 3, "rare", 1000);
  assert.equal(r.mastery, 1);
  assert.equal(r.wrongCount, 1);
  assert.equal(r.nextReview, 301000);
  for (const level of [2, 3, 4]) {
    r = scheduler.review(r, "1", true, 3, "rare", 2000);
    assert.equal(r.mastery, level);
  }
  assert.equal(r.correctCount, 3);
  assert.equal(r.rareTotal, 4);
  assert.equal(r.rareCorrect, 3);
  r = scheduler.review(r, "1", true, 2, "en");
  assert.equal(r.mastery, 2);
  assert.equal(r.streakCorrect, 0);
});
test("all seven quiz types have valid unique options; small pools fall back to spelling", () => {
  for (const mode of ["mixed", "en", "zh", "rare", "usage", "spell", "judge"])
    for (let i = 0; i < 80; i++) {
      const q = question(words[i % words.length], words, mode, true);
      if (q.type === "spell") assert.equal(q.options.length, 0);
      else {
        assert.equal(q.options.length, q.type === "judge" ? 2 : 4);
        assert.equal(new Set(q.options).size, q.options.length);
        assert(q.options.includes(q.answer));
      }
    }
  assert.equal(question(words[0], [words[0]], "en", false).type, "spell");
});
test("Chinese aliases and numbered words normalize without changing meanings", () => {
  const rows = fromRows([
    [
      "单词 / 短语",
      "音标",
      "常见意思",
      "考研熟词僻义 / 语境义",
      "常用搭配与用法",
    ],
    ["1. material", "/x/", "材料", "重要的", "material evidence"],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].word, "material");
  assert.equal(rows[0].rareMeaning, "重要的");
});
test("formatted Word study cards map core meaning, exam point and collocations", () => {
  const rows = fromWordCards([
    [
      "01. prone\n/proʊn/\nadj.",
      "核心义 易于……的；有……倾向的\n考研点 高频结构 be prone to + n./doing\n搭配 be prone to error 容易出错",
    ],
    ["移民语义链", "immigrants → settlers"],
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    {
      word: rows[0].word,
      phonetic: rows[0].phonetic,
      commonMeaning: rows[0].commonMeaning,
      rareMeaning: rows[0].rareMeaning,
      usage: rows[0].usage,
    },
    {
      word: "prone",
      phonetic: "/proʊn/",
      commonMeaning: "易于……的；有……倾向的",
      rareMeaning: "高频结构 be prone to + n./doing",
      usage: "be prone to error 容易出错",
    },
  );
});
test("merge, overwrite, skip preserve identity and daily list uniqueness", () => {
  const w = words[0];
  const d = {
    word: w.word.toUpperCase(),
    commonMeaning: "新义",
    rareMeaning: "新僻义",
    selected: true,
  };
  const merged = mergeImport(state, [d, d], "merge", "2026-09-08");
  assert.equal(merged.words.length, state.words.length);
  assert.equal(merged.days[0].wordIds.length, 1);
  assert(merged.words[0].commonMeaning.includes("新义"));
  assert.equal(state.words[0].commonMeaning, w.commonMeaning);
  assert.equal(
    mergeImport(state, [d], "overwrite", "x").words[0].commonMeaning,
    "新义",
  );
  assert.equal(mergeImport(state, [d], "skip", "x").days.length, 0);
});
test("CSV UTF8, XLSX multi-sheet, JSON aliases roundtrip", async () => {
  const csv = new File(
    ["单词,常见意思,熟词僻义\nprobe,探测,调查"],
    "words.csv",
  );
  assert.equal((await parseFile(csv))[0].rareMeaning, "调查");
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["单词", "常见意思"],
      ["probe", "探测"],
    ]),
    "Day1",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["word", "common"],
      ["test", "测试"],
    ]),
    "Day2",
  );
  const file = new File(
    [XLSX.write(wb, { type: "array", bookType: "xlsx" })],
    "words.xlsx",
  );
  assert.equal((await parseFile(file)).length, 2);
  assert.equal(
    (
      await parseFile(
        new File(
          [
            JSON.stringify([
              { word: "probe", common: "探测", rare_meaning: "调查" },
            ]),
          ],
          "words.json",
        ),
      )
    )[0].rareMeaning,
    "调查",
  );
  await assert.rejects(() => parseFile(new File(["bad"], "bad.json")));
});
test("IndexedDB state persists after close/reopen", async () => {
  const { db, saveState, loadState } = await import("../src/db");
  await saveState(state);
  db.close();
  await db.open();
  const migrated = await loadState();
  assert.equal(migrated.words.length, 153);
  assert.equal(migrated.settings.audio, true);
  assert.equal(migrated.settings.audioVersion, 1);
  assert.deepEqual(migrated.records, state.records);
  migrated.settings.audio = false;
  await saveState(migrated);
  assert.equal((await loadState()).settings.audio, false);
  await db.delete();
});
test("10k import remains deduplicated", () => {
  const draft = Array.from({ length: 10000 }, (_, i) => ({
    word: "vocab" + i,
    commonMeaning: "词义" + i,
    selected: true,
  }));
  const begin = performance.now();
  const a = mergeImport({ ...state, words: [] }, draft, "merge", "2026-09-08");
  assert.equal(a.words.length, 10000);
  assert.equal(new Set(a.days[0].wordIds).size, 10000);
  console.log("10k import ms", Math.round(performance.now() - begin));
});

test("reinforcement only selects reviewed weak words and stops once mastered", async () => {
  const { reinforcementWords } =
    await import("../src/features/review/scheduler");
  const r = scheduler.review(undefined, words[0].id, false, 1, "rare");
  assert.equal(
    reinforcementWords(words, { [words[0].id]: r }, [words[0].id, words[0].id])
      .length,
    1,
  );
  r.mastery = 3;
  assert.equal(
    reinforcementWords(words, { [words[0].id]: r }, [words[0].id]).length,
    0,
  );
});

test("10k-word quiz generation stays bounded for diverse vocabulary", () => {
  const large = Array.from({ length: 10000 }, (_, i) => ({
    ...words[i % words.length],
    id: String(i),
    word: "word" + i,
    commonMeaning: "释义" + i,
    rareMeaning: "语境" + i,
  }));
  const begin = performance.now();
  const questions = large.map((w) => question(w, large, "en", true));
  assert.equal(questions.length, 10000);
  assert(questions.every((q) => q.options.length === 4));
  console.log("10k questions ms", Math.round(performance.now() - begin));
});
