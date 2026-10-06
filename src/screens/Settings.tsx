import { useState } from "react";
import { version as appVersion } from "../../package.json";
import {
  Download,
  Upload,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { State, SaveState } from "../types";
import ReadingSettings from "./ReadingSettings";
import type { useReading } from "../features/reading/useReading";
import { initializeReading, validateReadingBackup } from "../features/reading/engine";
import { Picker } from "../components/ui";
import { download, defaults } from "../db";
import { modes } from "../features/quiz/engine";
export default function Settings({
  state,
  save,
  clearSession,
  readingControls,
}: {
  state: State;
  save: SaveState;
  clearSession: () => void;
  readingControls: ReturnType<typeof useReading>;
}) {
  const [action, setAction] = useState("");
  const [backup, setBackup] = useState<State | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const set = (key: string, value: unknown) =>
    void save(s => ({ ...s, settings: { ...s.settings, [key]: value } }));
  async function restore(file?: File) {
    if (!file) return;
    try {
      const b = JSON.parse(await file.text());
      if (
        b.version !== 1 ||
        !b.data ||
        !Array.isArray(b.data.words) ||
        !Array.isArray(b.data.attempts) ||
        !Array.isArray(b.data.days) ||
        !b.data.records
      )
        throw Error("格式错误");
      const s = b.data as State;
      const ids = new Set<string>();
      for (const w of s.words) {
        if (
          typeof w.id !== "string" ||
          !w.id ||
          ids.has(w.id) ||
          typeof w.word !== "string" ||
          !w.word ||
          [
            "commonMeaning",
            "rareMeaning",
            "phonetic",
            "usage",
            "example",
            "source",
          ].some((k) => typeof w[k as keyof typeof w] !== "string") ||
          !Array.isArray(w.tags)
        )
          throw Error("词汇字段缺失或重复");
        ids.add(w.id);
      }
      for (const r of Object.values(s.records))
        if (
          !ids.has(r.wordId) ||
          !Number.isInteger(r.mastery) ||
          r.mastery < 0 ||
          r.mastery > 4 ||
          !Number.isFinite(r.correctCount) ||
          !Number.isFinite(r.wrongCount)
        )
          throw Error("学习记录不完整");
      for (const a of s.attempts)
        if (
          !ids.has(a.wordId) ||
          !Number.isFinite(a.time) ||
          typeof a.correct !== "boolean"
        )
          throw Error("测试记录不完整");
      for (const d of s.days)
        if (
          typeof d.date !== "string" ||
          !Array.isArray(d.wordIds) ||
          d.wordIds.some((id) => !ids.has(id))
        )
          throw Error("每日词表不完整");
      s.settings = { ...defaults, ...s.settings };
      if (
        !["light", "dark", "system"].includes(s.settings.theme) ||
        !Number.isFinite(s.settings.goal) ||
        s.settings.goal < 1
      )
        throw Error("设置格式错误");
      validateReadingBackup(s);
      s.settings.readingAuto = false;
      setBackup(initializeReading(s));
      setAction("restore");
    } catch (e) {
      setMessage("无法恢复备份：" + (e as Error).message);
    }
  }
  async function confirm() {
    setPending(true);
    try {
      readingControls.pause();
      await save(current => (
        action === "restore" && backup
          ? backup
          : action === "records"
            ? { ...current, records: {}, attempts: [], reading: { version: 1, batches: [] } }
            : { ...current, words: [], records: {}, days: [], attempts: [], reading: { version: 1, batches: [] } }
        ),
      );
      clearSession();
      setMessage(action === "restore" ? "备份已恢复" : "已完成清理");
      setAction("");
    } catch (e) {
      setMessage("保存失败，请重试。");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>我的设置</h1>
          <p>适合自己的节奏，才容易坚持。</p>
          <p className="micro">当前版本 · v{appVersion.replace(/\.0$/, "")}</p>
        </div>
      </div>
      {message && (
        <p role="status" className="note">
          {message}
        </p>
      )}
      <section className="settings-section">
        <h2>外观与学习</h2>
        <div className="setting-row">
          <div>
            <strong>主题</strong>
            <p>暖杏主题 · 可切换浅色、深色或跟随系统</p>
          </div>
          <div className="segmented theme-picker">
            {[
              [Sun, "light", "浅色"],
              [Moon, "dark", "深色"],
              [Monitor, "system", "跟随系统"],
            ].map(([Icon, k, t]) => (
              <button
                key={String(k)}
                className={state.settings.theme === k ? "active" : ""}
                onClick={() => set("theme", k)}
              >
                <Icon size={16} />
                {String(t)}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>每日学习目标</strong>
            <p>按实际测试过的不同单词计数</p>
          </div>
          <input
            aria-label="每日学习目标"
            type="number"
            min="1"
            max="1000"
            value={state.settings.goal}
            onChange={(e) =>
              set(
                "goal",
                Math.max(1, Math.min(1000, Number(e.target.value) || 1)),
              )
            }
          />
        </div>
        <div className="setting-row">
          <strong>默认测试数量</strong>
          <Picker
            label="默认测试数量"
            value={state.settings.count}
            onChange={(v) => set("count", v)}
            items={{ 10: "10 题", 20: "20 题", 30: "30 题", all: "全部" }}
          />
        </div>
        <div className="setting-row">
          <strong>测试题型偏好</strong>
          <Picker
            label="测试题型偏好"
            value={state.settings.mode}
            onChange={(v) => set("mode", v)}
            items={modes}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>熟词僻义优先</strong>
            <p>智能混合测试中增加熟词僻义的出现概率</p>
          </div>
          <Switch
            aria-label="熟词僻义优先"
            checked={state.settings.rareFirst}
            onCheckedChange={(v) => set("rareFirst", v)}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>测试自动发音 · 美式</strong>
            <p>每题自动播放美式发音；手动可选美式或英式</p>
          </div>
          <Switch
            aria-label="自动播放发音"
            checked={state.settings.audio}
            onCheckedChange={(v) => set("audio", v)}
          />
        </div>
      </section>
      <ReadingSettings state={state} save={save} controls={readingControls} />
      <section className="settings-section">
        <h2>数据管理</h2>
        <div className="setting-row">
          <div>
            <strong>备份你的积累</strong>
            <p>
              {state.words.length} 个单词 · {state.attempts.length} 条答题记录
            </p>
          </div>
          <button
            className="secondary"
            onClick={() =>
              download("lexiday-backup.json", {
                version: 1,
                exportedAt: new Date().toISOString(),
                data: state,
              }).catch((e: Error) => setMessage("导出失败：" + e.message))
            }
          >
            <Download size={17} />
            导出全部数据
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>从 JSON 备份恢复</strong>
            <p>恢复会替换词库、记录、阅读材料和设置；不含 API 密钥，恢复后自动生成关闭</p>
          </div>
          <label className="secondary file-button">
            <Upload size={17} />
            导入备份
            <input
              type="file"
              aria-label="导入备份"
              accept=".json"
              onChange={(e) => {
                void restore(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="setting-row">
          <div>
            <strong>清空学习记录</strong>
            <p>保留单词内容与每日词表；同时移除阅读材料和累计进度</p>
          </div>
          <button
            className="text-button danger"
            onClick={() => setAction("records")}
          >
            清空记录
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>清空词库</strong>
            <p>移除所有单词、每日词表、学习记录和阅读材料</p>
          </div>
          <button
            className="text-button danger"
            onClick={() => setAction("words")}
          >
            清空词库
          </button>
        </div>
      </section>
      <div className="note">
        <ShieldCheck size={24} />
        <p>
          学习记录和已生成文章保存在当前设备。AI 阅读发送本次所需词汇或语境；拍照识词仅在手动识别时发送选中的照片。切换设备或清理应用数据前，请先导出备份。
        </p>
      </div>
      <section className="install-help">
        <h3>安装到桌面</h3>
        <p>
          Chrome /
          Edge：打开浏览器菜单，选择“安装应用”。首次联网打开后，应用会缓存离线资源。手机可选择“添加到主屏幕”。
        </p>
      </section>
      <AlertDialog
        open={!!action}
        onOpenChange={(v) => !v && !pending && setAction("")}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === "restore"
                ? "确认恢复备份？"
                : action === "records"
                  ? "确认清空学习记录？"
                  : "确认清空整个词库？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。建议先导出一份备份。
              {action === "restore" &&
                `将恢复 ${backup?.words.length} 个单词。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              {pending ? "处理中…" : "确认操作"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
