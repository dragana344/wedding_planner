import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignupForm } from "@/components/auth/SignupForm";

const mockSignUp = vi.fn();
const mockPush = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { signUp: mockSignUp },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  mockSignUp.mockReset();
  mockPush.mockReset();
});

describe("SignupForm", () => {
  it("signs up, provisions the venue, and redirects to /venue?tour=1", async () => {
    mockSignUp.mockResolvedValue({ data: { session: {} }, error: null });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ venue_id: "v1" }) });

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({ email: "owner@example.com", password: "strong-password-123" })
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/venue/signup",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ venue_name: "Демо Локал" }) })
      )
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/venue?tour=1"));
  });

  it("shows the Supabase error inline when signUp fails, without calling the provisioning route", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: { message: "User already registered" } });
    global.fetch = vi.fn();

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    expect(await screen.findByText("User already registered")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("retries provisioning once automatically before showing an error", async () => {
    mockSignUp.mockResolvedValue({ data: { session: {} }, error: null });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "transient failure" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ venue_id: "v1" }) });

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/venue?tour=1"));
  });

  it("shows a confirmation message and never calls the provisioning endpoint when signUp succeeds without a session", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    global.fetch = vi.fn();

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/име на локалот/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/^е-пошта$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^лозинка$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирај се/i }));

    expect(
      await screen.findByText("Please check your email to confirm your account before signing in.")
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
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
