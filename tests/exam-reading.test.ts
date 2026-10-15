import test from "node:test";
import assert from "node:assert/strict";
import { examCatalog, examYears, examSource, parseExamText, examSentences, examQuestionBlocks, collectExamWord, saveExamLookup, validateExamBackup, sentencePayload, parseSentenceCompletion, translationPayload, parseTranslationCompletion, saveExamTranslation } from "../src/features/exams/engine";
import type { State, Word } from "../src/types";
import { learnedWords } from "../src/features/reading/engine";
import { buildReviewPlan } from "../src/features/review/plan";

const source = examSource("english2-2024-reading-1")!;
const sentence = "Our progress, which depends on consistent practice, reflects the resilience of the team.";
const fixture = "English II (2024)\nSection II Part A\nDirections:\nRead the following text.\nText 1\n" + Array(9).fill(sentence).join("\n") + "\n" + [21,22,23,24,25].map(n => `${n}. An original test question?\n[A] First\n[B] Second\n[C] Third\n[D] Fourth`).join("\n");
const article = parseExamText(fixture, source);
const word: Word = { id: "old", word: "depend", phonetic: "", commonMeaning: "依赖", rareMeaning: "旧考点", usage: "旧用法", example: "Old example.", source: "旧词表", tags: ["保留"], createdAt: 1, updatedAt: 2 };
function state(): State { return { words: [word], records: {old: {wordId:"old",correctCount:4,wrongCount:1,mastery:3,lastReview:1,nextReview:2,lastResult:true,streakCorrect:4,streakWrong:0,lastWrong:0,wrongType:"",rareCorrect:0,rareTotal:0,firstStudyDate:"2026-10-01"}}, attempts: [], days: [{date:"2026-10-01",wordIds:["old"]}], settings: { theme:"light",audio:false,rareFirst:false,goal:30,count:"20",mode:"en" }, examReading: { version:1,articles:[article],contexts:[] } }; }
const selection = (surface: string) => ({surface,start:sentence.indexOf(surface),sentence,translation:""});

