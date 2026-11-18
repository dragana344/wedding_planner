"use client";

import { useState } from "react";
import { GENERIC_ERROR } from "@/lib/auth-messages";

/**
 * BlockedScreen's data export (0172): a blocked venue whose deletion is
 * scheduled can still download its data, by the owner's manager password
 * (POST /api/venue/privacy/export). Same file as Поставки → "Податоци и
 * приватност".
 */
export function BlockedExport() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsExporting(true);
    try {
      const res = await fetch("/api/venue/privacy/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Не успеа преземањето на податоците.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `podatoci-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setPassword("");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="lab-s" htmlFor="blocked-export-password">
        Лозинка на сопственикот
      </label>
      <input
        id="blocked-export-password"
        className="fld"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        style={{ width: "100%", margin: "4px 0 10px" }}
      />
      {error ? (
        <p className="auth-error" role="alert" style={{ margin: "0 0 10px" }}>
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-ghost" disabled={isExporting || password.length === 0}>
        {isExporting ? "Се презема..." : "Преземи ги податоците"}
      </button>
    </form>
  );
}
