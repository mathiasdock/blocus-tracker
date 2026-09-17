begin;
-- Canonical courses + matching foundation (Communities phase 1).
--
-- Three different objects, never merged:
--   personal course  public.courses          private, named freely, used by Timer/Planning/Stats (untouched here)
--   canonical course public.course_offerings  one real course inside ONE institution, with no personal data
--   course link      public.course_links      private owner decision: personal course -> canonical course
-- A link is not a room membership. Nothing here is visible in the product yet.
--
-- Institution = hard boundary: the study_spaces university that profiles.university resolves to,
-- exactly as sync_my_study_spaces/ensure_study_space resolve it (study_name_key of the name).
-- Program is never a boundary and is not used. Year is ambiguity evidence only.
-- No backfill: canonical courses emerge lazily when a student calls resolve_my_course_links().
-- Documentation: docs/canonical-courses.md. Tests: supabase/tests/course_matching_*.sql.

-- ---------------------------------------------------------------------------
-- Pure matcher (no table access). Deterministic, explainable, no AI.
-- ---------------------------------------------------------------------------

-- Edit distance between two words (Levenshtein). Only ever called on single words.
create or replace function public.course_token_distance(a text, b text)
returns integer
language plpgsql immutable strict
set search_path = public
as $$
declare
  la integer := char_length(a);
  lb integer := char_length(b);
  prev integer[];
  cur integer[];
  i integer;
  j integer;
  cost integer;
begin
  if a = b then return 0; end if;
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  if la > 60 or lb > 60 then return greatest(la, lb); end if;
  prev := array(select generate_series(0, lb));
  for i in 1..la loop
    cur := array[i];
    for j in 1..lb loop
      cost := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      cur := cur || least(prev[j + 1] + 1, cur[j] + 1, prev[j] + cost);
    end loop;
    prev := cur;
  end loop;
  return prev[lb + 1];
end
$$;

-- 2, 02, II -> '2'. Q2 / S1 are kept as written by the caller: a quadrimester is not a part.
create or replace function public.course_sequence_value(t text)
returns text
language sql immutable strict
set search_path = public
as $$
  select case t
    when 'i' then '1' when 'ii' then '2' when 'iii' then '3'
    when 'iv' then '4' when 'v' then '5' when 'vi' then '6'
    else nullif(ltrim(t, '0'), '')
  end
$$;

-- Spelling folding applied to every title word before comparison:
-- plurals (strategies, statistiques, internationaux, reseaux), feminine endings
-- (generale, appliquee, fonctionnelle) and systematic FR/EN or UK/US endings
-- (optimisation/optimization, statistique/statistic, economie/economy,
-- capitalisme/capitalism, probabilite/probability).
-- The fold only has to be identical on both sides; it never needs to be a real word.
create or replace function public.course_token_fold(t text)
returns text
language plpgsql immutable strict
set search_path = public
as $$
declare
  x text := t;
begin
  if char_length(x) >= 5 and x ~ 'ies$' then x := left(x, -3) || 'y';
  elsif x ~ 'eaux$' then x := left(x, -1);
  elsif char_length(x) >= 7 and x ~ '[^e]aux$' then x := left(x, -3) || 'al';
  elsif char_length(x) >= 4 and x ~ 's$' and x !~ '(ss|us|is)$' then x := left(x, -1);
  end if;

  if char_length(x) >= 5 and x ~ 'ee$' then x := left(x, -1);
  elsif char_length(x) >= 5 and x ~ 'ale$' then x := left(x, -1);
  elsif char_length(x) >= 6 and x ~ 'elle$' then x := left(x, -2);
  end if;

  if x ~ 'isation$' then x := left(x, -7) || 'ization';
  elsif char_length(x) >= 6 and x ~ 'ique$' then x := left(x, -4) || 'ic';
  elsif char_length(x) >= 6 and x ~ 'isme$' then x := left(x, -1);
  elsif char_length(x) >= 6 and x ~ 'ite$' then x := left(x, -1) || 'y';
  elsif char_length(x) >= 5 and x ~ 'ie$' then x := left(x, -2) || 'y';
  end if;
  return x;
