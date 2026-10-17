"use client";

import { useState } from "react";
import { Cormorant_Garamond } from "next/font/google";
import { getMenuItemPhotoUrl, type MenuTemplate, type MenuItem } from "@/lib/venue/menus";
import type { MenuSelection, MenuItemQuantity } from "@/lib/couple/menu";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { ImageLightbox } from "@/components/venue/dashboard/ImageLightbox";
import { formatMkDate } from "@/lib/date";
import "@/components/couple/InvitationCard.css";
import "./MenuPicker.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "400" });

const COURSE_LABELS: Record<MenuItem["course"], string> = {
  starter: "предјадење",
  main: "главно јадење",
  dessert: "десерт",
  other: "друго",
};
const COURSE_ORDER: MenuItem["course"][] = ["starter", "main", "dessert", "other"];
const FILTERS: { value: "all" | MenuItem["course"]; label: string }[] = [
  { value: "all", label: "Сите" },
  { value: "starter", label: "Предјадење" },
  { value: "main", label: "Главно јадење" },
  { value: "dessert", label: "Десерт" },
  { value: "other", label: "Друго" },
];

function dedupeById(items: MenuItem[]): MenuItem[] {
  const seen = new Set<string>();
  const out: MenuItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** The current pick equals some template's full item set exactly — saved as
 * that template (mode: "template") rather than "custom", so the venue side
 * keeps showing the template's name (EventsClient, EventEditForm, reports,
 * invitations all read menu_template_id) instead of losing it to a flat
 * "custom" label just because this picker merges both into one UI. */
function matchingTemplateId(selectedIds: Set<string>, templates: (MenuTemplate & { items: MenuItem[] })[]): string | null {
  for (const template of templates) {
    const ids = template.items.map((item) => item.id);
    if (ids.length === selectedIds.size && ids.every((id) => selectedIds.has(id))) return template.id;
  }
  return null;
}