test("English II catalog covers every year with exactly four reading articles", () => {
  assert.deepEqual(examYears, Array.from({length:17},(_,i)=>2026-i)); assert.equal(examCatalog.length,68);
  for(const year of examYears) assert.deepEqual(examCatalog.filter(item=>item.year===year).map(item=>item.number),[1,2,3,4]);
  assert.equal(new Set(examCatalog.map(item=>item.id)).size,68);
  assert(examCatalog.every(item=>item.documentUrl.startsWith("https://downloads.lazynote.cn/kaoyan/")&&item.documentUrl.endsWith(".docx")));
});
test("reading extraction preserves all paragraphs and rejects wrong or incomplete question ranges", () => {
  assert.equal(article.paragraphs.length,9); assert.equal(article.paragraphs[0],sentence); assert.equal(article.questions.length,25);
  assert.throws(()=>parseExamText(fixture, {...source,number:2}),/题号/);
  assert.throws(()=>parseExamText(fixture.replace("25.","26."),source),/不完整/);
  assert.deepEqual(examSentences("Dr. Smith reads. Our team learns."),["Dr. Smith reads.","Our team learns."]);
});
test("collecting an inflected existing word preserves IDs, edited content and every study record", () => {
  const original=state(); const draft={word:"depend",phonetic:"new",commonMeaning:"新释义",contextMeaning:"取决于",usage:"新用法"};
  const once=collectExamWord(original,source.id,selection("depends"),draft,"2026-10-11");
  const twice=collectExamWord(once,source.id,selection("depends"),draft,"2026-10-11");
  assert.strictEqual(twice.words,original.words);assert.strictEqual(twice.records,original.records);assert.strictEqual(twice.attempts,original.attempts);
  assert.deepEqual(twice.words[0],word);assert.deepEqual(twice.days.map(day=>day.wordIds),[["old"],["old"]]);assert.equal(twice.examReading!.contexts.length,1);
  assert.equal(twice.examReading!.contexts[0].meaning,"取决于"); validateExamBackup(twice);
});
test("collecting a new word stores context without counting it as learned or starting review", () => {
  const next=collectExamWord(state(),source.id,selection("resilience"),{word:"resilience",phonetic:"",commonMeaning:"韧性",contextMeaning:"团队面对困难的恢复力",usage:""},"2026-10-11");
  const added=next.words.find(word=>word.word==="resilience")!;
  assert.equal(added.example,sentence);assert.match(added.source,/2024 Text 1/);assert.equal(next.records[added.id],undefined);
  assert(!learnedWords(next).some(word=>word.id===added.id));
  assert(!JSON.stringify(buildReviewPlan(next,Date.now())).includes(added.id));validateExamBackup(next);
  assert.throws(()=>collectExamWord(state(),source.id,selection("depends"),{word:"different",phonetic:"",commonMeaning:"错误原形",contextMeaning:"",usage:""}),/原形/);
});
test("lookup and backup reject explanations for changed text or unrelated words", () => {
  const selected=selection("depends"), explanation={word:"depends",quote:sentence,headword:"depend",phonetic:"",partOfSpeech:"动词",meaning:"取决于",usage:"depend on",grammar:"从句谓语",collocations:[],contrast:"依赖",example:"They depend on us.",exampleTranslation:"他们依赖我们。"};
  const next=saveExamLookup(state(),source.id,{...selected,explanation,createdAt:1});validateExamBackup(next);
  const corrupt=structuredClone(next);corrupt.examReading!.articles[0].lookups![0].explanation.word="wrong";
  assert.throws(()=>validateExamBackup(corrupt),/不一致/);
  assert.throws(()=>saveExamLookup(state(),source.id,{...selected,sentence:"Changed.",explanation,createdAt:1}),/原文/);
  const duplicate=structuredClone(next);duplicate.examReading!.articles.push(article);assert.throws(()=>validateExamBackup(duplicate),/重复/);
});
test("sentence request sends only the chosen sentence and accepts complete matching replies", () => {
  const payload=sentencePayload(sentence,"deepseek-flash");assert.deepEqual(JSON.parse(payload.messages[1].content),{sentence});
  const completion=(value: unknown,reason="stop")=>JSON.stringify({choices:[{finish_reason:reason,message:{content:JSON.stringify(value)}}]});
  const value={sentence,translation:"原创测试译文",structure:"主谓宾",grammar:"which 引导定语从句"};
  assert.equal(parseSentenceCompletion(completion(value),sentence).structure,"主谓宾");
  assert.throws(()=>parseSentenceCompletion(completion({...value,sentence:"Other."}),sentence),/不一致/);
  assert.throws(()=>parseSentenceCompletion(completion(value,"length"),sentence),/不完整/);
});
test("paragraph translation sends only the chosen paragraph and rejects partial or mismatched replies", () => {
  assert.deepEqual(JSON.parse(translationPayload(sentence,"deepseek-flash").messages[1].content),{paragraph:sentence});
  const completion=(value:unknown,reason="stop")=>JSON.stringify({choices:[{finish_reason:reason,message:{content:JSON.stringify(value)}}]});
  const value={paragraph:sentence,translation:"团队的进步取决于持续练习。"};
  assert.equal(parseTranslationCompletion(completion(value),sentence).translation,value.translation);
  assert.throws(()=>parseTranslationCompletion(completion({...value,paragraph:"Another paragraph."}),sentence),/不一致/);
  assert.throws(()=>parseTranslationCompletion(completion(value,"length"),sentence),/不完整/);
  assert.throws(()=>parseTranslationCompletion(completion({...value,translation:" "}),sentence),/不完整/);
});
test("paragraph translation survives backup, preserves study data and rejects stale or duplicate references", () => {
  const original=state(),entry={paragraph:sentence,translation:"测试译文",createdAt:1};
  const next=saveExamTranslation(original,source.id,entry);validateExamBackup(next);
  assert.strictEqual(next.words,original.words);assert.strictEqual(next.records,original.records);assert.strictEqual(next.attempts,original.attempts);
  assert.equal(next.examReading!.articles[0].translations![0].translation,"测试译文");
  const stale=structuredClone(next);stale.examReading!.articles[0].paragraphs=["Changed paragraph."];
  assert.throws(()=>validateExamBackup(stale),/段落译文/);
  const duplicate=structuredClone(next);duplicate.examReading!.articles[0].translations!.push(entry);
  assert.throws(()=>validateExamBackup(duplicate),/重复/);
  assert.throws(()=>saveExamTranslation(original,source.id,{...entry,paragraph:"Changed paragraph."}),/原文/);
});
test("question grouping retains stems, continuation lines and all options without crossing question numbers", () => {
  const blocks=examQuestionBlocks(article.questions);
  assert.equal(blocks.length,5); assert.equal(blocks[0],article.questions.slice(0,5).join("\n"));
  assert.match(blocks[4],/^25\./); assert.equal(blocks.join("\n"),article.questions.join("\n"));
  assert.deepEqual(examQuestionBlocks(["21. Original stem", "continued here.", "[A] First [B] Second", "[C] Third [D] Fourth", "22. Next?"]),["21. Original stem\ncontinued here.\n[A] First [B] Second\n[C] Third [D] Fourth","22. Next?"]);
  assert.deepEqual(examQuestionBlocks([]),[]);
});
test("question translations and option vocabulary survive backup while changed questions are rejected", () => {
  const original=state(),question=examQuestionBlocks(article.questions)[0];
  const selected={surface:"First",start:question.indexOf("First"),sentence:question,translation:""};
  const translated=saveExamTranslation(original,source.id,{paragraph:question,translation:"21. 原创测试题？\n[A] 第一\n[B] 第二\n[C] 第三\n[D] 第四",createdAt:1});
  const collected=collectExamWord(translated,source.id,selected,{word:"first",phonetic:"",commonMeaning:"第一",contextMeaning:"",usage:""},"2026-10-12");
  const explanation={word:"First",quote:question,headword:"first",phonetic:"",partOfSpeech:"数词",meaning:"第一",usage:"顺序",grammar:"选项",collocations:[],contrast:"第一",example:"The first step.",exampleTranslation:"第一步。"};
  const next=saveExamLookup(collected,source.id,{...selected,explanation,createdAt:1});
  validateExamBackup(next);
  assert.equal(next.examReading!.articles[0].translations!.length,1);
  assert.equal(next.examReading!.contexts[0].sentence,question);
  assert.strictEqual(next.records,original.records); assert.strictEqual(next.attempts,original.attempts);
  assert.equal(next.words.at(-1)!.example,question); assert.equal(next.examReading!.articles[0].lookups![0].sentence,question);
  const restored=JSON.parse(JSON.stringify(next));validateExamBackup(restored);
  const stale=structuredClone(translated);stale.examReading!.articles[0].questions[1]="[A] Changed";
  assert.throws(()=>validateExamBackup(stale),/译文/);
  assert.throws(()=>collectExamWord(stale,source.id,selected,{word:"first",phonetic:"",commonMeaning:"第一",contextMeaning:"",usage:""}),/原文/);
});
