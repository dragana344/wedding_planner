"use client";

import { useEffect, useRef } from "react";

// Open modals, innermost last: Escape closes only the topmost one.
const openModals: symbol[] = [];
import { Icon } from "@/components/venue/shell/Icon";

export function Modal({
  title,
  onClose,
  children,
  hideHeader = false,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** When the child content renders its own header (name + actions), skip
   * this component's default title/close row instead of showing both. */
  hideHeader?: boolean;
  /** Widens the panel for two-column content (e.g. the package editor). */
  wide?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const id = Symbol("modal");
    openModals.push(id);
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && openModals[openModals.length - 1] === id) onCloseRef.current();
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      const at = openModals.indexOf(id);
      if (at !== -1) openModals.splice(at, 1);
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-panel${wide ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
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
