-- ============================================================================
-- Migration: reading_domain_schema
-- Slice:     F-01 (RafcioCzyta) — foundation reading-domain schema.
-- Purpose:   First domain migration. Establishes child profile, AI-generated
--            flashcard batches with acceptance status, per-flashcard SRS-agnostic
--            mastery state, and practice sessions with per-card outcomes. Adds
--            a SECURITY DEFINER helper is_my_child(child_id) used by RLS on
--            every domain table.
-- ----------------------------------------------------------------------------
-- Run order:
--   1. Extensions
--   2. Enums
--   3. Trigger helper: set_updated_at()
--   4. Tables (children, flashcard_generations, flashcards,
--              practice_sessions, practice_attempts)
--   5. Indexes
--   6. updated_at triggers
--   7. RLS helper: is_my_child(uuid) + grant/revoke
--   8. enable row level security on every domain table
--   9. Per-operation RLS policies (select / insert / update / delete) for the
--      `authenticated` role on every domain table
-- ----------------------------------------------------------------------------
-- Invariant the schema enforces: a row owned by one child can never reference
-- another child's rows. children -> generations -> flashcards -> attempts <-
-- sessions are all child-aligned through composite FKs on (id, child_id).
--
-- Invariant the schema does NOT enforce (per Round 3 decision, owned by the
-- app layer in S-03/S-04): "only accepted flashcards at child's level reach
-- practice". F-01 leaves this to higher layers.
-- ============================================================================


-- 1. Extensions --------------------------------------------------------------

create extension if not exists "pgcrypto";


-- 2. Enums -------------------------------------------------------------------

-- Ordered reading levels: letters < syllables < words < simple_sentences.
create type public.reading_level as enum (
  'letters',
  'syllables',
  'words',
  'simple_sentences'
);

create type public.flashcard_status as enum (
  'draft',
  'accepted',
  'rejected'
);

-- Binary outcome in MVP for SRS-agnostic simple mode; F-03's adapter normalizes
-- upstream library values (e.g. SM-2 quality 0..5) onto these two.
create type public.practice_attempt_outcome as enum (
  'correct',
  'incorrect'
);


-- 3. Trigger helper: set_updated_at() ----------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- 4. Tables ------------------------------------------------------------------

