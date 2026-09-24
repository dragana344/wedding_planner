"use client";

import { useState } from "react";
import { getMenuItemPhotoUrl, type MenuItem } from "@/lib/venue/menus";
import type { MenuSelection, MenuItemQuantity } from "@/lib/couple/menu";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { ImageLightbox } from "@/components/venue/dashboard/ImageLightbox";

export function CustomMenuBuilder({
  items,
  currentSelection,
  initialQuantities = [],
  guestCountEstimate = null,
}: {
  items: MenuItem[];
  currentSelection: MenuSelection;
  initialQuantities?: MenuItemQuantity[];
  guestCountEstimate?: number | null;
}) {
  const allItems = items;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentSelection.mode === "custom" ? currentSelection.menuItemIds : [])
  );
  const [quantities, setQuantities] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(initialQuantities.map((q) => [q.menu_item_id, q.guest_count]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);

  const selected = allItems.filter((item) => selectedIds.has(item.id));

  function courseHasMultipleItems(course: string) {
    return selected.filter((item) => item.course === course).length >= 2;
  }

  function explicitTotalForCourse(course: string) {
    return selected
      .filter((item) => item.course === course)
      .reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);
  }

  function blankCountForCourse(course: string) {
    return selected.filter((item) => item.course === course && quantities[item.id] == null).length;
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) {
      setSelectedIds((prev) => new Set(prev).add(itemId));
      setQuantities((prev) => (itemId in prev ? prev : { ...prev, [itemId]: null }));
    }
  }

  function removeItem(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    setSaved(false);

    const coursesWithMultiple = new Set(selected.map((item) => item.course).filter(courseHasMultipleItems));
    if (Array.from(coursesWithMultiple).some((course) => blankCountForCourse(course) > 1)) {
      setError("Only one item per course can be left blank.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/couple/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "custom", menu_item_ids: Array.from(selectedIds) }),
      });
      if (!response.ok) throw new Error("Failed to save your custom menu.");
      await jsonOrThrow(
        await fetch("/api/couple/menu/quantities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantities: selected.map((item) => ({ menu_item_id: item.id, guest_count: quantities[item.id] ?? null })),
          }),
        })
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your custom menu.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <h2 className="panel-t" style={{ marginBottom: 12 }}>Or build your own</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="lab-s" style={{ marginBottom: 8 }}>Available dishes (drag into your menu)</p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
            {allItems
              .filter((item) => !selectedIds.has(item.id))
              .map((item) => {
                const photoUrl = getMenuItemPhotoUrl(item.photo_path);
                return (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                    data-testid={`available-item-${item.id}`}
                    className="fld"
                    style={{ cursor: "grab", display: "flex", alignItems: "center", gap: 10 }}
                  >
                    {photoUrl ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomed({ src: photoUrl, alt: item.name });
                        }}
                        aria-label={`Погледни фотографија на ${item.name}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl} alt={item.name} className="menu-item-thumb" />
                      </button>
                    ) : (
                      <div className="menu-item-thumb menu-item-thumb-empty" />
                    )}
                    {item.name} ({item.course})
                  </li>
                );
              })}
          </ul>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          data-testid="custom-menu-drop-zone"
          style={{ minHeight: 128, borderRadius: 14, border: "2px dashed var(--line)", padding: 12 }}
        >
          <p className="lab-s" style={{ marginBottom: 8 }}>Your menu</p>
          {Array.from(selectedIds).length === 0 ? (
            <p style={{ color: "var(--faint)", fontSize: 13.5 }}>Drag dishes here.</p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
              {allItems
                .filter((item) => selectedIds.has(item.id))
                .map((item) => {
                  const photoUrl = getMenuItemPhotoUrl(item.photo_path);
                  return (
                    <li
                      key={item.id}
                      data-testid={`selected-item-${item.id}`}
                      className="fld"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderColor: "var(--gold)" }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {photoUrl ? (
                          <button
                            type="button"
                            onClick={() => setZoomed({ src: photoUrl, alt: item.name })}
                            aria-label={`Погледни фотографија на ${item.name}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoUrl} alt={item.name} className="menu-item-thumb" />
                          </button>
                        ) : (
                          <div className="menu-item-thumb menu-item-thumb-empty" />
                        )}
                        {item.name} ({item.course})
                      </span>
                      <button type="button" onClick={() => removeItem(item.id)} className="btn btn-ghost" style={{ padding: "4px 10px" }}>
                        Remove
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
      {Array.from(new Set(selected.map((item) => item.course)))
        .filter(courseHasMultipleItems)
        .map((course) => (
          <div key={course} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <p className="lab-s" style={{ margin: 0 }}>Guest counts for {course}</p>
            {selected
              .filter((item) => item.course === course)
              .map((item) => (
                <div key={item.id}>
                  <label htmlFor={`qty-${item.id}`} className="lab-s">Guest count for {item.name}</label>
                  <input
                    id={`qty-${item.id}`}
                    aria-label={`Guest count for ${item.name}`}
                    className="fld"
                    type="number"
                    min={1}
                    value={quantities[item.id] ?? ""}
                    placeholder="rest"
                    onChange={(e) =>
                      setQuantities((prev) => ({ ...prev, [item.id]: e.target.value ? Number(e.target.value) : null }))
                    }
                  />
                </div>
              ))}
            {guestCountEstimate !== null && explicitTotalForCourse(course) > guestCountEstimate ? (
              <p style={{ color: "var(--warn)", fontSize: 13.5, margin: 0 }}>
                These counts ({explicitTotalForCourse(course)}) already exceed the estimated guest count (
                {guestCountEstimate}) — you can still save.
              </p>
            ) : null}
            {blankCountForCourse(course) > 1 ? (
              <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>Only one item per course can be left blank.</p>
            ) : null}
          </div>
        ))}
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 8 }}>{error}</p> : null}
      <button type="button" onClick={handleSave} disabled={isSaving} className="btn btn-gold" style={{ marginTop: 12 }}>
        {isSaving ? "Saving..." : "Save custom menu"}
      </button>
      {saved ? <span style={{ marginLeft: 10, color: "var(--ok)", fontSize: 13.5 }}>Saved</span> : null}
      {zoomed ? <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </section>
  );
}
