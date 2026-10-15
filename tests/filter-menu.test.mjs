import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),React=require('react');
const {act,create}=require('react-test-renderer'),{renderToString}=require('react-dom/server');
const {transformSync}=require('@babel/core');
const source=readFileSync(new URL('../components/FilterMenu.js',import.meta.url),'utf8');
function load(globals={}){
 const {code}=transformSync(source,{filename:'FilterMenu.js',babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-react':{runtime:'automatic'}}]],plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]});
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>id==='./Glyph'?()=>null:id==='react-dom'?{createPortal:(children,target)=>{globals.portal?.(target);return children;}}:require(id),...globals});
 return module.exports.default;
}
function harness(initial={}){
 const calls=[],listeners=new Map(),body={},native={},document={body,activeElement:body};let renderer,props={value:'b',options:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'},{value:'c',label:'Charlie'}],ariaLabel:'Period',onChange:v=>calls.push(v),...initial};
 const nodeMap=new Map();let nodes=[];
 const trigger={getBoundingClientRect:()=>({top:100,bottom:132,left:20,right:100}),focus:()=>{document.activeElement=trigger;},closest:()=>h.native?native:null};
 const menu={scrollTop:0,offsetWidth:160,offsetHeight:120,contains:node=>{if(node===globals.window)throw new TypeError('contains expects a Node');return node===menu||nodes.includes(node);},getBoundingClientRect:()=>({top:138,bottom:258}),querySelectorAll:()=>nodes,focus:()=>{document.activeElement=menu;}};
 const add=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},remove=(name,fn)=>listeners.get(name)?.delete(fn);
 const globals={document,window:{innerWidth:390,innerHeight:844,addEventListener:add,removeEventListener:remove},portal:target=>{h.portal=target;}};
 Object.assign(document,{addEventListener:add,removeEventListener:remove});
 const Filter=load(globals);
 function syncNodes(){
  nodes=(props.actions?.length?props.actions:props.options).map((item,index)=>{
   const key=props.actions?.length?(item.key||item.label):item.value;
   if(!nodeMap.has(key))nodeMap.set(key,{key,focus(){document.activeElement=this;const role=props.actions?.length?'menuitem':'option';const rendered=renderer?.root.findAll(n=>n.props.role===role)[nodes.indexOf(this)];rendered?.props.onFocus?.();},getBoundingClientRect(){const i=nodes.indexOf(this);return {top:142+i*32-menu.scrollTop,bottom:174+i*32-menu.scrollTop};}});
   return nodeMap.get(key);
  });
 }
 const h={calls,listeners,document,trigger,menu,window:globals.window,native:false,portal:null,
  render(next={}){props={...props,...next};syncNodes();act(()=>{const element=React.createElement(Filter,props);if(renderer)renderer.update(element);else renderer=create(element,{createNodeMock:element=>element.props.role==='listbox'||element.props.role==='menu'?menu:element.type==='button'&&!element.props.role?trigger:{contains:node=>node===trigger}});});},
  button:()=>renderer.root.findAll(n=>n.type==='button'&&!n.props.role)[0],
  popup:()=>renderer.root.findAll(n=>n.props.role==='listbox'||n.props.role==='menu')[0],
  items:()=>renderer.root.findAll(n=>n.props.role==='option'||n.props.role==='menuitem'),
  click(){act(()=>h.button().props.onClick());},
  key(key,{trigger:atTrigger=false,...options}={}){let prevented=false,stopped=false;act(()=>{(atTrigger?h.button():h.popup()).props.onKeyDown?.({key,timeStamp:1000,preventDefault:()=>{prevented=true;},stopPropagation:()=>{stopped=true;},...options});});return {prevented,stopped};},
  event(name,target){act(()=>{for(const fn of [...listeners.get(name)||[]])fn({target,type:name});});},
  pick(i){act(()=>h.items()[i].props.onClick());},
  unmount(){act(()=>renderer.unmount());},
 };
 h.render();return h;
}
test('SSR is closed, deterministic and invokes no browser layout APIs',()=>{
 const Filter=load();let errors=[];const old=console.error;console.error=(...args)=>errors.push(args.join(' '));
 try{const html=renderToString(React.createElement(Filter,{value:'a',options:[{value:'a',label:'Alpha'}]}));assert.match(html,/aria-expanded="false"/);assert.doesNotMatch(html,/role="listbox"/);assert.deepEqual(errors,[]);}finally{console.error=old;}
});
test('selector opens on selected option with one roving tab stop and unchanged selection',()=>{
 const h=harness();h.key('ArrowDown',{trigger:true});assert.equal(h.document.activeElement.key,'b');assert.equal(h.popup().props.role,'listbox');assert.equal(h.items().filter(n=>n.props.tabIndex===0).length,1);assert.deepEqual(h.items().map(n=>n.props['aria-selected']),[false,true,false]);assert.deepEqual(h.calls,[]);h.unmount();
});
test('arrows wrap, Home and End move without committing values',()=>{
 const h=harness();h.click();for(const [key,expected] of [['End','c'],['ArrowDown','a'],['ArrowUp','c'],['Home','a']]){assert.equal(h.key(key).prevented,true);assert.equal(h.document.activeElement.key,expected);}assert.deepEqual(h.calls,[]);h.unmount();
});
test('Escape closes and restores trigger; Tab uses native traversal from trigger',()=>{
 for(const key of ['Escape','Tab'])for(const shiftKey of [false,true]){const h=harness();h.click();const event=h.key(key,{shiftKey});assert.equal(h.popup(),undefined);assert.equal(h.document.activeElement,h.trigger);assert.equal(event.prevented,key==='Escape');assert.equal(event.stopped,true);h.unmount();}
});
test('native Enter/Space remain the only activation path and repeated keys are suppressed',()=>{
 const h=harness();h.click();for(const key of ['Enter',' ']){assert.equal(h.key(key).prevented,false);assert.equal(h.key(key,{repeat:true}).prevented,true);}assert.deepEqual(h.calls,[]);h.pick(2);assert.deepEqual(h.calls,['c']);assert.equal(h.document.activeElement,h.trigger);h.unmount();
});
test('command menu opens at last with ArrowUp, first with click; action runs once',()=>{
 const calls=[],h=harness({actions:[{key:'view',label:'View',onSelect:()=>calls.push('view')},{key:'delete',label:'Delete',danger:true,onSelect:()=>calls.push('delete')}]});h.key('ArrowUp',{trigger:true});assert.equal(h.popup().props.role,'menu');assert.equal(h.document.activeElement.key,'delete');assert.equal(h.items()[1].props['aria-selected'],undefined);h.pick(1);assert.deepEqual(calls,['delete']);h.click();assert.equal(h.document.activeElement.key,'view');h.unmount();
});
test('internal scroll stays open; outside scroll and resize close and restore active focus',()=>{
 for(const event of ['scroll','resize']){const h=harness();h.click();h.event('scroll',h.menu);assert.ok(h.popup());h.event(event,{});assert.equal(h.popup(),undefined);assert.equal(h.document.activeElement,h.trigger);h.unmount();}
});
test('pointer outside and external focus close without stealing focus',()=>{
 for(const event of ['mousedown','touchstart','focusin']){const h=harness();h.click();h.event(event,h.menu);assert.ok(h.popup());const outside={};h.document.activeElement=outside;h.event(event,outside);assert.equal(h.popup(),undefined);assert.equal(h.document.activeElement,outside);h.unmount();}
});
test('external selected value changes focus and ARIA, without calling onChange',()=>{
 const h=harness();h.click();h.render({value:'c'});assert.equal(h.document.activeElement.key,'c');assert.deepEqual(h.items().map(n=>n.props['aria-selected']),[false,false,true]);assert.deepEqual(h.calls,[]);h.unmount();
});
test('reordered options retain focus by identity; removed focus falls back safely',()=>{
 const h=harness();h.click();h.render({options:[{value:'c',label:'Charlie'},{value:'b',label:'Updated'},{value:'a',label:'Alpha'}]});assert.equal(h.document.activeElement.key,'b');h.document.activeElement=h.document.body;h.render({options:[{value:'a',label:'Alpha'}]});assert.equal(h.document.activeElement.key,'a');h.unmount();
});
test('empty options can open, navigate, repopulate and close without a trap',()=>{
 const h=harness({options:[]});h.click();assert.equal(h.document.activeElement,h.menu);h.key('ArrowUp');h.key('End');h.render({options:[{value:'a',label:'Alpha'}]});assert.equal(h.document.activeElement.key,'a');h.key('Tab');assert.equal(h.popup(),undefined);h.unmount();
});
test('typeahead moves focus without selecting',()=>{
 const h=harness();h.click();h.key('c');assert.equal(h.document.activeElement.key,'c');assert.deepEqual(h.calls,[]);h.unmount();
});
test('portal stays in closest open native dialog and otherwise uses body',()=>{
 const h=harness();h.click();assert.equal(h.portal,h.document.body);h.key('Escape');h.native=true;h.click();assert.notEqual(h.portal,h.document.body);h.unmount();
});
test('listeners clean up after close and unmount',()=>{
 const h=harness();h.click();assert.ok([...h.listeners.values()].some(s=>s.size));h.key('Escape');assert.ok([...h.listeners.values()].every(s=>s.size===0));h.click();h.unmount();assert.ok([...h.listeners.values()].every(s=>s.size===0));
});

test('a queued page scroll with no movement since opening is ignored; a new movement closes',()=>{
 const h=harness();h.window.scrollX=0;h.window.scrollY=30;h.click();h.event('scroll',h.document);assert.ok(h.popup());h.window.scrollY=40;h.event('scroll',h.document);assert.equal(h.popup(),undefined);h.unmount();
});

test('holding activation on the trigger cannot reopen a just-closed menu',()=>{
 const h=harness();for(const key of ['Enter',' '])assert.equal(h.key(key,{trigger:true,repeat:true}).prevented,true);assert.equal(h.popup(),undefined);assert.deepEqual(h.calls,[]);h.unmount();
});

test('real resize targets Window, which cannot be passed to Node.contains',()=>{const h=harness();h.click();h.event('resize',h.window);assert.equal(h.popup(),undefined);h.unmount();});
