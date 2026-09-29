// A streaming ZIP writer for "download all" (C3). Files are stored, not
// deflated: photos and videos are already compressed. Each entry's CRC is
// computed while its bytes stream through and written in a data descriptor
// after them, so nothing is buffered. No ZIP64: planZipParts keeps every
// archive well under 4 GB and 65 535 entries.
import { crc32 } from "zlib";

export type ZipEntry = {
  name: string;
  /** Expected size in bytes; the real size is what streams through. */
  size: number;
  open: () => Promise<ReadableStream<Uint8Array>>;
};

const FLAGS = 0x0808; // bit 3: sizes in data descriptor; bit 11: UTF-8 names
const VERSION = 20;
const MAX_OFFSET = 0xffffffff;

function header(size: number, fill: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size);
  fill(new DataView(bytes.buffer));
  return bytes;
}

function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

async function* zipChunks(entries: ZipEntry[], modified: Date): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(modified);
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const localOffset = offset;
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, VERSION, true);
      v.setUint16(6, FLAGS, true);
      v.setUint16(8, 0, true); // stored
      v.setUint16(10, stamp.time, true);
      v.setUint16(12, stamp.date, true);
      v.setUint16(26, name.length, true);
    });
    yield local;
    yield name;
    offset += local.length + name.length;

    let crc = 0;
    let size = 0;
    const reader = (await entry.open()).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        crc = crc32(value, crc);
        size += value.length;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
    offset += size;
    if (offset > MAX_OFFSET) throw new Error("ZIP archive too large; split it into parts.");

    const descriptor = header(16, (v) => {
      v.setUint32(0, 0x08074b50, true);
      v.setUint32(4, crc >>> 0, true);
      v.setUint32(8, size, true);
      v.setUint32(12, size, true);
    });
    yield descriptor;
    offset += descriptor.length;

    central.push(
      header(46, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, VERSION, true);
        v.setUint16(6, VERSION, true);
        v.setUint16(8, FLAGS, true);
        v.setUint16(10, 0, true);
        v.setUint16(12, stamp.time, true);
        v.setUint16(14, stamp.date, true);
        v.setUint32(16, crc >>> 0, true);
        v.setUint32(20, size, true);
        v.setUint32(24, size, true);
        v.setUint16(28, name.length, true);
        v.setUint32(42, localOffset, true);
      }),
      name,
    );
  }

  let directorySize = 0;
  for (const part of central) {
    yield part;
    directorySize += part.length;
  }
  yield header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, entries.length, true);
    v.setUint16(10, entries.length, true);
    v.setUint32(12, directorySize, true);
    v.setUint32(16, offset, true);
  });
}

/**
 * The archive as a byte stream. Pull-based: an entry is only opened (and its
 * file only downloaded) as fast as the client reads, so a large album never
 * sits in the function's memory.
 */
export function zipStream(entries: ZipEntry[], modified: Date = new Date()): ReadableStream<Uint8Array> {
  const chunks = zipChunks(entries, modified);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

export const ZIP_PART_MAX_BYTES = 1.5 * 1024 ** 3;
export const ZIP_PART_MAX_FILES = 400;

/**
 * Splits files, in order, into archives of at most `maxBytes` and `maxFiles`
 * each (a single larger file gets an archive of its own).
 */
export function planZipParts<T extends { bytes: number }>(
  items: T[],
  maxBytes: number = ZIP_PART_MAX_BYTES,
  maxFiles: number = ZIP_PART_MAX_FILES,
): T[][] {
  const parts: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;
  for (const item of items) {
    if (current.length > 0 && (currentBytes + item.bytes > maxBytes || current.length >= maxFiles)) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.bytes;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}