end
$$;

-- Decomposes one course name into matching evidence. Normalisation reuses study_name_key.
--   identity_key: folded title words + sequence + level ('droit civil #s2 #lb1'),
--                 or '#c<code>' when the name is only a code. null = unmatchable.
--   content:      folded title words, in order, without filler words.
--   code:         ADV3008, LINFO1115, 'ADV 3008', 'INFO-F101'.
--   seq:          part marker (2, II, Partie 2 -> '2'; Q2, S1 kept; Semestre 1 -> 's1').
--   lvl:          study level written in the name (BAC 1, BA1, B1, Bloc 1 -> 'b1'; MA1, Master 1 -> 'm1').
--   generic:      at most one distinctive word (qualifiers such as introduction or
--                 generale do not count), or a language course.
--   non_course:   personal labels (test, perso), activities (memoire, stage, projet) or a
--                 qualifier alone (intro, theorie).
create or replace function public.course_identity(
  p_name text,
  out identity_key text,
  out content text[],
  out code text,
  out seq text,
  out lvl text,
  out generic boolean,
  out non_course boolean
)
language plpgsql immutable
set search_path = public
as $$
declare
  tokens text[];
  n integer;
  i integer := 1;
  t text;
  nx text;
  stop_words constant text[] := array[
    'de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'et', 'en', 'a', 'au', 'aux', 'un', 'une',
    'pour', 'sur', 'dans', 'par', 'avec', 'cours',
    'the', 'of', 'and', 'in', 'to', 'for', 'on', 'with', 'an', 'by', 'course',
    'van', 'het', 'voor', 'een', 'der', 'den'];
  part_words constant text[] := array[
    'partie', 'part', 'partim', 'module', 'chapitre', 'chapter', 'tome', 'volume', 'vol',
    'niveau', 'level', 'unit', 'unite'];
  qualifier_words constant text[] := array[
    'introduction', 'intro', 'initiation', 'fondement', 'fundamental', 'fondamental', 'principe', 'principle',
    'base', 'basic', 'notion', 'element', 'elementary', 'elementaire', 'general', 'avance', 'advanced',
    'approfondi', 'approfondy', 'applic', 'applied', 'theory', 'theoric', 'theoretical', 'pratic',
    'practical', 'practice', 'complement', 'special', 'specific', 'overview', 'apercu'];
  personal_words constant text[] := array[
    'perso', 'personnel', 'personal', 'test', 'todo', 'misc', 'diver', 'autre', 'other', 'permis'];
  activity_words constant text[] := array[
    'memoire', 'stage', 'tfe', 'tp', 'tps', 'td', 'tds', 'projet', 'project', 'seminaire', 'seminar',
    'labo', 'lab', 'atelier', 'revision', 'blocus', 'examen', 'exam', 'etude', 'study', 'travail',
    'traval', 'lecture', 'reading', 'job', 'sport'];
  language_words constant text[] := array[
    'anglais', 'english', 'eng', 'neerlandais', 'neerl', 'ndl', 'nl', 'nederland', 'dutch',
    'espagnol', 'spanish', 'allemand', 'german', 'deutsch', 'italien', 'italian', 'francais', 'french',
    'chinois', 'chinese', 'mandarin', 'japonais', 'japanese', 'arabe', 'arabic', 'portugais',
    'portuguese', 'russe', 'russian', 'langue', 'language'];
