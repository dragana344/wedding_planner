"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import type { EventPhoto } from "@/lib/media/photos";
import type { StorageUsage } from "@/lib/media/limits";
import { StorageMeter } from "@/components/couple/StorageMeter";
import { formatDay as dayOf, formatTime as timeOf } from "@/lib/media/format";

const ALL = "";


function Preview({ photo, onClose }: { photo: EventPhoto; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="s4-preview" role="dialog" aria-modal="true" aria-label="Преглед на фотографија" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not optimisable */}
      <img src={photo.url} alt={`Фотографија од ${photo.uploaderName ?? "гостин"}`} onClick={(e) => e.stopPropagation()} />
      <div className="s4-preview-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          {photo.uploaderName ?? "Гостин"} · {dayOf(photo.createdAt)} {timeOf(photo.createdAt)}
        </span>
        <a className="btn btn-ghost" href={photo.url} download>
          Преземи
        </a>
        <button className="btn btn-gold" type="button" onClick={onClose} autoFocus>
          Затвори
        </button>
      </div>
    </div>
  );
}

/** The couple's album (C3, C10): browse, filter, preview, hide, delete, download. */
export function AlbumClient({
  initialPhotos,
  hasMore: initialHasMore,
  usage,
  zipParts,
  guestPath,
}: {
  initialPhotos: EventPhoto[];
  hasMore: boolean;
  usage: StorageUsage;
  zipParts: number;
  /** "/e/<token>"; the origin is added in the browser, like the invitation link. */
  guestPath: string;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [uploader, setUploader] = useState(ALL);
  const [day, setDay] = useState(ALL);
  const [preview, setPreview] = useState<EventPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [guestUrl, setGuestUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // After mount: window.location doesn't exist during SSR.
  useEffect(() => {
    const url = `${window.location.origin}${guestPath}`;
    setGuestUrl(url);
    QRCode.toDataURL(url, { margin: 1, width: 264 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [guestPath]);

  const uploaders = useMemo(
    () => Array.from(new Set(photos.map((p) => p.uploaderName ?? "Гостин"))).sort((a, b) => a.localeCompare(b, "mk")),
    [photos],
  );
  const days = useMemo(() => Array.from(new Set(photos.map((p) => dayOf(p.createdAt)))), [photos]);
  const visible = photos.filter(
    (p) => (uploader === ALL || (p.uploaderName ?? "Гостин") === uploader) && (day === ALL || dayOf(p.createdAt) === day),
  );

  async function setHidden(photo: EventPhoto, hidden: boolean) {
    setError(null);
    const res = await fetch(`/api/couple/album/photos/${photo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    if (!res.ok) return setError("Не успеа промената. Обидете се повторно.");
    setPhotos((list) => list.map((p) => (p.id === photo.id ? { ...p, hidden } : p)));
  }

  async function remove(photo: EventPhoto) {
    if (!window.confirm("Да се избрише оваа фотографија? Ова не може да се врати.")) return;
    setError(null);
    const res = await fetch(`/api/couple/album/photos/${photo.id}`, { method: "DELETE" });
    if (!res.ok) return setError("Не успеа бришењето. Обидете се повторно.");
    setPhotos((list) => list.filter((p) => p.id !== photo.id));
  }

  async function loadMore() {
    const oldest = photos[photos.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/couple/album/photos?before=${encodeURIComponent(oldest.createdAt)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { photos: EventPhoto[]; hasMore: boolean };
      setPhotos((list) => [...list, ...data.photos]);
      setHasMore(data.hasMore);
    } catch {
      setError("Не успеа вчитувањето. Обидете се повторно.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="s4-album">
      <div className="s4-album-top">
        <section className="s4-share" aria-labelledby="s4-share-title">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- inline data URL
            <img className="s4-qr" src={qrDataUrl} alt="QR код за гостите" width={132} height={132} />
          ) : (
            <span className="s4-qr" aria-hidden />
          )}
          <div>
            <h2 id="s4-share-title" className="s4-h2">Гостите прикачуваат тука</h2>
            <p className="s4-link">{guestUrl}</p>
            <div className="s4-actions">
              <button className="btn btn-ghost" type="button" onClick={() => void navigator.clipboard?.writeText(guestUrl)}>
                Копирај линк
              </button>
              <Link className="btn btn-gold" href="/couple/album/qr">
                Печати QR картички
              </Link>
            </div>
          </div>
        </section>
        <StorageMeter usage={usage} />
      </div>

      <div className="s4-toolbar">
        <label className="s4-filter">
          <span>Прикачил</span>
          <select className="fld" value={uploader} onChange={(e) => setUploader(e.target.value)}>
            <option value={ALL}>Сите</option>
            {uploaders.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="s4-filter">
          <span>Датум</span>
          <select className="fld" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value={ALL}>Сите</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="s4-downloads">
          {zipParts === 1 && (
            <a className="btn btn-gold" href="/api/couple/album/zip?part=1">
              Преземи ги сите
            </a>
          )}
          {zipParts > 1 &&
            Array.from({ length: zipParts }, (_, i) => (
              <a key={i} className="btn btn-gold" href={`/api/couple/album/zip?part=${i + 1}`}>
                Преземи ги сите (дел {i + 1} од {zipParts})
              </a>
            ))}
        </div>
      </div>

      {error && (
        <p className="s4-error" role="alert">
          {error}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="s4-empty">Сè уште нема фотографии. Споделете го QR кодот со гостите.</p>
      ) : (
        <ul className="s4-grid">
          {visible.map((p) => (
            <li key={p.id} className={`s4-photo${p.hidden ? " is-hidden" : ""}`} data-testid={`photo-${p.id}`}>
              <button className="s4-thumb" type="button" onClick={() => setPreview(p)} aria-label={`Отвори фотографија од ${p.uploaderName ?? "гостин"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not optimisable */}
                <img src={p.url} alt={`Фотографија од ${p.uploaderName ?? "гостин"}`} loading="lazy" decoding="async" />
              </button>
              <div className="s4-photo-meta">
                <span>{p.uploaderName ?? "Гостин"}</span>
                {p.hidden && <span className="badge">Скриена</span>}
              </div>
              <div className="s4-photo-actions">
                <button className="btn btn-ghost" type="button" onClick={() => void setHidden(p, !p.hidden)}>
                  {p.hidden ? "Прикажи" : "Скриј"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => void remove(p)}>
                  Избриши
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button className="btn btn-ghost s4-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? "Се вчитува…" : "Прикажи уште"}
        </button>
      )}

      {preview && <Preview photo={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
