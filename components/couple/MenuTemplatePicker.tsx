"use client";

import { useState } from "react";
import { getMenuItemPhotoUrl, type MenuTemplate, type MenuItem } from "@/lib/venue/menus";
import type { MenuSelection, MenuItemQuantity } from "@/lib/couple/menu";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { ImageLightbox } from "@/components/venue/dashboard/ImageLightbox";

function quantityKey(templateId: string, menuItemId: string) {
  return `${templateId}:${menuItemId}`;
}

export function MenuTemplatePicker({
  templates,
  currentSelection,
  initialQuantities = [],
  guestCountEstimate = null,
}: {
  templates: (MenuTemplate & { items: MenuItem[] })[];
  currentSelection: MenuSelection;
  initialQuantities?: MenuItemQuantity[];
  guestCountEstimate?: number | null;
}) {
  const [selectedId, setSelectedId] = useState(currentSelection.mode === "template" ? currentSelection.menuTemplateId : null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keyed by `${templateId}:${menuItemId}`, not just menu item id — the same
  // physical menu item can appear in more than one template (many-to-many
  // via menu_template_items), so a plain item-id key would leak a value
  // typed while viewing one template into every other template that shares
  // that item.
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(
      templates.flatMap((template) =>
        template.items
          .filter((item) => initialQuantities.some((q) => q.menu_item_id === item.id))
          .map((item) => [
            quantityKey(template.id, item.id),
            initialQuantities.find((q) => q.menu_item_id === item.id)?.guest_count ?? null,
          ])
      )
    )
  );

  function courseHasMultipleItems(items: MenuItem[], course: string) {
    return items.filter((item) => item.course === course).length >= 2;
  }

  function explicitTotalForCourse(templateId: string, items: MenuItem[], course: string) {
    return items
      .filter((item) => item.course === course)
      .reduce((sum, item) => sum + (quantities[quantityKey(templateId, item.id)] ?? 0), 0);
  }

  function blankCountForCourse(templateId: string, items: MenuItem[], course: string) {
    return items.filter((item) => item.course === course && quantities[quantityKey(templateId, item.id)] == null).length;
  }

  async function handleSelect(templateId: string, items: MenuItem[]) {
    setError(null);

    const coursesWithMultiple = new Set(items.map((item) => item.course).filter((c) => courseHasMultipleItems(items, c)));
    if (Array.from(coursesWithMultiple).some((course) => blankCountForCourse(templateId, items, course) > 1)) {
      setError("Only one item per course can be left blank.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/couple/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "template", menu_template_id: templateId }),
      });
      if (!response.ok) throw new Error("Failed to select this menu.");
      await jsonOrThrow(
        await fetch("/api/couple/menu/quantities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantities: items.map((item) => ({
              menu_item_id: item.id,
              guest_count: quantities[quantityKey(templateId, item.id)] ?? null,
            })),
          }),
        })
      );
      setSelectedId(templateId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select this menu.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <h2 className="panel-t" style={{ marginBottom: 12 }}>Choose one of our menus</h2>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginBottom: 8 }}>{error}</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {templates.map((template) => (
          <div
            key={template.id}
            className="ev"
            style={{ borderColor: selectedId === template.id ? "var(--gold)" : undefined, borderWidth: selectedId === template.id ? 2 : 1 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontWeight: 700, margin: 0 }}>{template.name}</p>
              <button
                type="button"
                onClick={() => handleSelect(template.id, template.items)}
                disabled={isSaving || selectedId === template.id}
                className={selectedId === template.id ? "btn btn-ghost" : "btn btn-gold"}
              >
                {selectedId === template.id ? "Selected" : "Choose this menu"}
              </button>
            </div>
            <ul style={{ display: "flex", flexDirection: "column", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
              {template.items.map((item) => {
                const photoUrl = getMenuItemPhotoUrl(item.photo_path);
                return (
                  <li key={item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                    <span style={{ color: "var(--muted)", fontSize: 13.5 }}>
                      {item.name} ({item.course})
                    </span>
                  </li>
                );
              })}
            </ul>
            {Array.from(new Set(template.items.map((item) => item.course)))
              .filter((course) => courseHasMultipleItems(template.items, course))
              .map((course) => (
                <div key={course} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <p className="lab-s" style={{ margin: 0 }}>Guest counts for {course}</p>
                  {template.items
                    .filter((item) => item.course === course)
                    .map((item) => {
                      const key = quantityKey(template.id, item.id);
                      return (
                        <div key={item.id}>
                          <label htmlFor={`qty-${key}`} className="lab-s">Guest count for {item.name}</label>
                          <input
                            id={`qty-${key}`}
                            aria-label={`Guest count for ${item.name}`}
                            className="fld"
                            type="number"
                            min={1}
                            value={quantities[key] ?? ""}
                            placeholder="rest"
                            onChange={(e) =>
                              setQuantities((prev) => ({
                                ...prev,
                                [key]: e.target.value ? Number(e.target.value) : null,
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                  {guestCountEstimate !== null &&
                  explicitTotalForCourse(template.id, template.items, course) > guestCountEstimate ? (
                    <p style={{ color: "var(--warn)", fontSize: 13.5, margin: 0 }}>
                      These counts ({explicitTotalForCourse(template.id, template.items, course)}) already exceed the
                      estimated guest count ({guestCountEstimate}) — you can still save.
                    </p>
                  ) : null}
                  {blankCountForCourse(template.id, template.items, course) > 1 ? (
                    <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>Only one item per course can be left blank.</p>
                  ) : null}
                </div>
              ))}
          </div>
        ))}
      </div>
      {zoomed ? <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </section>
  );
}
