import test from "node:test";
import assert from "node:assert/strict";
import { addStudyDays, buildReviewPlan, DEFAULT_REVIEW_DAYS, firstStudyDays, initializeReview, localStudyDate, reviewDays, reviewForDate, validReviewDays } from "../src/features/review/plan";
import type { Attempt, State, StudyRecord, Word } from "../src/types";
const time = (date: string, hour = 12) => new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).getTime();
const TODAY = "2026-10-11", now = time(TODAY, 23);
const word = (id: string): Word => ({ id, word: id, phonetic: "", commonMeaning: id, rareMeaning: "", usage: "", example: "", tags: [], source: "fixture", createdAt: 1, updatedAt: 1 });
const record = (date: string): StudyRecord => ({ wordId: "a", mastery: 3, correctCount: 2, wrongCount: 1, lastReview: time(date), nextReview: time("2026-10-20"), lastResult: true, streakCorrect: 1, streakWrong: 0, lastWrong: 1, wrongType: "en", rareCorrect: 0, rareTotal: 0 });
const attempt = (id: string, date: string, correct = true, hour = 12): Attempt => ({ id: `${id}-${date}-${hour}`, wordId: id, sessionId: "fixture", time: time(date, hour), correct, type: "en", rating: correct ? 3 : 1 });
const make = (): State => ({ words: [word("a"), word("b"), word("unlearned")], records: {}, attempts: [], days: [{ date: "2026-09-01", wordIds: ["a", "b", "unlearned"] }], settings: { theme: "light", goal: 30, count: "20", mode: "en", rareFirst: false, audio: false } });

test("calendar offsets are measured from first learning, not repeated gaps or import dates", () => {
  const s = make(); s.attempts = [attempt("a", "2026-10-11")];
  assert.deepEqual(buildReviewPlan(s, now).map(n => n.dueDate), ["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-18", "2026-10-26", "2026-11-10"]);
  assert.equal(buildReviewPlan(s, now).some(n => n.word.id === "unlearned"), false);
  assert.equal(localStudyDate(time(TODAY)), TODAY);
});
test("calendar arithmetic handles leap years, month/year rollover and DST dates", () => {
  assert.equal(addStudyDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addStudyDays("2025-02-28", 1), "2025-03-01");
  assert.equal(addStudyDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addStudyDays("2026-03-07", 2), "2026-03-09");
  assert.equal(addStudyDays("2026-11-01", -1), "2026-10-31");
});
test("overdue nodes and different cohorts merge into one daily entry per word", () => {
  const s = make(); s.attempts = [attempt("a", "2026-10-04"), attempt("b", "2026-10-10")];
  const items = reviewForDate(buildReviewPlan(s, now), TODAY, TODAY);
  assert.equal(items.length, 2); assert.equal(items[0].word.id, "a");
  assert.equal(items[0].status, "overdue"); assert.equal(items[0].missedNodes, 3);
  assert.equal(items[1].status, "pending");
  assert.equal(reviewForDate(buildReviewPlan(s, now), "2026-10-18", TODAY).length, 0);
});
test("correct review completes arrived nodes together but cannot complete future nodes", () => {
  const s = make(); s.attempts = [attempt("a", "2026-10-04"), attempt("a", TODAY, true, 14), attempt("a", TODAY, true, 15)];
  const plan = buildReviewPlan(s, now);
  assert.deepEqual(plan.map(n => n.completedDate), [TODAY, TODAY, TODAY, TODAY, undefined, undefined]);
  const items = reviewForDate(plan, TODAY, TODAY);
  assert.equal(items.length, 1); assert.equal(items[0].status, "done");
  assert.equal(reviewForDate(plan, "2026-10-19", TODAY)[0].status, "planned");
  assert.equal(reviewForDate(plan, "2026-10-05", TODAY)[0].completedDate, TODAY);
});
test("wrong, revealed and uncertain outcomes stay pending; later correct clears them", () => {
  const s = make(); s.attempts = [attempt("a", "2026-10-10"), attempt("a", TODAY, false)];
  assert.equal(reviewForDate(buildReviewPlan(s, now), TODAY, TODAY)[0].status, "pending");
  s.attempts.push({ ...attempt("a", TODAY, true, 13), rating: 2 });
  assert.equal(reviewForDate(buildReviewPlan(s, now), TODAY, TODAY)[0].status, "pending");
  s.attempts.push(attempt("a", TODAY, true, 14));
  assert.equal(reviewForDate(buildReviewPlan(s, now), TODAY, TODAY)[0].status, "done");
});
test("latest answer of a day wins and attempt order does not change the outcome", () => {
  const s = make(); s.attempts = [attempt("a", "2026-10-10"), attempt("a", TODAY, false, 18), attempt("a", TODAY, true, 12)];
  assert.equal(buildReviewPlan(s, now)[0].completedDate, undefined);
  s.attempts.push(attempt("a", TODAY, true, 19));
  assert.equal(buildReviewPlan(s, now)[0].completedDate, TODAY);
});
test("legacy migration preserves scores and stable calendar labels across reload and backup", () => {
  const s = make(); s.records = { a: record("2026-10-10"), b: { ...record("2026-10-07"), wordId: "b" } };
  s.attempts = [attempt("a", "2026-10-04"), attempt("a", "2026-10-10")];
  const before = structuredClone(s), migrated = initializeReview(s, now);
  assert.deepEqual(s, before);
  assert.equal(migrated.records.a.firstStudyDate, "2026-10-04");
  assert.equal(migrated.records.b.firstStudyDate, "2026-10-07");
  for (const id of ["a", "b"]) { const { firstStudyDate, ...rest } = migrated.records[id]; assert.deepEqual(rest, s.records[id]); }
  assert.deepEqual(migrated.words, s.words); assert.deepEqual(migrated.days, s.days);
  assert.deepEqual(initializeReview(JSON.parse(JSON.stringify(migrated)), now), migrated);
  assert.deepEqual(migrated.settings.reviewDays, DEFAULT_REVIEW_DAYS);
  const tz = { ...migrated, attempts: migrated.attempts.map(a => ({ ...a, time: a.time + 12 * 3600000 })) };
  assert.equal(firstStudyDays(tz, time("2026-10-15")).get("a"), "2026-10-04");
});
test("deleting words or clearing history removes their plans; future and malformed events are ignored", () => {
  const s = make(); s.attempts = [attempt("deleted", "2026-10-01"), attempt("a", "2026-10-20"), { ...attempt("b", TODAY), time: NaN }];
  assert.deepEqual(buildReviewPlan(s, now), []);
  s.attempts = [attempt("a", "2026-10-01")]; assert.equal(buildReviewPlan(s, now).length, 6);
  s.attempts = []; s.records = {}; assert.deepEqual(buildReviewPlan(s, now), []);
});
test("custom days validate and replan without modifying history", () => {
  for (const invalid of [[], [0], [1, 1], [2, 1], [1.5], [366], "1,2", null, [1, 2, 3, 4, 5, 6, 7, 8, 9]]) {
    assert.equal(validReviewDays(invalid), false); assert.deepEqual(reviewDays(invalid), DEFAULT_REVIEW_DAYS);
  }
  const s = make(); s.settings.reviewDays = [1, 3, 10]; s.attempts = [attempt("a", "2026-10-10")];
  assert.deepEqual(buildReviewPlan(s, now).map(n => n.dueDate), [TODAY, "2026-10-13", "2026-10-20"]);
  assert.deepEqual(reviewForDate(buildReviewPlan(s, now), "2026-02-30", TODAY), []);
});
