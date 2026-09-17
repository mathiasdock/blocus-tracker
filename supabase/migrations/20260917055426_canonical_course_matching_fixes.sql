begin;
-- Canonical course matching, fixes found by supabase/tests/course_matching_security.sql
-- before any client uses these functions (course_offerings and course_links are empty).
--
-- 1. resolve_my_course_links: when an automatic link is withdrawn during the call (for
--    example after two students rejected that canonical course), the course now comes back
--    at once as a suggestion instead of disappearing until the next call.
-- 2. course_emerge_offerings: for a title identity, a tie between spellings no longer picks
--    one that carries a course code (the code belongs to the code identity).
-- Grants are unchanged: create or replace keeps the privileges set by the first migration.

-- A canonical course emerges when 2+ distinct students of the institution share the same
-- identity key or the same course code. Nobody is linked by this step.
-- A spelling variant (abbreviation, typo, word order, acronym) of an existing canonical
-- course, or of a better title shared by other students, does not get its own canonical
-- course: its students are asked about that variant instead (no duplicate for Progra /
-- Programmation). Two students rejecting the existing variant for that name lift this.
create or replace function public.course_emerge_offerings(p_institution text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  created integer;
begin
  with pop as materialized (
    select * from public.course_population(p_institution) pp
    where pp.identity_key is not null and not pp.non_course
  ),
  keyed as (
    select pop.user_id, pop.name, pop.content, pop.identity_key as cluster_key,
      case when cardinality(pop.content) = 0 then pop.code end as cluster_code
    from pop
    union all
    select pop.user_id, pop.name, pop.content, '#c' || pop.code, pop.code
    from pop
    where pop.code is not null and cardinality(pop.content) > 0
  ),
  shared as materialized (
    select k.cluster_key, max(k.cluster_code) as code, count(distinct k.user_id) as students
    from keyed k
    group by k.cluster_key
    having count(distinct k.user_id) >= 2
  ),
  spellings as (
    select k.cluster_key, public.course_clean_title(k.name) as title,
      count(distinct k.user_id) as users, max(cardinality(k.content)) as words
    from keyed k
    join shared s on s.cluster_key = k.cluster_key
    group by k.cluster_key, public.course_clean_title(k.name)
  ),
  -- Title = the most used spelling; on a tie the most complete one: title words (a code
  -- alone says less), no course code inside a title identity, no bare number such as a
  -- year, filler words kept (Droit des medias rather than Droit media), accents kept,
  -- capitalised, then the shortest.
  titled as (
    select distinct on (sp.cluster_key) sp.cluster_key, sp.title
    from spellings sp
    where sp.title <> ''
    order by sp.cluster_key, sp.users desc, sp.words desc,
      (sp.cluster_key not like '#c%' and (public.course_identity(sp.title)).code is not null),
      (sp.title ~ '(^|[[:space:]])[0-9]+([[:space:]]|$)'),
      cardinality(array_remove(array_remove(regexp_split_to_array(public.study_name_key(sp.title), ' '), 'cours'), 'course')) desc,
      (sp.title ~ '[À-ÿ]') desc,
      (left(sp.title, 1) <> lower(left(sp.title, 1))) desc,
      char_length(sp.title), sp.title
  ),
  pool as materialized (
    select o.identity_key as key, o.title, o.code, o.id as offering_id, null::bigint as students
    from public.course_offerings o
    where o.institution_id = p_institution
    union all
    select s.cluster_key, t.title, s.code, null::uuid, s.students
    from shared s
    join titled t on t.cluster_key = s.cluster_key
    where not exists (
      select 1 from public.course_offerings o
      where o.institution_id = p_institution and o.identity_key = s.cluster_key
    )
  ),
  shaped as materialized (
    select p.*, ci.content as words, ci.generic
    from pool p
    cross join lateral public.course_identity(p.title) ci
  )
  insert into public.course_offerings (institution_id, identity_key, code, title, generic)
  select p_institution, n.key, n.code, upper(left(n.title, 1)) || substr(n.title, 2), n.code is null and n.generic
  from shaped n
  where n.offering_id is null
    and (n.code is not null or not exists (
      select 1
      from shaped v
      where v.key <> n.key
        and v.code is null
        and public.course_pair_prefilter(n.words, null, v.words, null)
        and exists (
          select 1
          from public.course_title_match(n.title, v.title) m
          where m.confidence = 'medium'
            and m.rule in ('abbreviation', 'abbreviation_and_typo', 'acronym', 'typo', 'word_order')
            and case
              when v.offering_id is not null then (
                select count(distinct l.user_id) from public.course_links l
                where l.offering_id = v.offering_id and l.course_key = n.key and l.status = 'rejected'
              ) < 2
              when m.rule in ('abbreviation', 'abbreviation_and_typo', 'acronym') then
                char_length(v.title) > char_length(n.title)
              else
                v.students > n.students or (v.students = n.students and v.title < n.title)
            end
        )
    ))
  on conflict (institution_id, identity_key) do nothing;
  get diagnostics created = row_count;
  return created;
end
$$;

-- Refreshes the caller's matching state and returns it:
--   status 'auto' | 'confirmed'  current association of a personal course
--   status 'suggested'           plausible canonical course to ask about once (no decision yet)
-- Rejected pairs are never returned. Courses absent from the result are unresolved.
create or replace function public.resolve_my_course_links()
returns table (
  course_id uuid,
  offering_id uuid,
  offering_title text,
  status text,
  confidence text,
  rule text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  inst text;
  candidates jsonb;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  inst := public.course_institution_of(uid);
  if inst is null then
    -- No institution, no matching boundary: machine decisions are withdrawn.
    delete from public.course_links l where l.user_id = uid and l.status = 'auto';
    return;
  end if;

  perform public.course_emerge_offerings(inst);

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into candidates
  from public.course_candidates(uid, inst) c;

  -- An automatic link survives only while it is the single HIGH identity of its course.
  with cand as (
    select * from jsonb_to_recordset(candidates) as x(course_id uuid, offering_id uuid, confidence text, link_status text)
  ),
  single_high as (
    select cand.course_id, min(cand.offering_id::text)::uuid as offering_id
    from cand
    where cand.confidence = 'high' and cand.link_status is distinct from 'rejected'
    group by cand.course_id
    having count(*) = 1
  )
  delete from public.course_links l
  where l.user_id = uid
    and l.status = 'auto'
    and not exists (select 1 from single_high s where s.course_id = l.course_id and s.offering_id = l.offering_id);

  with cand as (
    select * from jsonb_to_recordset(candidates)
      as x(course_id uuid, offering_id uuid, course_key text, confidence text, rule text, link_status text)
  )
  update public.course_links l
  set rule = cand.rule, course_key = cand.course_key
  from cand
  where l.user_id = uid
    and l.status = 'auto'
    and l.course_id = cand.course_id
    and l.offering_id = cand.offering_id
    and (l.rule is distinct from cand.rule or l.course_key is distinct from cand.course_key);

  with cand as (
    select * from jsonb_to_recordset(candidates)
      as x(course_id uuid, offering_id uuid, course_key text, confidence text, rule text, link_status text)
  ),
  single_high as (
    select cand.course_id, min(cand.offering_id::text)::uuid as offering_id
    from cand
    where cand.confidence = 'high' and cand.link_status is distinct from 'rejected'
    group by cand.course_id
    having count(*) = 1
  )
  insert into public.course_links (course_id, offering_id, user_id, status, confidence, rule, course_key)
  select c.course_id, c.offering_id, uid, 'auto', c.confidence, c.rule, c.course_key
  from single_high s
  join cand c on c.course_id = s.course_id and c.offering_id = s.offering_id
  where c.link_status is null
    and not exists (
      select 1 from public.course_links a
      where a.course_id = c.course_id and a.status in ('auto', 'confirmed')
    )
  on conflict do nothing;

  return query
  select l.course_id, l.offering_id, o.title, l.status, l.confidence, l.rule
  from public.course_links l
  join public.course_offerings o on o.id = l.offering_id
  join public.courses pc on pc.id = l.course_id
  where l.user_id = uid
    and l.status in ('auto', 'confirmed')
    and pc.archived_at is null
  union all
  select x.course_id, x.offering_id, x.offering_title, 'suggested'::text, x.confidence, x.rule
  from jsonb_to_recordset(candidates)
    as x(course_id uuid, offering_id uuid, offering_title text, confidence text, rule text, link_status text)
  where x.confidence in ('high', 'medium')
    -- The candidates were read before the automatic links were refreshed: a link withdrawn
    -- above still carries its old status here and must come back as a question at once.
    and x.link_status is distinct from 'rejected'
    and not exists (
      select 1 from public.course_links a
      where a.course_id = x.course_id and a.status in ('auto', 'confirmed')
    );
end
$$;

commit;
