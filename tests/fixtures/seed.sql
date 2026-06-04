-- Hosted Supabase TEST project only — never run against production.
-- Prerequisites: Parent A/B auth users exist (see tests/fixtures/README.md).
-- Emails must match TEST_PARENT_*_EMAIL in .env.test (defaults below).
-- UUIDs are RFC 4122 v4-shaped so API zod z.uuid() accepts them in tests.

-- Fixed UUIDs — copy into .env.test after apply:
--   TEST_PARENT_A_GENERATION_ID  = bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1
--   TEST_PARENT_B_CHILD_ID       = 11111111-1111-4111-8111-111111111101
--   TEST_PARENT_B_GENERATION_ID  = 22222222-2222-4222-8222-222222222201
--   TEST_PARENT_B_SESSION_ID     = 33333333-3333-4333-8333-333333333301

do $$
declare
  parent_a_id uuid;
  parent_b_id uuid;
  child_a_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  child_b_id uuid := '11111111-1111-4111-8111-111111111101';
  gen_a_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  gen_b_id uuid := '22222222-2222-4222-8222-222222222201';
  session_b_id uuid := '33333333-3333-4333-8333-333333333301';
  card_a1_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbc1';
  card_a2_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbc2';
  card_b_id uuid := '44444444-4444-4444-8444-444444444401';
begin
  select id into parent_a_id from auth.users where email = 'test@test.pl';
  select id into parent_b_id from auth.users where email = 'test2@test.pl';

  if parent_a_id is null or parent_b_id is null then
    raise exception 'Missing test auth users. Create test@test.pl and test2@test.pl first (see tests/fixtures/README.md).';
  end if;

  delete from public.children
  where parent_user_id in (parent_a_id, parent_b_id);

  insert into public.children (id, parent_user_id, display_name, current_level)
  values
    (child_a_id, parent_a_id, 'Test Child A', 'letters'),
    (child_b_id, parent_b_id, 'Test Child B', 'letters');

  insert into public.flashcard_generations (id, child_id, requested_level)
  values
    (gen_a_id, child_a_id, 'letters'),
    (gen_b_id, child_b_id, 'letters');

  insert into public.flashcards (
    id,
    child_id,
    generation_id,
    level,
    front_text,
    status
  )
  values
    (card_a1_id, child_a_id, gen_a_id, 'letters', 'seed-a-draft-1', 'draft'),
    (card_a2_id, child_a_id, gen_a_id, 'letters', 'seed-a-draft-2', 'draft'),
    (card_b_id,  child_b_id, gen_b_id, 'letters', 'seed-b-draft',   'draft');

  insert into public.practice_sessions (id, child_id, started_at, ended_at)
  values (session_b_id, child_b_id, now(), null);
end $$;
