"use client";

import { useState } from "react";
import Link from "next/link";
import type { Greeting } from "@/lib/media/greetings";
import { formatDay } from "@/lib/media/format";

/** The couple's greetings from guests (C2, C7), with hide and delete. */
export function GreetingsClient({ initialGreetings }: { initialGreetings: Greeting[] }) {
  const [greetings, setGreetings] = useState(initialGreetings);
  const [error, setError] = useState<string | null>(null);

  async function setHidden(g: Greeting, hidden: boolean) {
    setError(null);
    const res = await fetch(`/api/couple/greetings/${g.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    if (!res.ok) return setError("Не успеа промената. Обидете се повторно.");
    setGreetings((list) => list.map((x) => (x.id === g.id ? { ...x, hidden } : x)));
  }

  async function remove(g: Greeting) {
    if (!window.confirm("Да се избрише оваа честитка? Ова не може да се врати.")) return;
    setError(null);
    const res = await fetch(`/api/couple/greetings/${g.id}`, { method: "DELETE" });
    if (!res.ok) return setError("Не успеа бришењето. Обидете се повторно.");
    setGreetings((list) => list.filter((x) => x.id !== g.id));
  }

  if (greetings.length === 0) {
    return (
      <p className="s4-empty">
        Сè уште нема честитки. Споделете го QR кодот од <Link href="/couple/album">Албум</Link>.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p className="s4-error" role="alert">
          {error}
        </p>
      )}
      <ul className="s4-greetings">
        {greetings.map((g) => (
          <li key={g.id} className={`s4-greeting${g.hidden ? " is-hidden" : ""}`} data-testid={`greeting-${g.id}`}>
            <div className="s4-greeting-head">
              <strong>
                {g.firstName} {g.lastName}
              </strong>
              <span className="s4-greeting-date">{formatDay(g.createdAt)}</span>
              {g.hidden && <span className="badge">Скриена</span>}
            </div>
            <p className="s4-greeting-text">{g.message}</p>
            {g.videoUrl && <video className="s4-greeting-video" src={g.videoUrl} controls preload="none" playsInline />}
            <div className="s4-photo-actions">
              <button className="btn btn-ghost" type="button" onClick={() => void setHidden(g, !g.hidden)}>
                {g.hidden ? "Прикажи" : "Скриј"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void remove(g)}>
                Избриши
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
