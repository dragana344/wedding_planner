import { describe, it, expect, vi, afterEach } from "vitest";
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

describe("RsvpForm greeting before answering (0152)", () => {
  const greeting = { enabled: true, videoSeconds: 30, sent: false };

  it("personal link: the greeting box shows immediately, before picking an answer", () => {
    render(
      <RsvpForm
        slug="abc123"
        accentColor="#C9992F"
        guestToken="Tok_en-24charsXXXXXXXXXX"
        invitee={{ fullName: "Петар", rsvpStatus: "invited", partySize: 1, childrenCount: 0, menuCounts: {}, allergies: null, rsvpComment: null }}
        greeting={greeting}
      />,
    );
    expect(screen.getByText(/Испратете честитка/)).toBeInTheDocument();
    // No answer was picked yet.
    expect(screen.queryByText(/Ви благодариме/)).not.toBeInTheDocument();
  });

  it("shared link: asks for a name first, then shows the greeting box with the ticket it gets back", async () => {
    render(<RsvpForm slug="abc123" accentColor="#C9992F" greeting={greeting} />);
    expect(screen.getByText(/Сакате да испратите честитка пред да одговорите/)).toBeInTheDocument();

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ticket: "a.b.c", sent: false }) });
    fireEvent.change(screen.getByLabelText("Вашето име"), { target: { value: "Марија Марковска" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжи" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/invite/abc123/greetings/identify",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ full_name: "Марија Марковска" }) }),
      ),
    );
    expect(await screen.findByText(/Испратете честитка/)).toBeInTheDocument();
    expect(screen.queryByText(/Сакате да испратите честитка пред да одговорите/)).not.toBeInTheDocument();
  });

  it("no greeting box at all when the package has it off, or nothing was passed", () => {
    const { rerender } = render(<RsvpForm slug="abc123" accentColor="#C9992F" greeting={{ enabled: false, videoSeconds: 0, sent: false }} />);
    expect(screen.queryByText(/честитка/)).not.toBeInTheDocument();
    rerender(<RsvpForm slug="abc123" accentColor="#C9992F" />);
    expect(screen.queryByText(/честитка/)).not.toBeInTheDocument();
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

  it("0181: a personal guest's summary names the children without a meal", () => {
    const invitee = {
      fullName: "Петар", rsvpStatus: "confirmed", partySize: 3, childrenCount: 1, noMealCount: 1,
      menuCounts: { [A]: 2 }, allergies: null, rsvpComment: null,
    };
    render(<RsvpForm slug="abc123" accentColor="#C9992F" menus={menus} invitee={invitee} guestToken="Tok_en-24charsXXXXXXXXXX" />);
    expect(screen.getByText(/Месо: 2, без оброк: 1/)).toBeInTheDocument();
    // The split adds up with the child, so the form doesn't ask for the menus again.
    expect(screen.queryByLabelText("Месо")).not.toBeInTheDocument();
  });

  it("0181: children without a meal count toward the split, never more than the children", async () => {
    mockFetch();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" menus={menus} />);
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Мила Милова" } });
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    fireEvent.change(screen.getByLabelText(/Број на лица/), { target: { value: "3" } });
    expect(screen.queryByLabelText(/Деца без оброк/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/од кои деца/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Деца без оброк/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    expect(await screen.findByText("Децата без оброк не можат да бидат повеќе од децата.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Деца без оброк/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Месо"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ party_size: 3, children_count: 1, menu_counts: { [A]: 2 }, no_meal_count: 1 });
    expect(await screen.findByText(/Го забележавме вашето доаѓање/)).toBeInTheDocument();
  });

  it("0181: with one menu the no-meal question still shows for children, and nothing else is asked", async () => {
    mockFetch();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" menus={[menus[0]]} />);
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Мила" } });
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    fireEvent.change(screen.getByLabelText(/Број на лица/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/од кои деца/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Деца без оброк/), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ party_size: 2, children_count: 1, no_meal_count: 1 });
    expect(sentBody().menu_counts).toBeUndefined();
  });
});

describe("RsvpForm 0179: remembered guest, phone, household names", () => {
  const KEY = "rsvp-remember:abc123";
  afterEach(() => window.localStorage.clear());

  it("shared link: sends an optional phone and the names of the people coming along", async () => {
    mockFetch(true, { ok: true, remember: "tok-1" });
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Мила Милова" } });
    fireEvent.change(screen.getByLabelText(/Телефон/), { target: { value: "070 111 222" } });
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    expect(screen.queryByText(/Имиња на лицата што доаѓаат со вас/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Број на лица/), { target: { value: "3" } });
    expect(screen.getByText("Имиња на лицата што доаѓаат со вас (не е задолжително)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Лице 2"), { target: { value: " Марко " } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ full_name: "Мила Милова", phone: "070 111 222", party_size: 3, household_names: ["Марко"] });
    // The answer was applied: this browser now remembers the guest.
    await screen.findByText(/Го забележавме вашето доаѓање/);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ token: "tok-1", name: "Мила Милова" });
  });

  it("refuses more children than people before sending", async () => {
    global.fetch = vi.fn();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана" } });
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    fireEvent.change(screen.getByLabelText(/Број на лица/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/од кои деца/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    expect(await screen.findByText("Децата не можат да бидат повеќе од бројот на лица.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("an answer waiting for the couple gets the same thank-you, and nothing is remembered", async () => {
    mockFetch(true, { ok: true });
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана" } });
    fireEvent.click(screen.getByRole("button", { name: "Нема да присуствувам" }));
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    expect(await screen.findByText(/Ви благодариме што нè известивте/)).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("greets a remembered guest by name, answers with the token, and 'Не сте вие?' forgets them", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ token: "tok-1", name: "Мила Милова" }));
    mockFetch(true, { ok: true, remember: "tok-2" });
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);
    expect(await screen.findByText("Здраво, Мила Милова!")).toBeInTheDocument();
    expect(screen.queryByLabelText("Име и презиме")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ќе одговорам подоцна" }));
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toEqual({ full_name: "Мила Милова", remember: "tok-1", status: "later", comment: null });
    await screen.findByText(/можете да одговорите подоцна/);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ token: "tok-2", name: "Мила Милова" });
  });

  it("'Не сте вие? Одговорете за друго лице' brings back the name field and clears the memory", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ token: "tok-1", name: "Мила Милова" }));
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);
    fireEvent.click(await screen.findByRole("button", { name: "Не сте вие? Одговорете за друго лице" }));
    expect(screen.getByLabelText("Име и презиме")).toHaveValue("");
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("a personal link ignores any remembered guest and prefills the household names", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ token: "tok-1", name: "Мила Милова" }));
    const invitee = {
      fullName: "Петар", rsvpStatus: "invited", partySize: 2, childrenCount: 0, menuCounts: {}, allergies: null, rsvpComment: null, householdNames: ["Ана"],
    };
    render(<RsvpForm slug="abc123" accentColor="#C9992F" invitee={invitee} guestToken="Tok_en-24charsXXXXXXXXXX" />);
    expect(screen.queryByText(/Здраво/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Телефон/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ќе присуствувам" }));
    expect(screen.getByLabelText("Лице 2")).toHaveValue("Ана");
  });
});

