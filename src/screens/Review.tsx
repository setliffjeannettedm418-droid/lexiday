import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, RotateCcw, Settings2 } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import type { State, Session } from "../types";
import { EmptyState } from "../components/ui";
import { question } from "../features/quiz/engine";
import { isCalendarDate } from "../features/quiz/selection";
import { addStudyDays, buildReviewPlan, localStudyDate, reviewDays, reviewForDate, type ReviewDayItem } from "../features/review/plan";
import { ReviewCurve, reviewDateLabel } from "../features/review/ReviewCurve";
import { useReviewClock } from "../features/review/useReviewClock";
import { newId } from "../utils/id";

export default function Review({ state, session, start, go }: {
  state: State; session: Session | null; start: (session: Session) => void; go: (path: string) => void;
}) {
  const now = useReviewClock(), today = localStudyDate(now);
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [batchOverride, setBatchOverride] = useState("");
  const [replace, setReplace] = useState(false);
  const date = dateOverride ?? today;
  const plan = useMemo(() => buildReviewPlan(state, now), [state, now]);
  const days = reviewDays(state.settings.reviewDays);
  const batches = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const node of plan) result.set(node.learnedDate, (result.get(node.learnedDate) ?? new Set()).add(node.word.id));
    return [...result].sort(([a], [b]) => b.localeCompare(a));
  }, [plan]);
  const batch = batches.some(([value]) => value === batchOverride) ? batchOverride : batches[0]?.[0] ?? today;
  const items = reviewForDate(plan, date, today);
  const pending = items.filter(item => item.status !== "done");
  const done = items.length - pending.length;
  const groups = new Map<string, ReviewDayItem[]>();
  for (const item of items) {
    const key = `${item.learnedDate}/${item.stage}/${item.status === "done" ? "done" : "pending"}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const ordered = [...groups].sort(([, a], [, b]) => Number(b[0].learnedDate === batch) - Number(a[0].learnedDate === batch));
  const choose = (next: string) => { if (isCalendarDate(next)) setDateOverride(next === today ? null : next); };
  function begin() {
    const at = Date.now(), currentDay = localStudyDate(at), chosenDay = dateOverride ?? currentDay;
    const available = reviewForDate(buildReviewPlan(state, at), chosenDay, currentDay).filter(item => item.status !== "done");
    if (!available.length || chosenDay > currentDay) { setReplace(false); return; }
    start({ id: newId(), reviewDate: chosenDay, autoReview: true, initialSize: available.length,
      questions: available.map(item => question(item.word, state.words, "en", false)), index: 0, answers: [], completed: false });
    setReplace(false);
  }
  return <div className="review-page narrow">
    <div className="page-heading"><div><h1>每日复习</h1><p>沿着记忆曲线，找回今天该复习的词。</p></div><button className="icon-button" aria-label="复习计划设置" onClick={() => go("/settings")}><Settings2 size={20} /></button></div>
    <div className="review-links"><button className="text-button" onClick={() => go("/mistakes")}><RotateCcw size={15} />错题复习</button>{session && !session.completed && <button className="text-button" onClick={() => go("/test/session")}>继续未完成的测试<ArrowRight size={15} /></button>}</div>
    {!batches.length ? <EmptyState title="先学习一组词，复习计划就会出现" description="单词首次作答后加入计划；仅导入词表不会开始计时。"><button className="primary" onClick={() => go("/test/setup?scope=all")}>开始学习<ArrowRight size={16} /></button></EmptyState> : <>
      <section className="review-curve-card">
        <div className="review-section-heading"><h2>艾宾浩斯遗忘曲线</h2><span>示意曲线</span></div>
        <label htmlFor="review-batch">查看一组词的复习轨迹</label>
        <select id="review-batch" aria-label="选择学习批次" value={batch} onChange={e => setBatchOverride(e.target.value)}>{batches.map(([day, ids]) => <option key={day} value={day}>{reviewDateLabel(day)}学习 · {ids.size} 个词</option>)}</select>
        <ReviewCurve days={days} learnedDate={batch} selectedDate={date} choose={choose} />
        <p className="review-note">从首次学习日计算：第 {days.join("、")} 天。曲线非个人实测记忆率。</p>
      </section>
      <section className="review-calendar" aria-label="每日复习日期">
        <div className="review-section-heading"><h2>每天复习哪些词</h2><button className="text-button" onClick={() => choose(today)}>回到今天</button></div>
        <div className="review-date-tools"><button className="icon-button" aria-label="上一周" onClick={() => choose(addStudyDays(date, -7))}><ChevronLeft size={19} /></button><label>选择日期<input type="date" aria-label="复习日期" value={date} onChange={e => choose(e.target.value)} /></label><button className="icon-button" aria-label="下一周" onClick={() => choose(addStudyDays(date, 7))}><ChevronRight size={19} /></button></div>
        <div className="review-week">{Array.from({ length: 7 }, (_, i) => {
          const day = addStudyDays(date, i - 2), count = reviewForDate(plan, day, today).length;
          return <button key={day} aria-label={`${reviewDateLabel(day)}，${count}个复习词`} aria-pressed={day === date} onClick={() => choose(day)}><small>{day === today ? "今天" : "周" + "日一二三四五六"[new Date(day + "T12:00:00Z").getUTCDay()]}</small><strong>{Number(day.slice(8))}</strong><small>{count ? `${count}词` : "—"}</small></button>;
        })}</div>
      </section>
      <section className="review-list" aria-label="所选日期复习清单">
        <div className="review-section-heading"><div><h2>{date === today ? "今天的复习清单" : `${reviewDateLabel(date)}复习清单`}</h2><p className="review-note" role="status">{date > today ? "预计安排 · 提前练习不会完成未来节点" : `已完成 ${done} / ${items.length} 词${date === today ? " · 含逾期任务" : " · 含后来补习的词"}`}</p></div><strong className="review-total">{items.length}<small>词</small></strong></div>
        {!items.length && <p className="review-empty">这一天没有安排复习。可以点击其他日期查看词表。</p>}
        <div className="review-groups">{ordered.map(([key, rows], index) => {
          const item = rows[0], completed = item.status === "done";
          return <details key={date + key + batch} className={`review-group ${item.learnedDate === batch ? "linked" : ""}`} open={index === 0}>
            <summary><span><strong>{reviewDateLabel(item.learnedDate)}学过的词</strong><small>学习后第 {item.offset} 天 · 第 {item.stage} 次复习{item.status === "overdue" ? ` · ${reviewDateLabel(item.dueDate)}逾期` : ""}{completed ? " · 已完成" : ""}</small></span><span>{rows.length} 词</span></summary>
            {rows.map(row => <button key={row.word.id} className="review-word" onClick={() => go("/words/" + encodeURIComponent(row.word.id))}><span><strong>{row.word.word}</strong><small>{row.word.phonetic}</small><p>{row.word.commonMeaning}</p>{row.missedNodes > 1 && <em>合并 {row.missedNodes} 次漏复习</em>}</span><span className={completed ? "review-done" : ""}>{completed ? (row.completedDate === row.dueDate ? "已完成" : `${reviewDateLabel(row.completedDate!)}补习`) : row.status === "planned" ? "待安排" : row.status === "overdue" ? "待补习" : "待复习"}<ChevronRight size={14} /></span></button>)}
          </details>;
        })}</div>
        <button className="primary wide review-start" disabled={!pending.length || date > today} onClick={() => session && !session.completed ? setReplace(true) : begin()}>{date > today ? "未来复习计划，仅供查看" : pending.length ? `开始${date === today ? "今日" : "所选日期"}复习 · ${pending.length} 词` : items.length ? "当天复习已完成" : "当天暂无复习词"}<ArrowRight size={17} /></button>
        <p className="review-note">答对自动下一题，答错后继续巩固。漏过多个节点的同一词，补习一次合并处理；未来节点按原日期保留。</p>
      </section>
    </>}
    <AlertDialog open={replace} onOpenChange={setReplace}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>开始新的复习？</AlertDialogTitle><AlertDialogDescription>尚有未完成的测试。开始复习将替换未完成的题目，已经保存的学习记录会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={begin}>开始新的复习</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
