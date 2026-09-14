-- Additive evolution: existing community keys, messages, attachments and XP
-- triggers stay intact. No private Friends data participates in these spaces.
begin;

create table public.study_fields (
  id text primary key, name_en text not null, name_fr text not null
);
insert into public.study_fields values
('business','Business & Management','Gestion & management'),('finance','Finance','Finance'),
('marketing','Marketing','Marketing'),('economics','Economics','Économie'),('law','Law','Droit'),
('computer-science','Computer Science','Informatique'),('engineering','Engineering','Ingénierie'),
('medicine','Medicine','Médecine'),('health','Health & Nursing','Santé & soins infirmiers'),
('psychology','Psychology','Psychologie'),('science','Natural Sciences','Sciences naturelles'),
('mathematics','Mathematics & Statistics','Mathématiques & statistiques'),('education','Education','Éducation'),
('social-sciences','Social Sciences','Sciences sociales'),('humanities','Humanities & Languages','Lettres & langues'),
('arts','Arts & Design','Arts & design'),('architecture','Architecture','Architecture'),
('communication','Communication & Media','Communication & médias'),
('environment','Environment & Agriculture','Environnement & agronomie'),
('hospitality','Hospitality & Tourism','Hôtellerie & tourisme'),('sport','Sport Sciences','Sciences du sport'),
('other','Other studies','Autres études');
alter table public.study_fields enable row level security;
grant select on public.study_fields to anon, authenticated;
create policy study_fields_read on public.study_fields for select to anon, authenticated using (true);

-- study_field remains the existing, user-written program. Never guess or
-- overwrite a student's broad field from a legacy free-text label.
alter table public.profiles add column broad_field text references public.study_fields(id);
grant select (broad_field), update (broad_field), insert (broad_field) on public.profiles to authenticated;
create index profiles_broad_field_idx on public.profiles(broad_field);

