import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const mfa = {
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  unenroll: vi.fn(),
};
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({ auth: { mfa } }),
}));

import { AdminMfaEnrol } from "@/components/admin/AdminMfaEnrol";

beforeEach(() => {
  push.mockReset();
  Object.values(mfa).forEach((fn) => fn.mockReset());
});

describe("AdminMfaEnrol", () => {
  it("routes to /admin as soon as the enrolment code is confirmed", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [], phone: [] }, error: null });
    mfa.enroll.mockResolvedValue({
      data: { id: "f-new", type: "totp", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "S", uri: "" } },
      error: null,
    });
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });

    render(<AdminMfaEnrol />);
    fireEvent.click(await screen.findByRole("button", { name: "Вклучи двофакторска автентикација" }));
    fireEvent.change(await screen.findByLabelText("Код од апликацијата"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Потврди и вклучи" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
  });
});
