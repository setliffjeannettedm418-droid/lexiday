import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
const output = process.env.LEXIDAY_TEST_OUTPUT || mkdtempSync(join(tmpdir(), 'lexiday-review-'));
const today = '2026-10-11', now = new Date('2026-10-11T15:00:00+08:00');
const words = ['sustain','emerge','insight','retain','subtle','adapt','thrive','context'].map((word,i)=>({id:`r${i}`,word,phonetic:'/test/',commonMeaning:['维持；支撑','出现；浮现','洞察力','保持；记住','微妙的','适应；改编','茁壮成长','语境；背景'][i],rareMeaning:'',usage:'',example:'',tags:[],source:'review-fixture',createdAt:1,updatedAt:1}));
const records=Object.fromEntries([0,1,2].map((i)=>[words[i].id,{wordId:words[i].id,correctCount:1,wrongCount:0,mastery:2,lastReview:new Date(`2026-10-${["04","10","07"][i]}T12:00:00+08:00`).getTime(),nextReview:now.getTime()-1000,lastResult:true,streakCorrect:1,streakWrong:0,lastWrong:0,wrongType:'',rareCorrect:0,rareTotal:0}]));
const state={words,records,attempts:[0,1,2].map(i=>({id:`old-${i}`,wordId:words[i].id,sessionId:'old',time:records[words[i].id].lastReview,correct:true,type:'en',rating:3})),days:[{date:'2026-09-01',wordIds:words.map(w=>w.id)}],settings:{theme:'light',appearance:'apricot',goal:30,count:'10',mode:'en',rareFirst:false,audio:false,audioVersion:1,readingAuto:false}};
const browser=await chromium.launch({executablePath:process.env.LEXIDAY_CHROME,headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(now);
 const navigate=async path=>page.evaluate(p=>{history.pushState({},'',p);dispatchEvent(new PopStateEvent('popstate'));window.scrollTo(0,0)},path);
 const session=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lexiday-session')));
 const readState=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('lexiday-v1');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,r=db.transaction('state').objectStore('state').get('main');r.onsuccess=()=>{db.close();resolve(r.result.value)}}}));
 const count=async n=>{await page.getByRole('button',{name:`开始今日复习 · ${n} 词`,exact:true}).waitFor()};
 const answer=async right=>{
  const s=await session(),q=s.questions[s.index],value=right?q.answer:(q.options.find(x=>x!==q.answer)||'wrong-answer');
  if(q.type==='spell'){await page.getByLabel('英文拼写').fill(value);await page.getByRole('button',{name:'确认答案',exact:true}).click()}
  else await page.locator('.answer').filter({hasText:value}).click();
 };
 await page.goto('http://127.0.0.1:4173/settings');
 await page.getByLabel('导入备份',{exact:true}).setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,data:state}))});
 await page.getByRole('button',{name:'确认操作',exact:true}).click();await page.getByText('备份已恢复',{exact:true}).waitFor();
 const migrated=await readState();assert.equal(migrated.records.r0.firstStudyDate,'2026-10-04');assert.equal(migrated.attempts[0].studyDate,'2026-10-04');assert.deepEqual(migrated.words,words);assert.deepEqual(migrated.days,state.days);
 await navigate('/');await page.locator('.home-review-plan').click();await count(3);
 assert.equal(await page.locator('.review-total').innerText(),'3词');
 assert.match(await page.locator('.review-groups').innerText(),/逾期/);
 assert.equal(await page.locator('.review-word').count(),3); // repeated missed nodes have one word entry
 await page.getByLabel('选择学习批次').selectOption('2026-10-10');
 await page.getByRole('button',{name:'第30天，11月9日，第6次复习',exact:true}).click();
 assert.equal(await page.getByLabel('复习日期',{exact:true}).inputValue(),'2026-11-09');
 assert.equal(await page.locator('.review-total').innerText(),'1词');
 assert(await page.getByRole('button',{name:'未来复习计划，仅供查看',exact:true}).isDisabled());
 await page.getByLabel('复习日期',{exact:true}).fill('2026-10-01');await page.locator('.review-empty').waitFor();
 await page.getByRole('button',{name:'回到今天',exact:true}).click();await count(3);
 for(const [theme,label] of [['apricot','暖杏手账'],['paper','墨白书页'],['aurora','极光蓝']]){
  await navigate('/settings');await page.getByRole('button',{name:label,exact:true}).click();
  await page.waitForFunction(v=>document.documentElement.dataset.appTheme===v,theme);
  for(const [mode,caption] of [['light','浅色'],['dark','深色']]){
   await navigate('/settings');await page.getByRole('button',{name:caption,exact:true}).click();
   await navigate('/review');await count(3);await page.evaluate(()=>document.fonts.ready);
   for(const width of [320,390,430,1200]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme}/${mode}/${width}`);
    const contrast = await page.locator('.review-week button[aria-pressed="true"] strong').evaluate(el=>{
     const rgb=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});
     const lum=c=>{const v=rgb(c);return .2126*v[0]+.7152*v[1]+.0722*v[2]};
     const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(el.parentElement).backgroundColor);
     return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });assert(contrast>=4.5,`${theme}/${mode} selected day contrast ${contrast}`);
    if(width===390){await page.mouse.move(0,0);await page.screenshot({path:join(output,`review-${theme}-${mode}-390.png`),fullPage:true,animations:'disabled'})}
   }
  }
 }
 await page.setViewportSize({width:390,height:844});
 const untouched=await readState();assert.deepEqual(untouched.records,migrated.records);assert.deepEqual(untouched.attempts,migrated.attempts);
 const oldSession={id:'unfinished',questions:[{wordId:'r7',type:'spell',prompt:'old',subtitle:'',options:[],answer:'context'}],index:0,answers:[],completed:false};
 await page.evaluate(s=>localStorage.setItem('lexiday-session',JSON.stringify(s)),oldSession);await page.reload();await count(3);
 await page.getByRole('button',{name:'开始今日复习 · 3 词',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await session(),oldSession);
 await page.getByRole('button',{name:'开始今日复习 · 3 词',exact:true}).click();await page.getByRole('button',{name:'开始新的复习',exact:true}).click();
 await page.getByLabel('暂停并返回复习计划').waitFor();
 let s=await session();assert.deepEqual(new Set(s.questions.map(q=>q.wordId)),new Set(['r0','r1','r2']));assert.equal(s.reviewDate,today);
 await answer(true);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lexiday-session')).index===1);
 await answer(false);await page.getByRole('button',{name:'下一题',exact:true}).waitFor();
 await page.getByLabel('暂停并返回复习计划').click();await count(2);
 const afterWrong=await readState();assert.equal(afterWrong.attempts.length,5);assert.equal(afterWrong.attempts.at(-1).correct,false);
 await page.reload();await count(2);assert.equal((await readState()).attempts.length,5);
 await page.getByRole('button',{name:'继续未完成的测试',exact:true}).click();await page.getByRole('button',{name:'下一题',exact:true}).click();
 for(let i=0;i<15;i++){
  s=await session();if(s.completed)break;
  const index=s.index;await answer(true);await page.waitForFunction(i=>JSON.parse(localStorage.getItem('lexiday-session')).index>i,index);
 }
 assert((await session()).completed);await page.getByRole('button',{name:'返回复习计划',exact:true}).click();
 await page.getByRole('button',{name:'当天复习已完成',exact:true}).waitFor();
 await page.getByLabel('选择学习批次').selectOption('2026-10-10');await page.getByRole('button',{name:'第2天，10月12日，第2次复习',exact:true}).click();
 assert.equal(await page.locator('.review-total').innerText(),'1词');assert.match(await page.locator('.review-groups').innerText(),/待安排/);
 // Settings validation and backup preserve the real state after review.
 await navigate('/settings');await page.getByLabel('复习节点（天）').fill('2,1');await page.getByRole('button',{name:'保存复习节点',exact:true}).click();await page.getByRole('status').filter({hasText:'递增且不重复'}).waitFor();
 await page.getByLabel('复习节点（天）').fill('1，3、10');await page.getByRole('button',{name:'保存复习节点',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#review-days')?.value==='1, 3, 10');
 await page.reload();assert.equal(await page.getByLabel('复习节点（天）').inputValue(),'1, 3, 10');
 const saved=await readState();assert.deepEqual(saved.settings.reviewDays,[1,3,10]);assert.deepEqual(saved.words,words);assert.deepEqual(saved.days,state.days);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出全部数据',exact:true}).click();
 const download=await downloadPromise;const backup=JSON.parse(readFileSync(await download.path(),'utf8'));assert.deepEqual(backup.data,saved);
 await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#review-days')?.value==='1, 2, 4, 7, 15, 30');
 await navigate('/review');await page.getByRole('button',{name:'当天复习已完成',exact:true}).waitFor();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready});await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'当天复习已完成',exact:true}).waitFor();
 assert.deepEqual((await readState()).attempts,saved.attempts);
 await page.clock.setFixedTime(new Date('2026-10-12T09:00:00+08:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByRole('button',{name:'开始今日复习 · 1 词',exact:true}).waitFor();
 assert.equal(await page.locator('.review-word').count(),1);
 assert.deepEqual(errors,[]);
 console.log('Review UI passed: legacy migration, curve/date cohorts, deduped overdue, protected session replacement, correct/wrong progress, pause/reload, future nodes, custom settings/export, offline and new-day refresh, 3 themes x 2 modes x 4 widths.');
 await context.close();
}finally{await browser.close()}
