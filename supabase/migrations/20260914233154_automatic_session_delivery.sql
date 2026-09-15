begin;
-- Atomic session delivery covers solo, Pomodoro, offline sync and group timers.
-- No backfill: only newly saved sessions with existing explicit account consent.
create or replace function public.publish_saved_study_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare prefs jsonb; course_name text; course_color text;
begin
  if new.duration_seconds is null or new.duration_seconds < 60 then return new; end if;
  select preferences into prefs from public.auto_share_settings where user_id = new.user_id;
  if prefs->>'session_completed' is distinct from 'true' then return new; end if;
  select name, color into course_name, course_color from public.courses where id = new.course_id;
  insert into public.posts(user_id, image_url, caption, visibility, activity, auto_event_key)
  values(new.user_id, null, null,
    case when prefs->>'visibility' = 'public' then 'public' else 'friends' end,
    jsonb_build_object('version',1,'type','session_completed','seconds',new.duration_seconds,
      'courseName',coalesce(course_name,''),'courseColor',coalesce(course_color,'')),
    'session_completed:' || new.id::text)
  on conflict (user_id, auto_event_key) where auto_event_key is not null do nothing;
  return new;
end;
$$;
revoke all on function public.publish_saved_study_activity() from public, anon, authenticated;
create trigger session_activity_after_insert after insert on public.sessions
for each row execute function public.publish_saved_study_activity();
commit;
