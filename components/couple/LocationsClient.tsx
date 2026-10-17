"use client";

import { useState } from "react";
import { Cormorant_Garamond } from "next/font/google";
import type { Location } from "@/lib/couple/locations";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { formatMkDate } from "@/lib/date";
import { Icon } from "@/components/venue/shell/Icon";
import "@/components/couple/InvitationCard.css";
import "./LocationsClient.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "400" });

export function LocationsClient({
  initialLocations,
  coupleNames,
  eventDate,
}: {
  initialLocations: Location[];
  coupleNames: string;
  eventDate: string;
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editMapUrl, setEditMapUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await jsonOrThrow(
        await fetch("/api/couple/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, address: address || null, map_url: mapUrl || null }),
        })
      );
      setLocations((prev) => [...prev, created]);
      setLabel("");
      setAddress("");
      setMapUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на локацијата.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/locations/${id}`, { method: "DELETE" }));
      setLocations((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на локацијата.");
    }
  }

  function startEdit(location: Location) {
    setError(null);
    setEditingId(location.id);
    setEditLabel(location.label);
    setEditAddress(location.address ?? "");
    setEditMapUrl(location.map_url ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(id: string) {
    setError(null);
    setIsSaving(true);
    try {
      const updated = await jsonOrThrow(
        await fetch(`/api/couple/locations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: editLabel, address: editAddress || null, map_url: editMapUrl || null }),
        })
      );
      setLocations((prev) => prev.map((l) => (l.id === id ? updated : l)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на локацијата.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2" style={{ alignItems: "start" }}>
      <div className="panel couple-card">
        <div className="panel-h">
          <h2 className="panel-t">
            <Icon name="plus" size="sm" /> Додади локација
          </h2>
        </div>
        <form onSubmit={handleAdd} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="lab-s" htmlFor="location-label">
              Назив
            </label>
            <input id="location-label" className="fld" placeholder="пр. Црква Св. Климент" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div>
            <label className="lab-s" htmlFor="location-address">
              Адреса (опционално)
            </label>
            <input id="location-address" className="fld" placeholder="Улица, град..." value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <label className="lab-s" htmlFor="location-map-url">
              Линк до мапа (опционално)
            </label>
            <input id="location-map-url" className="fld" placeholder="https://..." value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} />
          </div>
          {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
          <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
            {isSubmitting ? "Се додава..." : "Додади"}
          </button>
        </form>
      </div>

      <div className="panel couple-card invite-card">
        <div className="invite-frame">
          <h2 className={`invite-title ${cormorant.className}`}>Локации</h2>
          <p className="invite-sub">
            {coupleNames} · {formatMkDate(eventDate)}
          </p>
          <div className="invite-divider">
            <span className="invite-diamond" />
          </div>

          {locations.length === 0 ? <p className="location-empty">Сè уште нема додадено локации.</p> : null}

          {locations.map((location) =>
            editingId === location.id ? (
              <div key={location.id} className="location-edit-row">
                <input className="fld" placeholder="Назив" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} required aria-label="Измени назив" />
                <input className="fld" placeholder="Адреса (опционално)" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} aria-label="Измени адреса" />
                <input
                  className="fld"
                  placeholder="Линк до мапа (опционално)"
                  value={editMapUrl}
                  onChange={(e) => setEditMapUrl(e.target.value)}
                  aria-label="Измени линк до мапа"
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => handleSaveEdit(location.id)} disabled={isSaving} className="btn btn-gold">
                    {isSaving ? "Се зачувува..." : "Зачувај"}
                  </button>
                  <button type="button" onClick={cancelEdit} disabled={isSaving} className="btn btn-ghost">
                    Откажи
                  </button>
                </div>
              </div>
            ) : (
              <div key={location.id} className="location-row">
                <Icon name="pin" size="sm" className="location-pin" />
                <div className="location-content">
                  <p className="location-label">{location.label}</p>
                  {location.address ? <p className="location-address">{location.address}</p> : null}
                  {location.map_url ? (
                    <a href={location.map_url} target="_blank" rel="noreferrer" className="location-map-link">
                      Отвори мапа
                    </a>
                  ) : null}
                </div>
                <div className="location-actions">
                  <button type="button" onClick={() => startEdit(location)} className="location-link">
                    Измени
                  </button>
                  <button type="button" onClick={() => handleDelete(location.id)} className="location-link location-link-danger">
                    Избриши
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
