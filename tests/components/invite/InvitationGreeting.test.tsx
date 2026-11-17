import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RsvpForm } from "@/components/invite/RsvpForm";
import type { Invitee } from "@/lib/couple/rsvp";

// 0151: greetings come back with the invitation. Once a guest has answered —
// yes, no or later — they can send the couple a message and a video. The
// shared link knows the guest through the ticket its RSVP answer returns; a
// personal link through its token.

const media = vi.hoisted(() => ({ videoDuration: vi.fn(async () => 12) }));
vi.mock("@/components/album/media-client", async (original) => ({
  ...(await original<typeof import("@/components/album/media-client")>()),
  videoDuration: media.videoDuration,
}));

const TOKEN = "g".repeat(24);
const GREETING = { enabled: true, videoSeconds: 30, sent: false };
const invitee: Invitee = { fullName: "Ана Петрова", rsvpStatus: "confirmed", partySize: 2, childrenCount: 0, menuCounts: {}, allergies: null, rsvpComment: null };

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
let fetchMock: FetchMock;
let rsvpGreeting = { ticket: "ticket-1", sent: false };

beforeEach(() => {
  vi.clearAllMocks();
  rsvpGreeting = { ticket: "ticket-1", sent: false };
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/rsvp")) return Response.json({ ok: true, greeting: rsvpGreeting });
    if (url.endsWith("/greetings/video")) return Response.json({ path: "pending/e/v1", token: "tok", bucket: "event-media" });
    if (url.includes("/storage/v1/object/upload/sign/")) return Response.json({ Key: "x" });
    if (url.endsWith("/greetings")) return Response.json({ id: "gr1" });
    throw new Error(`unexpected ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const bodyOf = (path: string) => {
  const call = fetchMock.mock.calls.filter(([url]) => url.endsWith(path)).at(-1)!;
  return JSON.parse(String(call[1]!.body));
};

async function answerOnSharedLink(name: string, answer: string) {
  fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: answer }));
  fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
}

describe("greeting after the RSVP (0151)", () => {
  it("shared link: offered only after answering — even a no — and sent with the RSVP's ticket", async () => {
    render(<RsvpForm slug="abc123" accentColor="#C9992F" coupleNames="Ана и Марко" greeting={GREETING} />);
    expect(screen.queryByRole("button", { name: "Испрати честитка" })).not.toBeInTheDocument();

    await answerOnSharedLink("Петар Петровски", "Нема да присуствувам");
    expect(await screen.findByText("Испратете честитка за Ана и Марко")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Порака"), { target: { value: "  Честито и среќен живот!  " } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати честитка" }));
    expect(await screen.findByText("Ви благодариме! Вашата честитка е испратена.")).toBeInTheDocument();
    expect(bodyOf("/greetings")).toEqual({ ticket: "ticket-1", message: "Честито и среќен живот!", video_path: null });
  });

  it("asks for a message before sending", async () => {
    render(<RsvpForm slug="abc123" accentColor="#C9992F" greeting={GREETING} />);
    await answerOnSharedLink("Ана", "Ќе одговорам подоцна");
    fireEvent.click(await screen.findByRole("button", { name: "Испрати честитка" }));
    expect(await screen.findByText("Напишете порака.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/greetings"))).toBe(false);
  });

  it("personal link: a guest who answered earlier gets the form right away and can add a video", async () => {
    render(<RsvpForm slug="abc123" accentColor="#C9992F" invitee={invitee} guestToken={TOKEN} greeting={GREETING} />);
    expect(screen.getByLabelText("Видео честитка (до 30 секунди, не е задолжително)")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Порака"), { target: { value: "Среќно!" } });
    fireEvent.change(screen.getByLabelText(/Видео честитка/), { target: { files: [new File(["v"], "clip.mp4", { type: "video/mp4" })] } });
    expect(await screen.findByText("Избрано видео: clip.mp4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Испрати честитка" }));

    expect(await screen.findByText("Ви благодариме! Вашата честитка е испратена.")).toBeInTheDocument();
    expect(bodyOf("/greetings/video")).toEqual({ guest_token: TOKEN, seconds: 12, bytes: 1 });
    expect(bodyOf("/greetings")).toEqual({ guest_token: TOKEN, message: "Среќно!", video_path: "pending/e/v1" });
  });

  it("refuses a video longer than the package allows", async () => {
    media.videoDuration.mockResolvedValueOnce(45);
    render(<RsvpForm slug="abc123" accentColor="#C9992F" invitee={invitee} guestToken={TOKEN} greeting={GREETING} />);
    fireEvent.change(screen.getByLabelText(/Видео честитка/), { target: { files: [new File(["v"], "clip.mp4", { type: "video/mp4" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Видеото е подолго од 30 секунди.");
  });

  it("no video field when the package allows none; no form at all without greetings", () => {
    const { unmount } = render(
      <RsvpForm slug="abc123" accentColor="#C9992F" invitee={invitee} guestToken={TOKEN} greeting={{ ...GREETING, videoSeconds: 0 }} />,
    );
    expect(screen.getByRole("button", { name: "Испрати честитка" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Видео честитка/)).not.toBeInTheDocument();
    unmount();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" invitee={invitee} guestToken={TOKEN} />);
    expect(screen.queryByRole("button", { name: "Испрати честитка" })).not.toBeInTheDocument();
  });

  it("one per guest: a guest who already sent one is thanked instead", async () => {
    const { unmount } = render(
      <RsvpForm slug="abc123" accentColor="#C9992F" invitee={invitee} guestToken={TOKEN} greeting={{ ...GREETING, sent: true }} />,
    );
    expect(screen.getByText("Ви благодариме! Вашата честитка е испратена.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Испрати честитка" })).not.toBeInTheDocument();
    unmount();

    // On the shared link the RSVP answer says whether that guest already sent one.
    rsvpGreeting = { ticket: "ticket-2", sent: true };
    render(<RsvpForm slug="abc123" accentColor="#C9992F" greeting={GREETING} />);
    await answerOnSharedLink("Ана Петрова", "Ќе присуствувам");
    expect(await screen.findByText("Ви благодариме! Вашата честитка е испратена.")).toBeInTheDocument();
  });

  it("answering for the next person on the shared link starts a fresh greeting for them", async () => {
    render(<RsvpForm slug="abc123" accentColor="#C9992F" greeting={GREETING} />);
    await answerOnSharedLink("Петар", "Нема да присуствувам");
    await screen.findByRole("button", { name: "Испрати честитка" });

    fireEvent.click(screen.getByRole("button", { name: "Одговори за друго лице" }));
    expect(screen.queryByRole("button", { name: "Испрати честитка" })).not.toBeInTheDocument();
    rsvpGreeting = { ticket: "ticket-marija", sent: false };
    await answerOnSharedLink("Марија", "Ќе одговорам подоцна");

    fireEvent.change(await screen.findByLabelText("Порака"), { target: { value: "Честито!" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати честитка" }));
    await waitFor(() => expect(bodyOf("/greetings")).toMatchObject({ ticket: "ticket-marija" }));
  });
});
