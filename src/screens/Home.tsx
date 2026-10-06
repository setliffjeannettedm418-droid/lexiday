import { ArrowRight, ArrowUpRight, BookOpenText, CalendarDays, ChartNoAxesCombined, ChevronRight, Upload } from "lucide-react";
import { ProgressBar } from "../components/ui";
import { today } from "../db";
import { pendingWords } from "../features/reading/engine";
import type { State, Session } from "../types";

export default function Home({ state, go, session }: {
  state: State;
  go: (path: string) => void;
  session: Session | null;
}) {
  const day = state.days.find(d => d.date === today());
  const todayCount = state.words.filter(w => day?.wordIds.includes(w.id)).length;
  const due = state.words.filter(w => state.records[w.id]?.nextReview <= Date.now()).length;
  const batches = state.reading?.batches || [];
  const latest = [...batches].reverse().find(b => b.articles.length > 0);
  const running = batches.find(b => b.status === "generating");
  const pending = pendingWords(state).length;
  const unfinished = session && !session.completed;

  return <div className="home-focus">
    <div className="home-intro">
      <p>{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}</p>
      <h1>今天，也有新收获。</h1>
    </div>
    <div className="home-goals">
      <button onClick={() => go("/words?date=" + today())}>
        <span>今日词汇</span><strong>{todayCount}<small>词</small></strong>
      </button>
      <button onClick={() => go("/test/setup?scope=due")}>
        <span>到期复习</span><strong>{due}<small>词</small></strong>
      </button>
    </div>
    <button className="primary wide home-start" onClick={() => go("/test/setup")}>开始测试<ArrowRight size={18} /></button>
    {unfinished && <button className="home-resume" onClick={() => go("/test/session")}>继续上次测试 · 第 {session.index + 1} 题<ChevronRight size={16} /></button>}
    <div className="home-entry-grid">
      <button onClick={() => go("/import")}><Upload size={20} /><span>导入词表</span></button>
      <button onClick={() => go("/test/setup?scope=dates")}><CalendarDays size={20} /><span>按日期选词</span></button>
    </div>
    <button className="home-reading-card" onClick={() => go(latest ? `/reading/${encodeURIComponent(latest.id)}` : "/reading")}>
      <span className="home-reading-label"><BookOpenText size={17} />阅读巩固</span>
      <h2>{latest?.articles[0]?.title || "在文章里，\n重新遇见学过的词。"}</h2>
      <span className="home-reading-meta"><span>{running ? `正在生成第 ${running.articles.length + 1} / 4 篇` : latest ? `第 ${batches.indexOf(latest) + 1} 组 · ${latest.articles.length} 篇阅读` : `已积累 ${pending} / 80 个新词`}</span><ArrowUpRight size={19} /></span>
      {!latest && <ProgressBar value={pending / 80 * 100} />}
    </button>
    <div className="home-more">
      <button onClick={() => go("/reading")}>阅读书架<ChevronRight size={15} /></button>
      <button onClick={() => go("/stats")}><ChartNoAxesCombined size={17} />学习统计</button>
    </div>
  </div>;
}
