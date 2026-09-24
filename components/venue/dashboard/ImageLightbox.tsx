"use client";

import { useEffect } from "react";

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-[85vh] w-[85vw] rounded-lg object-contain shadow-2xl"
      />
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-6 top-6 text-2xl text-white/80 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
