import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { StatCard, WordListItem, EmptyState } from "../components/ui";
import type { State } from "../types";
export default function Stats({
  state,
  go,
}: {
  state: State;
  go: (p: string) => void;
}) {
  const at = state.attempts.filter(
    (a) => new Date(a.time).toDateString() === new Date().toDateString(),
  );
  const acc = (a: typeof at) =>
    a.length
      ? Math.round((a.filter((x) => x.correct).length / a.length) * 100)
      : null;
  const rare = Object.values(state.records).reduce(
    (o, r) => ({
      correct: o.correct + r.rareCorrect,
      total: o.total + r.rareTotal,
    }),
    { correct: 0, total: 0 },
  );
  const trend = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - 6 + i);
    const a = state.attempts.filter(
      (a) => new Date(a.time).toDateString() === day.toDateString(),
    );
    return {
      date: `${day.getMonth() + 1}/${day.getDate()}`,
      words: new Set(a.map((a) => a.wordId)).size,
      accuracy: acc(a),
    };
  });
  const top = state.words
    .filter((w) => state.records[w.id]?.wrongCount > 0)
    .sort(
      (a, b) => state.records[b.id].wrongCount - state.records[a.id].wrongCount,
    )
    .slice(0, 10);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PROGRESS, NOT PERFECTION</div>
          <h1>看见每一点进步</h1>
          <p>数据记录努力，薄弱词指引下一步。</p>
        </div>
      </div>
      <div className="stats-strip large">
        <StatCard
          label="今日学习词数"
          value={new Set(at.map((a) => a.wordId)).size}
        />
        <StatCard
          label="今日测试次数"
          value={new Set(at.map((a) => a.sessionId)).size}
        />
        <StatCard
          label="今日正确率"
          value={acc(at) ?? "—"}
          unit={at.length ? "%" : ""}
        />
      </div>
      <div className="stats-secondary">
        <span>
          累计词汇 <b>{state.words.length}</b>
        </span>
        <span>
          已掌握{" "}
          <b>
            {Object.values(state.records).filter((r) => r.mastery === 4).length}
          </b>
        </span>
        <span>
          熟词僻义答题正确率{" "}
          <b>
            {rare.total
              ? Math.round((rare.correct / rare.total) * 100) + "%"
              : "—"}
          </b>
        </span>
        <span>
          熟词僻义掌握率{" "}
          <b>
            {state.words.filter((w) => w.rareMeaning).length
              ? Math.round(
                  (state.words.filter(
                    (w) =>
                      w.rareMeaning &&
                      state.records[w.id]?.mastery >= 3 &&
                      state.records[w.id]?.rareCorrect > 0,
                  ).length /
                    state.words.filter((w) => w.rareMeaning).length) *
                    100,
                ) + "%"
              : "—"}
          </b>
        </span>
      </div>
      <section className="chart-panel">
        <div className="section-heading">
          <h2>最近 7 天</h2>
          <span className="chart-legend">
            ■ 学习词数 <span>━ 正确率</span>
          </span>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={trend}
              margin={{ top: 15, right: 0, bottom: 0, left: -25 }}
            >
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="words"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="rate"
                orientation="right"
                domain={[0, 100]}
                unit="%"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                }}
              />
              <Bar
                yAxisId="words"
                name="学习词数"
                dataKey="words"
                fill="var(--primary)"
                radius={[5, 5, 0, 0]}
                maxBarSize={35}
              />
              <Line
                yAxisId="rate"
                name="正确率 %"
                dataKey="accuracy"
                stroke="var(--green)"
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      <div className="section-heading">
        <h2>最易错词 TOP 10</h2>
        <span className="muted">优先复习这些词</span>
      </div>
      <section className="word-list">
        {top.length ? (
          top.map((w) => (
            <WordListItem
              key={w.id}
              word={w}
              level={state.records[w.id].mastery}
              onClick={() => go("/words/" + w.id)}
              extra={"累计错误 " + state.records[w.id].wrongCount + " 次"}
            />
          ))
        ) : (
          <EmptyState
            title="还没有错题记录"
            description="完成一场测试，开始记录你的进步。"
          />
        )}
      </section>
    </>
  );
}