begin
  content := '{}';
  tokens := array_remove(regexp_split_to_array(coalesce(public.study_name_key(p_name), ''), ' '), '');
  n := coalesce(array_length(tokens, 1), 0);

  while i <= n loop
    t := tokens[i];
    nx := tokens[i + 1];

    -- Course codes.
    if t ~ '^[a-z]{2,6}[0-9]{3,5}[a-z]?$' then
      code := coalesce(code, t); i := i + 1; continue;
    end if;
    if t ~ '^[a-z]{2,6}$'
       and ((nx ~ '^[0-9]{3,5}$' and nx !~ '^(19|20)[0-9]{2}$') or nx ~ '^[a-z][0-9]{3,5}$') then
      code := coalesce(code, t || nx); i := i + 2; continue;
    end if;

    -- Study level written in the name.
    if t ~ '^(b|ba|bac|bloc|m|ma|master)[1-5]$' then
      lvl := coalesce(lvl, case when t ~ '^m' then 'm' else 'b' end || right(t, 1)); i := i + 1; continue;
    end if;
    if t in ('ba', 'bac', 'bloc', 'bachelor', 'ma', 'master') and nx ~ '^[1-5]$' then
      lvl := coalesce(lvl, case when t in ('ma', 'master') then 'm' else 'b' end || nx); i := i + 2; continue;
    end if;

    -- Sequence markers.
    if t in ('semestre', 'semester', 'quadri', 'quadrimestre', 'periode', 'period') and nx ~ '^[1-8]$' then
      seq := coalesce(seq, case when t like 'sem%' then 's' when t like 'quad%' then 'q' else 'p' end || nx);
      i := i + 2; continue;
    end if;
    if t = any(part_words) and (nx ~ '^[0-9]{1,2}$' or nx in ('i', 'ii', 'iii', 'iv', 'v', 'vi')) then
      seq := coalesce(seq, public.course_sequence_value(nx)); i := i + 2; continue;
    end if;
    if t ~ '^[qsp][1-8]$' then
      seq := coalesce(seq, t); i := i + 1; continue;
    end if;
    if t ~ '^0+$' then
      i := i + 1; continue;
    end if;
    if t ~ '^[0-9]{1,2}$' then
      seq := coalesce(seq, public.course_sequence_value(t)); i := i + 1; continue;
    end if;
    if t in ('ii', 'iii', 'iv', 'vi') or (t in ('i', 'v') and i = n and n > 1) then
      seq := coalesce(seq, public.course_sequence_value(t)); i := i + 1; continue;
    end if;

    -- Academic years and filler words carry no identity.
    if t ~ '^(19|20)[0-9]{2}$' or t = any(stop_words) then
      i := i + 1; continue;
    end if;

    content := content || public.course_token_fold(t);
    i := i + 1;
  end loop;

  if cardinality(content) = 0 then
    identity_key := case when code is not null then '#c' || code end;
  else
    identity_key := array_to_string(content, ' ')
      || coalesce(' #s' || seq, '')
      || coalesce(' #l' || lvl, '');
  end if;
  generic := (select count(distinct w) from unnest(content) w where w <> all (qualifier_words)) <= 1
    or content && language_words;
  -- 'Intro' or 'Theorie' alone names no course.
  non_course := cardinality(content) > 0
    and (content && personal_words or content <@ activity_words or content <@ qualifier_words);
end
$$;

-- Lexical comparison of two course names, without any population evidence.
-- confidence: high | medium | low. rule: the single reason, for explanations and tests.
-- a_generic / b_generic are returned so callers do not analyse the names twice.
create or replace function public.course_title_match(
  a text,
  b text,
  out confidence text,
  out rule text,
  out a_generic boolean,
  out b_generic boolean
)
language plpgsql immutable
set search_path = public
as $$
declare
  x record;
  y record;
  na integer;
  nb integer;
  i integer;
  short_words text[];
  long_words text[];
  tx text;
  ty text;
  ls integer;
  min_prefix integer;
  abbreviated boolean := false;
  mistyped boolean := false;
  initials text;
