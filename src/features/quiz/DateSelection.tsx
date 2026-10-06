import type { DailyWordList } from "../../types";
import { dateSelectionError, type QuizDateSelection } from "./selection";

export function DateSelection({
  days,
  value,
  onChange,
}: {
  days: DailyWordList[];
  value: QuizDateSelection;
  onChange: (value: QuizDateSelection) => void;
}) {
  const error = dateSelectionError(value);
  const latest = days[0]?.date ?? "";
  function switchKind(kind: QuizDateSelection["kind"]) {
    if (kind === value.kind) return;
    if (kind === "range" && value.kind === "days") {
      const selected = value.dates
        .filter((date) => days.some((day) => day.date === date))
        .sort();
      onChange({
        kind,
        from: selected[0] ?? latest,
        to: selected.at(-1) ?? latest,
      });
    } else if (value.kind === "range") {
      onChange({
        kind: "days",
        dates: days
          .filter((day) => day.date >= value.from && day.date <= value.to)
          .map((day) => day.date),
      });
    }
  }
  return (
    <div className="quiz-date-filter">
      <div className="segmented" role="group" aria-label="日期选择方式">
        <button
          type="button"
          className={value.kind === "days" ? "active" : ""}
          aria-pressed={value.kind === "days"}
          onClick={() => switchKind("days")}
        >
          选日期（可多选）
        </button>
        <button
          type="button"
          className={value.kind === "range" ? "active" : ""}
          aria-pressed={value.kind === "range"}
          onClick={() => switchKind("range")}
        >
          日期范围
        </button>
      </div>
      <p className="micro" id="quiz-date-help">
        按导入时指定的词表日期选择，与“我的词库”一致。
      </p>
      {value.kind === "days" ? (
        <>
          <div className="quiz-date-actions">
            <span>选择一天或多天</span>
            <button
              type="button"
              className="text-button"
              disabled={!days.length}
              onClick={() =>
                onChange({ kind: "days", dates: days.map((day) => day.date) })
              }
            >
              全选日期
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!value.dates.length}
              onClick={() => onChange({ kind: "days", dates: [] })}
            >
              清空日期
            </button>
          </div>
          {days.length ? (
            <fieldset
              className="quiz-date-list"
              aria-describedby="quiz-date-help"
            >
              <legend className="sr-only">选择词表日期</legend>
              {days.map((day) => (
                <label
                  key={day.date}
                  className={value.dates.includes(day.date) ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={value.dates.includes(day.date)}
                    aria-label={day.date}
                    onChange={(event) =>
                      onChange({
                        kind: "days",
                        dates: event.target.checked
                          ? [...value.dates, day.date]
                          : value.dates.filter((date) => date !== day.date),
                      })
                    }
                  />
                  <span>{day.date}</span>
                  <small>{day.wordIds.length} 词</small>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="micro">暂无有词汇的日期，请先导入词表并指定日期。</p>
          )}
        </>
      ) : (
        <div className="quiz-date-range">
          <label>
            开始日期
            <input
              type="date"
              value={value.from}
              aria-describedby="quiz-date-help"
              onChange={(event) =>
                onChange({ ...value, from: event.target.value })
              }
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={value.to}
              aria-describedby="quiz-date-help"
              onChange={(event) =>
                onChange({ ...value, to: event.target.value })
              }
            />
          </label>
        </div>
      )}
      {error && (
        <p className="quiz-date-error" role="alert">
          {error}
        </p>
      )}
      <p className="micro">跨天重复的单词自动去重，每词在首轮只测试一次。</p>
    </div>
  );
}
