begin;
-- Remember the profile version already synchronized: deliberately leaving a
-- recommended space must survive reopening Communities or using its search.
create table public.study_space_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  profile_signature text not null
);
alter table public.study_space_preferences enable row level security;
grant select,insert,update on public.study_space_preferences to authenticated;
create policy study_preferences_read on public.study_space_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy study_preferences_insert on public.study_space_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy study_preferences_update on public.study_space_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

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
    if char_length(trim(coalesce(program_name,'')))>=2 then
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

-- Older installed clients still encode the type as a prefix. Keep their
-- posts visible in the new filters during the rollout.
create or replace function public.validate_study_reply() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.content like '[Question] %' then new.content_type='question';
  elsif new.content like '[Ressource] %' then new.content_type='resource';
  elsif new.content like '[Examen] %' then new.content_type='exam'; end if;
  if new.parent_id is not null and not exists(select 1 from public.community_messages where id=new.parent_id and community=new.community and parent_id is null) then
    raise exception 'Replies must belong to a root post in the same space';
  end if;
  return new;
end $$;
revoke all on function public.validate_study_reply() from public,anon,authenticated;
commit;
