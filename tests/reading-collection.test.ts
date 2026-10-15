import test from "node:test";
import assert from "node:assert/strict";
import type { State } from "../src/types";
import { collectReadingWord, addWordToDay } from "../src/features/reading/collection";
import { collectExamWord } from "../src/features/exams/engine";
import { selectQuizWords } from "../src/features/quiz/selection";
import { learnedWords } from "../src/features/reading/engine";
const sentence = "Their resilience helped them rebuild.";
const selection = { surface: "resilience", start: 6, sentence, translation: "译文" };
const draft = { word: "resilience", commonMeaning: "韧性", contextMeaning: "恢复力", phonetic: "", usage: "" };
const day = "2026-10-14";
function fixture(): State {
  return { words: [{ id:"imported",word:"learn",commonMeaning:"学习",rareMeaning:"",usage:"",example:"",tags:[],phonetic:"",source:"导入",createdAt:1,updatedAt:2 }], days:[{date:day,wordIds:["imported"]}], records:{},attempts:[],settings:{theme:"light",audio:false,rareFirst:false,goal:30,count:"20",mode:"en"},
    reading:{version:1,batches:[{id:"batch",createdAt:1,words:[],status:"paused",articles:[{title:"Reading practice",titleTranslation:"阅读",vocabulary:[],sentences:[{english:sentence,translation:"译文",structure:"",grammar:"",pattern:"",application:"",applicationTranslation:""}]}],autoEligible:false}]},
    examReading:{version:1,contexts:[],articles:[{id:"english2-2024-reading-1",paragraphs:[sentence],questions:[],downloadedAt:1}]} };
}
const todayIds = (state: State) => selectQuizWords(state,{scope:"today",mode:"en",today:day,dates:{kind:"days",dates:[]}}).map(word=>word.id);
test("ordinary reading and exam collection share today's test pool with imported words", () => {
  let state = fixture();
  state = collectReadingWord(state,"batch",0,selection,draft,day);
  const id = state.words.find(word=>word.word==="resilience")!.id;
  state = collectExamWord(state,"english2-2024-reading-1",selection,draft,day);
  assert.deepEqual(todayIds(state),["imported",id]);
  assert.equal(state.words.length,2); assert.equal(state.days.length,1);
  assert.equal(state.words[1].example,sentence); assert.match(state.words[1].source,/Reading practice/);
  assert.equal(state.attempts.length,0); assert.equal(state.records[id],undefined);
  assert.deepEqual(learnedWords(state),[]);
});
test("adding an existing word on a later day preserves original content, dates and study history", () => {
  let original = collectReadingWord(fixture(),"batch",0,selection,draft,"2026-10-13");
  const old = original.words[1]; const next = collectReadingWord(original,"batch",0,selection,{...draft,commonMeaning:"不得覆盖用户编辑"},day);
  assert.strictEqual(next.words,original.words); assert.strictEqual(next.words[1],old);
  assert.strictEqual(next.records,original.records); assert.strictEqual(next.attempts,original.attempts);
  assert(next.days.find(d=>d.date==="2026-10-13")!.wordIds.includes(old.id));
  assert.deepEqual(todayIds(next),["imported",old.id]);
  const again = addWordToDay(next,old.id,day); assert.equal(again.days.find(d=>d.date===day)!.wordIds.length,2);
});
test("today collection merges repeated date rows without losing imported or reading words", () => {
  const original = fixture();
  original.days.push({date:day,wordIds:["imported"]});
  const next = collectExamWord(original,"english2-2024-reading-1",selection,draft,day);
  assert.equal(next.days.filter(d=>d.date===day).length,1);
  assert.deepEqual(todayIds(next),next.words.map(word=>word.id));
  assert.throws(()=>collectReadingWord(next,"batch",0,{...selection,sentence:"Changed."},draft,day),/原文/);
  assert.throws(()=>collectReadingWord(next,"batch",0,selection,{...draft,word:"unrelated"},day),/原形/);
});
