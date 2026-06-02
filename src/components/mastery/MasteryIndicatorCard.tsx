import React, { useCallback, useEffect, useState } from "react";

import { ServerError } from "@/components/auth/ServerError";
import type { MasterySummaryDTO, MasterySummaryResponse } from "@/lib/dto/mastery";
import { resolveDisplayLevel } from "@/lib/reading-level-form";

interface Props {
  childExists: boolean;
  childLevel: string | null;
  initialSummary: MasterySummaryDTO | null;
  initialError?: string | null;
}

export default function MasteryIndicatorCard({ childExists, childLevel, initialSummary, initialError = null }: Props) {
  const [summary, setSummary] = useState<MasterySummaryDTO | null>(initialSummary);
  const [fetchError, setFetchError] = useState<string | null>(initialError);
  const [refetching, setRefetching] = useState(false);

  const refetchSummary = useCallback(async () => {
    setRefetching(true);
    try {
      const res = await fetch("/api/mastery/summary");
      const data = (await res.json()) as MasterySummaryResponse;
      if (data.ok) {
        setSummary(data.summary);
        setFetchError(null);
      } else {
        setFetchError(data.error);
      }
    } catch {
      setFetchError("Nie udało się odświeżyć postępu. Spróbuj ponownie później.");
    } finally {
      setRefetching(false);
    }
  }, []);

  useEffect(() => {
    const onRefresh = () => {
      if (childExists && childLevel) {
        void refetchSummary();
      }
    };

    window.addEventListener("rc-practice-complete", onRefresh);
    window.addEventListener("rc-flashcards-accepted", onRefresh);
    return () => {
      window.removeEventListener("rc-practice-complete", onRefresh);
      window.removeEventListener("rc-flashcards-accepted", onRefresh);
    };
  }, [childExists, childLevel, refetchSummary]);

  const displayLevel = resolveDisplayLevel(childLevel);

  function renderBody() {
    if (!childExists) {
      return <p className="text-sm text-blue-100/70">Najpierw utwórz profil dziecka powyżej.</p>;
    }

    if (!childLevel) {
      return <p className="text-sm text-blue-100/70">Ustaw poziom czytania, aby śledzić opanowanie materiału.</p>;
    }

    if (!summary || summary.acceptedCount === 0) {
      return <p className="text-sm text-blue-100/70">Zaakceptuj fiszki na swoim poziomie, aby śledzić postęp.</p>;
    }

    const { acceptedCount, masteredCount, percentMastered } = summary;

    if (masteredCount === 0) {
      return (
        <div className="space-y-2">
          <p className="text-base font-medium text-white/90">
            0 z {acceptedCount} {acceptedCount === 1 ? "fiszki" : "fiszek"} opanowanych
          </p>
          <p className="text-sm text-blue-100/70">Ćwicz regularnie — opanowanie rośnie z powtórkami.</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-base font-medium text-white/90">
          {masteredCount} z {acceptedCount} {acceptedCount === 1 ? "fiszki" : "fiszek"} opanowanych ({percentMastered}
          %)
        </p>
        <p className="text-xs text-blue-100/60">
          Prosty wskaźnik oparty na powtórkach — nie zastępuje diagnozy czytania.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl">
      <div className="mb-6">
        <h2 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
          Postęp w opanowaniu
        </h2>
        {childLevel ? <p className="mt-1 text-sm text-blue-100/60">Poziom: {displayLevel}</p> : null}
      </div>

      <ServerError message={fetchError} />

      {refetching ? (
        <p className="mb-3 text-xs text-blue-100/50" aria-live="polite">
          Odświeżam postęp...
        </p>
      ) : null}

      {renderBody()}
    </div>
  );
}
