import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlbumClient } from "@/components/couple/AlbumClient";
import type { EventPhoto } from "@/lib/media/photos";

// C3/C10: the couple's album — browse, filter, preview, hide, delete, download.

const photo = (id: string, uploaderName: string | null, createdAt: string, hidden = false): EventPhoto => ({
  id, url: `https://storage.test/${id}.jpg`, width: 800, height: 600, uploaderName, hidden, createdAt, bytes: 1000,
});

// Newest first, as the server lists them.
const PHOTOS = [
  photo("p3", "Тетка Роса", "2027-06-13T01:00:00Z"),
  photo("p2", "Вујко Ацо", "2027-06-12T21:00:00Z"),
  photo("p1", "Тетка Роса", "2027-06-12T20:00:00Z"),
];
const USAGE = { limitBytes: 5 * 1024 ** 3, photoBytes: 3000, videoBytes: 0 };

function renderAlbum(props: Partial<Parameters<typeof AlbumClient>[0]> = {}) {
  return render(
    <AlbumClient initialPhotos={PHOTOS} hasMore={false} usage={USAGE} zipParts={1} guestPath="/e/abc" {...props} />,
  );
}

beforeEach(() => {
  global.fetch = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;
});

describe("AlbumClient", () => {
  it("shows every photo and filters by who uploaded it", async () => {
    renderAlbum();
    expect(screen.getAllByRole("img", { name: /Фотографија од/ })).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText("Прикачил"), "Тетка Роса");
    expect(screen.getAllByRole("img", { name: /Фотографија од/ })).toHaveLength(2);
  });

  it("hides a photo and marks it as hidden", async () => {
    renderAlbum();
    const card = screen.getByTestId("photo-p2");
    await userEvent.click(within(card).getByRole("button", { name: "Скриј" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/couple/album/photos/p2", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ hidden: true }) }));
    await waitFor(() => expect(within(card).getByText("Скриена")).toBeInTheDocument());
    expect(within(card).getByRole("button", { name: "Прикажи" })).toBeInTheDocument();
  });

  it("deletes a photo after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAlbum();
    await userEvent.click(within(screen.getByTestId("photo-p1")).getByRole("button", { name: "Избриши" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/couple/album/photos/p1", expect.objectContaining({ method: "DELETE" }));
    await waitFor(() => expect(screen.queryByTestId("photo-p1")).not.toBeInTheDocument());
  });

  it("keeps the photo when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderAlbum();
    await userEvent.click(within(screen.getByTestId("photo-p1")).getByRole("button", { name: "Избриши" }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("photo-p1")).toBeInTheDocument();
  });

  it("opens a preview and closes it with Escape", async () => {
    renderAlbum();
    await userEvent.click(screen.getByRole("button", { name: "Отвори фотографија од Вујко Ацо" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers the download in parts when the album is large", () => {
    renderAlbum({ zipParts: 2 });
    expect(screen.getByRole("link", { name: "Преземи ги сите (дел 1 од 2)" })).toHaveAttribute("href", "/api/couple/album/zip?part=1");
    expect(screen.getByRole("link", { name: "Преземи ги сите (дел 2 од 2)" })).toHaveAttribute("href", "/api/couple/album/zip?part=2");
  });

  it("offers a single download for a small album and none for an empty one", () => {
    const { unmount } = renderAlbum();
    expect(screen.getByRole("link", { name: "Преземи ги сите" })).toHaveAttribute("href", "/api/couple/album/zip?part=1");
    unmount();
    renderAlbum({ initialPhotos: [], zipParts: 0 });
    expect(screen.queryByRole("link", { name: /Преземи ги сите/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Сè уште нема фотографии/)).toBeInTheDocument();
  });

  it("shows the guests' link and QR code with the way to print cards", async () => {
    renderAlbum();
    expect(screen.getByText(`${window.location.origin}/e/abc`)).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "QR код за гостите" })).toHaveAttribute("src", expect.stringMatching(/^data:image\/png/));
    expect(screen.getByRole("link", { name: "Печати QR картички" })).toHaveAttribute("href", "/couple/album/qr");
  });

  it("loads older photos", async () => {
    global.fetch = vi.fn(async () => Response.json({ photos: [photo("p0", null, "2027-06-12T19:00:00Z")], hasMore: false })) as unknown as typeof fetch;
    renderAlbum({ hasMore: true });
    await userEvent.click(screen.getByRole("button", { name: "Прикажи уште" }));
    await waitFor(() => expect(screen.getByTestId("photo-p0")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(`/api/couple/album/photos?before=${encodeURIComponent("2027-06-12T20:00:00Z")}`);
    expect(screen.queryByRole("button", { name: "Прикажи уште" })).not.toBeInTheDocument();
  });
});
