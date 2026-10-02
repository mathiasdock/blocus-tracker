import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarDatabase } from './fixtures/calendars/database.mjs';
import { createCalendarHandler, syncCalendar } from '../lib/server/calendarSync.mjs';
import { calendarReview, externalCourses, sourceChanged, calendarExamPrefill } from '../lib/calendarReview.mjs';
import { planningAcademicEvents, academicKey } from '../lib/planningAcademicEvents.mjs';
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
const C='00000000-0000-0000-0000-000000000011', D='00000000-0000-0000-0000-000000000012';
const today=new Date().toISOString().slice(0,10), stamp=today.replaceAll('-','');
const feed='https://canvas.example.edu/calendar.ics';
const ics=(title='Final Exam', uid='one')=>`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:${uid}\nSUMMARY:${title} [ADV 3001]\nDTSTART;VALUE=DATE:${stamp}\nURL:https://canvas.example.edu/courses/42/assignments/1\nEND:VEVENT\nEND:VCALENDAR`;
let db;
before(async()=>{db=await createCalendarDatabase({userFlow:true});});
after(async()=>db?.close());
beforeEach(async()=>{await db.exec(`reset role; truncate auth.users cascade;
 insert into auth.users values('${A}'),('${B}'); insert into profiles(id) values('${A}'),('${B}');
 insert into courses values('${C}','${A}','Principles of Advertising'),('${D}','${B}','Other user');`);});
const admin={async rpc(name,args){
 await db.query("select set_config('request.jwt.claim.sub','',false)"); await db.exec('set role service_role');
 try {const entries=Object.entries(args); const result=await db.query(`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) as result`,entries.map(([,v])=>Array.isArray(v)?JSON.stringify(v):v)); return {data:result.rows[0].result,error:null};}
 catch(error){return {error};}finally{await db.exec('reset role');}
}};
async function request(body,{fetchFeed=async()=>({text:ics()}),userId=A,method='POST'}={}){
 const res={status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;}};
 await createCalendarHandler({authenticate:async()=>({admin,userId}),setHeaders:()=>{},getIp:()=>'',rateLimit:()=>({ok:true}),fetchFeed})({method,headers:{'content-type':'application/json'},body},res); return res;
}
async function connect(){const response=await request({action:'connect',provider:'canvas',display_name:'University',feed_url:feed});assert.equal(response.code,201,JSON.stringify(response.payload));return response.payload.id;}
async function convert(source,user=A,changes={}) { return admin.rpc('confirm_calendar_exam',{p_user_id:user,p_source_id:source,p_external_uid:'one',p_recurrence_id:'',p_name:'Final Exam',p_course_id:C,p_exam_date:today,p_exam_time:null,p_location:null,...changes}); }
async function count(table){return (await db.query(`select count(*)::int n from ${table}`)).rows[0].n;}
async function asUser(user,sql,params=[]){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);try{return await db.query(sql,params);}finally{await db.exec('reset role');}}

