"use client";

import { Icon } from "@/components/venue/shell/Icon";

export function PhotoDropzone({
  previewUrl,
  onFileSelected,
  isUploading,
  onViewClick,
}: {
  previewUrl: string | null;
  onFileSelected: (file: File) => void;
  isUploading?: boolean;
  /** When set, a small "view" button appears over an existing photo (e.g. to open a lightbox) without triggering the file picker. */
  onViewClick?: () => void;
}) {
  return (
    <label className="mp-dropzone">
      {previewUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" />
          {onViewClick ? (
            <button
              type="button"
              className="mp-dropzone-view"
              aria-label="Погледни фотографија"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onViewClick();
              }}
            >
              <Icon name="eye" size="sm" />
            </button>
          ) : null}
        </>
      ) : (
        <>
          <span className="mp-dropzone-ic">
            <Icon name="photo" size="md" />
          </span>
          <span className="mp-dropzone-label">{isUploading ? "Се прикачува..." : "Додај фотографија"}</span>
          <span className="mp-dropzone-hint">или довлечете слика</span>
        </>
      )}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />
    </label>
  );
}
