"use client";

import { useEffect } from "react";
import { Icon } from "@/components/venue/shell/Icon";

export function Modal({
  title,
  onClose,
  children,
  hideHeader = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** When the child content renders its own header (name + actions), skip
   * this component's default title/close row instead of showing both. */
  hideHeader?: boolean;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        {hideHeader ? null : (
          <div className="modal-head">
            <h2>{title}</h2>
            <button onClick={onClose} aria-label="Затвори" className="modal-close">
              <Icon name="x" size="sm" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
