import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, ScanText, Trash2 } from "lucide-react";
import { preparePhoto, MAX_PHOTOS, MAX_PHOTO_WORDS, type ImportPhoto, type PhotoResult } from "../features/import/photo";
import { recognizePhotos, serviceStatus } from "../features/reading/service";

export default function PhotoImport({ disabled, onBusy, onResult, go }: {
  disabled: boolean; onBusy: (busy: boolean) => void;
  onResult: (result: PhotoResult) => void; go: (path: string) => void;
}) {
  const [photos, setPhotos] = useState<ImportPhoto[]>([]);
  const [phase, setPhase] = useState<"idle" | "preparing" | "recognizing">("idle");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const active = useRef(true); const epoch = useRef(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    void serviceStatus().then(s => { if (active.current) setConfigured(s.configured); })
      .catch(() => { if (active.current) { setConfigured(false); setError("无法读取 AI 配置，请到设置中重新配置。"); } });
    return () => { active.current = false; epoch.current++; request.current?.abort(); onBusy(false); };
  }, []);
  async function add(files: FileList | null) {
    if (!files?.length || disabled || phase !== "idle") return;
    setError("");
    if (photos.length + files.length > MAX_PHOTOS) { setError(`每批最多 ${MAX_PHOTOS} 张照片，请先移除多余照片。`); return; }
    const token = ++epoch.current;
    setPhase("preparing"); onBusy(true);
    try {
      const prepared = await Promise.all([...files].map(preparePhoto));
      if (active.current && token === epoch.current) setPhotos(prev => [...prev, ...prepared]);
    } catch (e) { if (active.current && token === epoch.current) setError(e instanceof Error ? e.message : "照片读取失败，请重新选择。"); }
    finally { if (active.current && token === epoch.current) { setPhase("idle"); onBusy(false); } }
  }
  function cancel() {
    epoch.current++; request.current?.abort(); request.current = null;
    setPhase("idle"); onBusy(false); setError("已取消等待，未导入单词。已发出的请求可能已计费，可手动重新识别。");
  }
  async function recognize() {
    if (!photos.length || disabled || phase !== "idle" || !configured) return;
    const token = ++epoch.current; const controller = new AbortController(); request.current = controller;
    setPhase("recognizing"); onBusy(true); setError("");
    try {
      const result = await recognizePhotos(photos, `photo-${crypto.randomUUID()}`, controller.signal);
      if (!active.current || token !== epoch.current || controller.signal.aborted) return;
      if (!result.drafts.length) { setError(result.warnings.join("；") || "没有识别到生词，请重新拍摄清晰的生词列表。"); return; }
      onResult(result);
    } catch (e) {
      if (active.current && token === epoch.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "识别失败，请手动重试。");
    } finally { if (active.current && token === epoch.current) { request.current = null; setPhase("idle"); onBusy(false); } }
  }
  const locked = disabled || phase !== "idle";
  return <section className="photo-import" aria-label="拍照导入生词">
    <div className="photo-import-heading"><span className="photo-import-icon"><ScanText size={24} /></span><div><h2>拍下生词，直接整理</h2><p>手写清单或打印词表 · 自动补全释义、考点、搭配和例句</p></div></div>
    <div className="photo-pick-actions">
      <label className={`primary file-button${locked ? " disabled" : ""}`}><Camera size={18} />拍照
        <input type="file" accept="image/*" capture="environment" aria-label="拍摄生词照片" disabled={locked || photos.length >= MAX_PHOTOS} onChange={e => { void add(e.target.files); e.target.value = ""; }} />
      </label>
      <label className={`secondary file-button${locked ? " disabled" : ""}`}><ImagePlus size={18} />从相册选择
        <input type="file" accept="image/*" multiple aria-label="选择生词照片" disabled={locked || photos.length >= MAX_PHOTOS} onChange={e => { void add(e.target.files); e.target.value = ""; }} />
      </label>
    </div>
    <p className="micro">每批最多 {MAX_PHOTOS} 张照片、{MAX_PHOTO_WORDS} 个词。字迹拍清楚，裁掉无关背景；更多生词请分批拍摄。</p>
    {photos.length > 0 && <div className="photo-thumbnails">{photos.map((photo, i) => <div key={photo.id}><img src={photo.dataUrl} alt={`待识别生词照片 ${i + 1}`} /><button className="icon-button" aria-label={`移除照片 ${i + 1}`} disabled={locked} onClick={() => setPhotos(prev => prev.filter(p => p.id !== photo.id))}><Trash2 size={16} /></button><span>照片 {i + 1}</span></div>)}</div>}
    {configured === false && <p className="photo-setup">请先在设置中填写自己的 DeepSeek API 密钥。<button className="text-button" disabled={locked} onClick={() => go("/settings")}>前往设置</button></p>}
    <p className="photo-send-note">点“识别并整理”后，仅将本次选中的照片发送给 DeepSeek，按你的 API 账户用量计费。整理结果可修改，确认后才入库。</p>
    <div className="photo-recognize-actions"><button className="primary" disabled={!photos.length || !configured || locked} onClick={() => void recognize()}><ScanText size={18} />{phase === "recognizing" ? "正在识别并补全…" : "识别并整理"}</button>{phase === "recognizing" && <button className="secondary" onClick={cancel}>取消识别</button>}</div>
    {phase === "preparing" && <p role="status">正在准备照片…</p>}
    {phase === "recognizing" && <p role="status">正在读取生词并补全学习资料，请稍候。离开此页会取消等待。</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </section>;
}
