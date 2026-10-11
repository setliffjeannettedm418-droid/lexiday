import { useEffect, useRef, useState } from "react";
import { addStudyDays } from "./plan";

export const reviewDateLabel = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
export function ReviewCurve({ days, learnedDate, selectedDate, choose }: {
  days: number[]; learnedDate: string; selectedDate: string; choose: (date: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element); setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  const max = days[days.length - 1], left = 26, right = Math.max(width, 240) - 12, top = 28, bottom = 150;
  const x = (day: number) => left + (right - left) * Math.log2(day + 1) / Math.log2(max + 1);
  const y = (retention: number) => bottom - (bottom - top) * retention;
  const path = (points: number[][]) => points.map(([day, retention], i) => `${i ? "L" : "M"}${x(day).toFixed(2)},${y(retention).toFixed(2)}`).join(" ");
  const baseline = Array.from({ length: 121 }, (_, i) => [max * i / 120, Math.exp(-1.15 * Math.sqrt(max * i / 120))]);
  const reviewed = [[0, 1]], stops = [0, ...days];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i], floor = .5 + Math.min(i - 1, 7) * .055;
    for (let j = 1; j <= 12; j++) reviewed.push([a + (b - a) * j / 12, 1 - (1 - floor) * Math.sqrt(j / 12)]);
    reviewed.push([b, 1]);
  }
  const active = days.findIndex(day => addStudyDays(learnedDate, day) === selectedDate);
  // Long custom schedules can cluster axis labels; every node still has a full button below.
  const ticks = [0, ...days].filter((day, i, list) => !i || i === list.length - 1 || (x(day) - x(list[i - 1]) >= 24 && x(max) - x(day) >= 24));
  return <>
    <div className="review-legend"><span><b className="review-dashed" />未复习</span><span><b />按节点复习</span></div>
    <div ref={container} className="review-chart">
      <svg viewBox={`0 0 ${Math.max(width, 240)} 200`} role="img" aria-label="遗忘与复习的示意曲线，不代表个人实测记忆率。下方按钮显示每个复习节点及日期。">
        <text x="0" y="12">记忆保持（示意）</text>
        {[0, .5, 1].map((v, i) => <g key={v}><line className="review-gridline" x1={left} x2={right} y1={y(v)} y2={y(v)} /><text x={left - 8} y={y(v) + 4} textAnchor="end">{["低", "中", "高"][i]}</text></g>)}
        <path className="review-area" d={`${path(reviewed)} L${right},${bottom} L${left},${bottom}Z`} />
        <path className="review-baseline" d={path(baseline)} /><path className="review-line" d={path(reviewed)} />
        {active >= 0 && <line className="review-selected-line" x1={x(days[active])} x2={x(days[active])} y1={top - 7} y2={bottom} />}
        {days.map((day, i) => <circle key={day} className={i === active ? "review-chosen" : "review-node"} cx={x(day)} cy={top} r={i === active ? 5 : 3.5} />)}
        {ticks.map(day => <text key={day} x={x(day)} y={bottom + 18} textAnchor="middle">{day}</text>)}
        <text x={right} y="193" textAnchor="end">学习后天数 · 压缩刻度</text>
      </svg>
    </div>
    <div className="review-nodes" aria-label="复习节点">
      {days.map((day, i) => {
        const date = addStudyDays(learnedDate, day);
        return <button key={day} aria-label={`第${day}天，${reviewDateLabel(date)}，第${i + 1}次复习`} aria-pressed={date === selectedDate} onClick={() => choose(date)}><strong>第 {day} 天</strong><small>{Number(date.slice(5, 7))}/{Number(date.slice(8))}</small></button>;
      })}
    </div>
  </>;
}
