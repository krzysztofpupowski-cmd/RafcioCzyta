# ts-fsrs — API reference for F-03 srs-adapter

> Fetched 2026-06-02 via Context7 MCP (`/open-spaced-repetition/ts-fsrs`, benchmark 90.9) + [official API docs](https://open-spaced-repetition.github.io/ts-fsrs/).  
> Roadmap: F-03 `srs-adapter` · Unlocks: S-04, S-05 · Prerequisites: F-01

## F-03 requirements

F-03 must:

1. Sync **accepted flashcards** into a ready-made SRS algorithm.
2. Read review state for **S-04** (practice session) and **S-05** (mastery indicator).
3. Normalize library state onto existing F-01 columns: `reps_count`, `last_reviewed_at`, `mastery_score` (0–100).

PRD Non-Goals exclude building a custom SRS. Stack fit: pure TypeScript, zero deps, runs on Cloudflare Workers (workerd). See also [`library-research.md`](./library-research.md) for the shortlist comparison.

---

## Install & core imports

```bash
npm install ts-fsrs
```

```typescript
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRSParameters,
  type ReviewLog,
} from 'ts-fsrs'
```

Initialize the scheduler (defaults: `request_retention: 0.9`, etc.):

```typescript
const scheduler = fsrs()
```

With custom or persisted parameters:

```typescript
const params = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36500,
})

const scheduler = fsrs(params)
```

Parameters are JSON-serializable — load from Supabase if per-child tuning is ever needed:

```typescript
const serializedParams = '{"request_retention":0.9,"maximum_interval":36500}'
const params = JSON.parse(serializedParams) as FSRSParameters
const scheduler = fsrs(params)
```

Validate external params with Zod at API boundaries (recommended in ts-fsrs docs).

---

## Core types

### `Card` — scheduler state (what the adapter persists)

| Field | Type | F-03 use |
| ----- | ---- | -------- |
| `state` | `State` | New / Learning / Review / Relearning |
| `due` | `Date` | Due queue — cards where `due <= now` |
| `stability` | `number` | Memory strength; drives intervals |
| `difficulty` | `number` | Item difficulty |
| `reps` | `number` | Map to `reps_count` |
| `lapses` | `number` | Failed review count |
| `last_review` | `Date?` | Map to `last_reviewed_at` |
| `elapsed_days` | `number` | Days since last review |
| `scheduled_days` | `number` | Interval until next review |
| `learning_steps` | `number` | Learning-phase step index |

Full interface (from API docs):

```typescript
interface Card {
  difficulty: number
  due: Date
  elapsed_days: number
  lapses: number
  last_review?: Date
  learning_steps: number
  reps: number
  scheduled_days: number
  stability: number
  state: State
}
```

`CardInput` is the same shape but accepts `DateInput` (`Date | number | string`) for deserialization from DB.

### `State` enum

| Value | Numeric | Meaning |
| ----- | ------- | ------- |
| `State.New` | 0 | Never reviewed |
| `State.Learning` | 1 | Short-interval learning phase |
| `State.Review` | 2 | Graduated — normal SRS |
| `State.Relearning` | 3 | Failed review, re-learning |

### `Rating` enum — user input during review

```typescript
Rating.Again   // failed / forgot
Rating.Hard
Rating.Good
Rating.Easy
```

**Binary mapping for `practice_attempts`** (MVP):

| FSRS rating | `practice_attempt_outcome` |
| ----------- | -------------------------- |
| `Again`, `Hard` | `incorrect` |
| `Good`, `Easy` | `correct` |

Stricter variant (optional): only `Good` / `Easy` → `correct`.

### `ReviewLog` — one review event

```typescript
interface ReviewLog {
  difficulty: number
  due: Date
  elapsed_days: number
  last_elapsed_days: number  // deprecated in v6
  learning_steps: number
  rating: Rating
  review: Date
  scheduled_days: number
  stability: number
  state: State
}
```

Store in `practice_attempts` metadata or a separate review-log table if undo/analytics are needed later.

---

## Key API methods

### `createEmptyCard(now?, afterHandler?)` — initialize on accept

Call when a flashcard transitions to `accepted` (S-03 hook):

```typescript
const card = createEmptyCard(new Date())
// card.state === State.New, card.due === now
```

With DB-friendly transform via `afterHandler`:

```typescript
interface StoredSrsState {
  difficulty: number
  due: number // timestamp ms
  stability: number
  state: number
  reps: number
  lapses: number
  learning_steps: number
  scheduled_days: number
  elapsed_days: number
  last_review: number | null
}

function toStored(card: Card): StoredSrsState {
  return {
    difficulty: card.difficulty,
    due: card.due.getTime(),
    stability: card.stability,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    scheduled_days: card.scheduled_days,
    elapsed_days: card.elapsed_days,
    last_review: card.last_review?.getTime() ?? null,
  }
}

const card = createEmptyCard(new Date(), toStored)
```

Deserialize before calling scheduler methods:

```typescript
function fromStored(stored: StoredSrsState): Card {
  return {
    ...stored,
    due: new Date(stored.due),
    last_review: stored.last_review != null ? new Date(stored.last_review) : undefined,
    state: stored.state as State,
  }
}
```

### `repeat(card, now)` — preview all four outcomes (S-04 UI)

Use **before** the user answers — e.g. show next interval per rating button:

```typescript
const preview = scheduler.repeat(card, new Date())

preview[Rating.Again].card   // hypothetical next state if Again
preview[Rating.Hard].card
preview[Rating.Good].card
preview[Rating.Easy].card
```

Each entry is a `RecordLogItem` with `{ card, log }`.

### `next(card, now, rating, afterHandler?)` — apply review (S-04)

Use **after** the user has chosen a rating:

```typescript
const result = scheduler.next(card, new Date(), Rating.Good)
// result.card  — updated Card
// result.log   — ReviewLog for this review
```

With persistence hook (convert `Date` → timestamps for JSON/Supabase):

```typescript
const saved = scheduler.next(card, new Date(), Rating.Good, ({ card, log }) => ({
  card: {
    ...card,
    due: card.due.getTime(),
    last_review: card.last_review?.getTime() ?? null,
  },
  log: {
    ...log,
    due: log.due.getTime(),
    review: log.review.getTime(),
  },
}))
```

**`repeat` vs `next`:** `repeat` previews all four paths; `next` commits one rating. Do not call both for the same review.

### Due queue — application responsibility

ts-fsrs does **not** ship a queue API. Filter accepted cards in Supabase or in app code:

```sql
-- Requires next_review_at column or srs_state->>'due' indexed appropriately
SELECT *
FROM flashcards
WHERE status = 'accepted'
  AND child_id = $1
  AND next_review_at <= now()
ORDER BY next_review_at ASC
LIMIT $sessionSize;
```

In TypeScript:

```typescript
function isDue(card: Card, now = new Date()): boolean {
  return card.due.getTime() <= now.getTime()
}
```

### `get_retrievability(card, now?, format?)` — mastery (S-05)

Returns current recall probability (0..1) or formatted string:

```typescript
const retention: number = scheduler.get_retrievability(card, new Date(), false)
const pct: string = scheduler.get_retrievability(card, new Date(), true) // e.g. "85%"
```

Map to F-01 `mastery_score` (0–100):

```typescript
const mastery_score = Math.round(
  scheduler.get_retrievability(card, new Date(), false) * 100
)
```

Aggregate across accepted cards for the dashboard indicator (S-05).

### Other `IFSRS` methods (non-MVP but useful)

| Method | Purpose |
| ------ | ------- |
| `forget(card, now, reset_count?)` | Reset card (e.g. remove from active practice) |
| `rollback(card, log)` | Undo last review |
| `reschedule(card, reviews[], options?)` | Rebuild state from review history |
| `next_state(memoryState, elapsedDays, rating)` | Low-level; simulations / analytics only |
| `next_interval(stability, elapsedDays)` | Low-level interval calculation |
| `useStrategy(mode, handler)` | Custom scheduling strategies |
| `clearStrategy(mode?)` | Remove custom strategy |

Prefer `repeat()` / `next()` for standard review flows.

---

## Suggested adapter service shape

Target: `src/lib/services/srs-adapter.ts` (or similar). Routes under `src/pages/api/` with `prerender = false`.

```typescript
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs'

const scheduler = fsrs()

export function initSrsState(now = new Date()): Card {
  return createEmptyCard(now)
}

export function previewReview(card: Card, now = new Date()) {
  return scheduler.repeat(card, now)
}

export function applyReview(card: Card, rating: Rating, now = new Date()) {
  const { card: nextCard, log } = scheduler.next(card, now, rating)

  return {
    srsCard: nextCard,
    reviewLog: log,
    reps_count: nextCard.reps,
    last_reviewed_at: nextCard.last_review ?? now,
    mastery_score: Math.round(scheduler.get_retrievability(nextCard, now, false) * 100),
    practice_outcome: rating <= Rating.Hard ? ('incorrect' as const) : ('correct' as const),
  }
}

export function isDue(card: Card, now = new Date()): boolean {
  return card.due.getTime() <= now.getTime()
}
```

### Adapter lifecycle

1. **On accept (S-03 hook):** `createEmptyCard()` → persist full FSRS state; set `reps_count = 0`, `mastery_score = 0`.
2. **On review (S-04):** load state → `scheduler.next(card, now, rating)` → persist updated state + denormalized columns; insert `practice_attempts` with binary outcome.
3. **Session start (S-04):** query due accepted cards for child; optionally cap session size for NFR `<10 min`.
4. **Mastery (S-05):** aggregate `get_retrievability()` or threshold on `mastery_score` across accepted cards.

---

## Persistence — schema gap vs F-01

F-01 columns alone are **insufficient** for FSRS:

| Column | FSRS source |
| ------ | ----------- |
| `reps_count` | `card.reps` |
| `last_reviewed_at` | `card.last_review` |
| `mastery_score` | derived from `get_retrievability()` |

Full scheduler state (`stability`, `difficulty`, `state`, `due`, `lapses`, `learning_steps`, …) must also be stored. Options for `/10x-plan`:

| Option | Pros | Cons |
| ------ | ---- | ---- |
| `srs_state jsonb` on `flashcards` | One migration, full fidelity | Due query needs expression index or app-side filter |
| Dedicated columns per FSRS field | SQL-friendly due queue | Wider migration |
| `next_review_at timestamptz` + `srs_state jsonb` | Fast due query + full state | Two fields to keep in sync on every review |

F-01 plan already noted F-03 may add columns or `srs_state jsonb` when Q-SRS resolves — **ts-fsrs confirms this is required**.

---

## Basic usage (from upstream README)

```typescript
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs'

const scheduler = fsrs()
const card = createEmptyCard()

// Preview all four possible outcomes before the user answers.
const preview = scheduler.repeat(card, new Date())

// Apply the final rating after the user has already answered.
const result = scheduler.next(card, new Date(), Rating.Good)

console.log(preview[Rating.Good].card)
console.log(result.card)
console.log(result.log)
```

---

## References

- Context7 library ID: `/open-spaced-repetition/ts-fsrs`
- npm: [ts-fsrs](https://www.npmjs.com/package/ts-fsrs)
- API docs: [open-spaced-repetition.github.io/ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs/)
- GitHub: [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- Related research: [`library-research.md`](./library-research.md)
- Domain schema: `supabase/migrations/20260526143400_reading_domain_schema.sql`
