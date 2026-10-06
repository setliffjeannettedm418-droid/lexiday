import { pronounce, stopSpeech, type Accent } from "./features/audio/speech";
"use client";
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpen,
  House,
  PanelsTopLeft,
  ScanText,
  RotateCcw,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Upload,
  ArrowUpRight,
  Sun,
  Moon,
  WifiOff,
  BookOpenText,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import type { State, Session, SaveState } from "./types";
import { loadState, saveState } from "./db";
import Home from "./screens/Home";
import { Words, WordDetail } from "./screens/Words";
import { Setup, Quiz, Result } from "./screens/Quiz";
import ImportPage from "./screens/Import";
import Stats from "./screens/Stats";
import Settings from "./screens/Settings";
import { EmptyState } from "./components/ui";
import Reading from "./screens/Reading";
import { queueReading } from "./features/reading/engine";
import { useReading } from "./features/reading/useReading";
const links = [
  ["/", "首页", House],
  ["/words", "我的词库", BookOpen],
  ["/test/setup", "开始测试", ScanText],
  ["/mistakes", "错题复习", RotateCcw],
  ["/reading", "阅读巩固", BookOpenText],
  ["/stats", "学习统计", ChartNoAxesCombined],
] as const;
const SystemBars = registerPlugin<{ setStyle(options: { style: string }): Promise<void> }>('SystemBars');
export default function Lexiday() {
  const [state, setState] = useState<State | null>(null);
  const currentState = useRef<State | null>(null);
  const [path, setPath] = useState("/");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const speechRequest = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const save: SaveState = useCallback(async (next) => {
    const task = saveQueue.current.catch(() => {}).then(async () => {
      if (!currentState.current) throw new Error("词库尚未加载");
      const raw = typeof next === "function" ? next(currentState.current) : next;
      const value = queueReading(raw, !raw.reading);
      await saveState(value); currentState.current = value; setState(value);
    });
    saveQueue.current = task;
    try { await task; } catch (e) { toast.error("保存失败，请检查设备存储空间后重试"); throw e; }
  }, []);
  const readingControls = useReading(state, save, offline);
  useEffect(() => {
    document.documentElement.classList.toggle("native-app", Capacitor.isNativePlatform());
    loadState()
      .then(value => { currentState.current = value; setState(value); })
      .catch((e) => setError("无法打开本地数据库：" + e.message));
    setPath(location.pathname + location.search);
    try {
      const s = localStorage.getItem("lexiday-session");
      if (s) setSession(JSON.parse(s));
    } catch {}
    const pop = () => setPath(location.pathname + location.search);
    window.addEventListener("popstate", pop);
    const net = () => setOffline(!navigator.onLine);
    net();
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    if ("serviceWorker" in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform())
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => toast.error("离线缓存未启用，请联网重新打开应用"));
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const m = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = state.settings.theme === "dark" || (state.settings.theme === "system" && m.matches);
      document.documentElement.classList.toggle("dark", dark);
      if (Capacitor.isNativePlatform()) void SystemBars.setStyle({ style: dark ? "DARK" : "LIGHT" }).catch(() => {});
    };
    apply();
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, [state?.settings.theme]);
  function go(p: string) {
    history.pushState({}, "", p);
    setPath(p);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function update(s: Session) {
    setSession(s);
    try {
      localStorage.setItem("lexiday-session", JSON.stringify(s));
    } catch {
      toast.error("当前会话暂时无法备份；已提交的学习记录仍在数据库中");
    }
  }
  function start(s: Session) {
    update(s);
    go("/test/session");
  }
  async function speak(word: string, accent: Accent = "us") {
    const id = ++speechRequest.current;
    const loading = setTimeout(() => { if (id === speechRequest.current) toast.loading(`正在准备${accent === "gb" ? "英式" : "美式"}发音…`, { id: "speech-loading" }); }, 800);
    try { await pronounce(word, accent); }
    catch (e) { if (id === speechRequest.current) toast.error((e as Error).message || "发音暂时无法播放", { id: "speech-error" }); }
    finally { clearTimeout(loading); if (id === speechRequest.current) toast.dismiss("speech-loading"); }
  }
  useEffect(() => { speechRequest.current++; toast.dismiss("speech-loading"); void stopSpeech(); }, [path]);
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const testing = route === "/test/session" && session && !session.completed;
  if (error)
    return (
      <div className="empty">
        <h1>暂时无法加载</h1>
        <p>{error}</p>
        <button className="primary" onClick={() => location.reload()}>
          重试
        </button>
      </div>
    );
  if (!state)
    return (
      <div className="loading">
        <div className="brand-mark">
          <BookOpen />
        </div>
        <h2>词序 Lexiday</h2>
        <p>正在打开你的词库…</p>
      </div>
    );
  let content;
  if (route === "/") content = <Home state={state} go={go} session={session} />;
  else if (route === "/words")
    content = (
      <Words
        key={path}
        state={state}
        go={go}
        initialDate={params.get("date") || "all"}
      />
    );
  else if (route.startsWith("/words/"))
    content = (
      <WordDetail
        state={state}
        go={go}
        id={route.split("/")[2]}
        speak={speak}
      />
    );
  else if (route === "/mistakes")
    content = <Words key="mistakes" state={state} go={go} mistakes />;
  else if (route === "/import")
    content = <ImportPage state={state} save={save} go={go} />;
  else if (route === "/stats") content = <Stats state={state} go={go} />;
  else if (route === "/reading" || route.startsWith("/reading/"))
    content = <Reading key={path} state={state} save={save} go={go} speak={speak} controls={readingControls} id={route.split("/")[2] ? decodeURIComponent(route.split("/")[2]) : undefined} />;
  else if (route === "/settings")
    content = (
      <Settings
        state={state}
        save={save}
        readingControls={readingControls}
        clearSession={() => {
          setSession(null);
          localStorage.removeItem("lexiday-session");
        }}
      />
    );
  else if (route === "/test/session" && testing)
    content = (
      <Quiz
        state={state}
        session={session}
        update={update}
        save={save}
        go={go}
        speak={speak}
      />
    );
  else if (route === "/test/result" && session?.completed)
    content = <Result state={state} session={session} start={start} go={go} />;
  else if (route.startsWith("/test/"))
    content = (
      <>
        {session && !session.completed && (
          <button className="resume" onClick={() => go("/test/session")}>
            继续未完成的测试 · 第 {session.index + 1} 题{" "}
            <ArrowUpRight size={17} />
          </button>
        )}
        <Setup key={path} state={state} params={params} start={start} go={go} />
      </>
    );
  else
    content = (
      <EmptyState title="没有找到这个页面">
        <button className="primary" onClick={() => go("/")}>
          返回首页
        </button>
      </EmptyState>
    );
  return (
    <div className={"app apricot-app " + (testing ? "is-testing" : "")} data-route={route}>
      <Toaster richColors position="top-center" />
      <header className="top-navigation">
        <button className="brand" onClick={() => go("/")}>
          <strong>
            词序<span>Lexiday</span>
          </strong>
        </button>
        <nav aria-label="主导航">
          {links.map(([p, label, Icon]) => (
            <button
              key={p}
              className={
                (
                  p === "/"
                    ? route === "/"
                    : route.startsWith(p.split("/").slice(0, 2).join("/"))
                )
                  ? "active"
                  : ""
              }
              onClick={() => go(p)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="icon-button theme-toggle"
            aria-label="切换浅色深色"
            onClick={() =>
              void save(current => ({
                ...current,
                settings: {
                  ...current.settings,
                  theme: document.documentElement.classList.contains("dark")
                    ? "light"
                    : "dark",
                },
              }))
            }
          >
            {state.settings.theme === "dark" ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="我的设置"
            onClick={() => go("/settings")}
          >
            <SettingsIcon size={20} />
          </button>
          <button className="import-button" onClick={() => go("/import")}>
            <Upload size={16} />
            导入词表
          </button>
        </div>
      </header>
      {offline && (
        <div className="offline">
          <WifiOff size={14} />
          离线模式 · 学习记录仍会保存在此设备
        </div>
      )}
      <main className="main-content">{content}</main>
      <footer className="desktop-footer">
        <span>词序 Lexiday</span>
        <span>每天一点，离目标更近一点。</span>
        <span>本地存储 · 为专注而设计</span>
      </footer>
      <nav className="bottom-navigation" aria-label="底部导航">
        {[
          ["/", "首页", House],
          ["/words", "词库", BookOpen],
          ["/test/setup", "测试", ScanText],
          ["/mistakes", "错题", RotateCcw],
          ["/reading", "阅读", BookOpenText],
        ].map(([p, label, Icon]) => (
          <button
            key={String(p)}
            className={
              (
                p === "/"
                  ? route === "/"
                  : route.startsWith(String(p).split("/").slice(0, 2).join("/"))
              )
                ? "active"
                : ""
            }
            onClick={() => go(String(p))}
          >
            <Icon size={21} />
            <span>{String(label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
