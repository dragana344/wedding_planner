"use client";

import { useEffect, useState } from "react";
import { useManagerElevation, reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

type Manager = { id: string; name: string; isOwner: boolean; createdAt: string };

export function ManagersSection() {
  const { token } = useManagerElevation();
  const [managers, setManagers] = useState<Manager[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      const res = await fetch("/api/venue/managers", { headers: { "x-venue-manager-token": token } });
      if (!res.ok) {
        if (res.status === 403) reportElevationRejected();
        setLoadError("Менаџерите не можеа да се вчитаат.");
        return;
      }
      setManagers((await res.json()).managers);
      setLoadError(null);
    } catch {
      setLoadError("Менаџерите не можеа да се вчитаат.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/venue/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-venue-manager-token": token ?? "" },
        body: JSON.stringify({ name, password }),
      });
      // A 5xx page or an empty body is not JSON — still show a message.
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 403) reportElevationRejected();
        setError(data?.error ?? "Менаџерот не можеше да се додаде.");
        return;
      }
      setName("");
      setPassword("");
      await load();
    } catch {
      setError("Менаџерот не можеше да се додаде. Проверете ја интернет-врската.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(managerId: string, managerName: string) {
    if (!window.confirm(`Отстрани го менаџерот „${managerName}“?`)) return;
    setError(null);
    setRemovingId(managerId);
    try {
      const res = await fetch(`/api/venue/managers/${managerId}`, { method: "DELETE", headers: { "x-venue-manager-token": token ?? "" } });
      if (!res.ok) {
        if (res.status === 403) reportElevationRejected();
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Менаџерот не можеше да се отстрани.");
        return;
      }
      await load();
    } catch {
      setError("Менаџерот не можеше да се отстрани. Проверете ја интернет-врската.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <h2 className="panel-t">Менаџери</h2>
      </div>
      <div className="ev-form" style={{ padding: "16px 20px" }}>
        {managers === null ? (
          loadError ? <p role="alert" style={{ color: "var(--bad)" }}>{loadError}</p> : <p className="muted">Се вчитува...</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {managers.map((m) => (
              <li key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                <span>{m.name}{m.isOwner ? " (сопственик)" : ""}</span>
                {!m.isOwner ? (
                  <button type="button" className="btn btn-ghost" onClick={() => handleRemove(m.id, m.name)} disabled={removingId !== null}>
                    {removingId === m.id ? "Се отстранува..." : "Отстрани"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="fld" placeholder="Име" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Име на нов менаџер" />
          <input className="fld" type="password" placeholder="Лозинка" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required aria-label="Лозинка на нов менаџер" />
          <button type="submit" className="btn btn-gold" disabled={isSubmitting}>
            {isSubmitting ? "Се додава..." : "Додади менаџер"}
          </button>
        </form>
        {error ? <p role="alert" style={{ color: "var(--bad)", marginTop: 8 }}>{error}</p> : null}
      </div>
    </section>
  );
}