export function MenuPicker({
  templates,
  specialItems,
  currentSelection,
  initialQuantities = [],
  guestCountEstimate = null,
  coupleNames,
  eventDate,
}: {
  templates: (MenuTemplate & { items: MenuItem[] })[];
  specialItems: MenuItem[];
  currentSelection: MenuSelection;
  initialQuantities?: MenuItemQuantity[];
  guestCountEstimate?: number | null;
  coupleNames: string;
  eventDate: string;
}) {
  const allItems = dedupeById([...specialItems, ...templates.flatMap((t) => t.items)]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (currentSelection.mode === "template") {
      const template = templates.find((t) => t.id === currentSelection.menuTemplateId);
      return new Set(template ? template.items.map((item) => item.id) : []);
    }
    if (currentSelection.mode === "custom") return new Set(currentSelection.menuItemIds);
    return new Set();
  });
  const [quantities, setQuantities] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(initialQuantities.map((q) => [q.menu_item_id, q.guest_count])),
  );
  const [filter, setFilter] = useState<"all" | MenuItem["course"]>("all");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);

  const selected = allItems.filter((item) => selectedIds.has(item.id));
  const visibleFilters = FILTERS.filter((f) => f.value === "all" || allItems.some((item) => item.course === f.value));
  const visibleItems = allItems.filter((item) => filter === "all" || item.course === filter);

  function courseHasMultipleItems(course: string) {
    return selected.filter((item) => item.course === course).length >= 2;
  }
  function explicitTotalForCourse(course: string) {
    return selected.filter((item) => item.course === course).reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);
  }
  function blankCountForCourse(course: string) {
    return selected.filter((item) => item.course === course && quantities[item.id] == null).length;
  }

  function toggleItem(itemId: string) {
    setSaved(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    setQuantities((prev) => (itemId in prev ? prev : { ...prev, [itemId]: null }));
  }

  function applyTemplate(template: MenuTemplate & { items: MenuItem[] }) {
    setSaved(false);
    setSelectedIds(new Set(template.items.map((item) => item.id)));
    setQuantities((prev) => {
      const next = { ...prev };
      for (const item of template.items) if (!(item.id in next)) next[item.id] = null;
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    setSaved(false);

    if (selectedIds.size === 0) {
      setError("Изберете барем едно јадење.");
      return;
    }
    const coursesWithMultiple = new Set(selected.map((item) => item.course).filter(courseHasMultipleItems));
    if (Array.from(coursesWithMultiple).some((course) => blankCountForCourse(course) > 1)) {
      setError("Поправете ги бројките на гости подолу пред да зачувате.");
      return;
    }

    setIsSaving(true);
    try {
      const templateId = matchingTemplateId(selectedIds, templates);
      const body = templateId
        ? { mode: "template" as const, menu_template_id: templateId }
        : { mode: "custom" as const, menu_item_ids: Array.from(selectedIds) };
      const response = await fetch("/api/couple/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Не успеа зачувувањето на менито.");
      await jsonOrThrow(
        await fetch("/api/couple/menu/quantities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantities: selected.map((item) => ({ menu_item_id: item.id, guest_count: quantities[item.id] ?? null })),
          }),
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на менито.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      {templates.length > 0 ? (
        <>
          <p className="lab-s" style={{ marginBottom: 10 }}>
            Готови менија
          </p>
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-3" style={{ marginBottom: 20 }}>
            {templates.map((template) => (
              <button key={template.id} type="button" onClick={() => applyTemplate(template)} className="panel couple-card menu-template-card">
                <p className={`menu-template-card-name ${cormorant.className}`}>{template.name}</p>
                <p className="menu-template-card-sub">
                  {template.items.length} {template.items.length === 1 ? "јадење" : "јадења"} · {template.items.map((item) => item.name).join(", ")}
                </p>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2" style={{ alignItems: "start" }}>
        <div className="panel couple-card">
          <div className="panel-h">
            <h2 className="panel-t">Јадења</h2>
          </div>
          <div style={{ padding: "12px 14px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {visibleFilters.map((f) => (
              <button key={f.value} type="button" onClick={() => setFilter(f.value)} className={`menu-filter-pill${filter === f.value ? " on" : ""}`}>
                {f.label}
              </button>
            ))}
          </div>
          <ul style={{ display: "flex", flexDirection: "column", padding: "12px 0 4px", margin: 0, listStyle: "none" }}>
            {visibleItems.map((item) => {
              const photoUrl = getMenuItemPhotoUrl(item.photo_path);
              const isSelected = selectedIds.has(item.id);
              return (
                <li key={item.id} className="menu-item-row">
                  {photoUrl ? (
                    <button type="button" onClick={() => setZoomed({ src: photoUrl, alt: item.name })} aria-label={`Погледни фотографија на ${item.name}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl} alt={item.name} className="menu-item-thumb" />
                    </button>
                  ) : (
                    <div className="menu-item-thumb menu-item-thumb-empty" />
                  )}
                  <span style={{ flex: 1 }}>
                    <span className="menu-item-row-name">{item.name}</span>
                    <span className="menu-item-row-course">{COURSE_LABELS[item.course]}</span>
                  </span>
                  <button type="button" onClick={() => toggleItem(item.id)} className={isSelected ? "btn btn-ghost menu-item-added" : "btn-gold-outline"}>
                    {isSelected ? "✓ Во менито" : "+ Додај"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="panel couple-card invite-card">
          <div className="invite-frame">
            <h2 className={`invite-title ${cormorant.className}`}>Мени</h2>
            <p className="invite-sub">
              {coupleNames} · {formatMkDate(eventDate)}
            </p>
            <div className="invite-divider">
              <span className="invite-diamond" />
            </div>
            {selected.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13.5, textAlign: "center" }}>Сè уште нема избрани јадења.</p>
            ) : (
              COURSE_ORDER.filter((course) => selected.some((item) => item.course === course)).map((course) => (
                <div key={course} style={{ marginBottom: 14 }}>
                  <p className="menu-preview-course">{COURSE_LABELS[course]}</p>
                  {selected
                    .filter((item) => item.course === course)
                    .map((item) => (
                      <div key={item.id} style={{ marginBottom: 6 }}>
                        <p className={`menu-preview-item ${cormorant.className}`}>{item.name}</p>
                        {courseHasMultipleItems(course) ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <label htmlFor={`qty-${item.id}`} className="lab-s" style={{ margin: 0 }}>
                              Број на гости
                            </label>
                            <input
                              id={`qty-${item.id}`}
                              aria-label={`Број на гости за ${item.name}`}
                              className="fld"
                              type="number"
                              min={1}
                              style={{ width: 90 }}
                              value={quantities[item.id] ?? ""}
                              placeholder="останато"
                              onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value ? Number(e.target.value) : null }))}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  {guestCountEstimate !== null && explicitTotalForCourse(course) > guestCountEstimate ? (
                    <p style={{ color: "var(--warn)", fontSize: 12.5, margin: 0, textAlign: "center" }}>
                      Овие бројки ({explicitTotalForCourse(course)}) веќе го надминуваат проценетиот број на гости ({guestCountEstimate}).
                    </p>
                  ) : null}
                  {blankCountForCourse(course) > 1 ? (
                    <p style={{ color: "var(--bad)", fontSize: 12.5, margin: 0, textAlign: "center" }}>
                      Само едно јадење по категорија може да остане без бројка.
                    </p>
                  ) : null}
                </div>
              ))
            )}
            {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginBottom: 8, textAlign: "center" }}>{error}</p> : null}
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <button type="button" onClick={handleSave} disabled={isSaving} className="btn btn-gold" style={{ padding: "10px 28px" }}>
                {isSaving ? "Се зачувува..." : "Зачувај мени"}
              </button>
              {saved ? <p style={{ color: "var(--ok)", fontSize: 13.5, margin: "8px 0 0" }}>Зачувано</p> : null}
            </div>
          </div>
        </div>
      </div>
      {zoomed ? <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </section>
  );
}
