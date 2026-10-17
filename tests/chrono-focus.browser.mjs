// Real-browser F02 regression fixture. No account, network service or timer writes.
// Run after npm run build: PLAYWRIGHT_MODULE=/path/to/playwright node tests/chrono-focus.browser.mjs
// F02_OUTPUT selects evidence directory; F02_BEFORE=63053e4 enables baseline assertions/visual comparison.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(root + '/package.json');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { transformSync } = require('@babel/core'), postcss = require('postcss'), sharp = require('sharp');
const output = process.env.F02_OUTPUT || '/tmp/blocus-f02-browser';
await fs.mkdir(output, { recursive: true });
const entries = ['components/timer/ChronoFocus.js', 'components/MascotMoment.js', 'components/DetailSheet.js', 'components/InboxSheet.js', 'components/FilterMenu.js', 'components/StreakFreezeOffer.js', 'components/Celebration.js', 'components/ConsentManager.js'];
const scripts = {}, styles = {};
for (const version of process.env.F02_BEFORE ? ['before','after'] : ['after']) {
  const modules = new Map(), css = [];
  async function load(file) {
    if (modules.has(file)) return;
    modules.set(file, '');
    let source;
    if (file === 'contexts/I18nContext.js') source = `export const useI18n=()=>({lang:window.lang,t:key=>require('../lib/i18n.js').translate(window.lang,key)});`;
    else if (file === 'components/timer/focusIsolation.js' && process.env.F02_ISOLATION_SOURCE) source = await fs.readFile(process.env.F02_ISOLATION_SOURCE, 'utf8');
    else if (file === 'contexts/ConsentContext.js') source = `export const useConsent=()=>window.fixtureConsent;`;
    else if (file === 'hooks/useFocusEnvironment.js') source = `import {useState} from 'react'; export function useFocusEnvironment(){const [environmentId,setId]=useState(window.environment);return {environmentId,highestLevel:99,loading:false,saving:false,error:null,refresh(){window.calls.refresh++},async equip(id){window.calls.equip.push(id);setId(id);return true}}}`;
    else source = version === 'before' ? execFileSync('git',['show',process.env.F02_BEFORE+':'+file],{cwd:root,encoding:'utf8'}) : await fs.readFile(root+'/'+file,'utf8');
    if (file.endsWith('.css')) {
      const names={}, ast=postcss.parse(source);
      ast.walkRules(rule=>{
        const globals=[];
        let selector=rule.selector.replace(/:global\(([^)]+)\)/g,(_,s)=>{globals.push(s);return 'GLOBAL'+(globals.length-1)+'TOKEN';});
        selector=selector.replace(/\.([a-zA-Z_][\w-]*)/g,(_,s)=>'.'+(names[s] ||= 'f02_'+path.basename(file).replace(/\W/g,'_')+'_'+s));
        rule.selector=selector.replace(/GLOBAL(\d+)TOKEN/g,(_,i)=>globals[i]);
      });
      css.push(ast.toString()); modules.set(file,'module.exports='+JSON.stringify(names)); return;
    }
    const deps = [...source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g)].map(m=>m[1]);
    for (const id of deps) if (id.startsWith('.')) {
      const rel=path.posix.normalize(path.posix.join(path.posix.dirname(file),id));
      let resolved=rel;
      if(!path.extname(rel)) for(const ext of ['.js','.jsx','.mjs','.cjs']) {try{await fs.access(root+'/'+rel+ext);resolved=rel+ext;break;}catch{}}
      await load(resolved);
    }
    modules.set(file,transformSync(source,{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-react':{runtime:'automatic'},'transform-runtime':{helpers:false,regenerator:false}}]],plugins:[require.resolve('@babel/plugin-transform-modules-commonjs'),require.resolve('@babel/plugin-transform-dynamic-import')]}).code);
  }
  for (const entry of entries) await load(entry);
  scripts[version]=Object.fromEntries(modules);styles[version]=css.join('\n');
}
const cssDir=root+'/.next/static/css';
const globalCSS=(await Promise.all((await fs.readdir(cssDir)).map(f=>fs.readFile(cssDir+'/'+f,'utf8')))).join('\n');
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/react.js'||url.pathname==='/react-dom.js'){const n=url.pathname.slice(1,-3);res.setHeader('Content-Type','application/javascript');return res.end(await fs.readFile(root+'/node_modules/'+n+'/umd/'+n+'.development.js'));}
  if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
  if(url.pathname.startsWith('/fonts/')||url.pathname.startsWith('/focus-environments/'))return res.end(await fs.readFile(root+'/public'+url.pathname));
  const version=url.searchParams.get('version')||'after',lang=url.searchParams.get('lang')||'fr',theme=url.searchParams.get('theme')||'light',environment=url.searchParams.get('environment')||'forest';
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html class="${theme==='dark'?'dark':''}" lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${globalCSS}\n${styles[version]}</style></head><body style="min-height:2000px"><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>
  window.lang=${JSON.stringify(lang)};window.environment=${JSON.stringify(environment)};
  window.calls={start:0,pause:0,finish:0,leave:0,close:0,refresh:0,equip:[]};
  const factories={${Object.entries(scripts[version]).map(([file,code])=>JSON.stringify(file)+':function(module,exports,require){'+code+'}').join(',')}};
  const cache={};function resolve(id,from=''){const a=(from.split('/').slice(0,-1).join('/')+'/'+id).split('/'),b=[];for(const s of a){if(s==='..')b.pop();else if(s&&s!=='.')b.push(s)}const p=id.startsWith('.')?b.join('/'):id;return factories[p]?p:['.js','.jsx','.mjs','.cjs'].map(e=>p+e).find(p=>factories[p])||p;}
  function load(id,from=''){
   if(id==='react')return React;if(id==='react-dom')return ReactDOM;
   if(id==='react/jsx-runtime')return {Fragment:React.Fragment,jsx:(type,props,key)=>React.createElement(type,key===undefined?props:{...props,key}),jsxs:(type,{children,...props},key)=>React.createElement(type,key===undefined?props:{...props,key},...children)};
   if(id==='next/link')return ({children,...p})=>React.createElement('a',p,children);
   if(id==='next/dynamic')return loader=>{const C=React.lazy(loader);return p=>React.createElement(React.Suspense,{fallback:null},React.createElement(C,p))};
   if(id==='@babel/runtime/helpers/interopRequireDefault')return o=>o&&o.__esModule?o:{default:o};
   if(id==='@babel/runtime/helpers/interopRequireWildcard')return o=>o&&o.__esModule?o:{...o,default:o};
   const file=resolve(id,from);if(!cache[file]){const m={exports:{}};cache[file]=m;if(!factories[file])throw Error('Missing '+file);factories[file](m,m.exports,id=>load(id,file))}return cache[file].exports;
  }
  const h=React.createElement,Focus=load('components/timer/ChronoFocus.js').default,Coach=load('components/MascotMoment.js').default,Sheet=load('components/DetailSheet.js').default,Inbox=load('components/InboxSheet.js').default,Filter=load('components/FilterMenu.js').default;
  const Consent=load('components/ConsentManager.js').default,Freeze=load('components/StreakFreezeOffer.js').default,Celebration=load('components/Celebration.js').default;function App(){
   const [consent,setConsent]=React.useState(false),[settings,setSettings]=React.useState(false);window.showConsent=()=>ReactDOM.flushSync(()=>setConsent(true));window.fixtureConsent={needsDecision:consent,settingsOpen:settings,categories:{functional:false,analytics:false,marketing:false},gpc:false,openSettings:()=>setSettings(true),closeSettings:()=>setSettings(false),acceptAll:()=>{calls.acceptConsent=(calls.acceptConsent||0)+1;setConsent(false)},rejectAll:()=>{calls.rejectConsent=(calls.rejectConsent||0)+1;setConsent(false)},save:()=>{calls.saveConsent=(calls.saveConsent||0)+1;setSettings(false);setConsent(false)}};
   const [overlays,setOverlays]=React.useState([]);window.openHigher=v=>ReactDOM.flushSync(()=>setOverlays(old=>[...old,v]));const decline=React.useCallback(()=>{calls.decline=(calls.decline||0)+1;setOverlays(s=>s.filter(v=>v!=='freeze'))},[]),closeCelebration=React.useCallback(()=>{calls.celebration=(calls.celebration||0)+1;setOverlays(s=>s.filter(v=>v!=='celebration'))},[]);const celebrationData=React.useMemo(()=>({kind:'level',level:5,titleKey:'xp.level5'}),[]);
   const [open,setOpen]=React.useState(false),[owner,setOwner]=React.useState('a'),[coach,setCoach]=React.useState(false),[nested,setNested]=React.useState(null),[mountInbox,setMountInbox]=React.useState(true),[value,setValue]=React.useState('a');
   const [state,setState]=React.useState({courseId:'math',running:false,elapsed:123,pomodoro:false,pomoPhase:'work',pomoCount:0,isPaused:false,onBreak:false,pauseSince:'02:03',pomoTargetSecs:1500,blockGoalSecs:900,blocksAria:'123 / 900',liveMessage:null});
   window.update=s=>ReactDOM.flushSync(()=>setState(old=>({...old,...s})));window.changeOwner=()=>ReactDOM.flushSync(()=>setOwner('b'));window.setCoach=v=>ReactDOM.flushSync(()=>setCoach(v));window.unmountFocus=()=>ReactDOM.flushSync(()=>setOpen(false));window.openNested=v=>ReactDOM.flushSync(()=>{setMountInbox(true);setNested(v)});window.unmountInbox=()=>ReactDOM.flushSync(()=>setMountInbox(false));const closeNested=kind=>setNested(old=>old==='stack'?(kind==='inbox'?'detail':'inbox'):null);
   const chrono={...state,startWithFeedback(){calls.start++;setState(s=>({...s,running:true,isPaused:false}))},pauseWithFeedback(){calls.pause++;setState(s=>({...s,running:false,isPaused:true}))},skipBreak(){calls.skip=(calls.skip||0)+1},leavePomodoro(){calls.leave++}};
   return h(React.Fragment,null,h('a',{id:'background-link',href:'#next'},'Behind'),h('button',{id:'open',onClick:()=>setOpen(true)},'Open Focus'),h('button',{id:'after'},'After'),h(Freeze,{open:overlays.includes('freeze'),streak:7,days:['2026-10-14'],stock:2,busy:false,onAccept:()=>{calls.accept=(calls.accept||0)+1;setOverlays(s=>s.filter(v=>v!=='freeze'))},onDecline:decline}),h(Inbox,{open:nested==='external',title:'External Inbox',closeLabel:'Close',onClose:()=>setNested(null)},h('button',null,'External action')),open&&h(Focus,{ownerId:owner,chrono,courses:[{id:'math',name:'Mathématiques',color:'#40916C'}],onClose:()=>{calls.close++;setOpen(false)},onFinish:()=>calls.finish++,renderCoach:({anchorRef,frameRef})=>h(React.Fragment,null,coach&&h(Coach,{message:'Coach de test',presentation:'anchored',anchorKind:'focusBlocks',anchorRef,frameRef,frequency:'always',eventKey:'test',live:true,onDismiss:()=>setCoach(false)}),h(Sheet,{open:nested==='detail'||nested==='stack',title:'Detail',closeLabel:'Close',onClose:()=>closeNested('detail')},h(Filter,{value,options:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}],onChange:setValue,ariaLabel:'Nested filter'})),mountInbox&&h(Inbox,{open:nested==='inbox'||nested==='stack',title:'Inbox',closeLabel:'Close',onClose:()=>closeNested('inbox')},h('button',null,'Inbox action')))}),overlays.includes('celebration')&&h(Celebration,{data:celebrationData,onClose:closeCelebration}),h(Consent));
  }
  ReactDOM.createRoot(document.getElementById('root')).render(h(React.StrictMode,null,h(App)));
  </script></body></html>`);
 } catch(error){res.writeHead(500);res.end(String(error));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
async function setup({version='after',width=1440,lang='fr',theme='light',motion='reduce',environment='forest'}={}){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:motion,colorScheme:theme,hasTouch:width<640,isMobile:width<640,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(6000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(origin+'/?'+new URLSearchParams({version,lang,theme,environment}));await page.locator('#open').waitFor();await page.evaluate(()=>document.fonts.ready);
 return {context,page,errors,version,width,lang,theme,motion,environment};
}
const add=(e,scenario,extra={})=>results.push({scenario,width:e.width,lang:e.lang,theme:e.theme,motion:e.motion,environment:e.environment,...extra});
const inside=p=>p.evaluate(()=>!!document.activeElement.closest('[data-focus-modal]'));
const opacity=(p,selector)=>p.locator(selector).evaluate(n=>{let o=1;for(;n;n=n.parentElement)o*=Number(getComputedStyle(n).opacity);return o});
try{

 if(process.env.F02_INBOX){
  for(const motion of ['reduce','no-preference']){
   const e=await setup({motion}),p=e.page,exit=p.getByRole('button',{name:'Quitter le focus',exact:true});await p.locator('#open').click();
   const noAction=async()=>{const c=await p.evaluate(()=>calls);for(const key of ['close','start','pause','finish','leave'])assert.equal(c[key],0,key+' remains untouched');};
   for(const mode of ['escape-root','escape-button','button','unmount']){
    await exit.focus();await p.evaluate(()=>openNested('inbox'));const sheet=p.getByRole('dialog',{name:'Inbox',exact:true});await sheet.waitFor();
    if(mode==='escape-root')await sheet.evaluate(n=>{n.tabIndex=-1;n.focus()});
    if(mode==='button')await sheet.getByRole('button',{name:'Close',exact:true}).click();
    else if(mode==='unmount')await p.evaluate(()=>unmountInbox());
    else await p.keyboard.press('Escape');
    await p.waitForFunction(()=>!document.querySelector('dialog[aria-label="Inbox"][open]'));
    await p.waitForFunction(()=>!!document.activeElement.closest('[data-focus-modal]')&&!document.activeElement.closest('dialog'));
    assert.ok(await exit.evaluate(n=>n===document.activeElement));await noAction();add(e,'inbox-'+mode+'-returns-focus');
   }
   for(let i=0;i<5;i++){await p.evaluate(()=>openNested('inbox'));await p.getByRole('dialog',{name:'Inbox',exact:true}).waitFor();await p.keyboard.press('Escape');await p.waitForFunction(()=>!!document.activeElement.closest('[data-focus-modal]')&&!document.activeElement.closest('dialog'));}await noAction();add(e,'inbox-five-consecutive-open-close');
   await p.evaluate(()=>openNested('detail'));const detail=p.getByRole('dialog',{name:'Detail',exact:true});await detail.waitFor();await p.evaluate(()=>openNested('stack'));const inbox=p.getByRole('dialog',{name:'Inbox',exact:true});await inbox.waitFor();assert.ok(await inbox.evaluate(n=>n.contains(document.activeElement)));await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('dialog[aria-label="Inbox"][open]'));assert.ok(await detail.evaluate(n=>n.open&&n.contains(document.activeElement)));await noAction();add(e,'inbox-escape-returns-to-still-open-detail');
   await p.evaluate(()=>openNested('stack'));await inbox.waitFor();await p.evaluate(()=>unmountInbox());await p.waitForFunction(()=>!document.querySelector('dialog[aria-label="Inbox"]'));assert.ok(await detail.evaluate(n=>n.open&&n.contains(document.activeElement)));await noAction();add(e,'inbox-unmount-returns-to-still-open-detail');await p.keyboard.press('Escape');await detail.waitFor({state:'detached'});await p.waitForFunction(()=>!!document.activeElement.closest('[data-focus-modal]'));
   for(const kind of ['freeze','celebration']){
    await p.evaluate(kind=>openHigher(kind),kind);const upper=kind==='freeze'?p.locator('[aria-labelledby="bt-freeze-title"]'):p.locator('[role="dialog"]:not([data-focus-modal]):not([aria-labelledby="bt-freeze-title"])');await upper.waitFor();await p.evaluate(()=>openNested('inbox'));await inbox.waitFor();await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('dialog[aria-label="Inbox"][open]'));assert.ok(await upper.evaluate(n=>n.contains(document.activeElement)));assert.ok(await upper.evaluate(n=>{const r=n.querySelector('button').getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}));await noAction();add(e,'inbox-yields-back-to-'+kind);await p.keyboard.press('Escape');await upper.waitFor({state:'detached'});await p.waitForFunction(()=>!!document.activeElement.closest('[data-focus-modal]'));await noAction();
   }
   await p.evaluate(()=>openNested('inbox'));await inbox.waitFor();await p.evaluate(()=>unmountInbox());await p.waitForFunction(()=>document.body.style.overflow==='');assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');await noAction();await p.evaluate(()=>unmountFocus());assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'visible');add(e,'inbox-unmount-then-focus-unmount-releases-scroll');
   for(const overflow of ['', 'clip', 'hidden']){
    await p.evaluate(v=>{openNested(null);document.body.style.overflow=v},overflow);await p.locator('#open').click();await p.evaluate(()=>openNested('inbox'));await inbox.waitFor();await p.evaluate(()=>unmountFocus());assert.equal(await p.evaluate(()=>document.body.style.overflow),overflow);assert.equal(await p.locator('[inert]').count(),0);add(e,'focus-unmount-with-inbox-preserves-initial-overflow',{overflow});
   }
   await p.evaluate(()=>{openNested(null);document.body.style.overflow=''});await p.locator('#open').click();await p.evaluate(()=>openNested('inbox'));await inbox.waitFor();await p.evaluate(()=>unmountInbox());await p.waitForFunction(()=>document.body.style.overflow==='');await p.evaluate(()=>openNested('external'));const external=p.getByRole('dialog',{name:'External Inbox',exact:true});await external.waitFor();await p.evaluate(()=>unmountFocus());assert.ok(await external.evaluate(n=>n.open&&n.contains(document.activeElement)));assert.equal(await p.evaluate(()=>document.body.style.overflow),'hidden');await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('dialog[aria-label="External Inbox"][open]'));assert.equal(await p.evaluate(()=>document.body.style.overflow),'');add(e,'removed-inbox-does-not-contaminate-next-dialog-scroll-lock');
   assert.deepEqual(e.errors,[]);await e.context.close();
  }
 }else if(process.env.F02_NOTICES){
  for(const width of [390,1440])for(const lang of ['fr','en'])for(const theme of ['light','dark']){
   const e=await setup({width,lang,theme,motion:theme==='dark'?'no-preference':'reduce'}),p=e.page;
   const reject=lang==='fr'?'Tout refuser':'Reject all',customize=lang==='fr'?'Personnaliser':'Customize',exit=lang==='fr'?'Quitter le focus':'Exit focus';
   await p.locator('#open').click();await p.evaluate(()=>showConsent());const banner=p.locator('[aria-labelledby="consent-banner-title"]');await banner.waitFor();assert.equal(await banner.evaluate(n=>!!n.closest('[inert]')),false);await banner.getByRole('button',{name:reject,exact:true}).focus();assert.ok(await banner.evaluate(n=>n.contains(document.activeElement)));await p.locator('#background-link').focus();assert.notEqual(await p.evaluate(()=>document.activeElement.id),'background-link');
   for(let i=0;i<30;i++){await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[data-focus-modal], [aria-labelledby="consent-banner-title"]')));}
   const ax=(await (await e.context.newCDPSession(p)).send('Accessibility.getFullAXTree')).nodes.filter(n=>!n.ignored);assert.ok(ax.some(n=>n.role?.value==='button'&&n.name?.value===reject));assert.ok(ax.some(n=>n.role?.value==='button'&&n.name?.value===exit));assert.ok(!ax.some(n=>n.name?.value==='Behind'));
   await banner.getByRole('button',{name:customize,exact:true}).click();
   // Desktop intentionally expands inline; mobile opens the shared settings panel.
   if(width===1440){assert.ok(await banner.getByRole('switch').count()>0);assert.equal(await p.locator('[aria-labelledby="consent-settings-title"]').count(),0);await p.evaluate(()=>ReactDOM.flushSync(()=>fixtureConsent.openSettings()));}
   const panel=p.locator('[aria-labelledby="consent-settings-title"]');await panel.waitFor();assert.ok(await panel.evaluate(n=>n.contains(document.activeElement)));await p.keyboard.press('Escape');await panel.waitFor({state:'detached'});assert.equal(await p.evaluate(()=>calls.close),0);await banner.getByRole('button',{name:reject,exact:true}).click();await banner.waitFor({state:'detached'});assert.equal(await p.evaluate(()=>calls.rejectConsent),1);assert.ok(await inside(p));add(e,'nonblocking-consent-banner-inline-or-panel-and-synthetic-refusal');
   await p.evaluate(()=>{const n=document.createElement('div');n.dataset.legalNotice='';n.style='position:fixed;bottom:0;z-index:2800';n.innerHTML='<button>Legal notice fixture</button>';document.body.append(n)});const notice=p.getByRole('button',{name:'Legal notice fixture',exact:true});await notice.focus();assert.ok(await notice.evaluate(n=>n===document.activeElement&&!n.closest('[inert]')));await p.evaluate(()=>document.querySelector('[data-legal-notice]').remove());await p.waitForTimeout(50);assert.ok(await inside(p));add(e,'legal-notice-layer-contract-synthetic-markup');assert.deepEqual(e.errors,[]);await e.context.close();
  }
 }else if(process.env.F02_BLOCKERS){
  const e=await setup(),p=e.page;
  const surface=p.locator('[data-focus-modal]'),exit=p.getByRole('button',{name:'Quitter le focus',exact:true});
  const ax=async()=>{const session=await p.context().newCDPSession(p);const tree=await session.send('Accessibility.getFullAXTree');await session.detach();return tree.nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value}));};
  const foreground=async locator=>locator.evaluate(n=>{const b=n.querySelector('button'),r=b.getBoundingClientRect();return {visible:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),focused:n.contains(document.activeElement),inert:!!n.closest('[inert]')};});
  await p.evaluate(()=>{const n=document.createElement('aside');n.id='pre-inert';n.setAttribute('inert','preserved');n.innerHTML='<button>Preexisting inert</button>';document.body.append(n)});
  await p.locator('#open').focus();await p.keyboard.press('Enter');await surface.waitFor();
  assert.ok(await inside(p));await p.locator('#background-link').focus();assert.ok(await inside(p));
  for(const key of ['Tab','Shift+Tab'])for(let i=0;i<20;i++){await p.keyboard.press(key);assert.ok(await inside(p));}
  assert.ok(await p.locator('#background-link').evaluate(n=>!!n.closest('[inert]')));
  assert.ok(!(await ax()).some(n=>n.name==='Behind'));add(e,'A-focus-alone-inert-tab-programmatic-ax');
  await exit.focus();
  for(const kind of ['freeze','celebration']){
   await p.evaluate(v=>openHigher(v),kind);const upper=kind==='freeze'?p.locator('[aria-labelledby="bt-freeze-title"]'):p.locator('[role="dialog"]:not([data-focus-modal]):not([aria-labelledby="bt-freeze-title"])');await upper.waitFor();await p.waitForTimeout(250);
   assert.deepEqual(await foreground(upper),{visible:true,focused:true,inert:false});
   const tree=await ax();assert.ok(!tree.some(n=>n.name==='Quitter le focus'));assert.ok(tree.some(n=>n.role==='button'));
   await fs.writeFile(output+'/'+kind+'-ax.json',JSON.stringify(tree,null,2));await p.screenshot({path:output+'/'+kind+'-inert.png'});
   await exit.evaluate(n=>n.focus());assert.ok(await upper.evaluate(n=>n.contains(document.activeElement)));
   for(let i=0;i<7;i++){await p.keyboard.press('Tab');assert.ok(await upper.evaluate(n=>n.contains(document.activeElement)));}
   const before=await p.evaluate(()=>({...calls}));await p.keyboard.press('Escape');await upper.waitFor({state:'detached'});assert.ok(await surface.count());assert.ok(await exit.evaluate(n=>n===document.activeElement));
   const after=await p.evaluate(()=>({...calls}));assert.equal(after.close,0);assert.equal(after.start,0);assert.equal(after.pause,0);assert.equal(after[kind==='freeze'?'decline':'celebration'],(before[kind==='freeze'?'decline':'celebration']||0)+1);
   add(e,(kind==='freeze'?'B':'C')+'-'+kind+'-foreground-ax-escape-once');add(e,'D-'+kind+'-returns-exact-focus');
  }
  await p.evaluate(()=>openHigher('celebration'));await p.waitForTimeout(5700);assert.ok(await inside(p));assert.equal(await p.evaluate(()=>calls.close),0);add(e,'C-celebration-auto-dismiss-preserves-focus');
  for(const order of [['freeze','celebration'],['celebration','freeze']]){
   await p.evaluate(order=>order.forEach(openHigher),order);await p.waitForTimeout(200);const freeze=p.locator('[aria-labelledby="bt-freeze-title"]');assert.deepEqual(await foreground(freeze),{visible:true,focused:true,inert:false});
   const before=await p.evaluate(()=>({...calls}));await p.keyboard.press('Escape');await freeze.waitFor({state:'detached'});const celebration=p.locator('[role="dialog"]:not([data-focus-modal]):not([aria-labelledby="bt-freeze-title"])');assert.deepEqual(await foreground(celebration),{visible:true,focused:true,inert:false});assert.equal(await p.evaluate(()=>calls.celebration),before.celebration);assert.equal(await p.evaluate(()=>calls.decline),before.decline+1);await p.keyboard.press('Escape');assert.ok(await inside(p));assert.equal(await p.evaluate(()=>calls.close),0);assert.equal(await p.evaluate(()=>calls.celebration),before.celebration+1);add(e,'E-concurrent-'+order.join('-')+'-one-action-per-escape');
  }
  for(let i=0;i<3;i++){await p.evaluate(()=>unmountFocus());await surface.waitFor({state:'detached'});assert.equal(await p.locator('[inert]').count(),1);assert.equal(await p.locator('#pre-inert').getAttribute('inert'),'preserved');assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'visible');assert.equal(await p.evaluate(()=>document.activeElement.id),'open');await p.locator('#open').click();await surface.waitFor();assert.ok(await inside(p));}add(e,'F-reopen-unmount-inert-and-scroll-cleanup');
  await p.evaluate(()=>changeOwner());await surface.waitFor({state:'detached'});assert.equal(await p.locator('[inert]').count(),1);assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'visible');add(e,'F-account-change-cleanup');
  assert.deepEqual(e.errors,[]);await e.context.close();
 }else{
 if(process.env.F02_BEFORE&&!process.env.F02_EXTRAS){const e=await setup({version:'before'});await e.page.locator('#open').click();await e.page.locator('[data-environment]').first().waitFor();const initial=await inside(e.page);assert.equal(initial,false);await e.page.keyboard.press('Tab');assert.equal(await e.page.evaluate(()=>document.activeElement.id),'after');await e.page.locator('#background-link').focus();assert.equal(await e.page.evaluate(()=>document.activeElement.id),'background-link');add(e,'baseline-focus-leak',{initial,tabBehind:true,programmaticBehind:true});await e.context.close();}
 if(!process.env.F02_EXTRAS)for(const width of [390,1440])for(const lang of ['fr','en'])for(const theme of ['light','dark']){
  const e=await setup({width,lang,theme,motion:theme==='light'?'reduce':'no-preference'}),p=e.page;
  const exit=lang==='fr'?'Quitter le focus':'Exit focus';
  await p.locator('#open').focus();await p.keyboard.press('Enter');await p.locator('[data-focus-modal]').waitFor();
  assert.ok(await inside(p));assert.equal(await p.evaluate(()=>document.activeElement.textContent.trim()),exit);
  await p.locator('#background-link').focus();assert.ok(await inside(p));
  const ax=await (await p.context().newCDPSession(p)).send('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>!n.ignored&&n.role?.value==='dialog'&&n.name?.value));assert.ok(!ax.nodes.some(n=>!n.ignored&&n.role?.value==='link'&&n.name?.value==='Behind'));
  for(let i=0;i<14;i++){await p.keyboard.press('Tab');assert.ok(await inside(p));}for(let i=0;i<14;i++){await p.keyboard.press('Shift+Tab');assert.ok(await inside(p));}
  add(e,'initial-tab-loop-programmatic-inert-ax');
  await p.locator('button[aria-controls="focus-environment-gallery"]').click();await p.keyboard.press('Escape');assert.equal(await p.locator('#focus-environment-gallery').count(),0);assert.ok(await inside(p));assert.equal(await p.locator('button[aria-controls="focus-environment-gallery"]').evaluate(n=>n===document.activeElement),true);add(e,'gallery-escape-focus-return');
  // Actual buttons' native Space activation must be the only timer action.
  const action=p.locator('[data-environment] .btn-hero').first();await action.focus();await p.keyboard.press('Space');assert.equal((await p.evaluate(()=>calls)).start,1);await p.keyboard.press('Space');assert.equal((await p.evaluate(()=>calls)).pause,1);add(e,'space-buttons-single-activation');
  await p.locator('[data-environment]').first().evaluate(n=>{n.tabIndex=-1;n.focus()});await p.keyboard.press('Space');assert.equal((await p.evaluate(()=>calls)).start,2);await p.keyboard.press('Space');assert.equal((await p.evaluate(()=>calls)).pause,2);add(e,'space-noninteractive-toggle');
  const sound=p.locator('[data-environment] button[aria-expanded]').first();await sound.click();const range=p.locator('input[type="range"]');await p.getByRole('button',{name:lang==='fr'?'Pluie':'Rain',exact:true}).click();await range.focus();const before=await p.evaluate(()=>({...calls}));await p.keyboard.press('Space');assert.deepEqual(await p.evaluate(()=>({...calls})),before);await p.keyboard.press('ArrowRight');assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('bt_ambient_v1')).preset),'rain');await p.getByRole('button',{name:lang==='fr'?'Aucun':'Off',exact:true}).click();await p.keyboard.press('Escape');assert.equal(await range.count(),0);assert.ok(await inside(p));add(e,'sound-panel-range-escape');
  await p.keyboard.press('Escape');await p.locator('[data-focus-modal]').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>document.activeElement.id),'open');assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'visible');assert.equal(await p.evaluate(()=>document.documentElement.classList.contains('bt-focus-active')),false);add(e,'exit-restore-cleanup');
  assert.deepEqual(e.errors,[]);await e.context.close();
 }
 const e=await setup(),p=e.page;await p.locator('#open').click();await p.locator('[data-focus-modal]').waitFor();
 await p.evaluate(()=>update({running:true}));await p.mouse.move(800,100);await p.waitForTimeout(5400);assert.equal(await opacity(p,'[data-environment] .btn-hero'),0);await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>{let n=document.activeElement,o=1;for(;n;n=n.parentElement)o*=Number(getComputedStyle(n).opacity);return o}),1);await p.waitForTimeout(900);assert.equal(await opacity(p,'[data-environment] .btn-hero'),1);await p.waitForTimeout(4700);assert.equal(await opacity(p,'[data-environment] .btn-hero'),1);add(e,'idle-pointer-fade-keyboard-persistence');
 await p.evaluate(()=>setCoach(true));await p.locator('[data-mascot-coach][data-ready]').waitFor();assert.equal(await p.locator('[data-mascot-coach]').evaluate(n=>!!n.closest('[data-focus-modal]')),true);await p.locator('.bt-coach-close').click();add(e,'coach-portal-visible-interactive');
 for(const kind of ['detail','inbox']){await p.getByRole('button',{name:'Quitter le focus',exact:true}).focus();await p.evaluate(k=>openNested(k),kind);const sheet=p.getByRole('dialog',{name:kind==='detail'?'Detail':'Inbox',exact:true});await sheet.waitFor();assert.ok(await sheet.evaluate(n=>n.contains(document.activeElement)));await sheet.evaluate(n=>{n.tabIndex=-1;n.focus()});const counts=await p.evaluate(()=>({...calls}));await p.keyboard.press('Space');assert.deepEqual(await p.evaluate(()=>({...calls})),counts);if(kind==='detail'){await sheet.getByRole('button',{name:/Nested filter/}).click();await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');assert.ok(await sheet.evaluate(n=>n.contains(document.activeElement)));}await p.keyboard.press('Escape');await p.waitForTimeout(200);assert.ok(await p.locator('[data-focus-modal]').evaluate(n=>n.isConnected));if(!(await inside(p))){await p.screenshot({path:output+'/nested-'+kind+'-failure.png'});console.log('NESTED_FAILURE',kind,JSON.stringify(await p.evaluate(()=>({active:document.activeElement.outerHTML,dialogs:[...document.querySelectorAll('dialog')].map(n=>({open:n.open,modal:n.matches(':modal'),inert:!!n.closest('[inert]'),html:n.outerHTML.slice(0,300)})),inert:[...document.querySelectorAll('[inert]')].map(n=>n.outerHTML.slice(0,150))}))));}assert.ok(await inside(p));add(e,'nested-'+kind+'-escape-and-shortcuts');}
 // A child native modal has priority over an already-open gallery.
 await p.locator('button[aria-controls="focus-environment-gallery"]').click();await p.evaluate(()=>openNested('detail'));await p.keyboard.press('Escape');await p.waitForTimeout(200);assert.equal(await p.locator('#focus-environment-gallery').count(),1);assert.ok(await inside(p));await p.keyboard.press('Escape');assert.equal(await p.locator('#focus-environment-gallery').count(),0);assert.equal(await p.locator('[data-focus-modal]').count(),1);add(e,'gallery-yields-to-higher-native-modal');
 for(const index of [1,2,3,0]){await p.locator('button[aria-controls="focus-environment-gallery"]').click();await p.locator('[data-gallery] button[aria-pressed]').nth(index).click();await p.locator('#focus-environment-gallery').waitFor({state:'detached'});assert.ok(await p.locator('button[aria-controls="focus-environment-gallery"]').evaluate(n=>n===document.activeElement));assert.equal(await p.locator('[data-environment]').first().getAttribute('data-environment'),['forest','gradient-wave','zenitho','glass-fold'][index]);}add(e,'all-environments-selection-restores-focus');
 const mini=p.getByRole('button',{name:'Mini-chrono',exact:true});await mini.click();await p.waitForTimeout(300);
 const nativePip=await p.evaluate(()=>Boolean(window.documentPictureInPicture?.window));
 if(nativePip){
   await p.evaluate(()=>update({elapsed:321,running:false,isPaused:true}));await p.waitForTimeout(100);
   const pip=await p.evaluate(()=>{const w=documentPictureInPicture.window;return {text:w.document.body.innerText,buttons:w.document.querySelectorAll('button').length,lang:w.document.documentElement.lang}});
   assert.ok(pip.text.includes('05:21'));assert.equal(pip.buttons,1);assert.equal(pip.lang,'fr');
   const prior=await p.evaluate(()=>({...calls}));const pipPage=e.context.pages().find(page=>page!==p);let returnActivation='DOM click in native PiP document';if(pipPage){await pipPage.getByRole('button',{name:'Revenir au Focus',exact:true}).focus();await pipPage.keyboard.press('Enter').catch(error=>{if(!pipPage.isClosed())throw error;});returnActivation='keyboard Enter in native PiP window';}else await p.evaluate(()=>documentPictureInPicture.window.document.querySelector('button').click());await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>Boolean(documentPictureInPicture.window)),false);assert.deepEqual(await p.evaluate(()=>({...calls})),prior);assert.ok(await mini.evaluate(n=>n===document.activeElement));
   add(e,'native-pip-open-sync-return',{pip,returnActivation});
   await mini.click();await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>Boolean(documentPictureInPicture.window)),true);await p.evaluate(()=>documentPictureInPicture.window.close());await p.waitForTimeout(150);assert.ok(await p.locator('[data-focus-modal]').evaluate(n=>n.isConnected));add(e,'native-pip-close-reopen');
 }else add(e,'native-pip-unavailable',{feedback:await p.locator('#mini-timer-feedback').innerText()});
 // Unsupported-API feedback is separately simulated, never called a native test.
 await p.evaluate(()=>{window.savedPipApi=window.documentPictureInPicture;Object.defineProperty(window,'documentPictureInPicture',{configurable:true,value:undefined})});await mini.click();await p.locator('#mini-timer-feedback').waitFor();await p.evaluate(()=>openNested('inbox'));await p.keyboard.press('Escape');await p.waitForTimeout(200);assert.equal(await p.locator('#mini-timer-feedback').count(),1);await p.keyboard.press('Escape');assert.equal(await p.locator('#mini-timer-feedback').count(),0);assert.ok(await mini.evaluate(n=>n===document.activeElement));add(e,'pip-feedback-yields-to-higher-dialog');await p.evaluate(()=>Object.defineProperty(window,'documentPictureInPicture',{configurable:true,value:window.savedPipApi}));
 await p.evaluate(()=>changeOwner());await p.locator('[data-focus-modal]').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>document.documentElement.classList.contains('bt-focus-active')),false);add(e,'account-change-closes-with-cleanup');
 for(let i=0;i<3;i++){await p.locator('#open').click();await p.locator('[data-focus-modal]').waitFor();await p.keyboard.press('Escape');await p.locator('[data-focus-modal]').waitFor({state:'detached'});}add(e,'repeated-open-close');
 await p.evaluate(()=>scrollTo(0,500));const scroll=await p.evaluate(()=>scrollY);await p.locator('#open').evaluate(n=>n.focus({preventScroll:true}));await p.keyboard.press('Enter');await p.locator('[data-focus-modal]').waitFor();await p.mouse.wheel(0,400);assert.equal(await p.evaluate(()=>scrollY),scroll);if(nativePip){await mini.click();await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>Boolean(documentPictureInPicture.window)),true);}await p.evaluate(()=>unmountFocus());if(nativePip){await p.waitForFunction(()=>!documentPictureInPicture.window||documentPictureInPicture.window.closed);assert.equal(await p.evaluate(()=>Boolean(documentPictureInPicture.window&&!documentPictureInPicture.window.closed)),false);add(e,'native-pip-closed-on-focus-unmount');}assert.equal(await p.evaluate(()=>scrollY),scroll);assert.equal(await p.evaluate(()=>document.activeElement.id),'open');add(e,'unmount-scroll-restoration');
 await p.locator('#open').click();await p.locator('[data-focus-modal]').waitFor();await p.evaluate(()=>openNested('external'));const external=p.getByRole('dialog',{name:'External Inbox',exact:true});await external.waitFor();await p.evaluate(()=>unmountFocus());assert.ok(await external.evaluate(n=>n.open&&n.contains(document.activeElement)));assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');await p.keyboard.press('Escape');await p.waitForTimeout(200);assert.notEqual(await p.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');add(e,'focus-unmount-preserves-other-modal-focus-scroll');
 await p.locator('#open').click();await p.locator('[data-focus-modal]').waitFor();await p.locator('#open').evaluate(n=>n.remove());await p.keyboard.press('Escape');assert.equal(await p.locator('[data-focus-modal]').count(),0);assert.equal(await p.evaluate(()=>document.documentElement.classList.contains('bt-focus-active')),false);add(e,'removed-trigger-no-focus-or-scroll-leak');
 assert.deepEqual(e.errors,[]);await e.context.close();
 if(process.env.F02_BEFORE)for(const width of [390,1440])for(const environment of ['forest','gradient-wave','zenitho','glass-fold']){
  const pixels=[];for(const version of ['before','after']){const e=await setup({version,width,environment,theme:width===390?'dark':'light',lang:width===390?'en':'fr'});await e.page.locator('#open').click();await e.page.locator('[data-environment]').first().waitFor();await e.page.mouse.move(0,500);await e.page.waitForTimeout(1600);const filename=output+'/'+environment+'-'+width+'-'+version+'.png';await e.page.screenshot({path:filename});pixels.push(await sharp(filename).raw().toBuffer());assert.deepEqual(e.errors,[]);await e.context.close();}const same=pixels[0].equals(pixels[1]);let maxChannelDelta=0,changedChannels=0;for(let i=0;i<pixels[0].length;i++){const delta=Math.abs(pixels[0][i]-pixels[1][i]);maxChannelDelta=Math.max(maxChannelDelta,delta);if(delta)changedChannels++;}add({width,environment},'visual-before-after',{same,maxChannelDelta,changedChannels});assert.ok(maxChannelDelta<=1,environment+' '+width+' unchanged apart from <=1/255 GPU rasterization noise');}
}
}finally{await fs.writeFile(output+(process.env.F02_INBOX?'/inbox-results.json':process.env.F02_NOTICES?'/notice-results.json':process.env.F02_BLOCKERS?'/blocker-results.json':process.env.F02_EXTRAS?'/extra-results.json':'/component-results.json'),JSON.stringify(results,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({observations:results.length,output}));
