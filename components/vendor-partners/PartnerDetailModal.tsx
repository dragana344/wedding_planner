"use client";

import { useEffect, useRef, useState } from "react";
import { ImageLightbox } from "@/components/venue/dashboard/ImageLightbox";
import { internationalPhone } from "@/lib/couple/invite-share";
import type { VendorPartner } from "@/lib/vendor-partners/partners";
import { getVendorPartnerPhotoUrl } from "@/lib/vendor-partners/photo-url";
import { CATEGORY_LABELS } from "./PartnerCard";
import {
  CategoryArt,
  ChatIcon,
  CloseIcon,
  FacebookIcon,
  GlobeIcon,
  InstagramIcon,
  PhoneIcon,
  PinIcon,
  SparkleIcon,
} from "./art";

type Contact = { key: string; label: string; href: string; external: boolean; icon: React.ReactNode };

function contactsOf(partner: VendorPartner): Contact[] {
  const whatsappIntl = internationalPhone(partner.whatsapp_phone);
  const all: (Contact | null)[] = [
    partner.phone ? { key: "phone", label: `Јави се · ${partner.phone}`, href: `tel:${partner.phone}`, external: false, icon: <PhoneIcon className="pv-btn-ic" /> } : null,
    whatsappIntl ? { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/${whatsappIntl}`, external: true, icon: <ChatIcon className="pv-btn-ic" /> } : null,
    partner.viber_phone ? { key: "viber", label: "Viber", href: "viber://forward", external: true, icon: <ChatIcon className="pv-btn-ic" /> } : null,
    partner.website_url ? { key: "web", label: "Веб-страница", href: partner.website_url, external: true, icon: <GlobeIcon className="pv-btn-ic" /> } : null,
    partner.instagram_url ? { key: "instagram", label: "Instagram", href: partner.instagram_url, external: true, icon: <InstagramIcon className="pv-btn-ic" /> } : null,
    partner.facebook_url ? { key: "facebook", label: "Facebook", href: partner.facebook_url, external: true, icon: <FacebookIcon className="pv-btn-ic" /> } : null,
  ];
  return all.filter((c) => c !== null);
}

/**
 * A partner's full profile as a panel over the whole page (fixed overlay):
 * photo slider, about, gallery and contact buttons. Own styles
 * rather than the venue panel's <Modal>, because it also opens on the landing
 * page (as a smaller version), where the panel's styles aren't loaded.
 * Rendered in place, not portalled, so the landing's re-accenting
 * (.lp .vps-directory) reaches it.
 */
export function PartnerDetailModal({ partner, onClose }: { partner: VendorPartner; onClose: () => void }) {
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const [slide, setSlide] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  const galleryUrls = partner.gallery_photo_paths.map((p) => getVendorPartnerPhotoUrl(p)).filter((u): u is string => !!u);
  const coverUrl = getVendorPartnerPhotoUrl(partner.cover_photo_path);
  const slides = [...new Set([...(coverUrl ? [coverUrl] : []), ...galleryUrls])];
  const contacts = contactsOf(partner);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    // While a photo is zoomed, Escape belongs to the lightbox.
    if (zoomed) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [zoomed, onClose]);

  return (
    <>
      <div className="pv-modal-backdrop" onClick={onClose}>
        <div className="pv-modal" role="dialog" aria-modal="true" aria-labelledby="pv-modal-title" onClick={(e) => e.stopPropagation()}>
          <div className={`pv-modal-hero pv-card-cover pv-cat-${partner.category}`}>
            {slides.length > 0 ? (
              <button type="button" className="pv-modal-hero-img" onClick={() => setZoomed({ src: slides[slide], alt: `${partner.name} ${slide + 1}` })} aria-label="Зголеми ја фотографијата">
                {/* eslint-disable-next-line @next/next/no-img-element -- variably-sized photos from Supabase Storage. */}
                <img src={slides[slide]} alt="" />
              </button>
            ) : (
              <CategoryArt category={partner.category} className="pv-card-art" />
            )}
            <span className="pv-modal-chip">
              <CategoryArt category={partner.category} className="pv-modal-chip-ic" />
              {CATEGORY_LABELS[partner.category]}
            </span>
            <button ref={closeRef} type="button" className="pv-modal-close" onClick={onClose} aria-label="Затвори">
              <CloseIcon className="pv-modal-close-ic" />
            </button>
            {slides.length > 1 ? (
              <div className="pv-modal-dots">
                {slides.map((url, i) => (
                  <button key={url} type="button" className={`pv-modal-dot${i === slide ? " on" : ""}`} onClick={() => setSlide(i)} aria-label={`Фотографија ${i + 1}`} />
                ))}
              </div>
            ) : null}
          </div>

          <div className="pv-modal-body">
            <div className="pv-modal-kicker">
              <span className="pv-card-category">{CATEGORY_LABELS[partner.category]}</span>
              {partner.is_featured ? (
                <span className="pv-modal-featured">
                  <SparkleIcon className="pv-modal-featured-ic" />
                  Истакнат партнер
                </span>
              ) : null}
            </div>
            <h2 id="pv-modal-title" className="pv-modal-title">
              {partner.name}
            </h2>
            <span className="pv-modal-city">
              <PinIcon className="pv-pin" />
              {partner.city}
            </span>

            <section className="pv-modal-sec">
              <h3>За нас</h3>
              <p className="pv-detail-desc">{partner.full_description || partner.short_description}</p>
            </section>

            <section className="pv-modal-sec pv-modal-sec-plain">
              <h3>Галерија</h3>
              {galleryUrls.length > 0 ? (
                <div className="pv-gallery">
                  {galleryUrls.map((url, i) => (
                    <button key={url} type="button" className="pv-gallery-thumb" onClick={() => setZoomed({ src: url, alt: `${partner.name} ${i + 1}` })}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- variably-sized gallery thumbnails from Supabase Storage. */}
                      <img src={url} alt={`${partner.name} ${i + 1}`} />
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="pv-gallery" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`pv-gallery-thumb pv-gallery-empty pv-card-cover pv-cat-${partner.category}`}>
                        <CategoryArt category={partner.category} className="pv-card-art" />
                      </div>
                    ))}
                  </div>
                  <p className="pv-modal-note pv-gallery-note">Партнерот сè уште нема додадено фотографии.</p>
                </>
              )}
            </section>

            {contacts.length > 0 ? (
              <section className="pv-modal-sec">
                <h3>Контактирајте нè</h3>
                <div className="pv-modal-contacts">
                  {contacts.map((c, i) => (
                    <a
                      key={c.key}
                      className={`pv-btn${i === 0 ? " pv-btn-primary" : ""}`}
                      href={c.href}
                      {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {c.icon}
                      {c.label}
                    </a>
                  ))}
                </div>
                <p className="pv-modal-note">Контактирајте го бизнисот директно за информации и понуда.</p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
      {zoomed ? <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </>
  );
}
