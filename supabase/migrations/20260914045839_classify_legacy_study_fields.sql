begin;
-- Exact reviewed mappings only: never overwrite an explicit field, never edit
-- original free text, never classify mixed or unclear disciplines by substring.
create or replace function public.infer_legacy_study_field(value text) returns text
language sql stable security invoker set search_path=public as $$
  with aliases(field,names) as (values
('business',ARRAY['gestion d''entreprise','gestion de l''entreprise','gestion entreprise','gestion','business management','business and management','business & management','management','business','sciences commerciales','science commercial','science de gestion','sciences de gestion','commercial sciences','international business','business international','international business management','commerce international','ingénieur de gestion','ingé gestion','igénieur de gestion','ingénieur commercial','ingénieur commerciale','ingénieur commerical','business engineering','handelsingenieur','diplome complementaire en gestion','e-business','e-commerce','compta & gestion']),
('economics',ARRAY['sciences éco','sciences économiques','science économique','sciences economiques','économie','economics','economy','econometrics']),
('medicine',ARRAY['médecine','medicine','médecins','medical studies']),
('law',ARRAY['droit','law','legal studies']),
('marketing',ARRAY['marketing']),
('finance',ARRAY['finance','comptabilité','accounting']),
('engineering',ARRAY['ingénieur civil','ingé civil','inge civ','ingénieur civil - MAP-MECA','ingé civil - MAP-MECA','ingénieur civil - FYKI-ELEC','ingénieur civil - Maths appliquées','ingénieur industriel','ingenieur','ingénierie','ingéniérie','engineering','electronic engineering','mechanical engineering','bioingénieur','bio ingénieur','bio-ing','bioingenieur','polytech','polytechnique']),
('health',ARRAY['kiné','kinésithérapie','pharmacie','pharmacy','infirmière','infirmier','nursing','dentaire','dentistry','diététique','ergothérapie','technologue orthopédique']),
('psychology',ARRAY['psychologie','psychology','sciences psychologiques']),
('communication',ARRAY['communication','communication & journalisme','relation publique','relations publiques','journalism']),
('social-sciences',ARRAY['science politique','sciences politiques','science po','sciences po','sciences sociales','sociologie','socio','political science','social sciences']),
('science',ARRAY['biologie','biology','physique','physics']),
('education',ARRAY['enseignement','enseignement préscolaire','enseignement EPS : Section 3','education','teaching']),
('humanities',ARRAY['langues et littératures romanes','humanities']),
('architecture',ARRAY['architecture']),
('computer-science',ARRAY['informatique','sciences informatiques','computer science'])
  ), matches as (
    select a.field from aliases a cross join unnest(a.names) n where public.study_name_key(n)=public.study_name_key(value)
    union select id from public.study_fields where public.study_name_key(value) in(public.study_name_key(name_en),public.study_name_key(name_fr))
  ) select min(field) from matches having count(distinct field)=1;
$$;
revoke all on function public.infer_legacy_study_field(text) from public,anon;
grant execute on function public.infer_legacy_study_field(text) to authenticated;

create or replace function public.study_program_is_generic(value text, broad text) returns boolean
language sql stable security invoker set search_path=public as $$
  with aliases(field,names) as (values
('business',ARRAY['gestion d''entreprise','gestion de l''entreprise','gestion entreprise','gestion','business management','business and management','business & management','management','business','science de gestion','sciences de gestion','sciences commerciales','science commercial','commercial sciences']),
('economics',ARRAY['sciences éco','sciences économiques','science économique','sciences economiques','économie','economics','economy']),
('medicine',ARRAY['médecine','medicine','médecins','medical studies']),
('law',ARRAY['droit','law','legal studies']),
('marketing',ARRAY['marketing']),
('finance',ARRAY['finance']),
('engineering',ARRAY['ingenieur','ingénierie','ingéniérie','engineering','polytech','polytechnique']),
('health',ARRAY['health','health and nursing','santé']),
('psychology',ARRAY['psychologie','psychology','sciences psychologiques']),
('communication',ARRAY['communication']),
('social-sciences',ARRAY['sciences sociales','social sciences']),
('science',ARRAY['natural sciences','sciences naturelles']),
('education',ARRAY['education','enseignement','teaching']),
('humanities',ARRAY['humanities']),
('architecture',ARRAY['architecture']),
('computer-science',ARRAY['informatique','sciences informatiques','computer science'])
  ) select exists(select 1 from aliases a cross join unnest(a.names) n where a.field=broad and public.study_name_key(n)=public.study_name_key(value))
    or exists(select 1 from public.study_fields where id=broad and public.study_name_key(value) in(public.study_name_key(name_en),public.study_name_key(name_fr)));