begin
  select * into x from public.course_identity(a);
  select * into y from public.course_identity(b);
  a_generic := x.generic;
  b_generic := y.generic;

  if x.identity_key is null or y.identity_key is null then
    confidence := 'low'; rule := 'unmatchable'; return;
  end if;
  if x.non_course or y.non_course then
    confidence := 'low'; rule := 'non_course_label'; return;
  end if;

  -- Two codes decide on their own.
  if x.code is not null and y.code is not null then
    if x.code <> y.code then
      confidence := 'low'; rule := 'code_conflict'; return;
    end if;
    if x.seq is distinct from y.seq then
      confidence := 'medium'; rule := 'code_match_sequence_differs'; return;
    end if;
    confidence := 'high'; rule := 'code_match'; return;
  end if;

  -- Compta / Compta 2, Math / Math Q2: never silently the same course.
  if x.seq is distinct from y.seq then
    confidence := 'low';
    rule := case when x.seq is not null and y.seq is not null then 'sequence_conflict' else 'sequence_one_sided' end;
    return;
  end if;
  if x.lvl is not null and y.lvl is not null and x.lvl <> y.lvl then
    confidence := 'low'; rule := 'level_conflict'; return;
  end if;

  na := cardinality(x.content);
  nb := cardinality(y.content);
  if na = 0 or nb = 0 then
    confidence := 'low'; rule := 'no_title_words'; return;
  end if;

  if x.content = y.content then
    confidence := 'high'; rule := 'same_title';
  elsif na = nb and na >= 2
    and (select array_agg(v order by v) from unnest(x.content) v)
      = (select array_agg(v order by v) from unnest(y.content) v) then
    confidence := 'medium'; rule := 'word_order';
  elsif na = nb then
    -- Word by word: each differing pair must be a safe abbreviation or a single typo.
    min_prefix := case when na = 1 then 4 else 3 end;
    for i in 1..na loop
      tx := x.content[i];
      ty := y.content[i];
      continue when tx = ty;
      ls := least(char_length(tx), char_length(ty));
      if ls >= min_prefix
         and greatest(char_length(tx), char_length(ty)) - ls >= 2
         and (left(ty, char_length(tx)) = tx or left(tx, char_length(ty)) = ty) then
        abbreviated := true;
      elsif ls >= 7 and left(tx, 3) = left(ty, 3) and public.course_token_distance(tx, ty) <= 1 then
        -- The start of a word carries its meaning: microeconomie is not a typo of macroeconomie.
        mistyped := true;
      else
        confidence := 'low'; rule := 'different_words'; return;
      end if;
    end loop;
    confidence := 'medium';
    rule := case
      when abbreviated and mistyped then 'abbreviation_and_typo'
      when abbreviated then 'abbreviation'
      else 'typo'
    end;
  else
    if na < nb then
      short_words := x.content; long_words := y.content;
    else
      short_words := y.content; long_words := x.content;
    end if;
    if cardinality(short_words) = 1
       and char_length(short_words[1]) between 3 and 6
       and cardinality(long_words) = char_length(short_words[1]) then
      select string_agg(left(w, 1), '' order by o) into initials
      from unnest(long_words) with ordinality as u(w, o);
      if initials = short_words[1] then
        confidence := 'medium'; rule := 'acronym'; return;
      end if;
    end if;
    -- Math / Math financiere: a longer title is a different, more specific course.
    confidence := 'low';
    rule := case
      when long_words[1:cardinality(short_words)] = short_words then 'extra_words'
      else 'different_words'
    end;
    return;
  end if;

  if confidence = 'high' and x.lvl is distinct from y.lvl then
    confidence := 'medium'; rule := 'level_one_sided';
  end if;
  if confidence = 'high' and (x.generic or y.generic) then
    confidence := 'medium'; rule := 'generic_name';
  end if;
end
$$;

