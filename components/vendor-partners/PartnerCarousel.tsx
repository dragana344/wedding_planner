"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PartnerCard } from "./PartnerCard";
import { ChevronIcon } from "./art";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

/** Past this many pages (one card per view on phones) a counter replaces the dots. */
const MAX_DOTS = 7;

/**
 * The directory's cards as a horizontal carousel: five per view on wide
 * screens (fewer as it narrows, set in CSS), arrows and dots to page through
 * the rest, and native swipe/scroll-snap on touch.
 */
export function PartnerCarousel({ partners, onOpen }: { partners: VendorPartner[]; onOpen: (partner: VendorPartner) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);

  /** Whole cards per view and the distance from one card to the next. */
  const geometry = useCallback(() => {
    const track = trackRef.current;
    const slides = track ? (Array.from(track.children) as HTMLElement[]) : [];
    if (!track || slides.length === 0 || slides[0].offsetWidth === 0) return null;
    const step = slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : slides[0].offsetWidth;
    const perView = Math.max(1, Math.floor((track.clientWidth + 4) / step));
    return { track, slides, step, perView };
  }, []);

  const measure = useCallback(() => {
    const g = geometry();
    if (!g) return;
    setPages(Math.ceil(g.slides.length / g.perView));
    setPage(Math.round(g.track.scrollLeft / (g.step * g.perView)));
  }, [geometry]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, partners.length]);

  function goTo(next: number) {
    const target = Math.min(Math.max(next, 0), pages - 1);
    setPage(target);
    const g = geometry();
    if (!g) return;
    const first = g.slides[Math.min(target * g.perView, g.slides.length - 1)];
    g.track.scrollTo?.({ left: first.offsetLeft - g.slides[0].offsetLeft, behavior: "smooth" });
  }

  return (
    <div className="pv-carousel">
      <div ref={trackRef} className="pv-carousel-track" onScroll={measure}>
        {partners.map((p) => (
          <div key={p.id} className="pv-carousel-slide">
            <PartnerCard partner={p} onOpen={onOpen} />
          </div>
        ))}
      </div>
      {pages > 1 ? (
        <div className="pv-carousel-nav">
          <button type="button" className="pv-carousel-arrow" onClick={() => goTo(page - 1)} disabled={page === 0} aria-label="Претходни">
            <ChevronIcon className="pv-carousel-prev" />
          </button>
          {pages <= MAX_DOTS ? (
            <div className="pv-carousel-dots">
              {Array.from({ length: pages }, (_, i) => (
                <button key={i} type="button" className={`pv-carousel-dot${i === page ? " on" : ""}`} onClick={() => goTo(i)} aria-label={`Страна ${i + 1}`} />
              ))}
            </div>
          ) : (
            <span className="pv-carousel-count">
              {page + 1} / {pages}
            </span>
          )}
          <button type="button" className="pv-carousel-arrow" onClick={() => goTo(page + 1)} disabled={page >= pages - 1} aria-label="Следни">
            <ChevronIcon className="pv-carousel-next" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
