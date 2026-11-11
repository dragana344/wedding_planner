"use client";

import { useRef, useState } from "react";
import { PartnerDirectory } from "@/components/vendor-partners/PartnerDirectory";
import { CATEGORY_LABELS } from "@/components/vendor-partners/PartnerCard";
import { ArrowRightIcon, ArrowUpRightIcon, CategoryArt, SparkleIcon } from "@/components/vendor-partners/art";
import type { VendorPartner, VendorPartnerCategory } from "@/lib/vendor-partners/partners";

/** Tiles shown when there is no clear top three yet. */
const FALLBACK_TILES: VendorPartnerCategory[] = ["music", "photography", "decoration"];

/** The three most-offered categories, topped up from the fallback list. */
function tileCategories(vendors: VendorPartner[]): VendorPartnerCategory[] {
  const counts = new Map<VendorPartnerCategory, number>();
  for (const v of vendors) counts.set(v.category, (counts.get(v.category) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return [...new Set([...top, ...FALLBACK_TILES])].slice(0, 3);
}

/**
 * Landing teaser for the vendor directory: a short pitch with three category
 * tiles in the logo's colours. The button (or a tile) unfolds the full,
 * filterable directory underneath.
 */
export function VendorPartnersSection({ vendors }: { vendors: VendorPartner[] }) {
  const [open, setOpen] = useState<{ category: VendorPartnerCategory | "" } | null>(null);
  const directoryRef = useRef<HTMLDivElement>(null);

  if (vendors.length === 0) return null;
  const tiles = tileCategories(vendors);

  function openDirectory(category: VendorPartnerCategory | "") {
    setOpen({ category });
    requestAnimationFrame(() => directoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <section id="partners" className="band" aria-label="Соработници за вашиот настан">
      <div className="wrap">
        <div className="vps">
          <div className="vps-main">
            <div className="vps-copy">
              <p className="vps-eyebrow">
                <SparkleIcon className="vps-eyebrow-star" />
                Сѐ за вашиот настан
              </p>
              <h2 className="vps-title">
                Вистинските луѓе за <em>посебните моменти.</em>
              </h2>
              <p className="vps-lead">Од музика до декорации — пронајдете ги услугите што ќе го направат вашиот настан незаборавен.</p>
              <button type="button" className="btn btn-red vps-cta" aria-expanded={open !== null} onClick={() => openDirectory("")}>
                Разгледај ги сите услуги
                <ArrowRightIcon className="vps-cta-arrow" />
              </button>
              <a className="vps-advertise" href="#contact">
                Огласи го твојот бизнис <ArrowUpRightIcon className="vps-advertise-arrow" />
              </a>
            </div>
            <div className="vps-tiles">
              {tiles.map((category) => (
                <button key={category} type="button" className={`vps-tile pv-cat-${category}`} onClick={() => openDirectory(category)}>
                  <CategoryArt category={category} className="vps-tile-art" />
                  <span className="vps-tile-label">
                    {CATEGORY_LABELS[category]}
                    <ArrowUpRightIcon className="vps-tile-arrow" />
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="vps-foot">
            <span className="vps-foot-brand">КАДЕСИ · Повеќе од организација</span>
            <span>Сите услуги, на едно место.</span>
          </div>
        </div>
        {open ? (
          <div ref={directoryRef} className="vps-directory">
            <PartnerDirectory key={open.category} partners={vendors} initialCategory={open.category} layout="carousel" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