test('connect fetches and validates before atomic first import; secret never returned; retry has one source',async()=>{
 const response=await request({action:'connect',provider:'canvas',display_name:'University',feed_url:feed});
 assert.equal(response.code,201); assert.equal(response.payload.event_count,1); assert.ok(!JSON.stringify(response.payload).includes(feed));
 assert.equal(await count('external_academic_events'),1); await connect(); assert.equal(await count('external_calendar_sources'),1);
 assert.equal(await count('external_calendar_secrets'),1); assert.equal(await count('exams'),0);
});
test('invalid URL and malformed feed leave no persisted source or secret',async()=>{
 for(const [url,text] of [['http://canvas.example.edu/calendar.ics',ics()],[feed,'<html>login</html>']]) {
  const response=await request({action:'connect',provider:'canvas',display_name:'University',feed_url:url},{fetchFeed:async()=>({text})});
  assert.ok([400,422].includes(response.code)); assert.equal(await count('external_calendar_sources'),0); assert.equal(await count('external_calendar_secrets'),0);
 }
});
test('fetch exceptions are sanitized, never reflecting URL/token',async()=>{
 const res=await request({action:'connect',provider:'canvas',display_name:'University',feed_url:feed},{fetchFeed:async()=>{throw Error('private-token-'+feed);}});
 assert.equal(res.payload.error,'calendar_sync_failed'); assert.ok(!JSON.stringify(res).includes(feed)); assert.equal(await count('external_calendar_sources'),0);
});
test('all four providers use the same validated import path',async()=>{
 for(const provider of ['canvas','moodle','brightspace','ical']){
  await db.exec('delete from external_calendar_sources');
  const res=await request({action:'connect',provider,display_name:provider,feed_url:feed}); assert.equal(res.code,201);
 }
});
test('atomic connect rolls back secret/source on event storage failure',async()=>{
 const result=await admin.rpc('connect_imported_calendar',{p_user_id:A,p_provider:'canvas',p_display_name:'Bad',p_feed_url:feed,p_events:[{event_date:today,status:'active',external_uid:'x'.repeat(300)}]});
 assert.ok(result.error); assert.equal(await count('external_calendar_sources'),0); assert.equal(await count('external_calendar_secrets'),0);
});
test('mapping supports mapped, ignored and intentionally unmapped with owner enforcement',async()=>{
 const id=await connect(); const sql=`insert into external_calendar_course_map(user_id,source_id,external_course_key,local_course_id,ignored) values($1,$2,'canvas:course:42',$3,$4)`;
 await assert.rejects(asUser(B,sql,[B,id,D,false])); await assert.rejects(asUser(A,sql,[A,id,D,false]));
 await asUser(A,sql,[A,id,null,true]); assert.equal((await asUser(B,'select * from external_calendar_course_map')).rows.length,0);
 await asUser(A,'update external_calendar_course_map set ignored=false where source_id=$1',[id]);
 await asUser(A,'update external_calendar_course_map set local_course_id=$1 where source_id=$2',[C,id]);
 assert.equal((await db.query('select name from courses where id=$1',[C])).rows[0].name,'Principles of Advertising');
});
test('explicit exam conversion is idempotent and links an exact preexisting local exam',async()=>{
 const id=await connect(); const first=await convert(id); assert.equal(first.error,null);
 const second=await convert(id,A,{p_name:'A retry must not edit',p_exam_date:'2028-01-01'}); assert.equal(second.data,first.data);
 assert.equal(await count('exams'),1); assert.equal(await count('external_calendar_exam_links'),1);
 assert.equal((await db.query('select name from exams')).rows[0].name,'Final Exam');
 await db.exec('delete from external_calendar_exam_links'); const third=await convert(id); assert.equal(third.data,first.data);assert.equal(await count('exams'),1);
});
test('exam API uses verified owner, validates input, supports retry and acknowledgement',async()=>{
 const id=await connect();
 const body={action:'confirm_exam',source_id:id,external_uid:'one',recurrence_id:'',user_id:B,exam:{name:'Final Exam',courseId:C,date:today,time:'',location:''}};
 assert.equal((await request({...body,exam:{...body.exam,name:''}})).code,400);
 assert.equal((await request(body,{userId:B})).code,400);
 assert.equal(await count('exams'),0);
 const first=await request(body); assert.equal(first.code,200);assert.ok(first.payload.exam_id);
 assert.equal((await request(body)).payload.exam_id,first.payload.exam_id);
 assert.equal((await request({...body,action:'acknowledge_exam',exam:undefined})).code,200);
 assert.equal(await count('exams'),1);
 assert.equal((await db.query('select user_id from exams')).rows[0].user_id,A);
});
test('exam prefill preserves all-day date and leaves time empty; floating dates keep local wall time',()=>{
 const row={source_id:'s',external_course_key:'c',raw_title:'Final Exam',all_day:true,event_date:today,starts_at:today+'T00:00:00Z'};
 const mapping=[{source_id:'s',external_course_key:'c',local_course_id:C}];
 assert.deepEqual(calendarExamPrefill(row,mapping),{name:'Final Exam',courseId:C,date:today,time:'',location:''});
 assert.equal(calendarExamPrefill({...row,all_day:false,floating_at:today+'T14:30:00'},[]).time,'14:30');
 assert.equal(calendarExamPrefill(row,[]).courseId,'');
});
test('conversion denies foreign source/course, direct link writes, anonymous RPC and suspended user',async()=>{
 const id=await connect(); assert.ok((await convert(id,B)).error); assert.ok((await convert(id,A,{p_course_id:D})).error);
 await assert.rejects(asUser(A,`select confirm_calendar_exam($1,$2,'one','','Exam',$3,$4)`,[A,id,C,today]));
 await db.exec('set role anon'); await assert.rejects(db.query('select * from external_calendar_exam_links'));await db.exec('reset role');
 await convert(id); assert.equal((await asUser(B,'select * from external_calendar_exam_links')).rows.length,0);
 await assert.rejects(asUser(A,'delete from external_calendar_exam_links'));
 await db.query('update profiles set locked=true where id=$1',[A]); assert.equal((await convert(id)).error.code,'42501');
});
test('resync never edits local exams; cancellation/reappearance preserves identity; disconnect keeps exam and course',async()=>{
 const id=await connect();const created=await convert(id);await db.query("update exams set name='Student edited',exam_date='2028-02-01' where id=$1",[created.data]);
 const sync=async(text)=>{await db.query('update external_calendar_sources set last_attempted_at=null where id=$1',[id]);await syncCalendar(admin,A,id,async()=>({text}));};
 await sync(ics('Midterm')); assert.equal((await db.query('select name from exams')).rows[0].name,'Student edited');
 await sync('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR'); assert.equal(await count('external_calendar_exam_links'),1);
 await sync(ics()); assert.equal((await convert(id)).data,created.data); assert.equal(await count('exams'),1);
 await asUser(A,'delete from external_calendar_sources where id=$1',[id]);
 for(const table of ['external_calendar_secrets','external_calendar_course_map','external_academic_events','external_calendar_exam_links'])assert.equal(await count(table),0);
 assert.equal(await count('exams'),1);assert.equal(await count('courses'),2);
});
test('source acknowledgement changes only the snapshot, never a local exam',async()=>{
 const id=await connect();const created=await convert(id);await db.query("update external_academic_events set event_date=event_date+1 where source_id=$1",[id]);
 assert.equal((await convert(id,A,{p_acknowledge_only:true})).data,created.data);
 assert.equal((await db.query('select exam_date::text from exams')).rows[0].exam_date,today);
 const result=await db.query('select source_snapshot from external_calendar_exam_links'); assert.notEqual(result.rows[0].source_snapshot.event_date,today);
});
test('sync failure finalizes through the real Supabase thenable contract without leaking errors',async()=>{
 const calls=[];
 const client={rpc(name,args){calls.push({name,args});return {then(resolve,reject){return Promise.resolve(name==='begin_external_calendar_sync'
  ? {data:{token:'lease',provider:'canvas',feed_url:feed},error:null} : {data:null,error:null}).then(resolve,reject);}};}};
 await assert.rejects(syncCalendar(client,A,C,async()=>{throw Error('private '+feed);}),error=>error.code==='calendar_sync_failed'&&!error.message.includes(feed));
 assert.equal(calls.length,2); assert.equal(calls[1].args.p_error,'calendar_sync_failed');
});
test('migration security catalog has RLS, read-only link grants, fixed paths and service-only invoker RPCs',async()=>{
 assert.equal((await db.query("select relrowsecurity from pg_class where relname='external_calendar_exam_links'")).rows[0].relrowsecurity,true);
 assert.equal((await db.query("select has_table_privilege('authenticated','external_calendar_exam_links','INSERT') p")).rows[0].p,false);
 for(const name of ['connect_imported_calendar','confirm_calendar_exam']) {
  const fn=(await db.query('select oid,prosecdef,proconfig from pg_proc where proname=$1',[name])).rows[0]; assert.equal(fn.prosecdef,false);assert.ok(fn.proconfig.some(x=>x.startsWith('search_path=')));
  assert.equal((await db.query("select has_function_privilege('anon',$1::oid,'EXECUTE') p",[fn.oid])).rows[0].p,false);
  assert.equal((await db.query("select has_function_privilege('authenticated',$1::oid,'EXECUTE') p",[fn.oid])).rows[0].p,false);
 }
});
test('review is compact, new courses are non-blocking, ignored events stay stored, linked exams never duplicate in Planning',()=>{
 const event={source_id:'s',external_uid:'one',recurrence_id:'',raw_title:'Final Exam',event_date:today,all_day:true,status:'active',external_course_key:'42',external_course_label:'ADV 3001',automatic_type:'exam',automatic_confidence:'high',automatic_importance:'critical'};
 const rows=[event,{...event,external_uid:'two',external_course_key:'99',external_course_label:'MAR 4156',automatic_type:'quiz',automatic_importance:'normal'}];
 assert.equal(externalCourses(rows,[],'s').length,2);const review=calendarReview(rows,[],[],'s');assert.equal(review.total,2);assert.equal(review.attention.length,1);
 const links=[{...event,local_exam_id:'exam',source_snapshot:{...event}}];assert.equal(calendarReview(rows,[],links,'s').attention.length,0);
 assert.equal(sourceChanged({...event,event_date:'2027-01-01'},event),true);
 assert.equal(Object.values(planningAcademicEvents(rows,[],[],[{id:'exam',name:'renamed',exam_date:'2028-01-01'}],undefined,links)).flat().length,1);
 assert.equal(Object.values(planningAcademicEvents(rows,[{source_id:'s',external_course_key:'42',ignored:true}],[],[])).flat().length,1);
 assert.equal(rows.length,2);assert.equal(academicKey(event),academicKey(links[0]));
});
