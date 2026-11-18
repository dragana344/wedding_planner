import { describe, it, expect } from "vitest";
import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import CoupleLoginPage from "@/app/couple/login/page";

// Group A task 2: proxy.ts sends a closed event's session to
// /couple/login?reason=closed; the page explains why.

async function renderWith(params: Record<string, string>) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <CoupleLoginPage searchParams={Promise.resolve(params)} />
      </Suspense>,
    );
  });
}

describe("couple login page", () => {
  it("says the event's access has ended when sent here with reason=closed", async () => {
    await renderWith({ reason: "closed" });
    expect(await screen.findByText("Пристапот до овој настан заврши. За прашања контактирајте го локалот.")).toBeInTheDocument();
  });

  it("shows no message otherwise", async () => {
    await renderWith({});
    expect(await screen.findByRole("button", { name: "Најави се" })).toBeInTheDocument();
    expect(screen.queryByText(/заврши/)).toBeNull();
  });
});
