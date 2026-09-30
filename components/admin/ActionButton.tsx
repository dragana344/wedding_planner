"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/admin/actions";

// One button that calls an admin Server Action and reports its result
// inline, with an optional browser confirm() for actions that need a second
// "are you sure" (e.g. removing a staff member's MFA).
export function ActionButton({
  label,
  action,
  confirm,
}: {
  label: string;
  action: () => Promise<ActionResult<unknown>>;
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setMessage(r.ok ? "Готово." : r.error);
          });
        }}
      >
        {label}
      </button>
      {message ? <span className="muted"> {message}</span> : null}
    </span>
  );
}
