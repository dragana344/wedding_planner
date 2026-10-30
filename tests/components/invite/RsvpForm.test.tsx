import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RsvpForm } from "@/components/invite/RsvpForm";

function mockFetch(ok = true, body: unknown = { ok: true }) {
  global.fetch = vi.fn().mockResolvedValue({ ok, json: async () => body });
}

function sentBody() {
  const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return JSON.parse(init.body);
}

describe("RsvpForm (A2-A5, A18)", () => {
  it("submits a yes with party size, children, allergies and comment", async () => {
    mockFetch();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Мила Милова" } });
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    fireEvent.change(screen.getByLabelText(/Број на лица/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/од кои деца/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Алергии/), { target: { value: "ореви" } });
    fireEvent.change(screen.getByLabelText(/Порака до младенците/), { target: { value: "Честито!" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/invite/abc123/rsvp", expect.objectContaining({ method: "POST" })));
    expect(sentBody()).toEqual({
      full_name: "Мила Милова",
      status: "confirmed",
      party_size: 3,
      children_count: 1,
      allergies: "ореви",
      comment: "Честито!",
    });
    expect(await screen.findByText(/Го забележавме вашето доаѓање/)).toBeInTheDocument();
  });

  it("asks nothing about the party for a no, but keeps the comment", async () => {
    mockFetch();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Петар Петровски" } });
    fireEvent.click(screen.getByRole("button", { name: "Нема да присуствувам" }));
    expect(screen.queryByLabelText(/Број на лица/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Порака до младенците/), { target: { value: "Жал ни е" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toEqual({ full_name: "Петар Петровски", status: "declined", comment: "Жал ни е" });
    expect(await screen.findByText(/Ви благодариме што нè известивте/)).toBeInTheDocument();
  });

  it("lets the guest answer later", async () => {
    mockFetch();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана" } });
    fireEvent.click(screen.getByRole("button", { name: "Ќе одговорам подоцна" }));
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toEqual({ full_name: "Ана", status: "later", comment: null });
    expect(await screen.findByText(/можете да одговорите подоцна/)).toBeInTheDocument();
  });

  it("requires choosing an answer before submitting", async () => {
    global.fetch = vi.fn();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана Петровска" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));

    expect(await screen.findByText("Изберете дали ќе присуствувате.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the server error message when the request fails", async () => {
    mockFetch(false, { error: "Поканата не е пронајдена." });
    render(<RsvpForm slug="bad-slug" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Некој" } });
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));

    expect(await screen.findByText("Поканата не е пронајдена.")).toBeInTheDocument();
  });
});

describe("RsvpForm on a personal link (A1, A2)", () => {
  const TOKEN = "Tok_en-24charsXXXXXXXXXX";
  const invitee = {
    fullName: "Петар Петровски",
    rsvpStatus: "invited",
    partySize: 2,
    childrenCount: 0,
    menuCounts: {},
    allergies: null,
    rsvpComment: null,
  };

  it("answers with the token instead of asking for a name", async () => {
    mockFetch();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" invitee={invitee} guestToken={TOKEN} />);

    expect(screen.queryByLabelText("Име и презиме")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    expect(screen.getByLabelText(/Број на лица/)).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ guest_token: TOKEN, status: "confirmed", party_size: 2 });
    expect(sentBody()).not.toHaveProperty("full_name");
  });

  it("shows an earlier answer and lets the guest change it, prefilled", async () => {
    mockFetch();
    const answered = { ...invitee, rsvpStatus: "confirmed", partySize: 3, childrenCount: 1, menuCounts: {}, rsvpComment: "Доаѓаме" };
    render(<RsvpForm slug="abc123" accentColor="#C9992F" invitee={answered} guestToken={TOKEN} />);

    expect(screen.getByText(/Ќе присуствувате/)).toBeInTheDocument();
    expect(screen.getByText(/3 лица/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Испрати одговор" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Промени го одговорот" }));
    expect(screen.getByRole("button", { name: "Ќе присуствувам" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Порака до младенците/)).toHaveValue("Доаѓаме");

    fireEvent.click(screen.getByRole("button", { name: "Нема да присуствувам" }));
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toEqual({ guest_token: TOKEN, status: "declined", comment: "Доаѓаме" });

    // After sending, the personal link can change the answer again.
    expect(await screen.findByRole("button", { name: "Промени го одговорот" })).toBeInTheDocument();
  });
});

describe("RsvpForm privacy notice (COMP-001 R1-03)", () => {
  it("tells the guest who sees the answer, who is responsible, and links the policy", () => {
    render(<RsvpForm slug="abc123" accentColor="#C9992F" coupleNames="Ана и Марко" venueName="Сала Лотос" />);
    expect(screen.getByText(/ги гледаат Ана и Марко/)).toBeInTheDocument();
    expect(screen.getByText(/локалот Сала Лотос/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Политиката за приватност" })).toHaveAttribute("href", "/privacy");
  });
});


describe("RsvpForm menus", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const menus = [
    { id: A, name: "Месо" },
    { id: B, name: "Посно" },
  ];

  it("asks no menu question with 0 or 1 menus", () => {
    for (const list of [[], [menus[0]]]) {
      const { unmount } = render(<RsvpForm slug="abc123" accentColor="#C9992F" menus={list} />);
      fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
      expect(screen.queryByText("Мени")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Месо")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("one number per menu with 2+, must add up to the party, zero entries not sent", async () => {
    mockFetch();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" menus={menus} />);
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Мила Милова" } });
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    fireEvent.change(screen.getByLabelText(/Број на лица/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Месо"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    expect(await screen.findByText("Изберете мени за сите 3 лица.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Месо"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Посно"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody().menu_counts).toEqual({ [A]: 3 });
    expect(await screen.findByText(/Го забележавме вашето доаѓање/)).toBeInTheDocument();
  });

  it("prefills from the guest's earlier counts", () => {
    const invitee = {
      fullName: "Петар", rsvpStatus: "confirmed", partySize: 3, childrenCount: 0,
      menuCounts: { [A]: 2, [B]: 1 }, allergies: null, rsvpComment: null,
    };
    render(<RsvpForm slug="abc123" accentColor="#C9992F" menus={menus} invitee={invitee} guestToken="Tok_en-24charsXXXXXXXXXX" />);
    expect(screen.getByText(/3 лица · Месо: 2, Посно: 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Промени го одговорот" }));
    expect(screen.getByLabelText("Месо")).toHaveValue(2);
    expect(screen.getByLabelText("Посно")).toHaveValue(1);
  });
});
