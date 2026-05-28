import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { READING_LEVEL_FORM_VALUES, type ReadingLevelFormValue } from "@/lib/reading-level-form";

const LEVEL_LABELS: Record<ReadingLevelFormValue, string> = {
  letters: "Litery",
  syllables: "Sylaby",
  words: "Pojedyncze słowa",
  simple_sentences: "Proste zdania",
  unknown: "Nie wiem — zacznij od najprostszego",
};

interface ReadingLevelFieldProps {
  value: ReadingLevelFormValue;
  onChange: (next: ReadingLevelFormValue) => void;
  error?: string;
  name?: string;
}

export function ReadingLevelField({ value, onChange, error, name = "level" }: ReadingLevelFieldProps) {
  const errorId = `${name}-error`;

  return (
    <fieldset
      className={cn("rounded-lg border p-3", error ? "border-red-400/60" : "border-white/20")}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-2 px-1 text-sm text-blue-100/80">Poziom czytania dziecka</legend>
      <div className="space-y-2">
        {READING_LEVEL_FORM_VALUES.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-3 text-white">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => {
                onChange(option);
              }}
              className="size-4 accent-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400"
            />
            <span className="text-sm">{LEVEL_LABELS[option]}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-2 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      )}
    </fieldset>
  );
}
