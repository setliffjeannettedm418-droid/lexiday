import type { DailyWordList, State } from "../../types";

export const scopes = {
  today: "今日词汇",
  dates: "按日期选词",
  all: "所有词汇",
  mistakes: "错题",
  weak: "未掌握",
  rare: "熟词僻义",
  due: "到期复习",
};

export type QuizDateSelection =
  | { kind: "days"; dates: string[] }
  | { kind: "range"; from: string; to: string };

// Compare calendar labels directly: converting them to local/UTC timestamps can
// move a word list to the previous day. Dates are the import's assigned date.
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
  );
}

export function quizDays(
  state: Pick<State, "days" | "words">,
): DailyWordList[] {
  const existing = new Set(state.words.map((word) => word.id));
  const dates = new Map<string, Set<string>>();
  for (const day of state.days) {
    if (!isCalendarDate(day.date)) continue;
    const ids = dates.get(day.date) ?? new Set<string>();
    for (const id of day.wordIds) if (existing.has(id)) ids.add(id);
    if (ids.size) dates.set(day.date, ids);
  }
  return [...dates]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, ids]) => ({ date, wordIds: [...ids] }));
}

export function dateSelectionError(selection: QuizDateSelection) {
  if (selection.kind === "days")
    return selection.dates.some(isCalendarDate)
      ? ""
      : "请选择至少一个有词汇的日期。";
  if (!isCalendarDate(selection.from) || !isCalendarDate(selection.to))
    return "请选择开始和结束日期。";
  return selection.from > selection.to ? "开始日期不能晚于结束日期。" : "";
}

export function selectedQuizDays(
  days: DailyWordList[],
  selection: QuizDateSelection,
) {
  if (dateSelectionError(selection)) return [];
  const selected = new Set(selection.kind === "days" ? selection.dates : []);
  return days.filter((day) =>
    selection.kind === "days"
      ? selected.has(day.date)
      : day.date >= selection.from && day.date <= selection.to,
  );
}

export function selectQuizWords(
  state: State,
  options: {
    scope: string;
    mode: string;
    today: string;
    dates: QuizDateSelection;
    wordId?: string | null;
  },
  now = Date.now(),
) {
  const days =
    options.scope === "today"
      ? state.days.filter((day) => day.date === options.today)
      : options.scope === "dates"
        ? selectedQuizDays(quizDays(state), options.dates)
        : [];
  const ids = new Set(days.flatMap((day) => day.wordIds));
  return state.words.filter((word) => {
    const record = state.records[word.id];
    const inScope = options.wordId
      ? word.id === options.wordId
      : options.scope === "today" || options.scope === "dates"
        ? ids.has(word.id)
        : options.scope === "mistakes"
          ? record?.wrongCount > 0
          : options.scope === "weak"
            ? (record?.mastery || 0) < 3
            : options.scope === "rare"
              ? !!word.rareMeaning
              : options.scope === "due"
                ? record?.nextReview <= now
                : options.scope === "all";
    return (
      inScope &&
      (options.mode !== "rare" || !!word.rareMeaning) &&
      (options.mode !== "usage" || !!word.usage)
    );
  });
}
