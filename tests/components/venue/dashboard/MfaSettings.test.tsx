import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// SEC-016: the "Двофакторска автентикација" panel in venue settings.

const mfa = {
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  unenroll: vi.fn(),
};

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({ auth: { mfa } }),
}));

import { MfaSettings } from "@/components/venue/dashboard/MfaSettings";

const verified = { id: "f-1", factor_type: "totp", status: "verified" };
const noFactors = { data: { all: [], totp: [], phone: [] }, error: null };

beforeEach(() => {
  Object.values(mfa).forEach((fn) => fn.mockReset());
  mfa.unenroll.mockResolvedValue({ data: {}, error: null });
});

describe("MfaSettings", () => {
  it("shows the disabled state when the user has no verified factor", async () => {
    mfa.listFactors.mockResolvedValue(noFactors);
    render(<MfaSettings />);
    expect(await screen.findByRole("button", { name: "Вклучи двофакторска автентикација" })).toBeInTheDocument();
    expect(screen.getByText("исклучена")).toBeInTheDocument();
  });

  it("shows the enabled state when a verified TOTP factor exists", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [verified], totp: [verified], phone: [] }, error: null });
    render(<MfaSettings />);
    expect(await screen.findByText("вклучена")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Исклучи двофакторска автентикација" })).toBeInTheDocument();
  });

  it("enrols: shows the QR code and the secret, verifies the code, and ends enabled", async () => {
    const stale = { id: "f-old", factor_type: "totp", status: "unverified" };
    mfa.listFactors
      .mockResolvedValueOnce(noFactors)
      .mockResolvedValueOnce({ data: { all: [stale], totp: [], phone: [] }, error: null });
    mfa.enroll.mockResolvedValue({
      data: { id: "f-new", type: "totp", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DPEHPK3PXP", uri: "" } },
      error: null,
    });
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });

    render(<MfaSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Вклучи двофакторска автентикација" }));

    const qr = await screen.findByRole("img", { name: /QR-код/ });
    expect(qr).toHaveAttribute("src", "data:image/svg+xml;utf-8,<svg/>");
    expect(screen.getByTestId("mfa-secret")).toHaveTextContent("JBSWY3DPEHPK3PXP");
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "f-old" });
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: "totp" });

    fireEvent.change(screen.getByLabelText("Код од апликацијата"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Потврди и вклучи" }));

    await waitFor(() => expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-new", code: "123456" }));
    expect(await screen.findByText("вклучена")).toBeInTheDocument();
    expect(screen.getByText(/Двофакторската автентикација е вклучена/)).toBeInTheDocument();
  });

  it("keeps the enrolment open with an error when the code is wrong", async () => {
    mfa.listFactors.mockResolvedValue(noFactors);
    mfa.enroll.mockResolvedValue({
      data: { id: "f-new", type: "totp", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "S", uri: "" } },
      error: null,
    });
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: "Invalid TOTP code entered" } });

    render(<MfaSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Вклучи двофакторска автентикација" }));
    fireEvent.change(await screen.findByLabelText("Код од апликацијата"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Потврди и вклучи" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Кодот не е точен");
    expect(screen.getByRole("img", { name: /QR-код/ })).toBeInTheDocument();
  });

  it("rejects a malformed code without calling Supabase", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [verified], totp: [verified], phone: [] }, error: null });
    render(<MfaSettings />);
    fireEvent.change(await screen.findByLabelText("Код од апликацијата"), { target: { value: "12" } });
    fireEvent.submit(screen.getByRole("button", { name: "Исклучи двофакторска автентикација" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("6-цифрениот код");
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("disables only after a fresh code is verified (aal2), then shows the disabled state", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [verified], totp: [verified], phone: [] }, error: null });
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });

    render(<MfaSettings />);
    fireEvent.change(await screen.findByLabelText("Код од апликацијата"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Исклучи двофакторска автентикација" }));

    await waitFor(() => expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "f-1" }));
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-1", code: "654321" });
    expect(mfa.challengeAndVerify.mock.invocationCallOrder[0]).toBeLessThan(mfa.unenroll.mock.invocationCallOrder[0]);
    expect(await screen.findByText("исклучена")).toBeInTheDocument();
  });

  it("does not remove the factor when the confirming code is wrong", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [verified], totp: [verified], phone: [] }, error: null });
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: "Invalid TOTP code entered" } });

    render(<MfaSettings />);
    fireEvent.change(await screen.findByLabelText("Код од апликацијата"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Исклучи двофакторска автентикација" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Кодот не е точен");
    expect(mfa.unenroll).not.toHaveBeenCalled();
    expect(screen.getByText("вклучена")).toBeInTheDocument();
  });
});