-- Cheap necessary condition for course_title_match to return MEDIUM or HIGH, on folded
-- words (course_identity.content): same code; same word count with a first word sharing
-- its first three letters, or the same words in another order; or a possible acronym.
-- Used to avoid evaluating every pair of an institution.
create or replace function public.course_pair_prefilter(a_words text[], a_code text, b_words text[], b_code text)
returns boolean
language sql immutable
set search_path = public
as $$
  select (a_code is not null and a_code = b_code)
    or (cardinality(a_words) > 0 and cardinality(a_words) = cardinality(b_words)
        and (left(a_words[1], 3) = left(b_words[1], 3)
             or (select array_agg(v order by v) from unnest(a_words) v)
              = (select array_agg(v order by v) from unnest(b_words) v)))
    or (cardinality(a_words) = 1 and char_length(a_words[1]) between 3 and 6
        and cardinality(b_words) = char_length(a_words[1]) and left(a_words[1], 1) = left(b_words[1], 1))
    or (cardinality(b_words) = 1 and char_length(b_words[1]) between 3 and 6
        and cardinality(a_words) = char_length(b_words[1]) and left(b_words[1], 1) = left(a_words[1], 1))
$$;

-- Final confidence for one personal course against one canonical course, given
-- institution-level evidence computed by the caller:
--   p_known_years:  distinct declared study years among students carrying the canonical course
--                   or the same personal course name (course identity) at the institution.
--   p_longer_title: a longer title carried by 2+ students contains this title (Supply chain / Supply chain management).
--   p_confirmers / p_rejecters: OTHER students who confirmed / rejected this canonical course
--                   for a personal course with the same identity key (aliases, same institution only).
create or replace function public.course_link_confidence(
  p_course_name text,
  p_offering_title text,
  p_known_years integer,
  p_longer_title boolean,
  p_confirmers integer,
  p_rejecters integer,
  out confidence text,
  out rule text
)
language plpgsql immutable
set search_path = public
as $$
declare
  m record;
  years integer := coalesce(p_known_years, 0);
  confirmers integer := coalesce(p_confirmers, 0);
  rejecters integer := coalesce(p_rejecters, 0);
begin
  select * into m from public.course_title_match(p_course_name, p_offering_title);
  confidence := m.confidence;
  rule := m.rule;

  -- Codes and hard conflicts are decided lexically.
  if rule in ('unmatchable', 'non_course_label', 'code_conflict', 'code_match', 'code_match_sequence_differs') then
    return;
  end if;

  -- Institution-scoped memory of other students' answers for this same personal name.
  if rejecters >= 3 and rejecters >= 2 * confirmers then
    confidence := 'low'; rule := 'rejected_by_students'; return;
  end if;
  if confidence = 'low' then
    return;
  end if;
  if confidence = 'medium' and confirmers >= 3 and confirmers >= 2 * rejecters then
    confidence := 'high'; rule := 'trusted_alias';
  end if;

  -- A generic name already used across study years is ambiguous: nobody is linked or asked.
  if m.b_generic and years >= 2 then
    confidence := 'low'; rule := 'generic_years_differ'; return;
  end if;

  if confidence = 'high' then
    if rejecters >= 2 then
      confidence := 'medium'; rule := 'contested';
    elsif m.a_generic or m.b_generic then
      confidence := 'medium'; rule := 'generic_name';
    elsif years >= 2 then
      confidence := 'medium'; rule := 'years_differ';
    elsif p_longer_title then
      confidence := 'medium'; rule := 'shorter_than_known_title';
    end if;
  end if;
end
$$;

-- Display title of a canonical course, derived from students' spellings: letters,
-- digits and ordinary punctuation only (no emoji), whitespace collapsed.
create or replace function public.course_clean_title(p_name text)
returns text
language sql immutable strict
set search_path = public
as $$
  select left(trim(regexp_replace(
    regexp_replace(p_name, '[^[:alpha:][:digit:][:space:]''’&:,./()+#-]', '', 'g'),
    '[[:space:]]+', ' ', 'g')), 120)
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One real course inside one institution. No owner, no member list, no counts.
create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references public.study_spaces(id) on delete cascade,
  identity_key text not null,
  code text,
  title text not null check (char_length(title) between 1 and 120),
  generic boolean not null default false,
  created_at timestamptz not null default now(),
  constraint course_offerings_identity_unique unique (institution_id, identity_key),
  constraint course_offerings_code_identity check (code is null or identity_key = '#c' || code)
);

