import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignupForm } from "@/components/auth/SignupForm";

const mockSignUp = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { signUp: mockSignUp },
  }),
}));

// SignupForm navigates with a hard `window.location.href` assignment rather
// than router.push (see the comment in components/auth/SignupForm.tsx) —
// jsdom's window.location can't be reassigned directly, so it's replaced
// with a stand-in that records the assignment.
let locationHref = "";
beforeEach(() => {
  mockSignUp.mockReset();
  locationHref = "";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return locationHref;
      },
      set href(value: string) {
        locationHref = value;
      },
    },
  });
});

describe("SignupForm", () => {
  it("signs up, provisions the venue, and redirects to /venue?tour=1", async () => {
    mockSignUp.mockResolvedValue({ data: { session: {} }, error: null });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ venue_id: "v1" }) });

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/име \(за менаџерска најава\)/i), { target: { value: "Марко Марковски" } });
    fireEvent.change(screen.getByLabelText(/менаџерска лозинка/i), { target: { value: "manager-pass-123" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "strong-password-123",
        // The venue name and the owner's manager-login details ride along for
        // the confirm-email path (lib/venue/pending-signup.ts).
        options: {
          data: { venue_name: "Демо Локал", owner_name: "Марко Марковски", owner_password: "manager-pass-123" },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/venue/signup",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ venue_name: "Демо Локал", owner_name: "Марко Марковски", owner_password: "manager-pass-123" }) })
      )
    );
    await waitFor(() => expect(locationHref).toBe("/venue?tour=1"));
  });

  it("shows the Supabase error inline when signUp fails, without calling the provisioning route", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: { message: "User already registered" } });
    global.fetch = vi.fn();

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/име \(за менаџерска најава\)/i), { target: { value: "Марко Марковски" } });
    fireEvent.change(screen.getByLabelText(/менаџерска лозинка/i), { target: { value: "manager-pass-123" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    expect(await screen.findByText("Веќе постои сметка со овој email. Најавете се.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(locationHref).toBe("");
  });

  it("retries provisioning once automatically before showing an error", async () => {
    mockSignUp.mockResolvedValue({ data: { session: {} }, error: null });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "transient failure" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ venue_id: "v1" }) });

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/име \(за менаџерска најава\)/i), { target: { value: "Марко Марковски" } });
    fireEvent.change(screen.getByLabelText(/менаџерска лозинка/i), { target: { value: "manager-pass-123" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(locationHref).toBe("/venue?tour=1"));
  });

  it("shows a confirmation message and never calls the provisioning endpoint when signUp succeeds without a session", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    global.fetch = vi.fn();

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/име \(за менаџерска најава\)/i), { target: { value: "Марко Марковски" } });
    fireEvent.change(screen.getByLabelText(/менаџерска лозинка/i), { target: { value: "manager-pass-123" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Ви испративме email на owner@example.com. Потврдете ја сметката преку линкот, па најавете се.");
    expect(screen.getByRole("link", { name: "Кон најава" })).toHaveAttribute("href", "/login");
    // The form is replaced, so the same details can't be submitted twice.
    expect(screen.queryByRole("button", { name: /регистрирај се/i })).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(locationHref).toBe("");
  });

  it("says the email is taken instead of promising a confirmation email (Supabase returns a user without identities)", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null, user: { id: "obfuscated", identities: [] } }, error: null });
    global.fetch = vi.fn();

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/име \(за менаџерска најава\)/i), { target: { value: "Марко Марковски" } });
    fireEvent.change(screen.getByLabelText(/менаџерска лозинка/i), { target: { value: "manager-pass-123" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    expect(await screen.findByText("Веќе постои сметка со овој email. Најавете се.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /регистрирај се/i })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("SignupForm legal notice (COMP-001)", () => {
  it("links the terms, the DPA and the privacy policy under the signup button", () => {
    render(<SignupForm />);
    expect(screen.getByRole("link", { name: "Условите за користење" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Договорот за обработка на лични податоци" })).toHaveAttribute("href", "/dpa");
    expect(screen.getByRole("link", { name: "Политиката за приватност" })).toHaveAttribute("href", "/privacy");
  });
});
