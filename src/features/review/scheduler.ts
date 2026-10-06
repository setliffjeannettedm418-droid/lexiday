import type { StudyRecord } from "../../types";
export interface ReviewScheduler {
  review(
    previous: StudyRecord | undefined,
    wordId: string,
    correct: boolean,
    rating: number,
    type: string,
    now?: number,
  ): StudyRecord;
  priority(record: StudyRecord | undefined, rare: boolean): number;
}
export const scheduler: ReviewScheduler = {
  review(p, id, correct, rating, type, now = Date.now()) {
    const streak = correct && rating === 3 ? (p?.streakCorrect || 0) + 1 : 0;
    const mastery =
      !correct || rating === 1 ? 1 : rating === 2 ? 2 : Math.min(4, streak + 1);
    return {
      wordId: id,
      correctCount: (p?.correctCount || 0) + Number(correct),
      wrongCount: (p?.wrongCount || 0) + Number(!correct),
      mastery,
      lastReview: now,
      nextReview:
        now +
        (!correct || rating === 1
          ? 5 * 60000
          : rating === 2
            ? 6 * 3600000
            : [0, 0, 86400000, 3 * 86400000, 7 * 86400000][mastery]),
      lastResult: correct,
      streakCorrect: streak,
      streakWrong: correct ? 0 : (p?.streakWrong || 0) + 1,
      lastWrong: correct ? p?.lastWrong || 0 : now,
      wrongType: correct ? p?.wrongType || "" : type,
      rareCorrect: (p?.rareCorrect || 0) + Number(type === "rare" && correct),
      rareTotal: (p?.rareTotal || 0) + Number(type === "rare"),
    };
  },
  priority(r, rare) {
    return !r
      ? 70 + (rare ? 10 : 0)
      : (r.mastery === 1
          ? 100
          : r.mastery === 2
            ? 65
            : r.mastery === 3
              ? 30
              : 5) +
          (r.nextReview <= Date.now() ? 25 : 0) +
          (rare ? 8 : 0);
  },
};

/** Build the next reinforcement block independently of the rendering layer. */
export function reinforcementWords(
  words: import("../../types").Word[],
  records: Record<string, StudyRecord>,
  reviewedIds: string[],
) {
  const byId = new Map(words.map((word) => [word.id, word]));
  return [...new Set(reviewedIds)]
    .map((id) => byId.get(id))
    .filter(
      (word): word is import("../../types").Word =>
        !!word && (records[word.id]?.mastery || 0) < 3,
    )
    .sort(
      (a, b) =>
        scheduler.priority(records[b.id], !!b.rareMeaning) -
        scheduler.priority(records[a.id], !!a.rareMeaning),
    )
    .slice(0, 10);
}
