"use client";

import { useEffect, useState } from "react";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from "@/lib/media/limits";
import { PhotoProcessError, compressImage, putSignedUpload, videoDuration } from "@/components/album/media-client";

const BUCKET = "event-media";
const PARALLEL_UPLOADS = 3;
const NAME_KEY = "album-uploader-name";
const MESSAGE_MAX = 1000;

const UPLOAD_FAILED = "Не успеа прикачувањето. Обидете се повторно.";
const NAME_REQUIRED = "Внесете име и презиме.";
const MESSAGE_REQUIRED = "Напишете порака.";
const VIDEO_TOO_LONG = "Видеото е подолго од 30 секунди.";
const VIDEO_TOO_LARGE = "Видеото е преголемо (најмногу 100 MB).";

function readSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // private mode: the name just isn't remembered
  }
}

/** POST JSON; returns the body or throws the server's message. */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : UPLOAD_FAILED);
  return data as T;
}

/** Upload a blob through a signed URL from `startUrl`; returns the pending path. */
async function signedUpload(startUrl: string, blob: Blob): Promise<string> {
  const { path, token } = await post<{ path: string; token: string }>(startUrl, { bytes: blob.size });
  try {
    await putSignedUpload(BUCKET, path, token, blob);
  } catch {
    throw new Error(UPLOAD_FAILED);
  }
  return path;
}

function PhotoUpload({ token }: { token: string }) {
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After mount, so the server-rendered and first client render agree.
  useEffect(() => setName(readSavedName()), []);

  async function uploadAll(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    saveName(name.trim());
    let done = 0;
    let stopped = false;
    setProgress({ done, total: files.length });

    const queue = [...files];
    const worker = async () => {
      while (!stopped && queue.length) {
        const file = queue.shift()!;
        try {
          const photo = await compressImage(file);
          const path = await signedUpload(`/api/e/${token}/photos`, photo.blob);
          await post(`/api/e/${token}/photos/confirm`, {
            path,
            consent: true,
            uploader_name: name.trim() || null,
            width: photo.width,
            height: photo.height,
          });
          done += 1;
          setProgress({ done, total: files.length });
        } catch (err) {
          setError((err as Error).message || UPLOAD_FAILED);
          // A photo the browser can't read only skips that photo; a refusal from
          // the server (full album, rate limit) stops the rest too.
          if (!(err instanceof PhotoProcessError)) stopped = true;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, files.length) }, worker));
    setBusy(false);
  }

  return (
    <section className="ga-card" aria-labelledby="ga-photos-title">
      <h2 id="ga-photos-title" className="ga-h2">Прикачи фотографии</h2>
      <p className="ga-note">Споделете ги вашите фотографии од славењето. Може да изберете повеќе одеднаш.</p>

      <label className="ga-label" htmlFor="ga-name">Вашето име (не е задолжително)</label>
      <input id="ga-name" className="ga-input" value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />

      <label className="ga-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Се согласувам фотографијата да биде прикажана во свадбениот албум</span>
      </label>

      <label className={`ga-button${!consent || busy ? " is-disabled" : ""}`} htmlFor="ga-files">
        {busy ? "Се прикачува…" : "Изберете фотографии"}
      </label>
      <input
        id="ga-files"
        className="ga-file"
        type="file"
        accept="image/*"
        multiple
        disabled={!consent || busy}
        aria-label="Изберете фотографии"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void uploadAll(files);
        }}
      />

      {progress && (
        <p className="ga-progress" aria-live="polite">
          {progress.done} / {progress.total} прикачени
        </p>
      )}
      {error && (
        <p className="ga-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function GreetingForm({ token }: { token: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [message, setMessage] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function pickVideo(file: File | undefined) {
    setError(null);
    setVideo(null);
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) return setError(VIDEO_TOO_LARGE);
    const seconds = await videoDuration(file);
    if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS) return setError(VIDEO_TOO_LONG);
    setVideo(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return setError(NAME_REQUIRED);
    if (!message.trim()) return setError(MESSAGE_REQUIRED);
    setBusy(true);
    try {
      const videoPath = video ? await signedUpload(`/api/e/${token}/greetings/video`, video) : null;
      await post(`/api/e/${token}/greetings`, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        message: message.trim(),
        video_path: videoPath,
      });
      setSent(true);
      setFirstName("");
      setLastName("");
      setMessage("");
      setVideo(null);
    } catch (err) {
      setError((err as Error).message || UPLOAD_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ga-card" aria-labelledby="ga-greeting-title">
      <h2 id="ga-greeting-title" className="ga-h2">Остави честитка</h2>
      {sent && (
        <p className="ga-success" aria-live="polite">
          Ви благодариме! Честитката е испратена.
        </p>
      )}
      <form onSubmit={submit} noValidate>
        <div className="ga-row">
          <div>
            <label className="ga-label" htmlFor="ga-first">Име</label>
            <input id="ga-first" className="ga-input" value={firstName} maxLength={60} autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="ga-label" htmlFor="ga-last">Презиме</label>
            <input id="ga-last" className="ga-input" value={lastName} maxLength={60} autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <label className="ga-label" htmlFor="ga-message">Порака</label>
        <textarea
          id="ga-message"
          className="ga-input ga-textarea"
          value={message}
          maxLength={MESSAGE_MAX}
          rows={5}
          aria-describedby="ga-message-count"
          onChange={(e) => setMessage(e.target.value)}
        />
        <p id="ga-message-count" className="ga-count">
          {message.length} / {MESSAGE_MAX}
        </p>

        <label className="ga-label" htmlFor="ga-video">Видео честитка (до 30 секунди)</label>
        <input
          id="ga-video"
          className="ga-input"
          type="file"
          accept="video/*"
          capture="user"
          onChange={(e) => void pickVideo(e.target.files?.[0])}
        />
        {video && <p className="ga-note">Избрано видео: {video.name}</p>}

        {error && (
          <p className="ga-error" role="alert">
            {error}
          </p>
        )}
        <button className="ga-button" type="submit" disabled={busy}>
          {busy ? "Се испраќа…" : "Испрати честитка"}
        </button>
      </form>
    </section>
  );
}

/** The guests' QR page body: photo upload and greeting (C1, C2, C7). */
export function GuestAlbum({ token }: { token: string }) {
  return (
    <div className="ga-stack">
      <PhotoUpload token={token} />
      <GreetingForm token={token} />
    </div>
  );
}
