"use client";

import { useState } from "react";
import type { GuestSide } from "@/lib/couple/guests";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { useOrigin } from "@/components/couple/guests/InviteSend";

export interface CoOrganizerRow {
  id: string;
  side: GuestSide;
  username: string;
  created_at: string;
}

const SIDE_LABELS: Record<GuestSide, string> = { bride: "Страна на невестата", groom: "Страна на младоженецот" };

/** 12 characters without look-alikes, from the browser's CSPRNG. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * A12: the couple gives each side of the family its own login, e.g. the
 * bride's mother sends the bride's side's invitations. The password is shown
 * once, right after it is set, for the couple to pass on.
 */
export function CoOrganizersPanel({ initial }: { initial: CoOrganizerRow[] }) {
  const origin = useOrigin();
  const [rows, setRows] = useState(initial);
  const freeSides = (Object.keys(SIDE_LABELS) as GuestSide[]).filter((s) => !rows.some((r) => r.side === s));
  const [side, setSide] = useState<GuestSide>(freeSides[0] ?? "bride");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created: CoOrganizerRow = await jsonOrThrow(
        await fetch("/api/couple/co-organizers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ side: freeSides.includes(side) ? side : freeSides[0], username, password }),
        }),
      );
      setRows((prev) => [...prev, created]);
      setShown({ username: created.username, password });
      setUsername("");
      setPassword(generatePassword());
      const nextFree = freeSides.find((s) => s !== created.side);
      if (nextFree) setSide(nextFree);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на ко-организаторот.");
    } finally {
      setBusy(false);
    }
  }

  async function rekey(row: CoOrganizerRow) {
    setError(null);
    const fresh = generatePassword();
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/co-organizers/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: fresh }),
        }),
      );
      setShown({ username: row.username, password: fresh });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа промената на лозинката.");
    }
  }

  async function remove(row: CoOrganizerRow) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/co-organizers/${row.id}`, { method: "DELETE" }));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (shown?.username === row.username) setShown(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на ко-организаторот.");
    }
  }

  return (
    <section className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 className="panel-t" style={{ margin: 0 }}>
        Ко-организатори
      </h2>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
        Посебна најава за секоја страна: ги гледа сите гости, а праќа покани само на гостите од својата страна.
      </p>

      {rows.map((row) => (
        <div key={row.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <div>
            <strong>{row.username}</strong>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{SIDE_LABELS[row.side]}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-ghost" onClick={() => void rekey(row)} aria-label={`Нова лозинка за ${row.username}`}>
              Нова лозинка
            </button>
            <button type="button" className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={() => void remove(row)} aria-label={`Избриши ${row.username}`}>
              Избриши
            </button>
          </div>
        </div>
      ))}

      {shown ? (
        <div role="status" style={{ background: "var(--gold-tint)", borderRadius: 9, padding: "10px 12px", fontSize: 13.5 }}>
          Испратете ги овие податоци (лозинката не се прикажува повторно):
          <br />
          Најава: {origin}/couple/login · Корисничко име: <strong>{shown.username}</strong> · Лозинка: <strong>{shown.password}</strong>
        </div>
      ) : null}

      {freeSides.length > 0 ? (
        <form onSubmit={add} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <select
            aria-label="Страна на ко-организаторот"
            className="fld"
            style={{ width: "auto", flex: "1 1 180px" }}
            value={freeSides.includes(side) ? side : freeSides[0]}
            onChange={(e) => setSide(e.target.value as GuestSide)}
          >
            {freeSides.map((s) => (
              <option key={s} value={s}>
                {SIDE_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            aria-label="Корисничко име"
            placeholder="Корисничко име"
            className="fld"
            style={{ width: "auto", flex: "1 1 160px" }}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="off"
          />
          <input
            aria-label="Лозинка"
            className="fld"
            style={{ width: "auto", flex: "1 1 160px" }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={10}
            required
            autoComplete="off"
          />
          <button type="submit" className="btn btn-gold" disabled={busy}>
            Додади ко-организатор
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
