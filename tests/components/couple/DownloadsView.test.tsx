import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DownloadsView } from "@/components/couple/DownloadsView";

// Group A task 7: the "Преземи сè" page.
const MB = 1024 ** 2;
// The part links carry the moment the page rendered, so the parts never shift between requests.
const PIN = "2027-07-01T10:00:00.000Z";

describe("DownloadsView", () => {
  it("links the book, the spreadsheets and every media part, with the end date in the read-only period", () => {
    render(<DownloadsView isWedding accessEnd="2027-12-12" media={{ before: PIN, parts: [196 * MB, 42 * MB], albumCount: 412, greetingVideoCount: 9, hasInvitationPhoto: true }} />);
    expect(screen.getByRole("link", { name: "Преземи ја книгата" })).toHaveAttribute("href", "/api/couple/download/book");
    expect(screen.getByRole("link", { name: "Преземи ги табелите" })).toHaveAttribute("href", "/api/couple/download/tables");
    expect(screen.getByRole("link", { name: "Дел 1 од 2 (196 MB)" })).toHaveAttribute("href", `/api/couple/download/media?part=1&before=${encodeURIComponent(PIN)}`);
    expect(screen.getByRole("link", { name: "Дел 2 од 2 (42 MB)" })).toHaveAttribute("href", `/api/couple/download/media?part=2&before=${encodeURIComponent(PIN)}`);
    expect(screen.getByText(/412 фотографии и видеа од гостите, 9 видео честитки, фотографијата од поканата/)).toBeInTheDocument();
    expect(screen.getByText("Пристапот трае до 12.12.2027")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Свадбена книга \(PDF\)/ })).toBeInTheDocument();
  });

  it("has no media links and no end date before the event, and names the book for other events", () => {
    render(<DownloadsView isWedding={false} accessEnd={null} media={{ before: PIN, parts: [], albumCount: 0, greetingVideoCount: 0, hasInvitationPhoto: false }} />);
    expect(screen.getByText("Сè уште нема фотографии ни видеа.")).toBeInTheDocument();
    expect(screen.queryByText(/Пристапот трае до/)).toBeNull();
    expect(screen.getByRole("heading", { name: /Спомен-книга \(PDF\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Дел|Преземи ги сите/ })).toBeNull();
  });
});
