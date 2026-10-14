import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
const dom = new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost/",pretendToBeVisual:true});
for(const name of ["window","document","HTMLElement","HTMLInputElement","Element","DocumentFragment","Node","Event","CustomEvent","MutationObserver","getComputedStyle","NodeFilter"]) globalThis[name]=dom.window[name];
Object.defineProperty(globalThis,"navigator",{value:dom.window.navigator,configurable:true});
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import("react-dom/client");
const {default:ExamReading}=await import("../src/screens/ExamReading.tsx");
const {configureService,clearService}=await import("../src/features/reading/service.ts");
const sentence="Our progress depends on consistent practice and resilience.";
async function mount({rejectSave=false,saveGate,configured=false,fetcher,paragraph=sentence,paragraphs,translations=[],questions=[]}={}) {
  let state={words:[{id:"old",word:"depend",phonetic:"",commonMeaning:"依赖",rareMeaning:"保留",usage:"",example:"Old.",source:"old",tags:[],createdAt:0,updatedAt:1}],records:{old:{mastery:3,wordId:"old"}},attempts:[],days:[],settings:{theme:"light",audio:false},examReading:{version:1,articles:[{id:"english2-2024-reading-1",paragraphs:[sentence],questions:[],downloadedAt:1}],contexts:[]}};
  state.examReading.articles[0].paragraphs=paragraphs || [paragraph];
  state.examReading.articles[0].translations=translations;
  state.examReading.articles[0].questions=questions;
  let saves=0;const originalFetch=globalThis.fetch;
  globalThis.fetch=fetcher || (async()=>new Response(JSON.stringify({resilience:["","韧性",""],depend:["","取决于",""],cogs:["kɔgz","复数释义","0:cog"],cog:["kɔg","齿轮","s:cogs"]})));
  const element=document.createElement("div");document.body.append(element);const root=createRoot(element);
  function render(){root.render(createElement(ExamReading,{state,save:async next=>{saves++;if(saveGate)await saveGate;if(rejectSave)throw new Error("测试保存失败");state=typeof next==="function"?next(state):next;render();},go(){},speak(){},controls:{service:{configured,model:"deepseek-flash"},busy:false},id:"english2-2024-reading-1"}));}
  await act(async()=>render());
  const button=text=>[...document.querySelectorAll("button")].find(button=>button.textContent.trim()===text);
  return {state:()=>state,saves:()=>saves,async open(word,scope=""){await act(async()=>element.querySelector(`${scope} [aria-label="查词 ${word}"]`.trim()).click());},button,async close(){await act(async()=>root.unmount());element.remove();globalThis.fetch=originalFetch;}};
}
test("existing inflected word is added to today's list without changing its study progress",async()=>{
  const view=await mount();try{await view.open("depends");await act(async()=>view.button("加入今日词表").click());assert.equal(view.state().words.length,1);assert.equal(view.state().records.old.mastery,3);assert.equal(view.state().words[0].rareMeaning,"保留");assert.deepEqual(view.state().days[0].wordIds,["old"]);assert.equal(view.state().examReading.contexts.length,1);assert(view.button("已加入今日词表").disabled);}finally{await view.close();}
});
test("collection prefers a verified base entry even when the plural is in the dictionary",async()=>{
  const view=await mount({paragraph:"The cogs turn smoothly."});try{await view.open("cogs");await act(async()=>view.button("加入今日词表").click());const word=view.state().words.at(-1);assert.equal(word.word,"cog");assert.equal(word.commonMeaning,"齿轮");assert.equal(word.phonetic,"kɔg");assert.equal(view.state().examReading.contexts[0].surface,"cogs");}finally{await view.close();}
});
test("sentence analysis sends only the manually selected sentence and caches the result",async()=>{
  let requests=0;
  await configureService("test-only-unused-key","deepseek-flash");
  const view=await mount({configured:true,fetcher:async(url,options)=>{requests++;assert.equal(url,"https://api.deepseek.com/chat/completions");const payload=JSON.parse(options.body);assert.deepEqual(JSON.parse(payload.messages[1].content),{sentence});return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({sentence,translation:"进步取决于坚持。",structure:"主语 + 谓语 + 宾语",grammar:"depend on 是动词短语。"})}}]}));}});
  try{assert.equal(requests,0);await act(async()=>view.button("长难句 · 译文与语法解析").click());assert.equal(requests,0);await act(async()=>view.button("解析这一句").click());assert.equal(requests,1);assert.equal(view.state().examReading.articles[0].analyses.length,1);assert.match(document.body.textContent,/中文译文 · AI 解析已保存/);assert.equal(view.button("解析这一句"),undefined);}finally{await view.close();await clearService();}
});
test("leaving the reader discards a late sentence analysis",async()=>{
  let release;const response=new Promise(resolve=>{release=resolve;});await configureService("test-only-unused-key","deepseek-flash");
  const view=await mount({configured:true,fetcher:async()=>response});
  try{await act(async()=>view.button("长难句 · 译文与语法解析").click());await act(async()=>view.button("解析这一句").click());await view.close();await act(async()=>{release(new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({sentence,translation:"迟到译文",structure:"主干",grammar:"语法"})}}]})));await response;});assert.equal(view.saves(),0);}finally{await clearService();}
});
test("failed add remains retryable and never displays false success",async()=>{
  const view=await mount({rejectSave:true});try{await view.open("resilience");await act(async()=>view.button("加入今日词表").click());assert.equal(view.state().words.length,1);assert.equal(view.state().days.length,0);assert.match(document.body.textContent,/测试保存失败/);assert.equal(view.button("已加入今日词表"),undefined);assert(!view.button("加入今日词表").disabled);}finally{await view.close();}
});
test("rapid double click enqueues only one collection save",async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const view=await mount({saveGate:gate});try{await view.open("resilience");await act(async()=>{const add=view.button("加入今日词表");add.click();add.click();});assert.equal(view.saves(),1);await act(async()=>{release();await gate;});assert.equal(view.state().words.length,2);assert.equal(view.state().examReading.contexts.length,1);}finally{release();await view.close();}
});
const translatedResponse=paragraph=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({paragraph,translation:"进步取决于持续练习和韧性。"})}}]}));
test("each paragraph has a manual translation button, inline result and cache-only toggles",async()=>{
  let requests=0;await configureService("test-only-unused-key","deepseek-flash");
  const view=await mount({configured:true,paragraphs:[sentence,"Small steps lead to lasting progress."],fetcher:async(url,options)=>{requests++;assert.deepEqual(JSON.parse(JSON.parse(options.body).messages[1].content),{paragraph:sentence});return translatedResponse(sentence);}});
  try{assert.equal(requests,0);assert.equal(document.querySelectorAll('.exam-translation-tools button').length,2);await act(async()=>view.button("翻译本段").click());assert.equal(requests,1);assert.equal(view.state().examReading.articles[0].translations.length,1);assert.equal(document.querySelector('.exam-paragraph-translation p').textContent,"进步取决于持续练习和韧性。");await act(async()=>view.button("收起译文").click());assert.equal(document.querySelector('.exam-paragraph-translation'),null);await act(async()=>view.button("查看译文").click());assert.equal(requests,1);assert.equal(view.state().records.old.mastery,3);}finally{await view.close();await clearService();}
});
test("restored paragraph translation opens without configuration or a network request",async()=>{
  let requests=0;const view=await mount({translations:[{paragraph:sentence,translation:"恢复的本段译文",createdAt:1}],fetcher:async()=>{requests++;throw new Error("网络不可用");}});
  try{await act(async()=>view.button("查看译文").click());assert.match(document.body.textContent,/恢复的本段译文/);assert.equal(requests,0);assert.equal(view.saves(),0);}finally{await view.close();}
});
test("translation save failure stays inline and requires a manual retry",async()=>{
  let requests=0;await configureService("test-only-unused-key","deepseek-flash");const view=await mount({configured:true,rejectSave:true,fetcher:async()=>{requests++;return translatedResponse(sentence);}});
  try{await act(async()=>view.button("翻译本段").click());assert.match(document.querySelector('.exam-paragraph [role=alert]').textContent,/测试保存失败/);assert.equal(view.state().examReading.articles[0].translations.length,0);assert.equal(document.querySelector('.exam-paragraph-translation'),null);assert.equal(requests,1);await act(async()=>view.button("重试翻译本段").click());assert.equal(requests,2);}finally{await view.close();await clearService();}
});
test("leaving the reader discards a late paragraph translation",async()=>{
  let release;const response=new Promise(resolve=>{release=resolve;});await configureService("test-only-unused-key","deepseek-flash");const view=await mount({configured:true,fetcher:async()=>response});
  try{await act(async()=>view.button("翻译本段").click());await view.close();await act(async()=>{release(translatedResponse(sentence));await response;});assert.equal(view.saves(),0);assert.equal(view.state().examReading.articles[0].translations.length,0);}finally{await clearService();}
});
const questions=["21. What does progress depend on?","[A] Consistent practice and resilience.","[B] Luck.","[C] Waiting.","[D] Speed.","22. Which step comes next?","[A] Continue.","[B] Pause.","[C] Stop.","[D] Wait."];
const firstQuestion=questions.slice(0,5).join("\n");
test("question translation sends just one stem with all options and expands underneath that question",async()=>{
  let requests=0;await configureService("test-only-unused-key","deepseek-flash");
  const view=await mount({configured:true,questions,fetcher:async(url,options)=>{requests++;assert.deepEqual(JSON.parse(JSON.parse(options.body).messages[1].content),{paragraph:firstQuestion});return translatedResponse(firstQuestion);}});
  try{assert.equal(requests,0);await act(async()=>view.button("查看本篇五道题").click());assert.equal(requests,0);assert.equal(document.querySelectorAll('.exam-question-block').length,2);await act(async()=>view.button("翻译本题及选项").click());assert.equal(requests,1);assert(document.querySelector('.exam-question-block .exam-paragraph-translation'));assert.equal(document.querySelectorAll('.exam-question-block')[1].querySelector('.exam-paragraph-translation'),null);assert.equal(view.state().examReading.articles[0].translations[0].paragraph,firstQuestion);await act(async()=>view.button("收起译文").click());await act(async()=>view.button("查看译文").click());assert.equal(requests,1);}finally{await view.close();await clearService();}
});
test("question stems and options support lookup and collection with the full original question",async()=>{
  for(const [word,expected] of [["depend","depend"],["resilience","resilience"]]){
    const view=await mount({questions});try{await act(async()=>view.button("查看本篇五道题").click());assert.equal(document.querySelector('.exam-question-block [aria-label="查词 A"]'),null);await view.open(word,".exam-question-block");assert.equal(document.querySelector('blockquote').textContent,firstQuestion);await act(async()=>view.button("加入今日词表").click());const added=view.state().words.find(item=>item.word===expected);assert(view.state().days[0].wordIds.includes(added.id));assert.equal(view.state().examReading.contexts[0].sentence,firstQuestion);assert.equal(view.state().records.old.mastery,3);assert.equal(view.state().attempts.length,0);}finally{await view.close();}
  }
});
test("restored question translation can open offline without a configured service",async()=>{
  let requests=0;const view=await mount({questions,translations:[{paragraph:firstQuestion,translation:"恢复的题干和四个选项译文",createdAt:1}],fetcher:async()=>{requests++;throw new Error("离线");}});
  try{Object.defineProperty(navigator,"onLine",{value:false,configurable:true});await act(async()=>{window.dispatchEvent(new Event("offline"));view.button("查看本篇五道题").click();});await act(async()=>view.button("查看译文").click());assert.match(document.querySelector('.exam-question-block .exam-paragraph-translation').textContent,/恢复的题干/);assert.equal(requests,0);assert.equal(view.saves(),0);}finally{Object.defineProperty(navigator,"onLine",{value:true,configurable:true});await view.close();}
});
test("question save failure stays under the selected question without claiming success",async()=>{
  let requests=0;await configureService("test-only-unused-key","deepseek-flash");const view=await mount({configured:true,questions,rejectSave:true,fetcher:async()=>{requests++;return translatedResponse(firstQuestion);}});
  try{await act(async()=>view.button("查看本篇五道题").click());await act(async()=>view.button("翻译本题及选项").click());assert.match(document.querySelector('.exam-question-block [role=alert]').textContent,/测试保存失败/);assert.equal(view.state().examReading.articles[0].translations.length,0);assert.equal(requests,1);assert(view.button("重试翻译本题及选项"));}finally{await view.close();await clearService();}
});