-- 4.1 children ---------------------------------------------------------------
-- One child row per parent (enforced by children_one_per_parent_idx below).
-- current_level NULL ≡ FR-002 "don't know" → app must start from 'letters'.
create table public.children (
  id              uuid primary key default gen_random_uuid(),
  parent_user_id  uuid not null references auth.users(id) on delete cascade,
  display_name    text not null,
  current_level   public.reading_level null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 4.2 flashcard_generations --------------------------------------------------
-- (id, child_id) unique enables descendant tables to FK-align by child.
create table public.flashcard_generations (
  id              uuid primary key default gen_random_uuid(),
  child_id        uuid not null references public.children(id) on delete cascade,
  requested_level public.reading_level not null,
  model           text null,
  prompt_version  text null,
  created_at      timestamptz not null default now(),
  constraint flashcard_generations_id_child_unique unique (id, child_id)
);

-- 4.3 flashcards -------------------------------------------------------------
-- (generation_id, child_id) -> flashcard_generations(id, child_id) prevents
-- a card from claiming another child's generation batch. ON DELETE SET NULL
-- (generation_id) is column-scoped (Postgres 15+) so removing a batch only
-- nulls the back-pointer instead of touching child_id (which is NOT NULL).
create table public.flashcards (
  id                uuid primary key default gen_random_uuid(),
  child_id          uuid not null references public.children(id) on delete cascade,
  generation_id     uuid null,
  level             public.reading_level not null,
  front_text        text not null,
  hint_text         text null,
  status            public.flashcard_status not null default 'draft',
  reps_count        integer not null default 0,
  last_reviewed_at  timestamptz null,
  mastery_score     smallint not null default 0
    check (mastery_score between 0 and 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint flashcards_id_child_unique unique (id, child_id),
  constraint flashcards_generation_alignment_fkey
    foreign key (generation_id, child_id)
    references public.flashcard_generations (id, child_id)
    on delete set null (generation_id)
);

-- 4.4 practice_sessions ------------------------------------------------------
create table public.practice_sessions (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.children(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz null,
  constraint practice_sessions_id_child_unique unique (id, child_id)
);

-- 4.5 practice_attempts ------------------------------------------------------
-- child_id is denormalized so the two composite FKs below can enforce that an
-- attempt's session and flashcard belong to the same child as the attempt.
create table public.practice_attempts (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references public.children(id) on delete cascade,
  session_id    uuid not null,
  flashcard_id  uuid not null,
  outcome       public.practice_attempt_outcome not null,
  answered_at   timestamptz not null default now(),
  constraint practice_attempts_session_alignment_fkey
    foreign key (session_id, child_id)
    references public.practice_sessions (id, child_id)
    on delete cascade,
  constraint practice_attempts_flashcard_alignment_fkey
    foreign key (flashcard_id, child_id)
    references public.flashcards (id, child_id)
    on delete cascade
);


-- 5. Indexes -----------------------------------------------------------------

-- MVP single-child rule. Lifting it later is `drop index children_one_per_parent_idx`.
create unique index children_one_per_parent_idx
  on public.children (parent_user_id);

create index flashcard_generations_child_id_idx
  on public.flashcard_generations (child_id);

create index flashcards_child_status_idx
  on public.flashcards (child_id, status);
create index flashcards_child_level_idx
  on public.flashcards (child_id, level);
create index flashcards_generation_id_idx
  on public.flashcards (generation_id);

create index practice_sessions_child_started_idx
  on public.practice_sessions (child_id, started_at desc);

create index practice_attempts_session_id_idx
  on public.practice_attempts (session_id);
create index practice_attempts_flashcard_id_idx
  on public.practice_attempts (flashcard_id);
create index practice_attempts_child_answered_idx
  on public.practice_attempts (child_id, answered_at desc);


-- 6. updated_at triggers -----------------------------------------------------

create trigger children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row execute function public.set_updated_at();


-- 7. RLS helper: is_my_child(uuid) -------------------------------------------
-- SECURITY DEFINER lets the function read `children` even when the caller's
-- own RLS chain would block direct selection. The body still filters by
-- auth.uid(), so the function can never reveal another parent's children.
create or replace function public.is_my_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.children
    where id = p_child_id
      and parent_user_id = auth.uid()
  );
$$;

revoke all on function public.is_my_child(uuid) from public;
grant execute on function public.is_my_child(uuid) to authenticated;


-- 8. Enable RLS on every domain table ----------------------------------------

alter table public.children              enable row level security;
alter table public.flashcard_generations enable row level security;
alter table public.flashcards            enable row level security;
alter table public.practice_sessions     enable row level security;
alter table public.practice_attempts     enable row level security;


-- 9. Policies (one per operation, scoped to `authenticated`) -----------------

-- 9.1 children: parent_user_id is checked directly, no helper.
create policy children_select on public.children
  for select to authenticated
  using (parent_user_id = (select auth.uid()));

create policy children_insert on public.children
  for insert to authenticated
  with check (parent_user_id = (select auth.uid()));

create policy children_update on public.children
  for update to authenticated
  using (parent_user_id = (select auth.uid()))
  with check (parent_user_id = (select auth.uid()));

create policy children_delete on public.children
  for delete to authenticated
  using (parent_user_id = (select auth.uid()));

-- 9.2 flashcard_generations
create policy flashcard_generations_select on public.flashcard_generations
  for select to authenticated
  using (public.is_my_child(child_id));

create policy flashcard_generations_insert on public.flashcard_generations
  for insert to authenticated
  with check (public.is_my_child(child_id));

create policy flashcard_generations_update on public.flashcard_generations
  for update to authenticated
  using (public.is_my_child(child_id))
  with check (public.is_my_child(child_id));

create policy flashcard_generations_delete on public.flashcard_generations
  for delete to authenticated
  using (public.is_my_child(child_id));

-- 9.3 flashcards
create policy flashcards_select on public.flashcards
  for select to authenticated
  using (public.is_my_child(child_id));

create policy flashcards_insert on public.flashcards
  for insert to authenticated
  with check (public.is_my_child(child_id));

create policy flashcards_update on public.flashcards
  for update to authenticated
  using (public.is_my_child(child_id))
  with check (public.is_my_child(child_id));

create policy flashcards_delete on public.flashcards
  for delete to authenticated
  using (public.is_my_child(child_id));

-- 9.4 practice_sessions
create policy practice_sessions_select on public.practice_sessions
  for select to authenticated
  using (public.is_my_child(child_id));

create policy practice_sessions_insert on public.practice_sessions
  for insert to authenticated
  with check (public.is_my_child(child_id));

create policy practice_sessions_update on public.practice_sessions
  for update to authenticated
  using (public.is_my_child(child_id))
  with check (public.is_my_child(child_id));

create policy practice_sessions_delete on public.practice_sessions
  for delete to authenticated
  using (public.is_my_child(child_id));

-- 9.5 practice_attempts
-- Composite FKs already enforce that session_id and flashcard_id belong to the
-- same child as child_id, so the per-operation policy on child_id is enough.
create policy practice_attempts_select on public.practice_attempts
  for select to authenticated
  using (public.is_my_child(child_id));

create policy practice_attempts_insert on public.practice_attempts
  for insert to authenticated
  with check (public.is_my_child(child_id));

create policy practice_attempts_update on public.practice_attempts
  for update to authenticated
  using (public.is_my_child(child_id))
  with check (public.is_my_child(child_id));

create policy practice_attempts_delete on public.practice_attempts
  for delete to authenticated
  using (public.is_my_child(child_id));
