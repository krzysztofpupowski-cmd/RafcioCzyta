-- F-03: SRS persistence on flashcards (ts-fsrs full Card state + due queue index)
-- srs_state holds serialized FSRS Card JSON; next_review_at mirrors srs_state.due for queries.
-- Nullable so draft/rejected rows need no scheduler data. RLS unchanged (existing flashcards policies).

alter table public.flashcards
  add column srs_state jsonb null;

comment on column public.flashcards.srs_state is
  'F-03: Full FSRS Card state (ts-fsrs). Set on accept/backfill; updated with applyReview in S-04.';

alter table public.flashcards
  add column next_review_at timestamptz null;

comment on column public.flashcards.next_review_at is
  'F-03: Denormalized due time from srs_state.due for due-queue queries. Keep in sync whenever srs_state is written.';

create index flashcards_child_status_next_review_idx
  on public.flashcards (child_id, status, next_review_at);
