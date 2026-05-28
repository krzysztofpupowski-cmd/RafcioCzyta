import React, { useState } from "react";
import { BookOpen } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { ReadingLevelField } from "@/components/child/ReadingLevelField";
import { READING_LEVEL_FORM_VALUES, type ReadingLevelFormValue } from "@/lib/reading-level-form";

interface Props {
  initialDisplayName: string;
  initialLevel: string | null;
  serverError?: string | null;
}

export default function ChildProfileForm({ initialDisplayName, initialLevel, serverError }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [level, setLevel] = useState<ReadingLevelFormValue>(
    (initialLevel as ReadingLevelFormValue | null) ?? "unknown",
  );
  const [errors, setErrors] = useState<{ displayName?: string; level?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!displayName.trim()) {
      next.displayName = "Imię dziecka jest wymagane";
    } else if (displayName.trim().length > 80) {
      next.displayName = "Imię nie może być dłuższe niż 80 znaków";
    }
    if (!READING_LEVEL_FORM_VALUES.includes(level)) {
      next.level = "Wybierz poziom czytania";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const isCreating = !initialDisplayName;

  return (
    <form method="POST" action="/api/children" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="displayName"
        name="displayName"
        label="Imię dziecka"
        type="text"
        value={displayName}
        onChange={(v) => {
          setDisplayName(v);
          clearError("displayName");
        }}
        placeholder="np. Rafcio"
        error={errors.displayName}
        icon={<BookOpen className="size-4" />}
      />

      <ReadingLevelField
        value={level}
        onChange={(v) => {
          setLevel(v);
          clearError("level");
        }}
        error={errors.level}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie..." icon={<BookOpen className="size-4" />}>
        {isCreating ? "Utwórz profil dziecka" : "Zapisz profil dziecka"}
      </SubmitButton>
    </form>
  );
}
