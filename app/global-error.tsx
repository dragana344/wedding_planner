"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";
import { reportClientError } from "@/lib/report-error";

// Errors in the root layout itself (REL-003). Replaces the whole document, so
// it renders its own <html> and <body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="mk">
      <body>
        <ErrorScreen
          code="Грешка"
          title="Нешто тргна наопаку"
          message="Апликацијата наиде на неочекувана грешка. Обидете се повторно за малку."
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
      </body>
    </html>
  );
}
