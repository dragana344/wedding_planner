import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestAlbum } from "@/components/album/GuestAlbum";

// C1 / 0151: the guests' QR page, for the shared album only. Photos are
// compressed in the browser, videos go as they are; both are sent straight to
// Storage with a signed upload, then confirmed. Greetings moved to the
// invitation (tests/components/invite/InvitationGreeting.test.tsx).


const media = vi.hoisted(() => ({
  compressImage: vi.fn(async (file: File) => ({ blob: new Blob([file.name], { type: "image/jpeg" }), width: 100, height: 80 })),
  videoDuration: vi.fn(async () => 12),
}));
vi.mock("@/components/album/media-client", async (original) => ({
  ...(await original<typeof import("@/components/album/media-client")>()),
  compressImage: media.compressImage,
  videoDuration: media.videoDuration,
}));

const TOKEN = "t".repeat(24);
const storagePuts = (fetchMock: ReturnType<typeof okFetch>) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/storage/v1/object/upload/sign/") && init?.method === "PUT");
const PICK = "Изберете фотографии и видеа";
const photos = (n: number) => Array.from({ length: n }, (_, i) => new File([`photo-${i}`], `IMG_${i}.jpg`, { type: "image/jpeg" }));

function okFetch(overrides: Record<string, () => Response> = {}) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    for (const [suffix, make] of Object.entries(overrides)) if (url.endsWith(suffix)) return make();
    if (url.includes("/storage/v1/object/upload/sign/")) return Response.json({ Key: "x" });
    if (url.endsWith("/photos")) return Response.json({ path: `pending/e/${crypto.randomUUID()}`, token: "tok", bucket: "event-media-uploads" });
    if (url.endsWith("/videos")) return Response.json({ path: `pending/e/${crypto.randomUUID()}`, token: "tok", bucket: "event-media" });
    if (url.endsWith("/photos/confirm") || url.endsWith("/videos/confirm")) return Response.json({ id: crypto.randomUUID() });
    throw new Error(`unexpected ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    // storage may be unavailable
  }
});

describe("photo upload", () => {
  it("cannot pick photos until the guest consents", async () => {
    global.fetch = okFetch() as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    const input = screen.getByLabelText(PICK);
    expect(input).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Се согласувам фотографиите и видеата да бидат прикажани во албумот/));
    expect(input).toBeEnabled();
  });

  it("uploads every chosen photo and shows progress", async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.type(screen.getByLabelText("Вашето име (не е задолжително)"), "Тетка Роса");
    await userEvent.click(screen.getByLabelText(/Се согласувам/));
    await userEvent.upload(screen.getByLabelText(PICK), photos(3));

    await waitFor(() => expect(screen.getByText("3 / 3 прикачени")).toBeInTheDocument());
    const puts = storagePuts(fetchMock);
    expect(puts).toHaveLength(3);
    expect(puts[0][0]).toMatch(/\/storage\/v1\/object\/upload\/sign\/event-media-uploads\/pending\/e\/[0-9a-f-]+\?token=tok$/);
    expect(new Headers(puts[0][1]!.headers).get("content-type")).toBe("image/jpeg");
    const confirms = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/photos/confirm"));
    expect(confirms).toHaveLength(3);
    expect(JSON.parse(String((confirms[0][1] as RequestInit).body))).toMatchObject({ consent: true, uploader_name: "Тетка Роса", width: 100, height: 80 });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/e/${TOKEN}/photos`);
  });

  it("shows the server's message and stops when the album is full", async () => {
    const fetchMock = okFetch({
      "/photos": () => Response.json({ error: "Просторот за овој албум е полн. Парот може да активира поголем пакет." }, { status: 400 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.click(screen.getByLabelText(/Се согласувам/));
    await userEvent.upload(screen.getByLabelText(PICK), photos(2));
    expect(await screen.findByRole("alert")).toHaveTextContent("Просторот за овој албум е полн.");
    expect(storagePuts(fetchMock)).toHaveLength(0);
  });

  it("reports a photo the browser cannot read and carries on with the rest", async () => {
    const { PhotoProcessError } = await import("@/components/album/media-client");
    media.compressImage.mockRejectedValueOnce(new PhotoProcessError());
    global.fetch = okFetch() as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.click(screen.getByLabelText(/Се согласувам/));
    await userEvent.upload(screen.getByLabelText(PICK), photos(2));
    await waitFor(() => expect(screen.getByText("1 / 2 прикачени")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Оваа фотографија не може да се обработи");
  });
});

describe("videos (0151)", () => {
  const clip = (name = "clip.mp4") => new File(["v"], name, { type: "video/mp4" });

  it("uploads a video next to the photos and confirms it with the guest's name", async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} features={{ photos: true, videoSeconds: 60 }} />);
    expect(screen.getByText(/Видеата можат да бидат до 1 минута/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Вашето име (не е задолжително)"), "Ана");
    await userEvent.click(screen.getByLabelText(/Се согласувам/));
    await userEvent.upload(screen.getByLabelText(PICK), [clip(), ...photos(1)]);

    await waitFor(() => expect(screen.getByText("2 / 2 прикачени")).toBeInTheDocument());
    const start = fetchMock.mock.calls.find(([url]) => url === `/api/e/${TOKEN}/videos`)!;
    expect(JSON.parse(String((start[1] as RequestInit).body))).toEqual({ seconds: 12, bytes: 1 });
    const confirm = fetchMock.mock.calls.find(([url]) => url === `/api/e/${TOKEN}/videos/confirm`)!;
    expect(JSON.parse(String((confirm[1] as RequestInit).body))).toMatchObject({ consent: true, uploader_name: "Ана" });
    expect(JSON.parse(String((confirm[1] as RequestInit).body)).path).toMatch(/^pending\/e\//);
  });

  it("skips a video longer than the package allows and carries on with the rest", async () => {
    media.videoDuration.mockResolvedValueOnce(31);
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} features={{ photos: true, videoSeconds: 30 }} />);
    await userEvent.click(screen.getByLabelText(/Се согласувам/));
    await userEvent.upload(screen.getByLabelText(PICK), [clip(), ...photos(1)]);
    await waitFor(() => expect(screen.getByText("1 / 2 прикачени")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Видеото е подолго од 30 секунди.");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/videos"))).toBe(false);
  });

  it("has no length limit when the package sets none", async () => {
    media.videoDuration.mockResolvedValueOnce(600);
    global.fetch = okFetch() as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} features={{ photos: true, videoSeconds: null }} />);
    await userEvent.click(screen.getByLabelText(/Се согласувам/));
    await userEvent.upload(screen.getByLabelText(PICK), clip());
    await waitFor(() => expect(screen.getByText("1 / 1 прикачени")).toBeInTheDocument());
  });
});

describe("package features (admin spec §4.4)", () => {
  it("shows a friendly locked state instead of the upload form when the album is off", () => {
    render(<GuestAlbum token={TOKEN} features={{ photos: false, videoSeconds: 30 }} />);
    expect(screen.getByText(/Споделувањето фотографии не е вклучено за овој настан/)).toBeInTheDocument();
    expect(screen.queryByLabelText(PICK)).not.toBeInTheDocument();
  });

  it("offers photos only when the package allows no videos", () => {
    render(<GuestAlbum token={TOKEN} features={{ photos: true, videoSeconds: 0 }} />);
    expect(screen.getByLabelText("Изберете фотографии")).toHaveAttribute("accept", "image/*");
    expect(screen.queryByLabelText(PICK)).not.toBeInTheDocument();
  });

  it("no longer has a greeting form: greetings come with the invitation", () => {
    render(<GuestAlbum token={TOKEN} />);
    expect(screen.queryByRole("button", { name: "Испрати честитка" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(PICK)).toHaveAttribute("accept", "image/*,video/*");
  });
});
