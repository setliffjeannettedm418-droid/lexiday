import { useEffect, useRef, useState } from "react";
import type { SaveState, State } from "../types";
import { DEFAULT_REVIEW_DAYS, reviewDays, validReviewDays } from "../features/review/plan";

export default function ReviewSettings({ state, save }: { state: State; save: SaveState }) {
  const [value, setValue] = useState(() => reviewDays(state.settings.reviewDays).join(", "));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const persisted = reviewDays(state.settings.reviewDays).join(", ");
  useEffect(() => { setValue(persisted); }, [persisted]);
  async function apply(days: number[]) {
    if (pending.current) return;
    if (!validReviewDays(days)) { setMessage("请输入 1–8 个递增且不重复的天数，每个为 1–365 的整数。"); return; }
    pending.current = true; setBusy(true); setMessage("");
    try { await save(current => ({ ...current, settings: { ...current.settings, reviewDays: days } })); setValue(days.join(", ")); setMessage("复习节点已保存，词表按首次学习日期重新排期。"); }
    catch { setMessage("保存失败，原复习安排仍保留，请重试。"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="settings-section review-settings">
    <h2>间隔复习计划</h2><p className="review-note">默认在首次学习后的第 1、2、4、7、15、30 天复习。节点按日历日期计算，原有错题巩固仍可使用。</p>
    <label htmlFor="review-days">复习节点（天）</label><input id="review-days" value={value} onChange={e => setValue(e.target.value)} disabled={busy} placeholder="1, 2, 4, 7, 15, 30" />
    <p className="review-note">用逗号分隔。修改会重新计算所有学习批次的计划；学习记录不变。旧词从最早可用的答题日期起算。</p>
    <div className="review-settings-actions"><button className="primary" disabled={busy} onClick={() => void apply(value.trim().split(/[,，、\s]+/).map(Number))}>{busy ? "正在保存…" : "保存复习节点"}</button><button className="secondary" disabled={busy} onClick={() => void apply([...DEFAULT_REVIEW_DAYS])}>恢复默认</button></div>
    {message && <p className="review-note" role="status">{message}</p>}
  </section>;
}
