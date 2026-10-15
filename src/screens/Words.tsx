import { PronunciationButtons } from "../components/PronunciationButtons";
import { type Speak } from "../features/audio/speech";
import { Search, ArrowLeft, Volume2, ArrowRight } from "lucide-react";
import {
  Picker,
  WordListItem,
  MasteryBadge,
  EmptyState,
  StatCard,
} from "../components/ui";
import type { State } from "../types";
import { modes } from "../features/quiz/engine";
import { readWordListView, wordListPath, type WordListView } from "../features/words/view";
export function Words({
  state,
  go,
  mistakes = false,
  params,
  replace,
}: {
  state: State;
  go: (p: string) => void;
  mistakes?: boolean;
  params: URLSearchParams;
  replace: (p: string) => void;
}) {
  const view = readWordListView(params);
  const { query, filter, date, sort, page } = view;
  const change = (next: Partial<WordListView>) => replace(wordListPath(mistakes, { ...view, ...next }));
  const dayIds = new Set(state.days.filter(d => d.date === date).flatMap(d => d.wordIds));
  const list = state.words.filter(
    (w) =>
      (!mistakes || state.records[w.id]?.wrongCount > 0) &&
      (date === "all" || dayIds.has(w.id)) &&
      (filter === "all" || filter === "mastered"
        ? filter !== "mastered" || state.records[w.id]?.mastery >= 3
        : (state.records[w.id]?.mastery || 0) === Number(filter)) &&
      (w.word.toLowerCase().includes(query.toLowerCase()) ||
        w.commonMeaning.includes(query)),
  );
  if (sort === "az") list.sort((a, b) => a.word.localeCompare(b.word));
  if (sort === "wrong" || mistakes)
    list.sort(
      (a, b) =>
        (state.records[b.id]?.wrongCount || 0) -
        (state.records[a.id]?.wrongCount || 0),
    );
  const pages = Math.max(1, Math.ceil(list.length / 30));
  const p = Math.min(page, pages - 1);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {mistakes ? "LEARN FROM MISTAKES" : "YOUR WORD COLLECTION"}
          </div>
          <h1>{mistakes ? "错题复习" : "我的词库"}</h1>
          <p>
            {mistakes
              ? "错过一次的词，下一次更有把握。"
              : "每一次积累，都在这里。"}{" "}
            共 {list.length} 个词
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            go(mistakes ? "/test/setup?scope=mistakes" : "/import")
          }
        >
          {mistakes ? "开始错题测试" : "导入词表"}
          <ArrowRight size={17} />
        </button>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="搜索单词或释义"
            placeholder="搜索单词或中文释义"
            value={query}
            onChange={(e) => {
              change({ query: e.target.value, page: 0 });
            }}
          />
        </label>
        <Picker
          label="词表日期"
          value={date}
          onChange={(v) => {
            change({ date: v, page: 0 });
          }}
          items={{
            all: "所有日期",
            ...Object.fromEntries(
              [...state.days].reverse().map((d) => [d.date, d.date]),
            ),
          }}
        />
        <Picker
          label="排序方式"
          value={sort}
          onChange={sort => change({ sort, page: 0 })}
          items={{ default: "导入顺序", az: "字母 A–Z", wrong: "错误次数" }}
        />
      </div>
      <div className="filter-row">
        {[
          ["all", "全部"],
          ["mastered", "已掌握"],
          ["2", "待巩固"],
          ["1", "未掌握"],
          ["0", "未测试"],
        ].map(([k, v]) => (
          <button
            key={k}
            className={filter === k ? "active" : ""}
            onClick={() => {
              change({ filter: k, page: 0 });
            }}
          >
            {v}
          </button>
        ))}
      </div>
      <section className="word-list">
        {list.length ? (
          list
            .slice(p * 30, p * 30 + 30)
            .map((w) => (
              <WordListItem
                key={w.id}
                word={w}
                level={state.records[w.id]?.mastery || 0}
                onClick={() => {
                  const detail = new URLSearchParams({ from: wordListPath(mistakes, { ...view, page: p }), scroll: String(window.scrollY) });
                  go("/words/" + w.id + "?" + detail);
                }}
                extra={
                  mistakes
                    ? `错误 ${state.records[w.id].wrongCount} 次 · ${modes[state.records[w.id].wrongType] || "测试"} · ${new Date(state.records[w.id].lastWrong).toLocaleString("zh-CN")}`
                    : undefined
                }
              />
            ))
        ) : (
          <EmptyState
            title={mistakes ? "暂时没有错题" : "没有符合条件的词汇"}
            description={
              mistakes
                ? "完成测试后，答错的单词会自动出现在这里。"
                : "试试其他筛选条件，或导入一份新的词表。"
            }
          />
        )}
      </section>
      {pages > 1 && (
        <div className="pagination">
          <button disabled={!p} onClick={() => change({ page: p - 1 })}>
            上一页
          </button>
          <span>
            {p + 1} / {pages}
          </span>
          <button disabled={p === pages - 1} onClick={() => change({ page: p + 1 })}>
            下一页
          </button>
        </div>
      )}
    </>
  );
}
export function WordDetail({
  state,
  id,
  go,
  speak,
  back,
  fromMistakes = false,
}: {
  state: State;
  id: string;
  go: (p: string) => void;
  speak: Speak;
  back: () => void;
  fromMistakes?: boolean;
}) {
  const w = state.words.find((w) => w.id === id);
  const r = state.records[id];
  if (!w) return <EmptyState title="没有找到这个单词" />;
  return (
    <div className="detail narrow">
      <button className="text-button" onClick={back}>
        <ArrowLeft size={17} /> {fromMistakes ? "返回错题" : "返回词库"}
      </button>
      <section className="detail-card">
        <div className="section-line">
          <span className="eyebrow">WORD DETAILS</span>
          <MasteryBadge level={r?.mastery} />
        </div>
        <h1 className="english">
          {w.word}

        </h1>
        <p className="phonetic">{w.phonetic}</p>
<PronunciationButtons word={w.word} speak={speak} />
        {[
          ["常见意思", w.commonMeaning],
          ["考研熟词僻义 / 语境义", w.rareMeaning],
          ["搭配与用法", w.usage],
          ["例句", w.example],
        ].map(([label, value]) => (
          <div
            key={label}
            className={
              "definition " +
              (label.startsWith("考研") ? "rare-definition" : "")
            }
          >
            <small>{label}</small>
            <p>{value || "暂未收录"}</p>
          </div>
        ))}
        <small className="source">来源：{w.source}</small>
        {(state.examReading?.contexts || []).filter(context => context.wordId === id).slice(-10).reverse().map((context, index) => <div className="definition exam-word-context" key={index}><small>英语二真题中的用法 · {context.articleId.match(/english2-(\d+)-reading-(\d+)/)?.slice(1).join(" · 阅读 ")}</small><p className="english">{context.sentence}</p><p>{context.meaning}</p><button className="text-button" onClick={() => go(`/exam-reading/${context.articleId}`)}>回到原文<ArrowRight size={15} /></button></div>)}
      </section>
      <div className="stats-strip">
        <StatCard label="正确次数" value={r?.correctCount || 0} />
        <StatCard label="错误次数" value={r?.wrongCount || 0} />
        <StatCard
          label="最近复习"
          value={
            r?.lastReview
              ? new Date(r.lastReview).toLocaleDateString("zh-CN")
              : "尚未测试"
          }
        />
      </div>
      <button
        className="primary wide"
        onClick={() => go("/test/setup?word=" + id)}
      >
        立即测试这个词
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
