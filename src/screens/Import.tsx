import { useState } from "react";
import {
  Upload,
  FileText,
  Check,
  Trash2,
  ArrowRight,
  Download,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Picker } from "../components/ui";
import { parseFile, mergeImport, type Draft } from "../features/import/parser";
import type { PhotoDraft } from "../features/import/photo";
import PhotoImport from "./PhotoImport";
import { today, downloadText } from "../db";
import type { State, SaveState } from "../types";
export default function ImportPage({
  state,
  save,
  go,
}: {
  state: State;
  save: SaveState;
  go: (p: string) => void;
}) {
  const [drafts, setDrafts] = useState<PhotoDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [photoSource, setPhotoSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setName] = useState("");
  const [policy, setPolicy] = useState("merge");
  const [date, setDate] = useState(today());
  const [page, setPage] = useState(0);
  async function parse(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      setDrafts(await parseFile(file));
      setWarnings([]); setPhotoSource(false);
      setName(file.name);
      setPage(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = drafts.filter(
    (d) => d.selected && d.word.trim() && d.commonMeaning.trim(),
  );
  const existing = new Set(state.words.map((w) => w.word.trim().toLowerCase()));
  const duplicates = drafts.filter((d) =>
    existing.has(d.word.trim().toLowerCase()),
  ).length;
  const edit = (i: number, key: string, value: unknown) =>
    setDrafts((prev) =>
      prev.map((d, j) => (j === i ? { ...d, [key]: value } : d)),
    );
  async function confirm() {
    setBusy(true);
    try {
      await save(current => mergeImport(current, drafts, policy, date));
      go("/words?date=" + date);
    } catch (e) {
      setError("保存失败，请重试：" + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BRING YOUR OWN WORDS</div>
          <h1>{drafts.length ? "确认你的词表" : "导入新的积累"}</h1>
          <p>
            {drafts.length
              ? `共识别 ${drafts.length} 个词 · ${fileName}`
              : "拍下生词或导入词表，让今天的积累马上进入学习。"}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!drafts.length ? (
        <>
          <PhotoImport disabled={busy} onBusy={setBusy} go={go} onResult={result => {
            setDrafts(result.drafts); setWarnings(result.warnings); setPhotoSource(true);
            setName("拍照识词 · DeepSeek"); setPage(0); setError("");
          }} />
          <label
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void parse(e.dataTransfer.files[0]);
            }}
          >
            <span className="upload-icon">
              <Upload size={32} />
            </span>
            <h2>选择词表文件</h2>
            <p>点击选择，也可拖放文件</p>
            <span className="file-types">
              DOCX <i /> XLSX <i /> CSV <i /> JSON
            </span>
            <input
              type="file"
              disabled={busy}
              aria-label="上传词表"
              accept=".docx,.xlsx,.csv,.json"
              onChange={(e) => void parse(e.target.files?.[0])}
            />
            <small>文件仅在当前设备解析 · 最大 20 MB</small>
          </label>
          <div className="import-guide">
            <FileText size={24} />
            <div>
              <h3>已经整理好的 Word，可以直接用</h3>
              <p>
                自动识别标准词表，以及“左侧单词和音标、右侧核心义和考研点”的背诵卡片。导入前可逐项修改，不会立即写入词库。
              </p>
              <button className="text-button" type="button" onClick={() => {
                fetch("/sample.csv").then(r => { if (!r.ok) throw new Error("无法读取示例"); return r.text(); })
                  .then(data => downloadText("lexiday-sample.csv", data, "text/csv"))
                  .catch((e: Error) => setError("保存示例失败：" + e.message));
              }}>
                <Download size={16} />
                下载 CSV 格式示例
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {photoSource && <p className="note">AI 整理结果请核对后导入；待核对词默认未勾选。可修改全部字段，考点保存在“熟词僻义 / 考点”中。</p>}
          {warnings.map((warning, i) => <p className="photo-warning" role="status" key={i}>{warning}</p>)}
          <div className="import-controls">
            <label>
              词表日期
              <input
                type="date"
                aria-label="词表日期"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <div>
              <label>检测到 {duplicates} 条已有词汇</label>
              <Picker
                label="重复词处理"
                value={policy}
                onChange={setPolicy}
                items={{
                  merge: "合并 · 保留已有学习记录",
                  overwrite: "覆盖内容 · 保留学习记录",
                  skip: "跳过已有词汇",
                }}
              />
            </div>
          </div>
          {photoSource ? <div className="photo-draft-list">
            <label className="photo-select-all"><Checkbox aria-label="全选词汇" checked={drafts.every(d => d.selected)} onCheckedChange={v => setDrafts(prev => prev.map(d => ({ ...d, selected: v === true })))} />全选词汇 · 已选 {selected.length} / {drafts.length} 个</label>
            {drafts.slice(page * 20, page * 20 + 20).map((d, j) => {
              const i = page * 20 + j;
              return <article className="photo-draft-card" key={i}>
                <Checkbox aria-label={"选择 " + d.word} checked={d.selected} onCheckedChange={v => edit(i, "selected", v === true)} />
                <details open={i === 0}>
                  <summary><strong>{d.word}</strong>{d.needsReview && <span className="photo-review-tag">待核对</span>}<span>{d.commonMeaning || "请补充释义"}</span><small>展开编辑释义与知识点</small></summary>
                  {d.needsReview && <p className="photo-review-note">{d.reviewNote || "请核对拼写与释义，确认后勾选此词。"}</p>}
                  <div className="photo-draft-fields">{([
                    ["word", "单词或短语"], ["phonetic", "音标"], ["commonMeaning", "常见意思"],
                    ["rareMeaning", "熟词僻义 / 考点"], ["usage", "固定搭配与用法"], ["example", "应用例句与译文"],
                  ] as const).map(([field, label]) => <label key={field}>{label}<textarea rows={field === "word" || field === "phonetic" ? 1 : 3} aria-label={field + " " + (i + 1)} value={String(d[field] || "")} onChange={e => edit(i, field, e.target.value)} /></label>)}</div>
                </details>
                <button className="icon-button" aria-label={"删除 " + d.word} onClick={() => { setDrafts(prev => prev.filter((_, n) => n !== i)); setPage(0); }}><Trash2 size={16} /></button>
              </article>;
            })}
          </div> : <div className="preview-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      aria-label="全选词汇"
                      checked={drafts.every((d) => d.selected)}
                      onCheckedChange={(v) =>
                        setDrafts(drafts.map((d) => ({ ...d, selected: !!v })))
                      }
                    />
                  </TableHead>
                  {[
                    "单词",
                    "音标",
                    "常见意思",
                    "熟词僻义 / 考点",
                    "搭配与用法",
                    "例句",
                    "",
                  ].map((v, i) => (
                    <TableHead key={i}>{v}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.slice(page * 20, page * 20 + 20).map((d, j) => {
                  const i = page * 20 + j;
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Checkbox
                          aria-label={"选择 " + d.word}
                          checked={d.selected}
                          onCheckedChange={(v) => edit(i, "selected", !!v)}
                        />
                        {d.needsReview && <span className="photo-review-tag" title={d.reviewNote || "请核对拼写与释义"}>待核对</span>}
                      </TableCell>
                      {[
                        "word",
                        "phonetic",
                        "commonMeaning",
                        "rareMeaning",
                        "usage",
                        "example",
                      ].map((k) => (
                        <TableCell key={k}>
                          <textarea
                            aria-label={k + " " + (i + 1)}
                            value={String(d[k as keyof Draft] || "")}
                            onChange={(e) => edit(i, k, e.target.value)}
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <button
                          className="icon-button"
                          aria-label={"删除 " + d.word}
                          onClick={() => {
                            setDrafts(drafts.filter((_, n) => n !== i));
                            setPage(0);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>}
          <div className="pagination">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <span>
              {page + 1} / {Math.ceil(drafts.length / 20)}
            </span>
            <button
              disabled={(page + 1) * 20 >= drafts.length}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
          <div className="import-footer">
            <button
              className="secondary"
              onClick={() => {
                setDrafts([]);
                setError(""); setWarnings([]); setPhotoSource(false);
              }}
            >
              取消导入
            </button>
            <button
              className="primary"
              disabled={!selected.length || busy || !date}
              onClick={() => void confirm()}
            >
              {busy ? "正在导入…" : `确认导入 ${selected.length} 个词`}
              <Check size={18} />
            </button>
          </div>
        </>
      )}
    </>
  );
}
