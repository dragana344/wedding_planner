"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { ImageLightbox } from "./ImageLightbox";
import { MenuCardContent, type MenuDetailItem } from "./MenuCardContent";
import { Icon } from "@/components/venue/shell/Icon";

export type { MenuDetailItem } from "./MenuCardContent";

/** One menu's dishes; several are shown as separate titled cards. */
export interface MenuDetailGroup {
  id: string;
  title: string;
  items: MenuDetailItem[];
}

export function MenuDetailModal({
  title,
  items,
  groups,
  onClose,
}: {
  title: string;
  /** A single menu's dishes (titled `title`)… */
  items?: MenuDetailItem[];
  /** …or several menus, one card each. */
  groups?: MenuDetailGroup[];
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);

  return (
    <Modal title={title} onClose={onClose} hideHeader>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button type="button" onClick={onClose} aria-label="Затвори" className="modal-close">
          <Icon name="x" size="sm" />
        </button>
      </div>
      {(groups ?? [{ id: "menu", title, items: items ?? [] }]).map((group) => (
        <div key={group.id} style={{ marginBottom: 12 }}>
          <MenuCardContent title={group.title} items={group.items} onPhotoClick={(src, alt) => setZoomed({ src, alt })} />
        </div>
      ))}
      {zoomed ? <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </Modal>
  );
}
