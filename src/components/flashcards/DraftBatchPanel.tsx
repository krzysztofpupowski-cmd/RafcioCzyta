import { useState } from "react";
import type { DraftBatchDTO } from "@/lib/dto/flashcards";
import { STORED_LEVEL_LABELS } from "@/lib/reading-level-form";

interface Props {
  batch: DraftBatchDTO;
  pending: boolean;
  onAccept: (generationId: string) => void;
  onReject: (generationId: string) => void;
}

function formatBatchDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DraftBatchPanel({ batch, pending, onAccept, onReject }: Props) {
  const [confirmReject, setConfirmReject] = useState(false);
  const levelLabel = STORED_LEVEL_LABELS[batch.requestedLevel];
  const dateLabel = formatBatchDate(batch.createdAt);

  return (
    <section
      className="rounded-lg border border-white/10 bg-white/5 p-4"
      aria-label={`Partia fiszek z ${dateLabel}, poziom ${levelLabel}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white">{levelLabel}</p>
          <p className="text-xs text-blue-100/60">{dateLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || confirmReject}
            onClick={() => {
              onAccept(batch.generationId);
            }}
            aria-label={`Akceptuj partię fiszek z ${dateLabel}`}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Akceptuj partię
          </button>
          {confirmReject ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmReject(false);
                  onReject(batch.generationId);
                }}
                aria-label={`Potwierdź odrzucenie partii fiszek z ${dateLabel}`}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Potwierdź odrzucenie
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmReject(false);
                }}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anuluj
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirmReject(true);
              }}
              aria-label={`Odrzuć partię fiszek z ${dateLabel}`}
              className="rounded-lg border border-red-400/30 bg-red-900/20 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Odrzuć partię
            </button>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {batch.cards.map((card) => (
          <li key={card.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-lg font-semibold text-white">{card.front_text}</p>
            {card.hint_text && <p className="mt-0.5 text-sm text-blue-100/70">{card.hint_text}</p>}
            <div className="mt-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-blue-100">
                {STORED_LEVEL_LABELS[card.level]}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
