import React, { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { DraftFlashcardList } from "@/components/flashcards/DraftFlashcardList";
import { resolveDisplayLevel } from "@/lib/reading-level-form";
import type { GenerateFlashcardsResponse, GeneratedFlashcardDTO } from "@/lib/dto/flashcards";

interface Props {
  childExists: boolean;
  childLevel: string | null;
}

export default function FlashcardGenerationCard({ childExists, childLevel }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<GeneratedFlashcardDTO[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const displayLevel = resolveDisplayLevel(childLevel);

  async function handleClick() {
    if (pending) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: abortRef.current.signal,
      });
      const data = (await res.json()) as GenerateFlashcardsResponse;
      if (data.ok) {
        setCards(data.cards);
      } else {
        setError(data.error);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl">
      <div className="mb-6">
        <h2 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
          Generuj fiszki
        </h2>
        <p className="mt-1 text-sm text-blue-100/60">Poziom: {displayLevel}</p>
      </div>

      {!childExists ? (
        <p className="text-sm text-blue-100/70">Najpierw utwórz profil dziecka powyżej, aby wygenerować fiszki.</p>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => void handleClick()}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <>
                <span
                  className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden="true"
                />
                Generuję fiszki... (do 10s)
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generuj 8 fiszek
              </>
            )}
          </button>

          <ServerError message={error} />

          <DraftFlashcardList cards={cards} />
        </div>
      )}
    </div>
  );
}