describe("RsvpForm 0180: deadline, invitation states, a moved date, a new menu", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const menus = [
    { id: A, name: "Месо" },
    { id: B, name: "Посно" },
  ];
  const token = "Tok_en-24charsXXXXXXXXXX";
  const yes = { fullName: "Петар", rsvpStatus: "confirmed", partySize: 2, childrenCount: 0, menuCounts: {}, allergies: null, rsvpComment: null };

  it("asks for an answer by the deadline while open", () => {
    render(<RsvpForm slug="abc123" accentColor="#C9992F" deadline="2027-05-28" />);
    expect(screen.getByText("Ве молиме одговорете до 28.05.2027")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Испрати одговор" })).toBeInTheDocument();
  });

  it("past the deadline: no form, the closed message, and a personal guest still sees their answer", () => {
    const { unmount } = render(<RsvpForm slug="abc123" accentColor="#C9992F" phase="closed" deadline="2027-05-28" />);
    expect(screen.getByText("Рокот за одговор помина. За промени јавете се на младенците.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Име и презиме")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Испрати одговор" })).not.toBeInTheDocument();
    unmount();

    render(<RsvpForm slug="abc123" accentColor="#C9992F" phase="closed" invitee={yes} guestToken={token} />);
    expect(screen.getByText(/Вашиот одговор: Ќе присуствувате · 2 лица/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Промени го одговорот" })).not.toBeInTheDocument();
  });

  it("after the event a thank-you; a cancelled event says so — neither has a form", () => {
    const { unmount } = render(<RsvpForm slug="abc123" accentColor="#C9992F" phase="after" invitee={yes} guestToken={token} />);
    expect(screen.getByText("Ви благодариме што бевте дел од нашиот ден!")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" phase="cancelled" />);
    expect(screen.getByText("Настанот е откажан.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("a moved date: the banner, and a yes confirms again with one tap (same answer, sent anew)", async () => {
    mockFetch();
    const onSaved = vi.fn();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" invitee={yes} guestToken={token} postponedTo="2027-09-04" reconfirm onSaved={onSaved} />);
    expect(screen.getByText("Датумот е променет на 04.09.2027 — потврдете дали доаѓате")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Потврдувам — доаѓам" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ guest_token: token, status: "confirmed", party_size: 2 });
    expect(await screen.findByText(/Го забележавме вашето доаѓање/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Потврдувам — доаѓам" })).not.toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith("confirmed");
  });

  it("a yes without a valid menu split (a second menu was added) opens on the menu question", async () => {
    mockFetch();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" menus={menus} invitee={{ ...yes, menuCounts: { [A]: 2, gone: 1 } }} guestToken={token} />);
    expect(screen.getByText("Изберете мени")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ќе присуствувам" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Месо"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Посно"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(sentBody().menu_counts).toEqual({ [A]: 1, [B]: 1 });
  });

  it("a yes whose menus add up is not asked again", () => {
    render(<RsvpForm slug="abc123" accentColor="#C9992F" menus={menus} invitee={{ ...yes, menuCounts: { [A]: 1, [B]: 1 } }} guestToken={token} />);
    expect(screen.queryByText("Изберете мени")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Промени го одговорот" })).toBeInTheDocument();
  });

  it("an answer waiting for the couple still offers a greeting, with the answer's ticket", async () => {
    mockFetch(true, { ok: true, greeting: { ticket: "a.ticket", sent: false } });
    render(<RsvpForm slug="abc123" accentColor="#C9992F" greeting={{ enabled: true, videoSeconds: 0, sent: false }} />);
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана" } });
    fireEvent.click(screen.getByRole("button", { name: "Нема да присуствувам" }));
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    expect(await screen.findByText(/Ви благодариме што нè известивте/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Порака/)).toBeInTheDocument();
  });

  it("shows the server's neutral message when the guest limit stopped the answer", async () => {
    mockFetch(false, { error: "Одговорот не можеше да се зачува. Ве молиме јавете се на младенците." });
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана" } });
    fireEvent.click(screen.getByRole("button", { name: "Нема да присуствувам" }));
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    expect(await screen.findByText("Одговорот не можеше да се зачува. Ве молиме јавете се на младенците.")).toBeInTheDocument();
  });
});
