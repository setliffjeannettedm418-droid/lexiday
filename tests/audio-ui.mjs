import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const output = process.env.LEXIDAY_TEST_OUTPUT || mkdtempSync(join(tmpdir(), 'lexiday-ui-')); 
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
const browser = await chromium.launch({ executablePath: process.env.LEXIDAY_CHROME, headless: true, args: ['--no-sandbox'] });
const results = [];
try {
 for (const width of [390,430,1200]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(() => {
   window.audioCalls=[];
   window.SpeechSynthesisUtterance=class { constructor(text){this.text=text;} };
   Object.defineProperty(window,'speechSynthesis',{value:{
    cancel(){}, getVoices:()=>[{lang:'en-US',localService:true},{lang:'en-GB',localService:true}],
    speak(u){window.audioCalls.push({text:u.text,lang:u.lang});setTimeout(()=>u.onstart?.(),0);},
    addEventListener(){},removeEventListener(){}
   }});
  });
  await page.goto('http://127.0.0.1:4173/test/setup');
  await page.getByRole('combobox',{name:'测试题型',exact:true}).selectOption({ label: '熟词僻义' });
  await page.getByRole('button',{name:/开始测试 ·/}).click();
  await page.waitForFunction(()=>window.audioCalls.length===1);
  assert.equal((await page.evaluate(()=>audioCalls.at(-1))).lang,'en-US');
  await page.getByRole('button',{name:'播放英式发音'}).click();
  await page.waitForFunction(()=>audioCalls.length===2);
  assert.equal((await page.evaluate(()=>audioCalls.at(-1))).lang,'en-GB');
  await page.getByRole('button',{name:'播放美式发音'}).click();
  await page.waitForFunction(()=>audioCalls.length===3);
  assert.equal((await page.evaluate(()=>audioCalls.at(-1))).lang,'en-US');
  const overflows = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflows,false);
  await page.screenshot({path:`${output}/audio-ui-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'暂时想不起来，显示答案'}).click();
  assert.equal(await page.locator('.rating-buttons').count(),0);
  await page.getByRole('button',{name:/下一题/}).click();
  await page.waitForFunction(()=>audioCalls.length===4);
  assert.equal((await page.evaluate(()=>audioCalls.at(-1))).lang,'en-US');
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.waitForTimeout(300);
  await page.screenshot({path:`${output}/audio-ui-${width}-dark.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  results.push({width,autoplay:'en-US',manual:['en-US','en-GB'],nextQuestionAutoplay:true,horizontalOverflow:false,errors});
  await context.close();
 }
 console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
