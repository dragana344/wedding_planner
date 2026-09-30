"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";
import { reportClientError } from "@/lib/report-error";

// Any error thrown while rendering a page below the root layout (REL-003).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <ErrorScreen
      code="Грешка"
      title="Нешто тргна наопаку"
      message="Не успеавме да ја вчитаме оваа страница. Обидете се повторно, а ако проблемот продолжи, контактирајте нè и наведете ја референцата подолу."
      reference={error.digest}
      action={
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[#a8842c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f7024]"
        >
          Обиди се повторно
        </button>
      }
    />
  );
}
