// File names for the couple's "Преземи сè" downloads (group A task 7). Pure,
// so the album ZIP route, the keepsake routes and the tests share them.
import { formatTime } from "@/lib/media/format";

/** Characters Windows, macOS or a ZIP tool refuse or misread in a file name. */
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

/**
 * A guest-typed name as a file name: Cyrillic kept, path and reserved
 * characters dropped, at most 80 characters, `fallback` when nothing is left.
 */
export function safeFileName(name: string | null | undefined, fallback: string): string {
  const words = (name ?? "").normalize("NFC").replace(UNSAFE, " ").split(/\s+/).filter((w) => w && !/^\.+$/.test(w));
  const clean = words.join(" ").replace(/^\.+/, "").slice(0, 80).trim();
  return clean || fallback;
}

/**
 * Makes each "base.ext" unique in the order given: the second "Ана Петрова.mp4"
 * becomes "Ана Петрова (2).mp4". Compared case-insensitively, like the file
 * systems the archive is unpacked on.
 */
export function uniqueFileNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

/** An album file inside the ZIP: "001-Тетка-Роса-1432.jpg" (number, who shared it, time). */
export function albumEntryName(file: { path: string; uploaderName: string | null; createdAt: string }, index: number): string {
  const who = (file.uploaderName ?? "").normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "gostin";
  const extension = file.path.slice(file.path.lastIndexOf(".") + 1);
  return `${String(index + 1).padStart(3, "0")}-${who}-${formatTime(file.createdAt).replace(":", "")}.${extension}`;
}

/**
 * `content-disposition` for a download: an ASCII `filename` for old clients
 * plus the real (Cyrillic) name as RFC 5987 `filename*`.
 */
export function attachmentDisposition(fileName: string, asciiFallback: string): string {
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encoded}`;
}
