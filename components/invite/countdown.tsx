"use client";

import { useEffect, useState } from "react";

// Rendered only after mount — the server and client would otherwise disagree
// on the current second (SSR time vs. hydration time) and trip a hydration
// warning, same fix as PanelShell's live clock.
function useCountdown(target: Date) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    setRemaining(target.getTime() - Date.now());
    const id = setInterval(() => setRemaining(target.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining === null ? null : Math.max(0, remaining);
}

export function CountdownTimer({
  target,
  color,
  fontFamily,
  labels = { days: "денови", hours: "часа", minutes: "минути", seconds: "секунди" },
}: {
  target: Date;
  color: string;
  fontFamily?: string;
  labels?: { days: string; hours: string; minutes: string; seconds: string };
}) {
  const remaining = useCountdown(target);
  const days = remaining === null ? null : Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = remaining === null ? null : Math.floor((remaining / (1000 * 60 * 60)) % 24);
  const minutes = remaining === null ? null : Math.floor((remaining / (1000 * 60)) % 60);
  const seconds = remaining === null ? null : Math.floor((remaining / 1000) % 60);
  const units: { value: number | null; label: string }[] = [
    { value: days, label: labels.days },
    { value: hours, label: labels.hours },
    { value: minutes, label: labels.minutes },
    { value: seconds, label: labels.seconds },
  ];

  return (
    <div style={{ display: "flex", gap: "clamp(6px, 2.5vw, 18px)", justifyContent: "center", margin: "28px 0 0" }}>
      {units.map((u, i) => (
        <div key={u.label} style={{ textAlign: "center", display: "flex", alignItems: "center", gap: "clamp(6px, 2.5vw, 18px)" }}>
          <div>
            <div style={{ fontFamily, fontStyle: "italic", fontSize: "clamp(24px, 8vw, 32px)", fontWeight: 500, color, lineHeight: 1, fontVariantNumeric: "tabular-nums lining-nums" }}>
              {u.value === null ? "--" : String(u.value).padStart(2, "0")}
            </div>
            <div style={{ fontFamily, fontSize: 11, letterSpacing: "0.1em", color, opacity: 0.75, marginTop: 4 }}>
              {u.label}
            </div>
          </div>
          {i < units.length - 1 ? <div style={{ color, opacity: 0.4, fontSize: 22 }}>:</div> : null}
        </div>
      ))}
    </div>
  );
}

export function formatMkDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const months = [
    "јануари", "февруари", "март", "април", "мај", "јуни",
    "јули", "август", "септември", "октомври", "ноември", "декември",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** "сабота" for "2027-06-12". */
export function formatMkWeekday(iso: string): string {
  const days = ["недела", "понеделник", "вторник", "среда", "четврток", "петок", "сабота"];
  return days[new Date(`${iso}T00:00:00`).getDay()];
}
