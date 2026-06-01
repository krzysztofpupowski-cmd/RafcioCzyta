import React, { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { AcceptedFlashcardList } from "@/components/flashcards/AcceptedFlashcardList";
import { DraftBatchPanel } from "@/components/flashcards/DraftBatchPanel";
import { resolveDisplayLevel } from "@/lib/reading-level-form";
import type {
  AcceptBatchResponse,
  AcceptedFlashcardDTO,
  DraftBatchDTO,
  GenerateFlashcardsResponse,
  RejectBatchResponse,
} from "@/lib/dto/flashcards";

interface Props {
  childExists: boolean;
  childLevel: string | null;
  initialDraftBatches: DraftBatchDTO[];
  initialAcceptedCards: AcceptedFlashcardDTO[];
  initialError: string | null;
}

type ActiveTab = "prepared" | "accepted";

export default function FlashcardDashboardCard({
  childExists,
  childLevel,
  initialDraftBatches,
  initialAcceptedCards,
  initialError,
}: Props) {
  const [draftBatches, setDraftBatches] = useState<DraftBatchDTO[]>(initialDraftBatches);
  const [acceptedCards, setAcceptedCards] = useState<AcceptedFlashcardDTO[]>(initialAcceptedCards);
  const [activeTab, setActiveTab] = useState<ActiveTab>("prepared");
  const [pendingAction, setPendingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const displayLevel = resolveDisplayLevel(childLevel);

  async function handleGenerate() {
    if (pendingAction) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setPendingAction(true);
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
        setDraftBatches((prev) => {
          if (prev.some((b) => b.generationId === data.generationId)) return prev;
          return [
            ...prev,
            {
              generationId: data.generationId,
              requestedLevel: data.requestedLevel,
              createdAt: new Date().toISOString(),
              cards: data.cards,
            },
          ];
        });
        setActiveTab("prepared");
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

  async function handleAccept(generationId: string) {
    if (pendingAction) return;

    setPendingAction(true);
    setError(null);

    try {
      const res = await fetch("/api/flashcards/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId }),
      });
      const data = (await res.json()) as AcceptBatchResponse;
      if (data.ok) {
        setDraftBatches((prev) => prev.filter((b) => b.generationId !== generationId));
        setAcceptedCards((prev) => [...data.cards, ...prev]);
      } else if (res.status === 404) {
        setDraftBatches((prev) => prev.filter((b) => b.generationId !== generationId));
      } else {
        setError(data.error);
      }
    } catch {
      setError("Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPendingAction(false);
    }
  }

  async function handleReject(generationId: string) {
    if (pendingAction) return;

    setPendingAction(true);
    setError(null);

    try {
      const res = await fetch("/api/flashcards/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId }),
      });
      const data = (await res.json()) as RejectBatchResponse;
      if (data.ok) {
        setDraftBatches((prev) => prev.filter((b) => b.generationId !== generationId));
      } else if (res.status === 404) {
        setDraftBatches((prev) => prev.filter((b) => b.generationId !== generationId));
      } else {
        setError(data.error);
      }
    } catch {
      setError("Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPendingAction(false);
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
            onClick={() => void handleGenerate()}
            disabled={pendingAction}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingAction ? (
              <>
                <span
                  className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden="true"
                />
                Przetwarzam...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generuj 8 fiszek
              </>
            )}
          </button>

          <ServerError message={initialError} />
          <ServerError message={error} />

          <div className="space-y-3">
            <div className="flex gap-2 border-b border-white/10 pb-2" role="tablist" aria-label="Przegląd fiszek">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "prepared"}
                onClick={() => {
                  setActiveTab("prepared");
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === "prepared"
                    ? "bg-white/15 text-white"
                    : "text-blue-100/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                Przygotowane
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "accepted"}
                onClick={() => {
                  setActiveTab("accepted");
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === "accepted"
                    ? "bg-white/15 text-white"
                    : "text-blue-100/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                Zaakceptowane
              </button>
            </div>

            {activeTab === "prepared" && (
              <div role="tabpanel" className="space-y-4">
                {draftBatches.length === 0 ? (
                  <p className="text-sm text-blue-100/70">Brak fiszek oczekujących na akceptację.</p>
                ) : (
                  draftBatches.map((batch) => (
                    <DraftBatchPanel
                      key={batch.generationId}
                      batch={batch}
                      pending={pendingAction}
                      onAccept={(id) => void handleAccept(id)}
                      onReject={(id) => void handleReject(id)}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === "accepted" && (
              <div role="tabpanel">
                <AcceptedFlashcardList cards={acceptedCards} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
