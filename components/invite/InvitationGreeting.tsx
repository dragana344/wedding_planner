"use client";

import { useState } from "react";
import { postJson, signedUpload, videoDuration } from "@/components/album/media-client";
import { MAX_VIDEO_BYTES, formatVideoLength, videoTooLongError } from "@/lib/media/limits";

const MESSAGE_MAX = 1000;
const SEND_FAILED = "Не успеа испраќањето на честитката. Обидете се повторно.";
const MESSAGE_REQUIRED = "Напишете порака.";
const VIDEO_TOO_LARGE = "Видеото е преголемо (најмногу 500 MB).";
const ALREADY_SENT = "Веќе испративте честитка. Ви благодариме!";

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-[16px]";
const labelClass = "mb-1 block text-sm text-neutral-600";

/**
 * 0151: the greeting a guest sends back with their RSVP, whatever they
 * answered. `sender` names the guest: their personal link's token, or the
 * ticket the RSVP just returned on the shared link. One per guest.
 */
export function InvitationGreeting({
  slug,
  accentColor,
  coupleNames,
  sender,
  videoSeconds,
  alreadySent,
}: {
  slug: string;
  accentColor: string;
  coupleNames?: string;
  sender: { guest_token: string } | { ticket: string };
  /** Longest video allowed: 0 = no video, null = no length limit. */
  videoSeconds: number | null;
  alreadySent: boolean;
}) {
  const [message, setMessage] = useState("");
  const [video, setVideo] = useState<{ file: File; seconds: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(alreadySent);

  if (sent) {
    return (
      <p className="mt-6 border-t pt-5 text-center font-medium text-neutral-800" style={{ borderColor: accentColor }} role="status">
        Ви благодариме! Вашата честитка е испратена.
      </p>
    );
  }

  async function pickVideo(file: File | undefined) {
    setError(null);
    setVideo(null);
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) return setError(VIDEO_TOO_LARGE);
    const measured = await videoDuration(file);
    const seconds = Number.isFinite(measured) ? measured : null;
    if (videoSeconds !== null && seconds !== null && seconds > videoSeconds) return setError(videoTooLongError(videoSeconds));
    setVideo({ file, seconds });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!message.trim()) return setError(MESSAGE_REQUIRED);
    setBusy(true);
    try {
      const videoPath = video ? await signedUpload(`/api/invite/${slug}/greetings/video`, video.file, { ...sender, seconds: video.seconds }) : null;
      await postJson(`/api/invite/${slug}/greetings`, { ...sender, message: message.trim(), video_path: videoPath }, SEND_FAILED);
      setSent(true);
    } catch (err) {
      const text = (err as Error).message || SEND_FAILED;
      if (text === ALREADY_SENT) setSent(true);
      else setError(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-4 border-t pt-5 text-left" style={{ borderColor: accentColor }}>
      <div className="text-center">
        <p className="font-medium text-neutral-800">Испратете честитка{coupleNames ? ` за ${coupleNames}` : ""}</p>
        <p className="mt-1 text-sm text-neutral-600">
          {videoSeconds === 0 ? "Напишете им порака." : "Напишете им порака, а ако сакате снимете и кратко видео."}
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="greeting-message">
          Порака
        </label>
        <textarea
          id="greeting-message"
          className={inputClass}
          value={message}
          maxLength={MESSAGE_MAX}
          rows={4}
          onChange={(e) => setMessage(e.target.value)}
        />
        <p className="mt-1 text-right text-xs text-neutral-500">
          {message.length} / {MESSAGE_MAX}
        </p>
      </div>

      {videoSeconds !== 0 ? (
        <div>
          <label className={labelClass} htmlFor="greeting-video">
            Видео честитка ({videoSeconds === null ? "не е задолжително" : `до ${formatVideoLength(videoSeconds)}, не е задолжително`})
          </label>
          <input id="greeting-video" className={inputClass} type="file" accept="video/*" onChange={(e) => void pickVideo(e.target.files?.[0])} />
          {video ? <p className="mt-1 text-sm text-neutral-600">Избрано видео: {video.file.name}</p> : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-full rounded-lg px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        style={{ background: accentColor }}
      >
        {busy ? "Се испраќа…" : "Испрати честитка"}
      </button>
    </form>
  );
}