-- Private decision about one personal course and one canonical course.
--   auto:      single HIGH identity, maintained by the resolver (withdrawn when no longer true)
--   confirmed: the student said yes (kept until they reject it)
--   rejected:  the student said no (never suggested or auto-linked again for this pair)
-- No row = unresolved.
create table public.course_links (
  course_id uuid not null references public.courses(id) on delete cascade,
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('auto', 'confirmed', 'rejected')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  rule text not null,
  course_key text not null,
  decided_at timestamptz not null default now(),
  primary key (course_id, offering_id)
);
create unique index course_links_one_association_idx on public.course_links (course_id) where status in ('auto', 'confirmed');
create index course_links_user_idx on public.course_links (user_id);
create index course_links_offering_key_idx on public.course_links (offering_id, course_key);

comment on table public.course_offerings is 'Canonical course: one real course inside one institution. Emerges from 2+ students; contains no personal data. See docs/canonical-courses.md.';
comment on table public.course_links is 'Private owner decision personal course -> canonical course (auto, confirmed, rejected). Not a room membership.';

alter table public.course_offerings enable row level security;
alter table public.course_links enable row level security;
revoke all on public.course_offerings from anon, authenticated;
revoke all on public.course_links from anon, authenticated;
grant select on public.course_offerings to authenticated;
grant select on public.course_links to authenticated;

-- Owners read their own decisions. All writes go through the functions below.
create policy course_links_read_own on public.course_links
  for select to authenticated
  using (user_id = (select auth.uid()));

