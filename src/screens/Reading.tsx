import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Check, Cloud, Pause, Settings, Sparkles } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ProgressBar } from "../components/ui";
import { PronunciationButtons } from "../components/PronunciationButtons";
import type { SaveState, State, Word } from "../types";
import type { Speak } from "../features/audio/speech";
import { coverage, learnedWords, pendingWords, unmatchedWords } from "../features/reading/engine";
import { findHighlights, readingTokens } from "../features/reading/matcher";
import { cacheLookup, sameLookup, type LookupSelection } from "../features/reading/lookup";
import { WordLookupSheet } from "../features/reading/WordLookupSheet";
import type { useReading } from "../features/reading/useReading";
export function ReadingProgress({ state, go }: { state: State; go: (p: string) => void }) {
  const pending = pendingWords(state).length; const books = state.reading?.batches || []; const running = books.find(b => b.status === "generating");
  return <button className="reading-banner" onClick={() => go("/reading")}><span className="icon-box"><BookOpenText size={24} /></span>
    <span className="reading-banner-copy"><strong>在文章里，重新遇见学过的词</strong><span>{running ? `正在生成第 ${running.articles.length + 1} / 4 篇短文` : `${pending} / 80 新词 · ${books.filter(b => b.status === "ready").length} 组阅读材料已保存`}</span><ProgressBar value={pending / 80 * 100} /></span><ArrowRight size={20} /></button>;
}
function Highlight({ text, words, select, lookup }: { text: string; words: Word[]; select: (id: string) => void; lookup: (surface: string, start: number) => void }) {
  const chunks: React.ReactNode[] = []; let end = 0;
  function plain(start: number, finish: number) {
    let cursor = start;
    for (const token of readingTokens(text.slice(start, finish))) {
      const offset = token.start + start;
      chunks.push(text.slice(cursor, offset));
      chunks.push(<button key={`word-${offset}`} className="reading-tap-word" onClick={() => lookup(token.surface, offset)} aria-label={`查词 ${token.surface}`}>{token.surface}</button>);
      cursor = token.end + start;
    }
    chunks.push(text.slice(cursor, finish));
  }
  for (const match of findHighlights(text, words)) {
    if (match.start > end) plain(end, match.start);
    chunks.push(<button key={match.start} className="reading-word" onClick={() => select(match.wordId)} aria-label={`查看 ${match.word} 的语境词义`}>{match.surface}</button>);
    end = match.end;
  }
  plain(end, text.length); return <>{chunks}</>;
}
export default function Reading({ state, save, go, speak, controls, id }: { state: State; save: SaveState; go: (p: string) => void; speak: Speak; controls: ReturnType<typeof useReading>; id?: string }) {
  const [articleIndex, setArticleIndex] = useState(0); const [selected, setSelected] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupSelection | null>(null);
  const [largeText, setLargeText] = useState(false);
  const batches = state.reading?.batches || []; const batch = batches.find(b => b.id === id); const article = batch?.articles[articleIndex];
  const word = batch?.words.find(w => w.id === selected); const vocabulary = article?.vocabulary.find(v => v.wordId === selected);
  const targets = batch?.words.slice(articleIndex * 20, (articleIndex + 1) * 20) || [];
  const missing = article ? unmatchedWords(article, targets) : [];
  const { service, serviceError, run, pause, busy } = controls;
  const statuses = { pending: "待生成", generating: "生成中", paused: "已暂停", failed: "需要重试", ready: "已保存到本机" };
  function actions(b: typeof batches[number]) { return <div className="reading-actions">{b.status === "generating"
    ? <button className="secondary" onClick={pause}><Pause size={16} />暂停生成</button>
    : b.articles.length < 4 && (service.configured
      ? <button className="primary" disabled={busy} onClick={() => void run(b.id)}><Sparkles size={16} />{b.articles.length ? "继续生成剩余短文" : "生成这组文章"}</button>
      : <button className="secondary" onClick={() => go("/settings")}><Settings size={16} />设置生成服务</button>)}</div>; }
  if (!batch) return <>
    <div className="page-heading"><div><div className="eyebrow">WORDS IN CONTEXT</div><h1>阅读巩固</h1><p>每学 80 个新词，把它们变成可反复阅读的文章。</p></div></div>
    <section className="reading-summary"><div><span className="muted">下一组进度</span><p><strong>{pendingWords(state).length}</strong><span> / 80 词</span></p></div>
      <div className="reading-summary-progress"><ProgressBar value={pendingWords(state).length / 80 * 100} /><p>累计学习 {learnedWords(state).length} 个不同单词 · 复习不重复计数</p></div></section>
    {(!service.configured || serviceError) && <div className="reading-notice"><Cloud size={22} /><div><strong>生成时联网，阅读时离线</strong><p>{serviceError || "首次使用请配置自己的生成服务。每组 80 词分为 4 篇短文，连同译文、语法和词义详解保存在手机。"}</p><button className="text-button" onClick={() => go("/settings")}>去设置 <ArrowRight size={16} /></button></div></div>}
    {!batches.length ? <section className="reading-empty"><BookOpenText size={36} /><h2>第一个 80 词，正在积累</h2><p>提交答案和自评后计入学习。达到 80 词自动归集；配置服务并开启自动生成后，App 打开且联网时开始生成。</p><button className="primary" onClick={() => go("/test/setup")}>继续学习 <ArrowRight size={16} /></button></section>
      : <div className="reading-books">{[...batches].reverse().map(b => <section className="reading-book" key={b.id}>
        <div className="section-line"><span className="eyebrow">80 WORDS · 第 {batches.indexOf(b) + 1} 组</span><span className="reading-status">{b.status === "ready" && coverage(b) === 80 && <Check size={14} />}{b.status === "ready" && coverage(b) < 80 ? "已保存 · 有待核对词" : statuses[b.status]}</span></div>
        <h2>{b.articles[0]?.title || "让学过的词连成故事"}</h2><p>{b.words.slice(0, 6).map(w => w.word).join(" · ")} …</p><span className="muted">{b.articles.length} / 4 篇 · 已核对覆盖 {coverage(b)} / 80 词</span>
        {b.articles.length > 0 && coverage(b) < b.articles.length * 20 && <p className="reading-review-note">文章已保留，进入阅读可查看待核对词并补全。</p>}
        {b.error && <p className="reading-error" role="alert">{b.error}</p>}<div className="reading-actions">{b.articles.length > 0 && <button className="secondary" onClick={() => go(`/reading/${encodeURIComponent(b.id)}`)}>打开阅读 <ArrowRight size={16} /></button>}{actions(b)}</div>
      </section>)}</div>}
    <p className="reading-footnote">历史已学词也会归集，但不会在升级或恢复备份后直接发起付费请求。AI 内容用于学习辅助，并非考试真题；有疑问请核对教材或词典。</p>
  </>;
  return <div className={"reading-reader" + (largeText ? " reading-large" : "")}><div className="reading-toolbar"><button className="back-link" onClick={() => go("/reading")}><ArrowLeft size={17} />阅读书架</button><button className="icon-button" aria-label="放大阅读字号" aria-pressed={largeText} onClick={() => setLargeText(value => !value)}>Aa</button></div>
    <div className="section-line reading-reader-meta"><span>第 {batches.indexOf(batch) + 1} 组 · {coverage(batch)} / 80 词已覆盖</span><span>本机保存</span></div>
    <nav className="reading-tabs" aria-label="选择短文">{batch.articles.map((a, i) => <button key={i} aria-pressed={i === articleIndex} className={i === articleIndex ? "active" : ""} onClick={() => { setArticleIndex(i); setSelected(null); setLookup(null); }}>第 {i + 1} 篇</button>)}</nav>
    {article && <article className="reading-paper" key={`${batch.id}-${articleIndex}`}><div className="eyebrow">READ FIRST · UNDERSTAND NEXT</div><h1 aria-label={article.title}><Highlight text={article.title} words={[]} select={setSelected} lookup={(surface, start) => setLookup({ surface, start, sentence: article.title, translation: article.titleTranslation })} /></h1><p className="reading-hint">{targets.length - missing.length} / {targets.length} 个目标词已定位 · 点击任意英文词查释义，彩色词为本篇学习目标</p>
      {missing.length > 0 && <section className="reading-review-note" aria-label="本篇待核对词"><strong>本篇已保存 · {missing.length} 个词待核对</strong><p>正文暂未定位到：{missing.map(w => w.word).join("、")}。可能是漏词或未识别的用法；这些词暂不计入覆盖。</p><p>可以继续阅读，或补全这一篇。补全会再次调用 AI，发送本篇原文和 20 个目标词，并按用量计费。</p>{service.configured ? <button className="secondary" disabled={busy} onClick={() => void run(batch.id, articleIndex)}><Sparkles size={16} />补全本篇待核对词</button> : <button className="secondary" onClick={() => go("/settings")}>设置生成服务</button>}</section>}
      <div className="reading-prose">{Array.from({ length: Math.ceil(article.sentences.length / 3) }, (_, p) => <p key={p}>{article.sentences.slice(p * 3, p * 3 + 3).map((s, i) => <span key={i}><Highlight text={s.english} words={targets} select={setSelected} lookup={(surface, start) => setLookup({ surface, start, sentence: s.english, translation: s.translation, structure: s.structure, grammar: s.grammar })} />{" "}</span>)}</p>)}</div>
      <Accordion type="multiple" className="reading-reveals"><AccordionItem value="translation"><AccordionTrigger>查看中文译文</AccordionTrigger><AccordionContent><h3>{article.titleTranslation}</h3>{article.sentences.map((s, i) => <p className="reading-translation" key={i}><span>{i + 1}.</span> {s.translation}</p>)}</AccordionContent></AccordionItem>
        <AccordionItem value="analysis"><AccordionTrigger>查看逐句语法与句式应用</AccordionTrigger><AccordionContent>{article.sentences.map((s, i) => <section className="reading-analysis" key={i}><span className="eyebrow">SENTENCE {String(i + 1).padStart(2, "0")}</span><h3>{s.english}</h3><dl><dt>句子主干</dt><dd>{s.structure}</dd><dt>时态、从句与语法</dt><dd>{s.grammar}</dd><dt>可迁移句式</dt><dd>{s.pattern}</dd><dt>仿写应用</dt><dd><p>{s.application}</p><p className="muted">{s.applicationTranslation}</p></dd></dl></section>)}</AccordionContent></AccordionItem>
        <AccordionItem value="words"><AccordionTrigger>查看本篇 20 词与应用</AccordionTrigger><AccordionContent><div className="reading-word-list">{article.vocabulary.map(v => { const w = batch.words.find(w => w.id === v.wordId)!; return <button key={v.wordId} onClick={() => setSelected(v.wordId)}><strong>{w.word}</strong><span>{v.meaning}{missing.some(m => m.id === v.wordId) && <small className="reading-unmatched-label">正文位置待核对</small>}</span><ArrowRight size={16} /></button>; })}</div></AccordionContent></AccordionItem>
      </Accordion></article>}
    {batch.error && <p role="alert" className="reading-error">{batch.error}</p>}{actions(batch)}<p className="reading-footnote">由 {batch.model || "AI"} 生成的原创练习。覆盖检查核对词形与详解完整性，不代表所有语言分析都已由教师审核。</p>
    <Sheet open={!!word && !!vocabulary} onOpenChange={open => !open && setSelected(null)}><SheetContent side="bottom" className="reading-word-sheet"><SheetHeader><SheetTitle>{word?.word}</SheetTitle><SheetDescription>{word?.phonetic} · 语境词义与应用</SheetDescription></SheetHeader>
      {word && vocabulary && <div className="reading-word-content"><PronunciationButtons word={word.word} speak={speak} />{article?.sentences[vocabulary.sentence] ? <blockquote>{article.sentences[vocabulary.sentence].english}</blockquote> : <p className="reading-review-note">正文位置待核对，以下生成说明暂不能作为本句用法依据。可回到阅读页补全。</p>}<dl><dt>{vocabulary.sentence >= 0 ? "本句词义" : "词义说明"} · {vocabulary.partOfSpeech}</dt><dd>{vocabulary.meaning}</dd><dt>搭配与使用限制</dt><dd>{vocabulary.usage}</dd><dt>词义辨析与易错点</dt><dd>{vocabulary.contrast}</dd><dt>换个语境再用一次</dt><dd><p>{vocabulary.example}</p><p className="muted">{vocabulary.exampleTranslation}</p></dd><dt>我的词库原义</dt><dd>{word.commonMeaning}{word.rareMeaning && <p>熟词僻义：{word.rareMeaning}</p>}</dd></dl></div>}
    </SheetContent></Sheet>
    {lookup && article && <WordLookupSheet key={`${articleIndex}:${lookup.sentence}:${lookup.start}`} selection={lookup} cached={article.lookups?.find(entry => sameLookup(entry, lookup))} words={state.words} service={service} busy={busy} speak={speak}
      save={entry => save(s => cacheLookup(s, batch.id, articleIndex, entry))} close={() => setLookup(null)} settings={() => go("/settings")} />}
    </div>;
}
