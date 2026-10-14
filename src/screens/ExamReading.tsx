import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Check, Download, ExternalLink, LoaderCircle, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { SaveState, State } from "../types";
import type { Speak } from "../features/audio/speech";
import type { useReading } from "../features/reading/useReading";
import { examCatalog, examSource, examYears, examSentences, examQuestionBlocks, saveExamArticle, saveExamLookup, collectExamWord, saveExamAnalysis, saveExamTranslation } from "../features/exams/engine";
import { loadExamDocument } from "../features/exams/documents";
import { readingTokens } from "../features/reading/matcher";
import { sameLookup, type LookupSelection } from "../features/reading/lookup";
import { WordLookupSheet } from "../features/reading/WordLookupSheet";
import { explainExamSentence, translateExamParagraph } from "../features/reading/service";
import { today } from "../db";
import { newId } from "../utils/id";

function TapSentence({ sentence, lookup, question = false }: { sentence: string; lookup: (selection: LookupSelection) => void; question?: boolean }) {
  const chunks: React.ReactNode[] = []; let end = 0;
  for (const token of readingTokens(sentence)) {
    if (question && /^[A-D]$/.test(token.surface) && /(?:^|\s)[\[(（]?$/.test(sentence.slice(0, token.start)) && /^[\])）.、]/.test(sentence.slice(token.end))) continue;
    chunks.push(sentence.slice(end, token.start));
    chunks.push(<button key={token.start} className="reading-tap-word" aria-label={`查词 ${token.surface}`} onClick={() => lookup({ surface: token.surface, start: token.start, sentence, translation: "" })}>{token.surface}</button>);
    end = token.end;
  }
  chunks.push(sentence.slice(end)); return <>{chunks}</>;
}
export default function ExamReading({ state, save, go, speak, controls, id, year }: { state: State; save: SaveState; go: (path: string) => void; speak: Speak; controls: ReturnType<typeof useReading>; id?: string; year?: number }) {
  const source = id ? examSource(id) : undefined;
  const article = state.examReading?.articles.find(item => item.id === id);
  const [lookup, setLookup] = useState<LookupSelection | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [pendingSentence, setPendingSentence] = useState("");
  const [pendingParagraph, setPendingParagraph] = useState("");
  const [expandedTranslations, setExpandedTranslations] = useState<string[]>([]);
  const [translationError, setTranslationError] = useState<{ paragraph: string; message: string } | null>(null);
  const [largeText, setLargeText] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const request = useRef<AbortController | null>(null), analysisRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); analysisRequest.current?.abort(); }; }, []);
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener("online", changed); window.addEventListener("offline", changed);
    return () => { window.removeEventListener("online", changed); window.removeEventListener("offline", changed); };
  }, []);
  async function load() {
    if (!source || request.current) return;
    const controller = new AbortController(); request.current = controller; setLoading(true); setError("");
    try {
      const result = await loadExamDocument(source.id, controller.signal);
      if (controller.signal.aborted) return;
      await save(current => controller.signal.aborted ? current : saveExamArticle(current, result));
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "下载失败，请稍后重试。"); }
    finally { request.current = null; if (mounted.current) setLoading(false); }
  }
  async function analyze(sentence: string) {
    if (!source || analysisRequest.current || !controls.service.configured || controls.busy || !online) return;
    const controller = new AbortController(); analysisRequest.current = controller; setPendingSentence(sentence); setError("");
    try {
      const result = await explainExamSentence(sentence, controls.service.model, `sentence-${newId()}`, controller.signal);
      if (controller.signal.aborted) return;
      await save(current => controller.signal.aborted ? current : saveExamAnalysis(current, source.id, result));
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "解析失败，请手动重试。"); }
    finally { analysisRequest.current = null; if (mounted.current) setPendingSentence(""); }
  }
  async function translate(paragraph: string) {
    if (!source || analysisRequest.current || !controls.service.configured || controls.busy || !online) return;
    const controller = new AbortController(); analysisRequest.current = controller; setPendingParagraph(paragraph); setTranslationError(null);
    try {
      const result = await translateExamParagraph(paragraph, controls.service.model, `paragraph-${newId()}`, controller.signal);
      if (controller.signal.aborted) return;
      await save(current => controller.signal.aborted ? current : saveExamTranslation(current, source.id, result));
      if (!controller.signal.aborted && mounted.current) setExpandedTranslations(current => [...new Set([...current, paragraph])]);
    } catch (e) { if (!controller.signal.aborted) setTranslationError({ paragraph, message: e instanceof Error ? e.message : "翻译失败，请手动重试。" }); }
    finally { analysisRequest.current = null; if (mounted.current) setPendingParagraph(""); }
  }
  if (!id) {
    const selectedYear = year && examYears.includes(year) ? year : undefined;
    const collected = state.examReading?.contexts.filter(context => state.days.find(day => day.date === today())?.wordIds.includes(context.wordId)).map(context => context.wordId) || [];
    return <div className="exam-reading"><div className="page-heading"><div><div className="eyebrow">ENGLISH II · READ & COLLECT</div><h1>英语二真题阅读</h1><p>在真题里理解词汇，把新收获留给今天。</p></div></div>
      <div className="exam-summary"><span>2010—2026 · 17 年 · 68 篇阅读理解</span><button className="text-button" onClick={() => go(`/words?date=${today()}`)}>今日词表{collected.length ? ` · ${new Set(collected).size} 个采集词` : ""}<ArrowRight size={16} /></button></div>
      {selectedYear ? <><button className="back-link" onClick={() => go("/exam-reading")}><ArrowLeft size={17} />全部年份</button><h2 className="exam-year-title">{selectedYear} 年 · 四篇阅读</h2><div className="exam-articles">{examCatalog.filter(item => item.year === selectedYear).map(item => {
        const cached = state.examReading?.articles.some(article => article.id === item.id);
        return <button className="exam-article-entry" key={item.id} onClick={() => go(`/exam-reading/${item.id}`)}><span className="exam-article-number">{String(item.number).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{cached ? "已保存 · 可离线阅读" : "首次联网打开后保存到本机"}</small></span>{cached ? <Check size={18} /> : <ArrowRight size={18} />}</button>;
      })}</div></> : <div className="exam-years">{examYears.map(value => {
        const saved = state.examReading?.articles.filter(item => examSource(item.id)?.year === value).length || 0;
        return <button className="exam-year-entry" key={value} onClick={() => go(`/exam-reading?year=${value}`)}><span><strong>{value}</strong><small>4 篇阅读{saved ? ` · 已保存 ${saved} 篇` : ""}</small></span><ArrowRight size={18} /></button>;
      })}</div>}
      <p className="reading-footnote">目录内置，正文由懒笔记公开资料入口获取并保存到本机。点词查义使用随包离线词典；新增 AI 解析需要自己的生成服务。</p></div>;
  }
  if (!source) return <div className="reading-empty"><h1>没有找到这篇阅读</h1><button className="primary" onClick={() => go("/exam-reading")}>返回真题目录</button></div>;
  const sentences = article?.paragraphs.flatMap(examSentences) || [];
  function openLookup(selection: LookupSelection) {
    const analysis = article?.analyses?.find(item => item.sentence === selection.sentence);
    const translation = article?.translations?.find(item => item.paragraph === selection.sentence);
    setLookup({ ...selection, translation: analysis?.translation || translation?.translation || "", structure: analysis?.structure, grammar: analysis?.grammar });
  }
  function translationControl(text: string, key: string, label: string) {
    const cached = article?.translations?.find(item => item.paragraph === text);
    const expanded = expandedTranslations.includes(text), failed = translationError?.paragraph === text;
    return <><div className="exam-translation-tools"><button className="text-button" aria-expanded={expanded} aria-controls={`exam-translation-${key}`} disabled={!cached && (!!pendingParagraph || !!pendingSentence || (controls.service.configured && (controls.busy || !online)))} onClick={() => {
      if (cached) setExpandedTranslations(current => expanded ? current.filter(item => item !== text) : [...current, text]);
      else if (!controls.service.configured) go("/settings");
      else void translate(text);
    }}>{pendingParagraph === text ? <LoaderCircle size={15} className="reading-spinning" /> : <BookOpenText size={15} />}{cached ? expanded ? "收起译文" : "查看译文" : pendingParagraph === text ? "正在翻译…" : failed ? `重试${label}` : label}</button><small>{cached ? "已保存 · 可离线查看" : !controls.service.configured ? "需设置翻译服务" : !online ? "联网后可翻译" : "点击后使用 AI 翻译"}</small></div>
      {cached && expanded && <div className="exam-paragraph-translation" id={`exam-translation-${key}`}><span>中文译文 · AI</span><p>{cached.translation}</p></div>}
      {failed && <p className="reading-error exam-translation-error" role="alert">{translationError.message}</p>}</>;
  }
  return <div className={"exam-reading reading-reader" + (largeText ? " reading-large" : "")}><div className="reading-toolbar"><button className="back-link" onClick={() => go(`/exam-reading?year=${source.year}`)}><ArrowLeft size={17} />{source.year} 年目录</button><button className="icon-button" aria-label="放大阅读字号" aria-pressed={largeText} onClick={() => setLargeText(value => !value)}>Aa</button></div>
    <div className="section-line reading-reader-meta"><span>英语二 · {source.year} · Text {source.number}</span><span>{article ? "已保存到本机" : "首次联网获取"}</span></div>
    {!article ? <section className="reading-empty"><BookOpenText size={36} /><h1>{source.year} · {source.title}</h1><p>打开后保存完整阅读正文和五道题，之后可离线阅读、查词与采集生词。</p><button className="primary" disabled={loading || !online} onClick={() => void load()}>{loading ? <LoaderCircle size={18} className="reading-spinning" /> : <Download size={18} />}{loading ? "正在获取并保存…" : "打开并保存阅读"}</button>{!online && <p>这篇尚未保存，请联网后打开。</p>}</section> : <article className="reading-paper"><div className="eyebrow">ENGLISH II · TEXT {source.number}</div><h1>{source.year} 年 · 阅读 {source.number}</h1><p className="reading-hint">点击英文词查义并加入今日词表，段落下方可展开翻译。正文来源：{source.sourceName}。</p><div className="reading-prose">{article.paragraphs.map((paragraph, index) => {
      return <section className="exam-paragraph" key={index} aria-label={`第${index + 1}段`}><p>{examSentences(paragraph).map((sentence, number) => <span key={number}><TapSentence sentence={sentence} lookup={openLookup} />{" "}</span>)}</p>
        {translationControl(paragraph, `paragraph-${index}`, "翻译本段")}
      </section>;
    })}</div>
      <Accordion type="multiple" className="reading-reveals"><AccordionItem value="questions"><AccordionTrigger>查看本篇五道题</AccordionTrigger><AccordionContent><p className="reading-footnote">题干和选项都可点词查义、加入今日词表。每题下方可展开中文翻译。</p><div className="exam-questions reading-prose">{examQuestionBlocks(article.questions).map((question, index) => <section className="exam-question-block" key={index} aria-label={`第${21 + (source.number - 1) * 5 + index}题`}><p className="exam-question"><TapSentence sentence={question} lookup={openLookup} question /></p>{translationControl(question, `question-${index}`, "翻译本题及选项")}</section>)}</div><a className="text-button" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">查看来源与参考解析<ExternalLink size={15} /></a></AccordionContent></AccordionItem>
        <AccordionItem value="analysis"><AccordionTrigger>长难句 · 译文与语法解析</AccordionTrigger><AccordionContent><p className="reading-footnote">选择需要理解的句子再生成，发送该句并按用量计费；已保存解析可离线看。AI 解析用于辅助学习。</p>{sentences.map((sentence, index) => {
          const analysis = article.analyses?.find(item => item.sentence === sentence);
          return <section className="reading-analysis" key={index}><span className="eyebrow">SENTENCE {index + 1}</span><h3>{sentence}</h3>{analysis ? <dl><dt>中文译文 · AI 解析已保存</dt><dd>{analysis.translation}</dd><dt>句子主干</dt><dd>{analysis.structure}</dd><dt>从句与修饰关系</dt><dd>{analysis.grammar}</dd></dl> : controls.service.configured ? <button className="secondary" disabled={!!pendingSentence || !!pendingParagraph || controls.busy || !online} onClick={() => void analyze(sentence)}>{pendingSentence === sentence ? <LoaderCircle size={16} className="reading-spinning" /> : <Sparkles size={16} />}{pendingSentence === sentence ? "正在解析…" : "解析这一句"}</button> : <button className="secondary" onClick={() => go("/settings")}>设置生成服务</button>}</section>;
        })}</AccordionContent></AccordionItem></Accordion>
    </article>}
    {error && <p className="reading-error" role="alert">{error}</p>}
    <div className="exam-reader-links"><button className="secondary" onClick={() => go(`/words?date=${today()}`)}>查看今日词表<ArrowRight size={16} /></button><a className="text-button" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">资料来源<ExternalLink size={15} /></a></div>
    {lookup && article && <WordLookupSheet key={`${id}:${lookup.sentence}:${lookup.start}`} selection={lookup} cached={article.lookups?.find(item => sameLookup(item, lookup))} words={state.words} service={controls.service} busy={controls.busy} speak={speak}
      save={entry => save(current => saveExamLookup(current, source.id, entry))} close={() => setLookup(null)} settings={() => go("/settings")}
      collect={{ added: !!state.examReading?.contexts.some(item => item.articleId === source.id && item.sentence === lookup.sentence && item.surface === lookup.surface && state.days.find(day => day.date === today())?.wordIds.includes(item.wordId)), add: draft => save(current => collectExamWord(current, source.id, lookup, draft)) }} />}
  </div>;
}
