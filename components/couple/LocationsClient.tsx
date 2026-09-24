"use client";

import { useState } from "react";
import type { Location } from "@/lib/couple/locations";
import { jsonOrThrow } from "@/lib/couple/client-utils";

export function LocationsClient({ initialLocations }: { initialLocations: Location[] }) {
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
      setError(err instanceof Error ? err.message : "Failed to add location.");
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
      setError(err instanceof Error ? err.message : "Failed to delete location.");
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
      setError(err instanceof Error ? err.message : "Failed to update location.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {locations.map((location) =>
        editingId === location.id ? (
          <div key={location.id} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="fld" placeholder="Label" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} required aria-label="Edit label" />
            <input className="fld" placeholder="Address (optional)" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} aria-label="Edit address" />
            <input className="fld" placeholder="Map link (optional)" value={editMapUrl} onChange={(e) => setEditMapUrl(e.target.value)} aria-label="Edit map link" />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => handleSaveEdit(location.id)} disabled={isSaving} className="btn btn-gold">
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={cancelEdit} disabled={isSaving} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div key={location.id} className="ev" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontWeight: 700, margin: 0 }}>{location.label}</p>
              {location.address ? <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>{location.address}</p> : null}
              {location.map_url ? (
                <a href={location.map_url} target="_blank" rel="noreferrer" style={{ color: "var(--gold-lo)", fontSize: 13.5 }}>
                  Open map
                </a>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={() => startEdit(location)} aria-label="Edit" className="btn btn-ghost">
                Edit
              </button>
              <button type="button" onClick={() => handleDelete(location.id)} aria-label="Delete" className="btn btn-ghost" style={{ color: "var(--bad)" }}>
                Delete
              </button>
            </div>
          </div>
        )
      )}

      <form onSubmit={handleAdd} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="fld" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} required />
        <input className="fld" placeholder="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
        <input className="fld" placeholder="Map link (optional)" value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} />
        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
          {isSubmitting ? "Adding..." : "Add"}
        </button>
      </form>
    </div>
  );
}
