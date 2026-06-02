import React, { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { Rating } from "ts-fsrs";

import { ServerError } from "@/components/auth/ServerError";
import { resolveDisplayLevel } from "@/lib/reading-level-form";
import { cn } from "@/lib/utils";
import type {
  EndPracticeResponse,
  PracticeCardDTO,
  ReviewPracticeResponse,
  StartPracticeResponse,
} from "@/lib/dto/practice";
import type { ReviewRating } from "@/lib/schemas/srs";

interface Props {
  childExists: boolean;
  childLevel: string | null;
  initialDueCount: number;
  initialError?: string | null;
}

type SessionPhase = "idle" | "empty" | "active" | "complete";

const RATING_OPTIONS: { rating: ReviewRating; label: string; className: string }[] = [
  { rating: Rating.Again, label: "Jeszcze raz", className: "bg-red-600/90 hover:bg-red-500" },
  { rating: Rating.Hard, label: "Trudne", className: "bg-orange-600/90 hover:bg-orange-500" },
  { rating: Rating.Good, label: "Dobrze", className: "bg-emerald-600/90 hover:bg-emerald-500" },
  { rating: Rating.Easy, label: "Łatwe", className: "bg-blue-600/90 hover:bg-blue-500" },
];

export default function PracticeSessionCard({ childExists, childLevel, initialDueCount, initialError = null }: Props) {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [dueCount, setDueCount] = useState(initialDueCount);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cards, setCards] = useState<PracticeCardDTO[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [reviewedInSession, setReviewedInSession] = useState(0);
  const [pendingAction, setPendingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const displayLevel = resolveDisplayLevel(childLevel);
  const currentCard = cards[cardIndex];
  const totalCards = cards.length;
  const canShowCta = childExists && childLevel && dueCount > 0 && phase === "idle";

  async function endSession(id: string, signal?: AbortSignal) {
    const res = await fetch("/api/practice/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
      signal,
    });
    const data = (await res.json()) as EndPracticeResponse;
    if (!data.ok) {
      throw new Error(data.error);
    }
  }

  async function handleStart() {
    if (pendingAction || !canShowCta) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setPendingAction(true);
    setError(null);

    try {
      const res = await fetch("/api/practice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal,
      });
      const data = (await res.json()) as StartPracticeResponse;

      if (data.ok) {
        if (data.cards.length === 0) {
          setPhase("empty");
          setDueCount(0);
          return;
        }
        setSessionId(data.sessionId);
        setCards(data.cards);
        setCardIndex(0);
        setHintRevealed(false);
        setReviewedInSession(0);
        setPhase("active");
      } else if (res.status === 404) {
        setPhase("empty");
        setDueCount(0);
        setError(data.error);
      } else {
        setError(data.error);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPendingAction(false);
    }
  }

  async function handleRating(rating: ReviewRating) {
    if (pendingAction || phase !== "active" || !sessionId || cardIndex >= cards.length) return;
    const card = cards[cardIndex];

    setPendingAction(true);
    setError(null);

    try {
      const res = await fetch("/api/practice/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          flashcardId: card.id,
          rating,
        }),
      });
      const data = (await res.json()) as ReviewPracticeResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      const nextReviewed = reviewedInSession + 1;
      setReviewedInSession(nextReviewed);

      const nextIndex = cardIndex + 1;
      if (nextIndex >= cards.length) {
        let endWarning: string | null = null;
        try {
          await endSession(sessionId);
        } catch {
          endWarning =
            "Powtórki zapisane. Nie udało się zamknąć sesji — odśwież stronę później.";
        }
        setDueCount((prev) => Math.max(0, prev - nextReviewed));
        setPhase("complete");
        setSessionId(null);
        setCards([]);
        setCardIndex(0);
        setHintRevealed(false);
        if (endWarning) setError(endWarning);
      } else {
        setCardIndex(nextIndex);
        setHintRevealed(false);
      }
    } catch {
      setError("Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPendingAction(false);
    }
  }

  async function handleEndEarly() {
    if (pendingAction || phase !== "active" || !sessionId) return;

    setPendingAction(true);
    setError(null);

    try {
      await endSession(sessionId);
      if (reviewedInSession > 0) {
        setDueCount((prev) => Math.max(0, prev - reviewedInSession));
      }
      resetToIdle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zakończyć sesji.");
    } finally {
      setPendingAction(false);
    }
  }

  function resetToIdle() {
    setPhase("idle");
    setSessionId(null);
    setCards([]);
    setCardIndex(0);
    setHintRevealed(false);
    setReviewedInSession(0);
    setError(null);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl">
      <div className="mb-6">
        <h2 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
          Ćwicz fiszki
        </h2>
        <p className="mt-1 text-sm text-blue-100/60">Poziom: {displayLevel}</p>
      </div>

      <ServerError message={initialError} />
      <ServerError message={error} />

      {!childExists ? (
        <p className="text-sm text-blue-100/70">Najpierw utwórz profil dziecka powyżej, aby ćwiczyć fiszki.</p>
      ) : !childLevel ? (
        <p className="text-sm text-blue-100/70">Ustaw poziom czytania dziecka powyżej, aby rozpocząć ćwiczenie.</p>
      ) : phase === "idle" ? (
        <div className="space-y-4">
          {dueCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={pendingAction}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction ? (
                <>
                  <span
                    className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden="true"
                  />
                  Przygotowuję sesję...
                </>
              ) : (
                <>
                  <BookOpen className="size-5" />
                  Ćwicz teraz ({dueCount})
                </>
              )}
            </button>
          ) : (
            <p className="text-sm text-blue-100/70">Na ten moment brak fiszek do powtórki.</p>
          )}
        </div>
      ) : phase === "empty" ? (
        <div className="space-y-4">
          <p className="text-sm text-blue-100/70">Brak fiszek do powtórki.</p>
          <button
            type="button"
            onClick={() => {
              resetToIdle();
            }}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/20"
          >
            Wróć do fiszek
          </button>
        </div>
      ) : phase === "complete" ? (
        <div className="space-y-4">
          <p className="text-base text-white/90">
            Ukończono ćwiczenie — oceniono <span className="font-semibold text-purple-200">{reviewedInSession}</span>{" "}
            {reviewedInSession === 1 ? "fiszkę" : "fiszki"}.
          </p>
          <button
            type="button"
            onClick={() => {
              resetToIdle();
            }}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
          >
            Wróć do fiszek
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between text-sm text-blue-100/70">
            <span>
              Fiszka {cardIndex + 1} z {totalCards}
            </span>
            <button
              type="button"
              onClick={() => void handleEndEarly()}
              disabled={pendingAction}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-60"
            >
              Zakończ
            </button>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/5 p-5 sm:p-6">
            <p className="text-xl leading-relaxed font-medium text-white sm:text-2xl">{currentCard.front_text}</p>

            {!hintRevealed ? (
              <button
                type="button"
                onClick={() => {
                  setHintRevealed(true);
                }}
                disabled={pendingAction}
                className="mt-4 min-h-11 w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/15 disabled:opacity-60"
              >
                Pokaż podpowiedź
              </button>
            ) : (
              <p className="mt-4 rounded-lg border border-blue-300/20 bg-blue-900/20 px-3 py-2 text-sm text-blue-100/90">
                {currentCard.hint_text?.trim() ? currentCard.hint_text : "Brak podpowiedzi dla tej fiszki."}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {RATING_OPTIONS.map(({ rating, label, className }) => (
              <button
                key={rating}
                type="button"
                onClick={() => void handleRating(rating)}
                disabled={pendingAction}
                className={cn(
                  "min-h-14 rounded-lg px-3 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  className,
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
