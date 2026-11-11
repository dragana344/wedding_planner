"use client";

import { ArrowUpRightIcon, CategoryArt, PinIcon } from "./art";
import type { VendorPartner, VendorPartnerCategory } from "@/lib/vendor-partners/partners";
import { getVendorPartnerPhotoUrl } from "@/lib/vendor-partners/photo-url";

export const CATEGORY_LABELS: Record<VendorPartnerCategory, string> = {
  music: "Музички групи",
  decoration: "Декорација",
  catering: "Кетеринг",
  florist: "Цвеќари",
  jeweler: "Златари",
  equipment: "Опрема и уредување",
  photography: "Фотографи",
  cakes_desserts: "Торти и десерти",
  makeup_hair: "Шминка и фризура",
};

/**
 * One tile of the directory: cover (photo, or the category's artwork on its
 * own tint), category, name, city and a link into the profile. Contacts and
 * the description live in the profile (PartnerDetailModal), not on the tile.
 */
export function PartnerCard({ partner, onOpen }: { partner: VendorPartner; onOpen: (partner: VendorPartner) => void }) {
  const coverUrl = getVendorPartnerPhotoUrl(partner.cover_photo_path);

  return (
    <article className="pv-card">
      <div className={`pv-card-cover pv-cat-${partner.category}`}>
        {partner.is_featured ? <span className="pv-card-badge">Спонзорирано</span> : null}
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small, variably-sized cover photo from Supabase Storage.
          <img src={coverUrl} alt={partner.name} />
        ) : (
          <CategoryArt category={partner.category} className="pv-card-art" />
        )}
      </div>
      <div className="pv-card-body">
        <span className="pv-card-category">{CATEGORY_LABELS[partner.category]}</span>
        <h3 className="pv-card-name">{partner.name}</h3>
        <span className="pv-card-city">
          <PinIcon className="pv-pin" />
          {partner.city}
        </span>
        <button type="button" className="pv-card-open" onClick={() => onOpen(partner)}>
          Погледни профил
          <ArrowUpRightIcon className="pv-card-arrow" />
        </button>
      </div>
    </article>
  );
}