-- A canonical course is readable once the student has a decision about it.
create policy course_offerings_read_linked on public.course_offerings
  for select to authenticated
  using (exists (
    select 1 from public.course_links l
    where l.offering_id = course_offerings.id and l.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Internal data functions (not callable by clients)
-- ---------------------------------------------------------------------------

-- Institution of a student, read-only. Same resolution as sync_my_study_spaces.
create or replace function public.course_institution_of(p_user uuid)
returns text
language sql stable
set search_path = public
as $$
  select s.id
  from public.profiles p
  join public.study_spaces s
    on s.kind = 'university'
   and public.study_name_key(s.name) = public.study_name_key(p.university)
  where p.id = p_user
    and char_length(trim(coalesce(p.university, ''))) >= 2
  limit 1
$$;

-- Active personal courses of every student at one institution, with matching evidence.
create or replace function public.course_population(p_institution text)
returns table (
  course_id uuid,
  user_id uuid,
  name text,
  identity_key text,
  code text,
  content text[],
  generic boolean,
  non_course boolean,
  study_year text
)
language sql stable
set search_path = public
as $$
  select c.id, c.user_id, c.name, ci.identity_key, ci.code, ci.content, ci.generic, ci.non_course,
    case when y.k in ('autre', 'other') then null else y.k end
  from public.study_spaces s
  join public.profiles p
    on public.study_name_key(p.university) = public.study_name_key(s.name)
  join public.courses c
    on c.user_id = p.id and c.archived_at is null
  cross join lateral public.course_identity(c.name) ci
  cross join lateral (select nullif(public.study_name_key(coalesce(p.study_year, '')), '') as k) y
  where s.id = p_institution
    and s.kind = 'university'
$$;

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
  -- alone says less), no bare number such as a year, filler words kept (Droit des medias
  -- rather than Droit media), accents kept, capitalised, then the shortest.
  titled as (
    select distinct on (sp.cluster_key) sp.cluster_key, sp.title
    from spellings sp
    where sp.title <> ''
    order by sp.cluster_key, sp.users desc, sp.words desc,
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

-- Every plausible pair (personal course of p_user, canonical course of the institution)
-- with its confidence and the existing decision, if any.
create or replace function public.course_candidates(p_user uuid, p_institution text)
returns table (
  course_id uuid,
  offering_id uuid,
  offering_title text,
  course_key text,
  confidence text,
  rule text,
  link_status text
)
language sql stable
set search_path = public
as $$
  with pop as materialized (
    select * from public.course_population(p_institution)
  ),
  mine as materialized (
    select pop.course_id, pop.name, pop.identity_key, pop.code, pop.content
    from pop
    where pop.user_id = p_user and pop.identity_key is not null and not pop.non_course
  ),
  offers as materialized (
    select o.id, o.title, o.identity_key, o.code, oi.content as words
    from public.course_offerings o
    cross join lateral public.course_identity(o.title) oi
    where o.institution_id = p_institution
  ),
  -- Declared years of students carrying each canonical course (same identity, same code, or linked)...
  offering_years as (
    select o.id as offering_id, pop.study_year
    from offers o
    join pop on not pop.non_course
      and ((o.code is not null and pop.code = o.code) or (o.code is null and pop.identity_key = o.identity_key))
    where pop.study_year is not null
    union
    select l.offering_id, pop.study_year
    from public.course_links l
    join pop on pop.course_id = l.course_id
    where l.status in ('auto', 'confirmed') and pop.study_year is not null
  ),
  -- ...and of students using the same personal course name.
  identity_years as (
    select distinct pop.identity_key, pop.study_year
    from pop
    where pop.identity_key is not null and not pop.non_course and pop.study_year is not null
  ),
  shared_titles as (
    select array_to_string(pop.content, ' ') as words, cardinality(pop.content) as n
    from pop
    where not pop.non_course and cardinality(pop.content) > 0
    group by pop.content
    having count(distinct pop.user_id) >= 2
  ),
  decisions as (
    select l.offering_id, l.course_key,
      (count(distinct l.user_id) filter (where l.status = 'confirmed'))::integer as confirmers,
      (count(distinct l.user_id) filter (where l.status = 'rejected'))::integer as rejecters
    from public.course_links l
    join offers o on o.id = l.offering_id
    where l.user_id <> p_user
    group by l.offering_id, l.course_key
  ),
  -- Only pairs able to reach MEDIUM or HIGH are evaluated.
  pairs as materialized (
    select m.course_id, m.name, m.identity_key, o.id as offering_id, o.title, o.words
    from mine m
    join offers o on public.course_pair_prefilter(m.content, m.code, o.words, o.code)
  )
  select p.course_id, p.offering_id, p.title, p.identity_key, e.confidence, e.rule, l.status
  from pairs p
  left join decisions d on d.offering_id = p.offering_id and d.course_key = p.identity_key
  left join public.course_links l on l.course_id = p.course_id and l.offering_id = p.offering_id
  cross join lateral public.course_link_confidence(
    p.name,
    p.title,
    (
      select count(*)::integer from (
        select oy.study_year from offering_years oy where oy.offering_id = p.offering_id
        union
        select iy.study_year from identity_years iy where iy.identity_key = p.identity_key
      ) years
    ),
    exists (
      select 1 from shared_titles s
      where cardinality(p.words) > 0 and s.n > cardinality(p.words)
        and ' ' || s.words || ' ' like '% ' || array_to_string(p.words, ' ') || ' %'
    ),
    coalesce(d.confirmers, 0),
    coalesce(d.rejecters, 0)
  ) e
$$;

-- ---------------------------------------------------------------------------
-- Client functions (owner only). Other students' courses never leave the server.
-- ---------------------------------------------------------------------------

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
    and x.link_status is null
    and not exists (
      select 1 from public.course_links a
      where a.course_id = x.course_id and a.status in ('auto', 'confirmed')
    );
end
$$;

-- The student says yes. Only a MEDIUM/HIGH candidate of their own active course at their
-- own institution can be confirmed. Replaces any other association of that course.
create or replace function public.confirm_course_link(p_course_id uuid, p_offering_id uuid)
returns public.course_links
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  cand record;
  result public.course_links;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if not exists (select 1 from public.courses c where c.id = p_course_id and c.user_id = uid) then
    raise exception 'Course not found';
  end if;

  select * into cand
  from public.course_candidates(uid, public.course_institution_of(uid)) x
  where x.course_id = p_course_id and x.offering_id = p_offering_id;
  if cand.offering_id is null then
    raise exception 'Course identity not available';
  end if;
  if cand.confidence not in ('high', 'medium') then
    raise exception 'This course cannot be associated with this identity';
  end if;

  delete from public.course_links l
  where l.course_id = p_course_id
    and l.offering_id <> p_offering_id
    and l.status in ('auto', 'confirmed');

  insert into public.course_links as l (course_id, offering_id, user_id, status, confidence, rule, course_key, decided_at)
  values (p_course_id, p_offering_id, uid, 'confirmed', cand.confidence, cand.rule, cand.course_key, now())
  on conflict (course_id, offering_id) do update
    set status = 'confirmed',
        confidence = excluded.confidence,
        rule = excluded.rule,
        course_key = excluded.course_key,
        decided_at = now()
  returning * into result;
  return result;
end
$$;

-- The student says no. Remembered for this pair: never suggested or auto-linked again.
-- Works for a current candidate or for any existing decision of their own course.
create or replace function public.reject_course_link(p_course_id uuid, p_offering_id uuid)
returns public.course_links
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  cand record;
  existing public.course_links;
  result public.course_links;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if not exists (select 1 from public.courses c where c.id = p_course_id and c.user_id = uid) then
    raise exception 'Course not found';
  end if;

  select * into existing from public.course_links l
  where l.course_id = p_course_id and l.offering_id = p_offering_id;
  select * into cand
  from public.course_candidates(uid, public.course_institution_of(uid)) x
  where x.course_id = p_course_id and x.offering_id = p_offering_id;

  if existing.course_id is null and (cand.offering_id is null or cand.confidence not in ('high', 'medium')) then
    raise exception 'Course identity not available';
  end if;

  insert into public.course_links as l (course_id, offering_id, user_id, status, confidence, rule, course_key, decided_at)
  values (
    p_course_id, p_offering_id, uid, 'rejected',
    coalesce(cand.confidence, existing.confidence),
    coalesce(cand.rule, existing.rule),
    coalesce(cand.course_key, existing.course_key),
    now()
  )
  on conflict (course_id, offering_id) do update
    set status = 'rejected',
        confidence = excluded.confidence,
        rule = excluded.rule,
        course_key = excluded.course_key,
        decided_at = now()
  returning * into result;
  return result;
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges: only the three client functions are callable by students.
-- ---------------------------------------------------------------------------

revoke all on function public.course_token_distance(text, text) from public, anon, authenticated;
revoke all on function public.course_sequence_value(text) from public, anon, authenticated;
revoke all on function public.course_token_fold(text) from public, anon, authenticated;
revoke all on function public.course_identity(text) from public, anon, authenticated;
revoke all on function public.course_title_match(text, text) from public, anon, authenticated;
revoke all on function public.course_link_confidence(text, text, integer, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.course_clean_title(text) from public, anon, authenticated;
revoke all on function public.course_institution_of(uuid) from public, anon, authenticated;
revoke all on function public.course_population(text) from public, anon, authenticated;
revoke all on function public.course_pair_prefilter(text[], text, text[], text) from public, anon, authenticated;
revoke all on function public.course_emerge_offerings(text) from public, anon, authenticated;
revoke all on function public.course_candidates(uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_my_course_links() from public, anon;
revoke all on function public.confirm_course_link(uuid, uuid) from public, anon;
revoke all on function public.reject_course_link(uuid, uuid) from public, anon;
grant execute on function public.resolve_my_course_links() to authenticated;
grant execute on function public.confirm_course_link(uuid, uuid) to authenticated;
grant execute on function public.reject_course_link(uuid, uuid) to authenticated;

commit;