create function public.study_name_key(value text) returns text
language sql immutable strict set search_path = public
as $$ select trim(regexp_replace(lower(translate(value,
  'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
  'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^[:alnum:]]+', ' ', 'g')) $$;
revoke all on function public.study_name_key(text) from public, anon;
grant execute on function public.study_name_key(text) to authenticated;

create table public.study_spaces (
  id text primary key,
  kind text not null check (kind in ('hub','university','field','program','course','exam')),
  name text not null check (char_length(trim(name)) between 2 and 180),
  parent_id text references public.study_spaces(id),
  broader_id text references public.study_spaces(id),
  university_id text references public.study_spaces(id),
  field_id text references public.study_fields(id),
  exam_date date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (parent_id is distinct from id), check (broader_id is distinct from id)
);
create index study_spaces_parent_idx on public.study_spaces(parent_id);
create index study_spaces_broader_idx on public.study_spaces(broader_id);
create index study_spaces_university_idx on public.study_spaces(university_id);
create index study_spaces_field_idx on public.study_spaces(field_id);
create index study_spaces_creator_idx on public.study_spaces(created_by);
create unique index study_spaces_university_name_idx on public.study_spaces(public.study_name_key(name)) where kind='university';
create unique index study_spaces_course_identity_idx on public.study_spaces(university_id,public.study_name_key(name)) where kind='course';
create unique index study_spaces_child_identity_idx on public.study_spaces(parent_id,kind,public.study_name_key(name),coalesce(exam_date,'0001-01-01'::date)) where kind in ('program','field','exam');
alter table public.study_spaces enable row level security;
grant select, insert on public.study_spaces to authenticated;
create policy study_spaces_read on public.study_spaces for select to authenticated using (true);
create policy study_spaces_insert on public.study_spaces for insert to authenticated with check (created_by=(select auth.uid()) and kind<>'hub');

insert into public.study_spaces(id,kind,name) values ('study-hub','hub','All students');
insert into public.study_spaces(id,kind,name,parent_id)
select id,'university',full_name,'study-hub' from public.university_communities;
insert into public.study_spaces(id,kind,name,parent_id,field_id)
select 'field-'||id,'field',name_en,'study-hub',id from public.study_fields;
-- Preserve any historical key outside the curated directory too.
insert into public.study_spaces(id,kind,name,parent_id)
select distinct community,'university',community,'study-hub' from public.community_messages
where not exists(select 1 from public.study_spaces s where s.id=community);

create table public.study_space_members (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  space_id text not null references public.study_spaces(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(user_id,space_id)
);
create index study_space_members_space_idx on public.study_space_members(space_id);
alter table public.study_space_members enable row level security;
grant select,insert,delete on public.study_space_members to authenticated;
-- Study memberships are public within the signed-in study community, unlike
-- private Friends groups; the directory can count them without a definer view.
create policy study_members_read on public.study_space_members for select to authenticated using (true);
create policy study_members_insert on public.study_space_members for insert to authenticated with check(user_id=(select auth.uid()));
create policy study_members_delete on public.study_space_members for delete to authenticated using(user_id=(select auth.uid()));
insert into public.study_space_members(user_id,space_id)
select p.id,s.id from public.profiles p join public.study_spaces s on s.kind='university' and public.study_name_key(s.name)=public.study_name_key(p.university)
on conflict do nothing;

-- Clients cannot forge a parent chain, impersonate a broad field or create
-- cycles. No UPDATE/DELETE privilege exists on the registry.
create function public.validate_study_space() returns trigger language plpgsql security invoker set search_path=public as $$
declare p public.study_spaces; f public.study_fields; root_id text;
begin
  select * into p from public.study_spaces where id=new.parent_id;
  if p.id is null then raise exception 'A parent space is required'; end if;
  if not ((new.kind='university' and p.kind='hub')
    or (new.kind='field' and p.kind='university')
    or (new.kind='program' and p.kind in ('field','university'))
    or (new.kind='course' and p.kind in ('university','field','program'))
    or (new.kind='exam' and p.kind='course')) then raise exception 'Invalid study hierarchy'; end if;
  if new.kind='university' then new.university_id=null; new.field_id=null; new.broader_id='study-hub';
  else
    root_id=case when p.kind='university' then p.id else p.university_id end;
    if root_id is null then raise exception 'Choose a university first'; end if;
    new.university_id=root_id;
    if new.kind='field' then
      select * into f from public.study_fields where id=new.field_id;
      if f.id is null then raise exception 'Unknown field'; end if;
      new.name=f.name_en;
    else new.field_id=p.field_id; end if;
    new.broader_id=case when new.field_id is not null then 'field-'||new.field_id else root_id end;
  end if;
  if new.kind<>'exam' then new.exam_date=null; end if;
  return new;
end $$;
revoke all on function public.validate_study_space() from public,anon,authenticated;
create trigger study_spaces_validate before insert on public.study_spaces for each row execute function public.validate_study_space();
create trigger study_spaces_rate_limit before insert on public.study_spaces for each row execute function public.enforce_insert_rate_limit('created_by','30','3600');

create function public.ensure_study_space(p_kind text,p_name text,p_parent text default 'study-hub',p_field text default null,p_exam_date date default null)
returns text language plpgsql security invoker set search_path=public as $$
declare sid text; root_id text; clean text=trim(regexp_replace(p_name,'\s+',' ','g'));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(clean) not between 2 and 180 then raise exception 'Name must contain 2 to 180 characters'; end if;
  select case when kind='university' then id else university_id end into root_id from public.study_spaces where id=p_parent;
  if p_kind='university' then
    select id into sid from public.study_spaces where kind='university' and public.study_name_key(name)=public.study_name_key(clean);
  elsif p_kind='course' then
    select id into sid from public.study_spaces where kind='course' and university_id=root_id and public.study_name_key(name)=public.study_name_key(clean);
  else
    select id into sid from public.study_spaces where kind=p_kind and parent_id=p_parent
      and (case when p_kind='field' then field_id=p_field else public.study_name_key(name)=public.study_name_key(clean) end)
      and exam_date is not distinct from (case when p_kind='exam' then p_exam_date else null end);
  end if;
  if sid is not null then return sid; end if;
  sid='space-'||md5(concat_ws('|',p_kind,case when p_kind='course' then root_id else p_parent end,
    case when p_kind='field' then p_field else public.study_name_key(clean) end,case when p_kind='exam' then p_exam_date::text end));
  insert into public.study_spaces(id,kind,name,parent_id,field_id,exam_date) values(sid,p_kind,clean,p_parent,p_field,p_exam_date) on conflict do nothing;
  if not exists(select 1 from public.study_spaces where id=sid) then
    -- Another transaction may have won a normalized-name unique constraint.
    return public.ensure_study_space(p_kind,clean,p_parent,p_field,p_exam_date);
  end if;
  return sid;
end $$;
revoke all on function public.ensure_study_space(text,text,text,text,date) from public,anon;
grant execute on function public.ensure_study_space(text,text,text,text,date) to authenticated;

create function public.sync_my_study_spaces() returns void language plpgsql security invoker set search_path=public as $$
declare p public.profiles; uni text; field_space text; program_space text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  -- Only select publicly readable columns: profiles has column-level grants.
  select university,study_field,broad_field into p.university,p.study_field,p.broad_field from public.profiles where id=auth.uid();
  if char_length(trim(coalesce(p.university,'')))<2 then return; end if;
  uni=public.ensure_study_space('university',p.university);
  insert into public.study_space_members(user_id,space_id) values(auth.uid(),uni) on conflict do nothing;
  field_space=uni;
  if p.broad_field is not null then
    field_space=public.ensure_study_space('field',(select name_en from public.study_fields where id=p.broad_field),uni,p.broad_field);
    insert into public.study_space_members(user_id,space_id) values(auth.uid(),field_space),(auth.uid(),'field-'||p.broad_field) on conflict do nothing;
  end if;
  if char_length(trim(coalesce(p.study_field,'')))>=2 then
    program_space=public.ensure_study_space('program',p.study_field,field_space);
    insert into public.study_space_members(user_id,space_id) values(auth.uid(),program_space) on conflict do nothing;
  end if;
end $$;
revoke all on function public.sync_my_study_spaces() from public,anon;
grant execute on function public.sync_my_study_spaces() to authenticated;

alter table public.community_messages add column content_type text not null default 'discussion' check(content_type in ('discussion','question','resource','exam'));
update public.community_messages set content_type=case when content like '[Question] %' then 'question' when content like '[Ressource] %' then 'resource' when content like '[Examen] %' then 'exam' else 'discussion' end;
alter table public.community_messages add constraint community_messages_space_fk foreign key(community) references public.study_spaces(id);
create index community_messages_timeline_idx on public.community_messages(community,created_at desc,id desc) where parent_id is null;
create or replace function public.can_access_community(c text) returns boolean language sql stable security invoker set search_path=public as $$
  select auth.uid() is not null and (
    exists(select 1 from public.study_space_members where user_id=auth.uid() and space_id=c)
    or exists(select 1 from public.profiles p join public.university_communities u on u.full_name=p.university where p.id=auth.uid() and u.id=c)
    or exists(select 1 from public.profiles where id=auth.uid() and is_admin=true))
$$;
revoke all on function public.can_access_community(text) from public,anon;
grant execute on function public.can_access_community(text) to authenticated;

create function public.validate_study_reply() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.parent_id is not null and not exists(select 1 from public.community_messages where id=new.parent_id and community=new.community and parent_id is null) then
    raise exception 'Replies must belong to a root post in the same space';
  end if;
  return new;
end $$;
revoke all on function public.validate_study_reply() from public,anon,authenticated;
create trigger community_reply_scope before insert on public.community_messages for each row execute function public.validate_study_reply();

create view public.study_space_directory with(security_invoker=true) as
select s.*,
  trim(concat_ws(' ',s.name,p.name,u.name,f.name_en,f.name_fr,s.id)) as search_text,
  (select count(*) from public.study_space_members m where m.space_id=s.id) as member_count,
  (select count(*) from public.community_messages m where m.community=s.id and m.parent_id is null and m.created_at>now()-interval '14 days') as recent_posts,
  (select max(created_at) from public.community_messages m where m.community=s.id) as last_activity
from public.study_spaces s left join public.study_spaces p on p.id=s.parent_id
left join public.study_spaces u on u.id=s.university_id left join public.study_fields f on f.id=s.field_id;
grant select on public.study_space_directory to authenticated;
commit;
