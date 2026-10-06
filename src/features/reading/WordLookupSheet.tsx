import { useEffect, useRef, useState } from "react";
import { BookOpenText, LoaderCircle, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PronunciationButtons } from "../../components/PronunciationButtons";
import type { Speak } from "../audio/speech";
import type { ReadingLookup, ReadingWordExplanation, Word } from "../../types";
import { dictionaryCandidates, normalizeWord } from "./matcher";
import { lookupDictionary, wordForms, type DictionaryEntry, type LookupSelection } from "./lookup";
import { explainReadingWord, type ReadingServiceStatus } from "./service";
import { newId } from "../../utils/id";

export function WordLookupSheet({ selection, cached, words, service, busy, speak, save, close, settings }: {
  selection: LookupSelection; cached?: ReadingLookup; words: Word[]; service: ReadingServiceStatus; busy: boolean;
  speak: Speak; save: (entry: ReadingLookup) => Promise<void>; close: () => void; settings: () => void;
}) {
  const candidates = dictionaryCandidates(selection.surface);
  const local = words.find(w => candidates.includes(normalizeWord(w.word)));
  const [dictionary, setDictionary] = useState<DictionaryEntry | null>(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(true);
  const [dictionaryError, setDictionaryError] = useState("");
  const [explanation, setExplanation] = useState<ReadingWordExplanation | undefined>(cached?.explanation);
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const [saved, setSaved] = useState(!!cached);
  const [online, setOnline] = useState(navigator.onLine);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    void lookupDictionary(selection.surface).then(entry => { if (alive) setDictionary(entry); })
      .catch(e => { if (alive) setDictionaryError(e instanceof Error ? e.message : "词典读取失败。"); })
      .finally(() => { if (alive) setDictionaryLoading(false); });
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener("online", changed); window.addEventListener("offline", changed);
    return () => { alive = false; active.current?.abort(); window.removeEventListener("online", changed); window.removeEventListener("offline", changed); };
  }, [selection.surface]);
  async function explain() {
    if (active.current || !online || !service.configured || busy) return;
    const controller = new AbortController(); active.current = controller; setPending(true); setError("");
    try {
      const result = await explainReadingWord(selection, service.model, `word-${newId()}`, controller.signal);
      if (controller.signal.aborted) return;
      setExplanation(result);
      try { await save({ surface: selection.surface, start: selection.start, sentence: selection.sentence, explanation: result, createdAt: Date.now() }); setSaved(true); }
      catch { if (!controller.signal.aborted) setError("解析已生成，但本机保存失败。请先保留当前页面；重新打开后可能需要再次查询。"); }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "解析失败，请手动重试。"); }
    finally { if (!controller.signal.aborted) { setPending(false); active.current = null; } }
  }
  const headword = explanation?.headword || local?.word || dictionary?.word || selection.surface;
  const phonetic = explanation?.phonetic || local?.phonetic || dictionary?.phonetic;
  return <Sheet open onOpenChange={open => { if (!open) close(); }}><SheetContent side="bottom" className="reading-word-sheet reading-lookup-sheet">
    <SheetHeader><SheetTitle>{selection.surface}</SheetTitle><SheetDescription>{headword !== selection.surface ? `原词 ${headword} · ` : ""}{phonetic ? `${phonetic} · ` : ""}阅读查词{saved ? " · 解析已保存" : ""}</SheetDescription></SheetHeader>
    <div className="reading-word-content"><PronunciationButtons word={headword} speak={speak} />
      <blockquote>{selection.sentence.slice(0, selection.start)}<mark>{selection.surface}</mark>{selection.sentence.slice(selection.start + selection.surface.length)}</blockquote>
      {explanation ? <section aria-label="生词语境解析" className="reading-lookup-explanation"><span className="reading-lookup-badge"><Sparkles size={14} />本句详解{saved ? " · 可离线查看" : ""}</span><dl>
        <dt>本句词义 · {explanation.partOfSpeech}</dt><dd>{explanation.meaning}</dd>
        <dt>在句中怎样使用</dt><dd>{explanation.usage}</dd>
        <dt>本句语法作用</dt><dd>{explanation.grammar}</dd>
        {explanation.collocations.length > 0 && <><dt>常用搭配</dt><dd>{explanation.collocations.map((item, i) => <p key={i}>{item}</p>)}</dd></>}
        <dt>知识点与易错辨析</dt><dd>{explanation.contrast}</dd>
        <dt>换个语境再用一次</dt><dd><p>{explanation.example}</p><p className="muted">{explanation.exampleTranslation}</p></dd>
      </dl></section> : <>
        <section className="reading-lookup-definition" aria-label="离线词义"><span className="reading-lookup-badge"><BookOpenText size={14} />{local ? "我的词库" : "离线词典"}</span>
          {local || dictionary ? <><p className="reading-dictionary-meaning">{local?.commonMeaning || dictionary?.meaning}</p>
            {local?.rareMeaning && <p>熟词僻义：{local.rareMeaning}</p>}{local?.usage && <p>常用法：{local.usage}</p>}
            {dictionary?.exchange && <p className="reading-lookup-forms">{wordForms(dictionary.exchange).join(" · ")}</p>}
            <p className="muted reading-lookup-note">以上为词条常见义，具体含义要结合下面的本句详解。</p></>
            : <p role="status">{dictionaryLoading ? "正在读取离线词典…" : dictionaryError || "本机词典暂未收录，可联网获取这个词在本句中的释义。"}</p>}
        </section>
        <section className="reading-lookup-request" aria-label="获取本句详解"><strong>这个词，在这里怎么用？</strong><p>结合当前原句，解析本句词义、语法作用、搭配与易错点，并附应用例句。</p>
          {service.configured ? <button className="primary" disabled={pending || !online || busy} onClick={() => void explain()}>{pending ? <LoaderCircle className="reading-spinning" size={17} /> : <Sparkles size={17} />}{pending ? "正在解析本句…" : error ? "重新获取本句详解" : "查看本句用法与知识点"}</button>
            : <button className="secondary" onClick={settings}>设置生成服务</button>}
          <p className="reading-lookup-note">{!online ? "当前离线，词典和已保存解析仍可使用。" : busy ? "短文正在生成，完成后可获取本句详解。" : "点击后使用已配置的 AI 服务，发送所选词、所在句及该句译文，按用量计费；保存后再看无需联网。"}{pending && " 关闭面板会停止等待，已发出的请求可能仍会计费。"}</p>
        </section>
      </>}
      {error && <p className="reading-error" role="alert">{error}</p>}
      <Accordion type="multiple" className="reading-reveals reading-lookup-reveals">
        {selection.translation && <AccordionItem value="translation"><AccordionTrigger>查看本句译文</AccordionTrigger><AccordionContent>{selection.translation}</AccordionContent></AccordionItem>}
        {(selection.structure || selection.grammar) && <AccordionItem value="grammar"><AccordionTrigger>查看已有句子解析</AccordionTrigger><AccordionContent><dl>{selection.structure && <><dt>句子主干</dt><dd>{selection.structure}</dd></>}{selection.grammar && <><dt>语法与句式</dt><dd>{selection.grammar}</dd></>}</dl></AccordionContent></AccordionItem>}
        {explanation && (local || dictionary) && <AccordionItem value="dictionary"><AccordionTrigger>查看词典常见义与词形</AccordionTrigger><AccordionContent><p className="reading-dictionary-meaning">{local?.commonMeaning || dictionary?.meaning}</p>{dictionary && <p>{wordForms(dictionary.exchange).join(" · ")}</p>}</AccordionContent></AccordionItem>}
      </Accordion>
      <p className="reading-lookup-note reading-lookup-source">离线释义：{local ? "我的词库" : "ECDICT 开源英汉词典"}。本句详解由 AI 生成，有疑问可结合词典核对。查词不会增加已学词数量。</p>
    </div>
  </SheetContent></Sheet>;
}
