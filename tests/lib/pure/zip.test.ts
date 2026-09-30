// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { planZipParts, zipStream, ZIP_PART_MAX_BYTES, ZIP_PART_MAX_FILES, type ZipEntry } from "@/lib/media/zip";

function entry(name: string, data: Uint8Array, chunk = 3): ZipEntry {
  return {
    name,
    size: data.length,
    open: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < data.length; i += chunk) controller.enqueue(data.subarray(i, i + chunk));
          controller.close();
        },
      }),
  };
}

async function writeZip(entries: ZipEntry[]): Promise<string> {
  const bytes = new Uint8Array(await new Response(zipStream(entries)).arrayBuffer());
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-")), "album.zip");
  fs.writeFileSync(file, bytes);
  return file;
}

describe("zipStream", () => {
  it("writes an archive that unzip verifies, with UTF-8 names and exact contents", async () => {
    const photo = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256));
    const note = new TextEncoder().encode("Честито!");
    const file = await writeZip([entry("фото.jpg", photo), entry("note.txt", note)]);

    expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors detected");
    // macOS's unzip ignores the UTF-8 name flag, so names are read with Python's zipfile.
    const names = execFileSync("python3", ["-c", "import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))", file]);
    expect(JSON.parse(names.toString())).toEqual(["фото.jpg", "note.txt"]);
    expect(new Uint8Array(execFileSync("unzip", ["-p", file, "*.jpg"]))).toEqual(photo);
    expect(execFileSync("unzip", ["-p", file, "note.txt"]).toString()).toBe("Честито!");
  });

  it("reads entries only as fast as the consumer pulls (no buffering of the whole album)", async () => {
    const opened: string[] = [];
    const lazy = (name: string): ZipEntry => ({ ...entry(name, new Uint8Array(10)), open: async () => { opened.push(name); return entry(name, new Uint8Array(10)).open(); } });
    const reader = zipStream([lazy("a.jpg"), lazy("b.jpg"), lazy("c.jpg")]).getReader();
    await reader.read();
    await new Promise((r) => setTimeout(r, 20));
    expect(opened).toEqual([]); // the first chunk is a's local header; nothing downloaded yet
    await reader.cancel();
  });

  it("writes a valid empty archive", async () => {
    const file = await writeZip([]);
    expect(fs.statSync(file).size).toBe(22); // end-of-central-directory record only
  });
});

describe("planZipParts", () => {
  it("starts a new part before the byte limit is exceeded", () => {
    expect(planZipParts([{ bytes: 10 }, { bytes: 10 }, { bytes: 10 }], 25, 400).map((p) => p.length)).toEqual([2, 1]);
  });

  it("starts a new part at the file limit", () => {
    expect(planZipParts([{ bytes: 1 }, { bytes: 1 }, { bytes: 1 }], 100, 2).map((p) => p.length)).toEqual([2, 1]);
  });

  it("puts a single file larger than the limit in its own part", () => {
    expect(planZipParts([{ bytes: 50 }, { bytes: 200 }, { bytes: 50 }], 100, 400).map((p) => p.length)).toEqual([1, 1, 1]);
  });

  it("defaults to parts a slow phone connection downloads within the 300 s function limit", () => {
    // ~200 MB at 10 Mbit/s ≈ 160 s: the stream runs as long as the client downloads.
    expect(ZIP_PART_MAX_BYTES).toBeLessThanOrEqual(200 * 1024 * 1024);
    expect(ZIP_PART_MAX_FILES).toBeLessThanOrEqual(150);
    expect(planZipParts(Array.from({ length: 200 }, () => ({ bytes: 1 }))).map((p) => p.length)).toEqual([150, 50]);
  });

  it("returns no parts for no files", () => {
    expect(planZipParts([], 100, 2)).toEqual([]);
  });
});
