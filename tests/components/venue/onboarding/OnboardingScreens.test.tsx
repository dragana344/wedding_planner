import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth: { signOut: vi.fn() } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/venue" }));

import { FirstLoginPassword } from "@/components/venue/onboarding/FirstLoginPassword";
import { TermsAcceptance } from "@/components/venue/onboarding/TermsAcceptance";

// Both screens leave with a hard `window.location.href` assignment; jsdom's
// location can't be reassigned, so a stand-in records it.
let locationHref = "";
const fetchMock = vi.fn();
beforeEach(() => {
  locationHref = "";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      pathname: "/venue/events",
      search: "?x=1",
      get href() {
        return locationHref;
      },
      set href(value: string) {
        locationHref = value;
      },
    },
  });
});

function reply(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("FirstLoginPassword", () => {
  function fill(password: string, repeat = password) {
    fireEvent.change(screen.getByLabelText("Нова лозинка"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("Повторете ја лозинката"), { target: { value: repeat } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај лозинка" }));
  }

  it("saves the new password and reloads the panel", async () => {
    reply(200, { ok: true });
    render(<FirstLoginPassword />);
    fill("моја-нова-лозинка");
    await waitFor(() => expect(locationHref).toBe("/venue"));
    expect(fetchMock).toHaveBeenCalledWith("/api/venue/first-login", expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "моја-нова-лозинка" }) }));
  });

  it("checks the length and the repeat before sending", async () => {
    render(<FirstLoginPassword />);
    fill("кратка");
    expect(await screen.findByRole("alert")).toHaveTextContent("најмалку 10 знаци");
    fill("моја-нова-лозинка", "друга-лозинка-12");
    expect(await screen.findByRole("alert")).toHaveTextContent("Лозинките не се совпаѓаат.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's message", async () => {
    reply(400, { error: "Новата лозинка мора да е различна од старата." });
    render(<FirstLoginPassword />);
    fill("моја-нова-лозинка");
    expect(await screen.findByRole("alert")).toHaveTextContent("Новата лозинка мора да е различна од старата.");
    expect(locationHref).toBe("");
  });
});

describe("TermsAcceptance", () => {
  function accept() {
    fireEvent.change(screen.getByLabelText("Лозинка на сопственикот"), { target: { value: "сопственик-1" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Прифаќам" }));
  }

  it("links the three documents and needs the checkbox", () => {
    render(<TermsAcceptance venueName="Сала" ownerName="Марија" />);
    expect(screen.getByRole("heading", { name: "Услови за користење" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Услови за користење" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Политика за приватност" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Договор за обработка на податоци" })).toHaveAttribute("href", "/dpa");
    expect(screen.getByText(/Ако не сте сопственикот \(Марија\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Прифаќам" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Прифаќам" })).toBeEnabled();
  });

  it("starts the onboarding tour after a new venue's first acceptance", async () => {
    reply(200, { ok: true, startTour: true });
    render(<TermsAcceptance venueName="Сала" ownerName="Марија" />);
    accept();
    await waitFor(() => expect(locationHref).toBe("/venue?tour=1"));
    expect(fetchMock).toHaveBeenCalledWith("/api/venue/terms", expect.objectContaining({ body: JSON.stringify({ password: "сопственик-1", accepted: true }) }));
  });

  it("reloads the current page when it's a re-acceptance", async () => {
    reply(200, { ok: true, startTour: false });
    render(<TermsAcceptance venueName="Сала" ownerName="Марија" />);
    accept();
    await waitFor(() => expect(locationHref).toBe("/venue/events?x=1"));
  });

  it("shows a wrong owner password", async () => {
    reply(401, { error: "Неточна лозинка на сопственикот." });
    render(<TermsAcceptance venueName="Сала" ownerName="Марија" />);
    accept();
    expect(await screen.findByRole("alert")).toHaveTextContent("Неточна лозинка на сопственикот.");
    expect(locationHref).toBe("");
  });

  it("in the panel (a newer version): an updated-terms card that goes back to the dashboard", async () => {
    reply(200, { ok: true, startTour: false });
    render(<TermsAcceptance embedded venueName="Сала" ownerName="Марија" />);
    expect(screen.getByRole("heading", { name: "Ажурирани услови за користење" })).toBeInTheDocument();
    expect(screen.getByText(/Панелот работи и до тогаш/)).toBeInTheDocument();
    accept();
    await waitFor(() => expect(locationHref).toBe("/venue"));
  });

  it("a venue with no owner login is asked for its own sign-in password", () => {
    render(<TermsAcceptance venueName="Сала" ownerName="" />);
    expect(screen.getByLabelText("Лозинка за најава на локалот")).toBeInTheDocument();
    expect(screen.getByText(/Локалот нема најава за сопственик/)).toBeInTheDocument();
  });
});
