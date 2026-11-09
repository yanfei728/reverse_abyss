#!/usr/bin/env node
/* -*- coding: utf-8 -*-
/* browser_29_menu.mjs —— 29号卡可见主界面/设置/种子/开始/退出/编辑器返回 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from './loader.mjs';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT=join(ROOT,'docs/checks'); const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const results=[]; let pass=0,fail=0;
function check(n,c,e){results.push({name:n,ok:!!c,extra:e===undefined?'':String(e)}); if(c){pass++;console.log('  PASS  '+n+(e?'    '+e:''));}else{fail++;console.log('  FAIL  '+n+(e?'    '+e:''));}}
function freePort(){return new Promise((res,rej)=>{const s=createServer();s.once('error',rej);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});});}
async function fj(u){const r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
function conn(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url),pending=new Map();let seq=0;ws.onopen=()=>resolve({send(m,p){return new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});ws.send(JSON.stringify({id,method:m,params:p||{}}));});},close(){try{ws.close();}catch(e){}}});ws.onerror=()=>reject(new Error('ws'));ws.onmessage=(ev)=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}if(!m.id||!pending.has(m.id))return;const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.rej(new Error(m.error.message));else p.res(m.result);};});}
function kill(c){try{spawnSync('taskkill',['/PID',String(c.pid),'/T','/F'],{stdio:'ignore'});}catch(e){}}
async function main(){
  const exes=[process.env.RA_BROWSER,CHROME,EDGE].filter(Boolean).filter(existsSync); if(!exes.length)return 2;
  let b=null,last=null;
  for(const exe of exes){const prof=mkdtempSync(join(tmpdir(),'ra-29-')),port=await freePort();const ch=spawn(exe,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--no-sandbox','--window-size=1440,900','--user-data-dir='+prof,'--remote-debugging-port='+port,'file:///'+join(ROOT,'index.html').replace(/\\/g,'/')],{stdio:'ignore',windowsHide:true});
    try{let v=null;for(let i=0;i<100&&!v;i++){try{v=await fj('http://127.0.0.1:'+port+'/json/version');}catch(e){await sleep(100);}}if(!v)throw new Error('no devtools');let t=null;for(let i=0;i<60&&!t;i++){const l=await fj('http://127.0.0.1:'+port+'/json/list');t=l.find(x=>x.type==='page');if(!t)await sleep(100);}if(!t)throw new Error('no page');const ws=await conn(t.webSocketDebuggerUrl);await ws.send('Page.enable');await ws.send('Runtime.enable');b={ws,ch,prof,v};break;}catch(e){last=e;kill(ch);try{rmSync(prof,{recursive:true,force:true});}catch(e2){}}}
  if(!b){console.error('browser failed',last);return 1;}
  const send=b.ws.send;
  try{
    async function ev(expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||''));return r.result?r.result.value:undefined;}
    async function wait(expr,ms){const end=Date.now()+(ms||10000);while(Date.now()<end){try{if(await ev(expr))return true;}catch(e){}await sleep(60);}return false;}
    async function shot(n){const s=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(OUT,n),Buffer.from(s.data,'base64'));}
    async function click(sel){const p=await ev('(function(){var e=document.querySelector('+JSON.stringify(sel)+');if(!e)return null;var r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()');if(!p)throw new Error('no '+sel);await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'none',clickCount:0});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await sleep(60);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await sleep(120);}
    check('Chrome 已启动',true,b.v.Browser);
    check('index 是新正式壳',await wait('!!RA.short && !!document.getElementById("btn-formal")',15000));
    check('英文logo/仅开始退出/右下设置',await ev('!!document.querySelector(".logo") && document.querySelector(".logo").textContent.indexOf("REVERSE ABYSS")>=0 && !!document.getElementById("btn-quit") && !!document.getElementById("btn-main-settings") && !document.getElementById("btn-dev")'));
    check('显示固定40层',await ev('document.body.textContent.indexOf("固定 0–40")>=0 || document.body.textContent.indexOf("固定 0-40")>=0'));
    await shot('29-index-menu.png');
    await click('#btn-main-settings');
    check('设置打开',await wait('document.getElementById("main-settings").style.display==="flex"'));
    await shot('29-settings.png');
    await ev('(function(){document.getElementById("seed-input").value="RA-1Z141Z3";return true;})()');
    await click('#btn-seed-apply');
    const seedAfter=await ev('({text:RA.short.state.seedText,value:RA.short.state.seedValue,status:document.getElementById("seed-status").textContent})');
    check('种子文本完整解析并规范化',seedAfter.text==="RA-1Z141Z3" && seedAfter.value===0xFFFFFFFF,JSON.stringify(seedAfter));
    await click('#btn-seed-save');
    check('保存只保存种子文本到专用 key',await ev('(function(){var p=JSON.parse(localStorage.getItem("ra_seed_texts_v1"));return p && p.version===1 && p.savedSeeds.indexOf("RA-1Z141Z3")>=0;})()'));
    await ev('(function(){document.getElementById("seed-input").value="RA-0";return true;})()');
    await click('#btn-seed-apply');
    const badSeed=await ev('({text:RA.short.state.seedText,msg:document.getElementById("seed-status").textContent})');
    check('0 种子明确拒绝不静默变1',badSeed.text==="RA-1Z141Z3" && /种子未应用/.test(badSeed.msg),JSON.stringify(badSeed));
    // 非法输入不能覆盖已应用的有效种子;恢复输入框到有效值后开始
    await ev('(function(){document.getElementById("seed-input").value="RA-1Z141Z3";return true;})()');
    await click('#btn-main-settings-close');
    check('设置关闭',await wait('document.getElementById("main-settings").style.display==="none"'));
    await click('#btn-formal');
    check('开始游戏创建正式会话',await wait('!!RA.short.state.session',12000));
    check('开始使用已选种子,不是 Date.now',await ev('RA.short.state.manifest && RA.short.state.manifest.seed===0xFFFFFFFF && RA.short.state.seedText==="RA-1Z141Z3"'));
    await send('Input.dispatchKeyEvent',{type:'rawKeyDown',code:'KeyF',key:'f',windowsVirtualKeyCode:70});await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyF',key:'f',windowsVirtualKeyCode:70});
    check('真实 F 进入1层',await wait('RA.short.state.session && RA.short.state.session.world.current===1',3000));
    await sleep(900);
    check('HUD 1/40',await ev('document.getElementById("floor-text").textContent.indexOf("1/40")>=0'));
    const dbg=await ev('(function(){var s=RA.short.state,ss=s.session;return {cur:ss&&ss.world.current,cam:s.cam,and:s.cam&&[Math.round(s.cam.x),Math.round(s.cam.y)],cw:s.cw,ch:s.ch,canvas:s.canvas&&[s.canvas.width,s.canvas.height],p:ss&&ss.player&&[Math.round(ss.player.x),Math.round(ss.player.y)],acts:ss&&ss.world&&ss.world.instances?Array.from(ss.world.instances.keys()):[]};})()');
    check('进入1层后渲染状态有效',dbg && dbg.cur===1 && dbg.canvas && dbg.canvas[0]>0,JSON.stringify(dbg));
    await shot('29-formal-playing.png');
    await click('#btn-pause');
    await click('#btn-menu-pause');
    check('暂停返回主界面',await wait('!RA.short.state.session && document.getElementById("menu").style.display!=="none"'));
    await shot('29-return-menu.png');
    // headless 里 window.close 会直接销毁测试页;拦截它,验证关闭失败时的真实提示/回退
    await ev('window.close=function(){};true');
    await click('#btn-quit');
    check('退出结束会话并显示手动关闭提示',await wait('document.getElementById("exit-overlay").style.display==="flex" && !!document.getElementById("exit-text")'));
    check('退出不假报关闭,提示手动',await ev('document.getElementById("exit-text").textContent.indexOf("手动关闭")>=0'));
    await shot('29-exit-overlay.png');
    await click('#btn-exit-back');
    check('退出后可回主界面',await wait('document.getElementById("exit-overlay").style.display==="none" && !!RA.short.state && !RA.short.state.session'));
    const base='file:///'+ROOT.replace(/\\/g,'/')+'/';
    await send('Page.navigate',{url:base+'short.html'});
    check('short.html 单向进入英文首页',await wait('location.pathname.endsWith("/index.html") && !!document.querySelector(".logo") && document.querySelector(".logo").textContent.indexOf("REVERSE ABYSS")>=0',12000));
    await shot('29-short-redirect.png');
    await send('Page.navigate',{url:base+'legacy.html'});
    check('legacy.html 单向进入英文首页',await wait('location.pathname.endsWith("/index.html") && !!document.querySelector(".logo") && document.querySelector(".logo").textContent.indexOf("REVERSE ABYSS")>=0',12000));
    await click('#btn-main-settings');
    await click('#btn-open-editor');
    check('设置打开编辑器',await wait('location.pathname.endsWith("/editor.html") && !!RA.editor',15000));
    await shot('29-editor-from-settings.png');
    await click('#back-link');
    check('编辑器回游戏到 index',await wait('location.pathname.endsWith("/index.html") && !!document.querySelector(".logo")',15000));
  }finally{try{b.ws.close();}catch(e){}kill(b.ch);try{rmSync(b.prof,{recursive:true,force:true});}catch(e){}}
  const report={title:'29号卡新主界面/种子/开始/退出可见证据',date:'2026-11-09',note:'真实Chrome;正式池为空时用test3补位;不写作者passed/APK。',browser:b.v.Browser,pass,fail,results};
  writeFileSync(join(OUT,'browser-29-menu-2026-11-09.json'),JSON.stringify(report,null,2)+'\n');
  console.log('\n29 主界面检查:'+pass+' PASS / '+fail+' FAIL');return fail?1:0;
}
main().then(c=>process.exit(c)).catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
