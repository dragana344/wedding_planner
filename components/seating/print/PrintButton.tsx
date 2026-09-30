"use client";

export function PrintButton({ label = "Печати" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
