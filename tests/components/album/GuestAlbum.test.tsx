import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestAlbum } from "@/components/album/GuestAlbum";

// C1/C2/C7: the guests' QR page. Photos are compressed in the browser, sent
// straight to Storage with a signed upload, then confirmed; greetings need a
// first and last name.


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
const photos = (n: number) => Array.from({ length: n }, (_, i) => new File([`photo-${i}`], `IMG_${i}.jpg`, { type: "image/jpeg" }));

function okFetch(overrides: Record<string, () => Response> = {}) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    for (const [suffix, make] of Object.entries(overrides)) if (url.endsWith(suffix)) return make();
    if (url.includes("/storage/v1/object/upload/sign/")) return Response.json({ Key: "x" });
    if (url.endsWith("/photos")) return Response.json({ path: `pending/e/${crypto.randomUUID()}`, token: "tok", bucket: "event-media-uploads" });
    if (url.endsWith("/greetings/video")) return Response.json({ path: `pending/e/${crypto.randomUUID()}`, token: "tok", bucket: "event-media" });
    if (url.endsWith("/photos/confirm")) return Response.json({ id: crypto.randomUUID() });
    if (url.endsWith("/greetings")) return Response.json({ id: "g1" });
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
    const input = screen.getByLabelText("Изберете фотографии");
    expect(input).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Се согласувам фотографијата да биде прикажана во свадбениот албум/));
    expect(input).toBeEnabled();
  });

  it("uploads every chosen photo and shows progress", async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.type(screen.getByLabelText("Вашето име (не е задолжително)"), "Тетка Роса");
    await userEvent.click(screen.getByLabelText(/Се согласувам/));
    await userEvent.upload(screen.getByLabelText("Изберете фотографии"), photos(3));

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
    await userEvent.upload(screen.getByLabelText("Изберете фотографии"), photos(2));
    expect(await screen.findByRole("alert")).toHaveTextContent("Просторот за овој албум е полн.");
    expect(storagePuts(fetchMock)).toHaveLength(0);
  });

  it("reports a photo the browser cannot read and carries on with the rest", async () => {
    const { PhotoProcessError } = await import("@/components/album/media-client");
    media.compressImage.mockRejectedValueOnce(new PhotoProcessError());
    global.fetch = okFetch() as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.click(screen.getByLabelText(/Се согласувам/));
    await userEvent.upload(screen.getByLabelText("Изберете фотографии"), photos(2));
    await waitFor(() => expect(screen.getByText("1 / 2 прикачени")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Оваа фотографија не може да се обработи");
  });
});

describe("greeting", () => {
  it("requires a first and a last name before sending", async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.type(screen.getByLabelText("Име"), "Ана");
    await userEvent.type(screen.getByLabelText("Порака"), "Честито!");
    await userEvent.click(screen.getByRole("button", { name: "Испрати честитка" }));
    expect(await screen.findByText("Внесете име и презиме.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the greeting and thanks the guest", async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.type(screen.getByLabelText("Име"), "Ана");
    await userEvent.type(screen.getByLabelText("Презиме"), "Петрова");
    await userEvent.type(screen.getByLabelText("Порака"), "Честито!");
    await userEvent.click(screen.getByRole("button", { name: "Испрати честитка" }));
    expect(await screen.findByText("Ви благодариме! Честитката е испратена.")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe(`/api/e/${TOKEN}/greetings`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ first_name: "Ана", last_name: "Петрова", message: "Честито!", video_path: null });
  });

  it("refuses a video longer than 30 seconds", async () => {
    media.videoDuration.mockResolvedValueOnce(31);
    global.fetch = okFetch() as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.upload(screen.getByLabelText("Видео честитка (до 30 секунди)"), new File(["v"], "clip.mp4", { type: "video/mp4" }));
    expect(await screen.findByText("Видеото е подолго од 30 секунди.")).toBeInTheDocument();
  });

  it("uploads the video and sends its path with the greeting", async () => {
    const fetchMock = okFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<GuestAlbum token={TOKEN} />);
    await userEvent.type(screen.getByLabelText("Име"), "Марко");
    await userEvent.type(screen.getByLabelText("Презиме"), "Марков");
    await userEvent.type(screen.getByLabelText("Порака"), "Среќно!");
    await userEvent.upload(screen.getByLabelText("Видео честитка (до 30 секунди)"), new File(["v"], "clip.mp4", { type: "video/mp4" }));
    await userEvent.click(screen.getByRole("button", { name: "Испрати честитка" }));
    expect(await screen.findByText("Ви благодариме! Честитката е испратена.")).toBeInTheDocument();
    expect(storagePuts(fetchMock)).toHaveLength(1);
    const body = JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body));
    expect(body.video_path).toMatch(/^pending\/e\//);
  });
});

describe("package features (admin spec §4.4)", () => {
  it("shows a friendly locked state instead of the upload form when the album is off", () => {
    render(<GuestAlbum token={TOKEN} features={{ photos: false, greetings: true, video: true }} />);
    expect(screen.getByText(/Споделувањето фотографии не е вклучено за овој настан/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Изберете фотографии")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Остави честитка" })).toBeInTheDocument();
  });

  it("hides the greeting section when greetings are off, and the video field when videos are off", () => {
    const { unmount } = render(<GuestAlbum token={TOKEN} features={{ photos: true, greetings: false, video: true }} />);
    expect(screen.queryByRole("heading", { name: "Остави честитка" })).not.toBeInTheDocument();
    unmount();
    render(<GuestAlbum token={TOKEN} features={{ photos: true, greetings: true, video: false }} />);
    expect(screen.getByRole("heading", { name: "Остави честитка" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Видео честитка (до 30 секунди)")).not.toBeInTheDocument();
  });
});
