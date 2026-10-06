import test from "node:test";
import assert from "node:assert/strict";
import type { State, Word } from "../src/types";
import {
  dateSelectionError,
  isCalendarDate,
  quizDays,
  selectQuizWords,
} from "../src/features/quiz/selection";
import { scheduler } from "../src/features/review/scheduler";

const words: Word[] = ["alpha", "beta", "gamma", "delta", "epsilon"].map(
  (word, i) => ({
    id: String(i),
    word,
    phonetic: "",
    commonMeaning: `释义${i}`,
    rareMeaning: i === 1 ? "僻义" : "",
    usage: i === 2 ? "用法" : "",
    example: "",
    tags: [],
    source: "fixture",
    createdAt: Date.UTC(2024, 0, 1),
    updatedAt: Date.UTC(2024, 0, 1),
  }),
);
const state: State = {
  words,
  records: {},
  attempts: [],
  settings: {
    theme: "light",
    goal: 30,
    count: "20",
    mode: "mixed",
    rareFirst: true,
    audio: false,
  },
  days: [
    { date: "2026-10-01", wordIds: ["1", "2", "missing"] },
    { date: "2026-09-30", wordIds: ["0", "1", "1"] },
    { date: "2026-10-03", wordIds: ["3"] },
    { date: "2026-10-01", wordIds: ["2", "3"] },
    { date: "2026-02-30", wordIds: ["4"] },
    { date: "2026-09-29", wordIds: ["deleted"] },
  ],
};
const options = {
  scope: "dates",
  mode: "mixed",
  today: "2026-10-01",
  dates: { kind: "days" as const, dates: ["2026-09-30"] },
};
const ids = (list: Word[]) => list.map((word) => word.id);

test("quiz dates use assigned word-list dates, merge duplicate days, ignore deleted words, and sort newest first", () => {
  assert.deepEqual(quizDays(state), [
    { date: "2026-10-03", wordIds: ["3"] },
    { date: "2026-10-01", wordIds: ["1", "2", "3"] },
    { date: "2026-09-30", wordIds: ["0", "1"] },
  ]);
  assert.deepEqual(ids(selectQuizWords(state, options)), ["0", "1"]);
  assert.deepEqual(
    ids(selectQuizWords(state, { ...options, scope: "today" })),
    ["1", "2", "3"],
  );
  assert.equal(quizDays({ ...state, days: [] }).length, 0);
});

test("multiple nonadjacent dates deduplicate words without including the dates between them", () => {
  const before = JSON.stringify(state);
  assert.deepEqual(
    ids(
      selectQuizWords(state, {
        ...options,
        dates: {
          kind: "days",
          dates: ["2026-09-30", "2026-10-03", "2026-09-30"],
        },
      }),
    ),
    ["0", "1", "3"],
  );
  assert.deepEqual(
    ids(
      selectQuizWords(state, {
        ...options,
        dates: { kind: "days", dates: ["2026-09-30", "2026-10-01"] },
      }),
    ),
    ["0", "1", "2", "3"],
  );
  assert.deepEqual(
    selectQuizWords(state, { ...options, dates: { kind: "days", dates: [] } }),
    [],
  );
  assert.deepEqual(
    selectQuizWords(state, {
      ...options,
      dates: { kind: "days", dates: ["2026-10-02"] },
    }),
    [],
  );
  assert.equal(JSON.stringify(state), before);
});

test("date ranges include both calendar boundaries, reject reversed/incomplete/invalid dates, and cross months and years", () => {
  const range = (from: string, to: string) =>
    selectQuizWords(state, { ...options, dates: { kind: "range", from, to } });
  assert.deepEqual(ids(range("2026-09-30", "2026-10-01")), [
    "0",
    "1",
    "2",
    "3",
  ]);
  assert.deepEqual(ids(range("2026-09-30", "2026-09-30")), ["0", "1"]);
  assert.deepEqual(ids(range("2025-12-31", "2027-01-01")), [
    "0",
    "1",
    "2",
    "3",
  ]);
  for (const [from, to] of [
    ["2026-10-03", "2026-09-30"],
    ["", "2026-10-01"],
    ["2026-02-30", "2026-10-01"],
    ["2026-10-02", "2026-10-02"],
  ])
    assert.deepEqual(range(from, to), []);
  assert(isCalendarDate("2024-02-29"));
  assert(!isCalendarDate("2026-02-29"));
  assert(!isCalendarDate("2026-9-30"));
  assert(
    dateSelectionError({ kind: "range", from: "2026-10-02", to: "2026-10-01" }),
  );
});

test("date pool respects question eligibility; single-word and existing scopes keep their behavior", () => {
  assert.deepEqual(ids(selectQuizWords(state, { ...options, mode: "rare" })), [
    "1",
  ]);
  assert.deepEqual(selectQuizWords(state, { ...options, mode: "usage" }), []);
  assert.deepEqual(ids(selectQuizWords(state, { ...options, wordId: "4" })), [
    "4",
  ]);
  assert.deepEqual(ids(selectQuizWords(state, { ...options, scope: "all" })), [
    "0",
    "1",
    "2",
    "3",
    "4",
  ]);
  assert.deepEqual(ids(selectQuizWords(state, { ...options, scope: "rare" })), [
    "1",
  ]);
  const reviewed = {
    ...state,
    records: { "0": scheduler.review(undefined, "0", false, 1, "en", 1000) },
  };
  assert.deepEqual(
    ids(selectQuizWords(reviewed, { ...options, scope: "mistakes" })),
    ["0"],
  );
  assert.deepEqual(
    ids(selectQuizWords(reviewed, { ...options, scope: "due" }, 302000)),
    ["0"],
  );
  assert.deepEqual(
    selectQuizWords(reviewed, { ...options, scope: "due" }, 2000),
    [],
  );
  assert.deepEqual(ids(selectQuizWords(state, { ...options, scope: "weak" })), [
    "0",
    "1",
    "2",
    "3",
    "4",
  ]);
});