$$;
revoke all on function public.study_program_is_generic(text,text) from public,anon;
grant execute on function public.study_program_is_generic(text,text) to authenticated;

create or replace function public.sync_my_study_spaces() returns void language plpgsql security invoker set search_path=public as $$
declare uni_name text; program_name text; broad text; signature text; uni text; field_space text; program_space text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select university,study_field,broad_field into uni_name,program_name,broad from public.profiles where id=auth.uid();
  signature=md5(concat_ws('|',uni_name,program_name,broad));
  if exists(select 1 from public.study_space_preferences where user_id=auth.uid() and profile_signature=signature) then return; end if;
  if char_length(trim(coalesce(uni_name,'')))>=2 then
    uni=public.ensure_study_space('university',uni_name);
    insert into public.study_space_members(user_id,space_id) values(auth.uid(),uni) on conflict do nothing;
    field_space=uni;
    if broad is not null then
      field_space=public.ensure_study_space('field',(select name_en from public.study_fields where id=broad),uni,broad);
      insert into public.study_space_members(user_id,space_id) values(auth.uid(),field_space),(auth.uid(),'field-'||broad) on conflict do nothing;
    end if;
    if char_length(trim(coalesce(program_name,''))) between 2 and 180 and not public.study_program_is_generic(program_name,broad) then
      program_space=public.ensure_study_space('program',program_name,field_space);
      insert into public.study_space_members(user_id,space_id) values(auth.uid(),program_space) on conflict do nothing;
    end if;
  elsif broad is not null then
    insert into public.study_space_members(user_id,space_id) values(auth.uid(),'field-'||broad) on conflict do nothing;
  end if;
  insert into public.study_space_preferences(user_id,profile_signature) values(auth.uid(),signature)
    on conflict(user_id) do update set profile_signature=excluded.profile_signature;
end $$;
revoke all on function public.sync_my_study_spaces() from public,anon;
grant execute on function public.sync_my_study_spaces() to authenticated;


-- Transaction-local snapshot verifies that all original labels and explicit
-- choices survive. It is dropped automatically, no extra public user-data table.
create temporary table study_profile_before on commit drop as
select id,study_field,broad_field from public.profiles;
create temporary table study_field_candidates on commit drop as
select p.id,p.university,public.infer_legacy_study_field(p.study_field) as target
from public.profiles p where p.broad_field is null and public.infer_legacy_study_field(p.study_field) is not null;
update public.profiles p set broad_field=c.target from study_field_candidates c
where p.id=c.id and p.broad_field is null;

-- Place migrated students in their global field immediately, and in the local
-- university field when the institution can be resolved. Preserve old spaces.
insert into public.study_space_members(user_id,space_id)
select id,'field-'||target from study_field_candidates on conflict do nothing;
do $$ declare r record; uni text; local_field text; previous_uid text=current_setting('request.jwt.claim.sub',true);
begin
  for r in select * from study_field_candidates where char_length(trim(coalesce(university,''))) between 2 and 180 loop
    perform set_config('request.jwt.claim.sub',r.id::text,true);
    uni=public.ensure_study_space('university',r.university);
    local_field=public.ensure_study_space('field',(select name_en from public.study_fields where id=r.target),uni,r.target);
    insert into public.study_space_members(user_id,space_id) values(r.id,uni),(r.id,local_field) on conflict do nothing;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
  if exists(select 1 from public.profiles p join study_profile_before b using(id) where p.study_field is distinct from b.study_field or (b.broad_field is not null and p.broad_field is distinct from b.broad_field)) then
    raise exception 'Backfill changed original text or an explicit field';
  end if;
  if exists(select 1 from study_field_candidates c join public.profiles p using(id) where p.broad_field is distinct from c.target) then
    raise exception 'Backfill did not classify every reviewed candidate';
  end if;
end $$;
commit;
