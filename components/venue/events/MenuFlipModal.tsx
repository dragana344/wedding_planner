"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/venue/dashboard/Modal";
import { ImageLightbox } from "@/components/venue/dashboard/ImageLightbox";
import { MenuCardContent } from "@/components/venue/dashboard/MenuCardContent";
import { Icon } from "@/components/venue/shell/Icon";
import { formatPrice } from "@/lib/venue/menu-display";
import type { MenuTemplateWithItems } from "./EventWizardSteps";

/** Lets a venue manager flip through every available menu (prev/next, dot
 * pagination) while deciding what to serve — and pick the ones they want
 * for the event directly from the preview, without closing it. */
export function MenuFlipModal({
  templates,
  openIndex,
  selectedIds,
  onNavigate,
  onPick,
  onClose,
}: {
  templates: MenuTemplateWithItems[];
  openIndex: number;
  selectedIds: string[];
  onNavigate: (index: number) => void;
  onPick: (templateId: string) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const template = templates[openIndex];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && openIndex < templates.length - 1) onNavigate(openIndex + 1);
      if (e.key === "ArrowLeft" && openIndex > 0) onNavigate(openIndex - 1);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openIndex, templates.length, onNavigate]);

  if (!template) return null;

  const chosen = selectedIds.includes(template.id);
  const vegCount = template.items.filter((i) => i.is_vegetarian).length;
  const total = template.items.reduce((sum, i) => sum + (i.price ?? 0), 0);

  return (
    <Modal title={template.name} onClose={onClose} hideHeader>
      <div className="mp-flip-head">
        <button
          type="button"
          className="modal-close"
          onClick={() => onNavigate(openIndex - 1)}
          disabled={openIndex === 0}
          aria-label="Претходно мени"
        >
          <Icon name="left" size="sm" />
        </button>
        <div className="mp-flip-dots">
          {templates.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`mp-flip-dot${i === openIndex ? " on" : ""}`}
              onClick={() => onNavigate(i)}
              aria-label={`Мени ${i + 1}`}
            />
          ))}
          <span className="mp-flip-count">
            {openIndex + 1} / {templates.length}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="modal-close"
            onClick={() => onNavigate(openIndex + 1)}
            disabled={openIndex === templates.length - 1}
            aria-label="Следно мени"
          >
            <Icon name="right" size="sm" />
          </button>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Затвори">
            <Icon name="x" size="sm" />
          </button>
        </div>
      </div>

      <MenuCardContent
        title={template.name}
        description={template.description}
        items={template.items}
        onPhotoClick={(src, alt) => setZoomed({ src, alt })}
        footer={
          <p className="mp-flip-stats">
            {template.items.length} јадења · <Icon name="leaf" size="sm" style={{ display: "inline-block" }} /> {vegCount} вегетаријански
            · <span className="price">≈ {formatPrice(total)} по гостин</span>
          </p>
        }
      />

      <button type="button" className={`btn btn-gold mp-flip-pick${chosen ? " done" : ""}`} onClick={() => onPick(template.id)}>
        {chosen ? (
          <>
            <Icon name="tick" size="sm" /> Ова мени е избрано
          </>
        ) : (
          "Избери го ова мени"
        )}
      </button>

      {zoomed ? <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </Modal>
  );
}
