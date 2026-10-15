import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";

export function CollectTodayButton({ added, add, disabled = false, hint = "保存原形、释义和原句；首次测试后开始复习排期。" }: {
  added: boolean; add: () => Promise<void>; disabled?: boolean; hint?: string;
}) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const locked = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function collect() {
    if (added || disabled || locked.current) return;
    locked.current = true; setPending(true); setError("");
    try { await add(); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "加词保存失败，请重试。"); }
    finally { locked.current = false; if (mounted.current) setPending(false); }
  }
  return <section className="exam-collect"><button className="primary wide" disabled={pending || added || disabled} onClick={() => void collect()}>
    {pending ? <LoaderCircle size={17} className="reading-spinning" /> : added ? <Check size={17} /> : <Plus size={17} />}
    {pending ? "正在保存…" : added ? "已加入今日词表" : "加入今日词表"}
  </button><p role="status">{added ? "已计入今日词汇，可在今日测试中练习；已有学习进度继续保留。" : hint}</p>
    {error && <p className="reading-error" role="alert">{error}</p>}</section>;
}
