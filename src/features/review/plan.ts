import type { Attempt, State, Word } from "../../types";
import { isCalendarDate } from "../quiz/selection";

export const DEFAULT_REVIEW_DAYS = [1, 2, 4, 7, 15, 30];
export function localStudyDate(time = Date.now()) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addStudyDays(date: string, days: number) {
  // Calendar arithmetic must not depend on DST or the UTC offset of the device.
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function validReviewDays(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 8 &&
    value.every((day, i) => Number.isInteger(day) && day >= 1 && day <= 365 && (!i || day > value[i - 1]));
}
export const reviewDays = (value: unknown) => validReviewDays(value) ? [...value] : [...DEFAULT_REVIEW_DAYS];
function attemptDay(attempt: Attempt) {
  return attempt.studyDate && isCalendarDate(attempt.studyDate) ? attempt.studyDate : localStudyDate(attempt.time);
}
export function firstStudyDays(state: State, now = Date.now()) {
  const dates = new Map<string, string>();
  const today = localStudyDate(now);
  for (const attempt of state.attempts) {
    if (!Number.isFinite(attempt.time) || attempt.time <= 0 || attempt.time > now) continue;
    const day = attemptDay(attempt);
    if (day > today) continue;
    if (!dates.has(attempt.wordId) || day < dates.get(attempt.wordId)!) dates.set(attempt.wordId, day);
  }
  for (const [id, record] of Object.entries(state.records)) {
    if (record.firstStudyDate && isCalendarDate(record.firstStudyDate) && record.firstStudyDate <= today) {
      // A saved anchor survives time-zone changes and old truncated histories.
      dates.set(id, record.firstStudyDate);
    } else if (!dates.has(id) && Number.isFinite(record.lastReview) && record.lastReview > 0 && record.lastReview <= now) {
      dates.set(id, localStudyDate(record.lastReview));
    }
  }
  return dates;
}
/** Adds calendar labels only; never rewrites mastery, attempts, or nextReview. */
export function initializeReview(state: State, now = Date.now()): State {
  const dates = firstStudyDays(state, now);
  return {
    ...state,
    settings: { ...state.settings, reviewDays: reviewDays(state.settings.reviewDays) },
    records: Object.fromEntries(Object.entries(state.records).map(([id, record]) => [id, {
      ...record, ...(dates.has(id) ? { firstStudyDate: dates.get(id) } : {}),
    }])),
    attempts: state.attempts.map(attempt => Number.isFinite(attempt.time) && attempt.time > 0
      ? { ...attempt, studyDate: attemptDay(attempt) } : attempt),
  };
}
export interface ReviewNode {
  word: Word;
  learnedDate: string;
  dueDate: string;
  stage: number;
  offset: number;
  completedDate?: string;
}
export interface ReviewDayItem extends ReviewNode {
  status: "pending" | "overdue" | "done" | "planned";
  missedNodes: number;
}
export function buildReviewPlan(state: State, now = Date.now()): ReviewNode[] {
  const today = localStudyDate(now), anchors = firstStudyDays(state, now);
  const daily = new Map<string, Map<string, Attempt>>();
  for (const a of state.attempts) {
    if (!Number.isFinite(a.time) || a.time <= 0 || a.time > now) continue;
    const day = attemptDay(a);
    if (day > today) continue;
    const days = daily.get(a.wordId) ?? new Map<string, Attempt>();
    const previous = days.get(day);
    if (!previous || a.time >= previous.time) days.set(day, a);
    daily.set(a.wordId, days);
  }
  const offsets = reviewDays(state.settings.reviewDays);
  return state.words.flatMap(word => {
    const learnedDate = anchors.get(word.id);
    if (!learnedDate) return [];
    const passed = [...(daily.get(word.id)?.entries() ?? [])]
      .filter(([, a]) => a.correct && a.rating === 3).map(([date]) => date).sort();
    return offsets.map((offset, i) => {
      const dueDate = addStudyDays(learnedDate, offset);
      return { word, learnedDate, dueDate, stage: i + 1, offset,
        completedDate: passed.find(date => date >= dueDate) };
    });
  });
}
/** Today includes overdue work; other dates show their originally assigned words. */
export function reviewForDate(plan: ReviewNode[], date: string, today: string): ReviewDayItem[] {
  if (!isCalendarDate(date)) return [];
  const candidates = plan.filter(node => node.dueDate === date || (date === today && node.dueDate < date &&
    (!node.completedDate || node.completedDate === today)));
  const byWord = new Map<string, ReviewNode[]>();
  for (const node of candidates) byWord.set(node.word.id, [...(byWord.get(node.word.id) ?? []), node]);
  return [...byWord.values()].map(nodes => {
    const pending = nodes.filter(node => !node.completedDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const node = pending[0] ?? nodes[nodes.length - 1];
    const status = date > today ? "planned" : node.completedDate ? "done" : node.dueDate < today ? "overdue" : "pending";
    return { ...node, status, missedNodes: pending.filter(n => n.dueDate < today).length } as ReviewDayItem;
  }).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.dueDate.localeCompare(b.dueDate) || a.word.word.localeCompare(b.word.word));
}
