-- Lifetime history must not disappear from streaks, studied-day counts and
-- badge eligibility when the account passes ten years of saved study data.
-- v73 returned NO calendar rows beyond 3,660 days, rather than a shorter view.
-- Only remove that all-or-nothing cutoff; keep finite/reversed-range guards.
-- No stored rows, XP formulas, day thresholds, freeze rules or ACLs change.
-- Internal function only: public/anon/authenticated have no EXECUTE permission.
do $patch$
declare
  source text;
  old_guard constant text := 'where p_from <= p_to and p_to - p_from <= 3660';
  new_guard constant text := 'where p_from <= p_to and isfinite(p_from) and isfinite(p_to)';
begin
  select pg_get_functiondef('public.study_day_states(uuid,date,date,date)'::regprocedure)
  into source;
  if position(new_guard in source) > 0 then return; end if;
  if position(old_guard in source) = 0 then
    raise exception 'Lifetime study days: expected v73 guard not found; review function before applying';
  end if;
  execute replace(source, old_guard, new_guard);
end
$patch$;
