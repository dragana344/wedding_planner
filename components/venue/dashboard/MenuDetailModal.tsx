"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { ImageLightbox } from "./ImageLightbox";
import { getMenuItemPhotoUrl } from "@/lib/venue/menus";

const COURSE_LABELS: Record<string, string> = {
  starter: "Предјадење",
  main: "Главно јадење",
  dessert: "Десерт",
  other: "Друго",
};

export interface MenuDetailItem {
  id: string;
  name: string;
  course: string;
  photo_path: string | null;
}

export function MenuDetailModal({
  title,
  items,
  onClose,
}: {
  title: string;
  items: MenuDetailItem[];
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => {
          const photoUrl = getMenuItemPhotoUrl(item.photo_path);
          return (
            <div key={item.id} className="menu-item-row" style={{ cursor: "default" }}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{item.name}</b>
                <span className="muted"> — {COURSE_LABELS[item.course] ?? item.course}</span>
              </div>
            </div>
          );
        })}
      </div>
      {zoomed ? <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </Modal>
  );
}
