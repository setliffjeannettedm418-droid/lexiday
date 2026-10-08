import { PronunciationButtons } from "../components/PronunciationButtons";
import { stopSpeech, prepareSpeech, type Speak } from "../features/audio/speech";
import { Switch } from "@/components/ui/switch";
import { newId } from "../utils/id";
import { useEffect, useState, useRef, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCcw,
  Volume2,
  Upload,
} from "lucide-react";
import type { State, Session, Word, SaveState } from "../types";
import {
  ProgressBar,
  AnswerOption,
  EmptyState,
  StatCard,
} from "../components/ui";
import { question, modes, shuffle } from "../features/quiz/engine";
import { scheduler, reinforcementWords } from "../features/review/scheduler";
import { today } from "../db";
import { DateSelection } from "../features/quiz/DateSelection";
import { scopes, quizDays, selectQuizWords, selectedQuizDays, type QuizDateSelection } from "../features/quiz/selection";
export function Setup({
  state,
  params,
  start,
  go,
}: {
  state: State;
  params: URLSearchParams;
  start: (s: Session) => void;
  go: (p: string) => void;
}) {
  const [autoReview, setAutoReview] = useState(true);
  const [scope, setScope] = useState(params.get("scope") || "today");
  const [count, setCount] = useState(state.settings.count);
  const [mode, setMode] = useState(
    params.get("scope") === "rare" ? "rare" : state.settings.mode,
  );
  const days = useMemo(() => quizDays(state), [state.days, state.words]);
  const [dates, setDates] = useState<QuizDateSelection>(() => ({
    kind: "days",
    dates: days.length ? [days.find(day => day.date === today())?.date ?? days[0].date] : [],
  }));
  const byDate = scope === "dates" && !params.get("word");
  const selectedDays = byDate ? selectedQuizDays(days, dates) : [];
  const selectedCount = new Set(selectedDays.flatMap(day => day.wordIds)).size;
  const words = selectQuizWords(state, { scope, mode, today: today(), dates, wordId: params.get("word") });
  function begin() {
    if (!words.length) return;
    const selected = shuffle(words)
      .sort(
        (a, b) =>
          scheduler.priority(
            state.records[b.id],
            !!b.rareMeaning && state.settings.rareFirst,
          ) -
          scheduler.priority(
            state.records[a.id],
            !!a.rareMeaning && state.settings.rareFirst,
          ),
      )
      .slice(0, count === "all" ? undefined : Number(count));
    start({
      id: newId(),
      autoReview,
      initialSize: selected.length,
      questions: selected.map((w) =>
        question(w, state.words, mode, state.settings.rareFirst),
      ),
      index: 0,
      answers: [],
      completed: false,
    });
  }
  return (
    <div className="narrow quiz-setup">
      <div className="page-heading">
        <div>
          <h1>选好范围，<br />专注测试。</h1>
          <p>先回忆，再确认。每一次测试都是一次积累。</p>
        </div>
        <button className="icon-button" aria-label="导入词表" onClick={() => go("/import")}><Upload size={21} /></button>
      </div>
      <section className="setup-card">
        <div className="form-field">
          <label htmlFor="quiz-scope">测试范围</label>
          {params.get("word") ? (
            <p>单词专项 · {words[0]?.word}</p>
          ) : (
            <select id="quiz-scope" aria-label="测试范围" value={scope} onChange={e => setScope(e.target.value)}>
              {Object.entries(scopes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          )}
        </div>
        {byDate && (
          <div className="form-field">
            <DateSelection days={days} value={dates} onChange={setDates} />
            <div className="quiz-date-summary" role="status" aria-live="polite">
              <strong>已选 {selectedDays.length} 天 · 去重后 {selectedCount} 词</strong>
              <span>符合当前题型 {words.length} 词</span>
            </div>
          </div>
        )}
        <div className="form-field">
          <label htmlFor="quiz-mode">测试题型</label>
          <select id="quiz-mode" aria-label="测试题型" value={mode} onChange={e => setMode(e.target.value)}>
            {Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>测试题数</label>
          <div className="segmented">
            {["10", "20", "30", "all"].map((v) => (
              <button
                key={v}
                className={count === v ? "active" : ""}
                aria-pressed={count === v}
                onClick={() => setCount(v)}
              >
                {v === "all" ? "全部" : v + " 题"}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>自动巩固薄弱词</strong>
            <p>首轮结束后继续巩固薄弱词，连续答对后完成；可提前结束。</p>
          </div>
          <Switch
            aria-label="自动巩固薄弱词"
            checked={autoReview}
            onCheckedChange={setAutoReview}
          />
        </div>
        <p className="quiz-available" role="status" aria-live="polite">当前范围与题型可用 {words.length} 词</p>
        <button
          className="primary wide"
          disabled={!words.length}
          onClick={begin}
        >
          开始测试 ·{" "}
          {count === "all"
            ? words.length
            : Math.min(Number(count), words.length)}{" "}
          题<ArrowRight size={18} />
        </button>
        {!words.length && (
          <div className="quiz-empty"><p className="micro">
            {byDate ? "所选日期内没有符合当前题型的词汇，请调整日期或题型。" : "当前范围没有可测试词汇，请更换范围或导入词表。"}
          </p><button className="text-button" onClick={() => go("/import")}><Upload size={16} />导入词表</button></div>
        )}
      </section>
    </div>
  );
}
export function Quiz({
  state,
  session,
  update,
  save,
  go,
  speak,
}: {
  state: State;
  session: Session;
  update: (s: Session) => void;
  save: SaveState;
  go: (p: string) => void;
  speak: Speak;
}) {
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const answerLock = useRef("");
  const autoSubmitted = useRef("");
  const mounted = useRef(false);
  const currentSession = useRef(session);
  currentSession.current = session;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const spelling = session.spelling ?? "";
  const q = session.questions[session.index];
  const w = state.words.find((w) => w.id === q?.wordId);
  const revealed = session.selected !== undefined;
  const correct =
    session.selected?.trim().toLowerCase() === q?.answer.trim().toLowerCase();
  const attemptId = session.id + "-" + session.index;
  function answer(value: string) {
    if (revealed || busy || saving.current || answerLock.current === attemptId) return;
    answerLock.current = attemptId;
    const right = value.trim().toLowerCase() === q.answer.trim().toLowerCase();
    update({ ...session, selected: value, rating: right ? 3 : 1 });
  }
  async function next(finish = false, advance = true) {
    if (!revealed || saving.current || !w) return;
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      const rating = correct ? 3 : 1;
      let savedState = state;
      if (!state.attempts.some((a) => a.id === attemptId))
        await save(current => {
          savedState = current;
          if (current.attempts.some(a => a.id === attemptId)) return current;
          savedState = {
            ...current,
            records: {
              ...current.records,
              [w.id]: scheduler.review(current.records[w.id], w.id, correct, rating, q.type),
            },
            attempts: [...current.attempts, {
              id: attemptId, sessionId: session.id, wordId: w.id,
              time: Date.now(), correct, type: q.type, rating,
            }],
          };
          return savedState;
        });
      // The answer may finish saving after navigation. Keep the saved attempt,
      // but never let an old page replace a newer session or force navigation.
      // Resuming this question can safely advance using the same attempt ID.
      if (
        !mounted.current ||
        currentSession.current.id !== session.id ||
        currentSession.current.index !== session.index ||
        !advance
      ) return;
      const s = {
        ...session,
        index: session.index + 1,
        answers: [...session.answers, { wordId: w.id, correct }],
        selected: undefined,
        rating: undefined,
        spelling: undefined,
        completed: session.index + 1 >= session.questions.length,
      };
      if (s.completed && session.autoReview && !finish) {
        const weak = reinforcementWords(
          savedState.words,
          savedState.records,
          s.answers.map((a) => a.wordId),
        );
        if (weak.length) {
          s.questions = [
            ...s.questions,
            ...weak
              .slice(0, 10)
              .map((word) =>
                question(word, savedState.words, "mixed", savedState.settings.rareFirst),
              ),
          ];
          s.completed = false;
        }
      }
      if (finish) s.completed = true;
      update(s);
      if (s.completed) go("/test/result");
      else window.scrollTo({ top: 0, behavior: "instant" });
    } catch {
      if (mounted.current && currentSession.current.id === session.id && currentSession.current.index === session.index)
        setSaveError("学习记录暂未保存，请重试后继续。");
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!revealed) setSaveError("");
    if (!revealed || !w || busy || saving.current || autoSubmitted.current === attemptId) return;
    autoSubmitted.current = attemptId;
    // Persist both outcomes immediately. Incorrect answers stay open for review;
    // correct answers advance only after their learning record has been saved.
    void next(false, correct);
  }, [attemptId, session.selected, busy]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (w && state.settings.audio) void speak(w.word, "us").then(() => {
        const next = session.questions[session.index + 1];
        const nextWord = next && state.words.find(word => word.id === next.wordId);
        if (active && nextWord) void prepareSpeech(nextWord.word);
      });
    }, 180);
    return () => { active = false; clearTimeout(timer); void stopSpeech(); };
  }, [session.id, session.index, state.settings.audio]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (busy || saving.current || e.repeat) return;
      if (
        e.target instanceof Element && e.target.matches(
          "input,textarea,[contenteditable=true]",
        )
      )
        return;
      if (
        !revealed &&
        ["1", "2", "3", "4"].includes(e.key) &&
        q.options[Number(e.key) - 1]
      )
        answer(q.options[Number(e.key) - 1]);
      if (e.code === "Space" && !revealed) {
        e.preventDefault();
        answer("");
      }
      if (e.key === "Enter" && revealed && (!correct || saveError)) {
        e.preventDefault();
        void next(false, correct || !saveError);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  if (!w || !q) return <EmptyState title="测试已结束" />;
  return (
    <div className="quiz-shell narrow">
      <div className="quiz-top">
        <button
          className="icon-button"
          aria-label="暂停并返回测试设置"
          onClick={() => go("/test/setup")}
        >
          <ArrowLeft />
        </button>
        <span>
          {session.index + 1} <small>/ {session.questions.length}</small>
        </span>
        <span className="tag">
          {session.index >= (session.initialSize || Infinity) ? "巩固 · " : ""}
          {modes[q.type]}
        </span>
      </div>
      <ProgressBar value={(session.index / session.questions.length) * 100} />
      <section className="quiz-card">
        <h1
          className={
            q.type === "zh" || q.type === "spell"
              ? "chinese-question"
              : "english"
          }
        >
          {q.prompt}
        </h1>
        <div className="quiz-pronunciation">
          {q.type !== "spell" && q.type !== "zh" && <span className="phonetic">{w.phonetic}</span>}
          <PronunciationButtons word={w.word} speak={speak} />
        </div>
        <p className="question-subtitle">{q.subtitle}</p>
        <div className="answers">
          {q.type === "spell" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                answer(spelling);
              }}
            >
              <input
                className="spelling"
                aria-label="英文拼写"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="输入英文单词…"
                value={revealed ? session.selected : spelling}
                disabled={revealed || busy}
                onChange={(e) => update({ ...session, spelling: e.target.value })}
              />
              <button
                disabled={revealed || busy || !spelling.trim()}
                className="primary wide"
              >
                确认答案
              </button>
            </form>
          ) : (
            q.options.map((option, i) => (
              <AnswerOption
                key={option}
                index={i}
                text={option}
                disabled={revealed || busy}
                onClick={() => answer(option)}
                state={
                  !revealed
                    ? ""
                    : option === q.answer
                      ? "right"
                      : option === session.selected
                        ? "wrong"
                        : ""
                }
              />
            ))
          )}
          {!revealed && (
            <button className="text-button reveal" disabled={busy} onClick={() => answer("")}>
              暂时想不起来，显示答案
            </button>
          )}
        </div>
        {revealed && (
          <div
            className={"feedback " + (correct ? "correct" : "incorrect")}
            role="status"
          >
            <h3>
              {correct ? "✓ 回答正确" : "× 回答错误"}
              <span>
                {correct ? "记得不错，继续保持。" : "没关系，现在记住它。"}
              </span>
            </h3>
            <p>
              <small>正确答案</small>
              <br />
              <strong>{q.answer}</strong>
            </p>
            <div>
              <small>常见意思</small>
              <p>{w.commonMeaning}</p>
            </div>
            {w.rareMeaning && (
              <div>
                <small>考研熟词僻义 / 语境义</small>
                <p>{w.rareMeaning}</p>
              </div>
            )}
            {w.usage && (
              <div>
                <small>搭配与用法</small>
                <p>{w.usage}</p>
              </div>
            )}
            {w.example && <p>{w.example}</p>}
          </div>
        )}
      </section>
      {revealed && (
        <section className="rating-area">
          <p>{correct ? "答对了，自动进入下一题。" : "本题判为不会，记住答案后继续。"}</p>
          {saveError && <p role="alert">{saveError}</p>}
          <button
            className="primary wide"
            disabled={busy || (correct && !saveError)}
            onClick={() => void next(false, correct || !saveError)}
          >
            {busy
              ? "正在保存…"
              : saveError
                ? "重试保存"
                : correct
                  ? "正在进入下一题…"
                  : session.index + 1 === session.questions.length
                ? session.autoReview
                  ? "保存并继续"
                  : "完成测试"
                : "下一题"}
            <ArrowRight size={18} />
          </button>
          {session.autoReview && !correct && (
            <button
              className="text-button finish-session"
              disabled={busy}
              onClick={() => void next(true)}
            >
              保存本题并结束本次测试
            </button>
          )}
        </section>
      )}
      <p className="keyboard-tip">
        1–4 选择答案 · 答对自动下一题 · Space 显示答案 · Enter 继续
      </p>
    </div>
  );
}
export function Result({
  state,
  session,
  start,
  go,
}: {
  state: State;
  session: Session;
  start: (s: Session) => void;
  go: (p: string) => void;
}) {
  const wrong = [
    ...new Set(session.answers.filter((a) => !a.correct).map((a) => a.wordId)),
  ];
  const ids = [...new Set(session.answers.map((a) => a.wordId))];
  const accuracy = session.answers.length
    ? Math.round(
        (session.answers.filter((a) => a.correct).length /
          session.answers.length) *
          100,
      )
    : 0;
  const weak = ids.filter((id) => (state.records[id]?.mastery || 0) < 3);
  function retry() {
    const candidates = [...new Set([...wrong, ...weak])]
      .map((id) => state.words.find((w) => w.id === id))
      .filter(Boolean) as Word[];
    start({
      id: newId(),
      autoReview: session.autoReview ?? false,
      initialSize: candidates.length,
      questions: candidates.map((w) => question(w, state.words, "mixed", true)),
      index: 0,
      answers: [],
      completed: false,
    });
  }
  return (
    <div className="narrow result">
      <div className="success-symbol">
        <Check size={34} />
      </div>
      <div className="eyebrow">ONE STEP FORWARD</div>
      <h1>本次测试完成</h1>
      <p>完成 {session.answers.length} 题，又向掌握迈进了一步。</p>
      <div className="result-accuracy">
        {accuracy}
        <span>%</span>
        <small>本次正确率</small>
      </div>
      <div className="stats-strip">
        <StatCard
          label="已掌握 / 基本掌握"
          value={ids.filter((id) => state.records[id]?.mastery >= 3).length}
        />
        <StatCard
          label="待巩固"
          value={ids.filter((id) => state.records[id]?.mastery === 2).length}
        />
        <StatCard
          label="未掌握"
          value={ids.filter((id) => state.records[id]?.mastery === 1).length}
        />
      </div>
      <section className="result-words">
        <h3>{wrong.length ? "这些词值得再看一次" : "本次没有答错的单词"}</h3>
        <div>
          {wrong.map((id) => (
            <button key={id} onClick={() => go("/words/" + id)}>
              {state.words.find((w) => w.id === id)?.word}
            </button>
          ))}
        </div>
        <p>答对自动提升掌握等级，答错自动记为不会。下一轮优先巩固错词和薄弱词。</p>
      </section>
      {(wrong.length > 0 || weak.length > 0) && (
        <button className="primary wide" onClick={retry}>
          <RotateCcw size={17} />
          复习本次错题与薄弱词 · {new Set([...wrong, ...weak]).size} 词
        </button>
      )}
      <button className="secondary wide" onClick={() => go("/")}>
        返回首页
      </button>
    </div>
  );
}
