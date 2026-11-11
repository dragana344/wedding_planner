"use client";

import { useMemo, useState } from "react";
import { PartnerCard, CATEGORY_LABELS } from "./PartnerCard";
import { PartnerCarousel } from "./PartnerCarousel";
import { PartnerDetailModal } from "./PartnerDetailModal";
import { ChevronIcon, PinIcon, SearchIcon } from "./art";
import { VENDOR_PARTNER_CATEGORIES } from "@/lib/vendor-partners/categories";
import type { VendorPartner, VendorPartnerCategory } from "@/lib/vendor-partners/partners";
import "./partner-directory.css";

export function PartnerDirectory({
  partners,
  initialCategory = "",
  layout = "grid",
}: {
  partners: VendorPartner[];
  /** "carousel" pages through five at a time (the landing page). */
  layout?: "grid" | "carousel";
  /** Pre-selected category pill (the landing teaser's tiles open it filtered). */
  initialCategory?: VendorPartnerCategory | "";
}) {
  const [category, setCategory] = useState<VendorPartnerCategory | "">(initialCategory);
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<VendorPartner | null>(null);

  // Only categories someone actually offers get a pill.
  const categories = useMemo(() => VENDOR_PARTNER_CATEGORIES.filter((c) => partners.some((p) => p.category === c)), [partners]);
  const cities = useMemo(() => Array.from(new Set(partners.map((p) => p.city))).sort(), [partners]);

  const filtered = partners.filter((p) => {
    if (category && p.category !== category) return false;
    if (city && p.city !== city) return false;
    if (search && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  if (partners.length === 0) {
    return <p className="pv-empty">Нема соработници во моментов.</p>;
  }

  return (
    <div className="pv-directory">
      <div className="pv-filters">
        <div className="pv-cats" role="group" aria-label="Категорија">
          <button type="button" className="pv-pill" aria-pressed={category === ""} onClick={() => setCategory("")}>
            Сите
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className="pv-pill" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="pv-tools">
          <label className="pv-field">
            <SearchIcon className="pv-field-ic" />
            <input type="search" aria-label="Пребарај по име" placeholder="Пребарај по име" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="pv-field">
            <PinIcon className="pv-field-ic" />
            <select aria-label="Град" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Сите градови</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronIcon className="pv-field-caret" />
          </label>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="pv-empty">Нема резултати за избраните филтри.</p>
      ) : layout === "carousel" ? (
        <PartnerCarousel key={`${category}|${city}|${search}`} partners={filtered} onOpen={setOpen} />
      ) : (
        <div className="pv-grid">
          {filtered.map((p) => (
            <PartnerCard key={p.id} partner={p} onOpen={setOpen} />
          ))}
        </div>
      )}
      {open ? <PartnerDetailModal partner={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
