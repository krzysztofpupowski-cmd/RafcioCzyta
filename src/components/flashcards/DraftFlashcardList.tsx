import type { GeneratedFlashcardDTO } from "@/lib/dto/flashcards";
import { STORED_LEVEL_LABELS } from "@/lib/reading-level-form";

interface Props {
  cards: GeneratedFlashcardDTO[];
}

export function DraftFlashcardList({ cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Wygenerowane fiszki oczekujące na akceptację">
      {cards.map((card) => (
        <li key={card.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-lg font-semibold text-white">{card.front_text}</p>
          {card.hint_text && <p className="mt-0.5 text-sm text-blue-100/70">{card.hint_text}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-blue-100">
              {STORED_LEVEL_LABELS[card.level]}
            </span>
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
              oczekuje na akceptację
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
