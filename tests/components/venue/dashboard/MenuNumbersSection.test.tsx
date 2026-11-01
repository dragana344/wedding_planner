import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MenuNumbersSection } from "@/components/venue/dashboard/MenuNumbersSection";
import * as changesClient from "@/lib/venue/changes-client";
import type { EventDetail } from "@/lib/venue/events";
import type { MenuSubmission } from "@/lib/menu-numbers";

// "Today" is 2026-10-31 in Skopje.
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T10:00:00Z") }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const menus: EventDetail["menus"] = [
  { id: "m1", name: "Класично", isCustom: false, items: [] },
  { id: "m2", name: "Вегетаријанско", isCustom: false, items: [] },
];
const submission = (over: Partial<MenuSubmission>): MenuSubmission => ({
  id: "s1", sentAt: "2026-10-20T08:00:00Z", sentBy: "Младенците",
  numbers: { menus: [{ id: "m1", name: "Класично", count: 80 }], total: 80 },
  seenAt: "2026-10-21T08:00:00Z", seenBy: "Марко", source: "couple", unanswered: null, ...over,
});

function renderSection(props: Partial<React.ComponentProps<typeof MenuNumbersSection>> = {}) {
  const onChanged = vi.fn();
  render(
    <MenuNumbersSection
      eventId="e1"
      menuNumbers={{ latest: null, previous: null }}
      // 18 days out, created long ago: venue_can_remind.
      eventDate="2026-11-18"
      createdAt="2026-01-01T10:00:00Z"
      menus={menus}
      lastReminderAt={null}
      canConfirm
      token="tok"
      onChanged={onChanged}
      {...props}
    />,
  );
  return onChanged;
}

describe("MenuNumbersSection", () => {
  it("labels automatically sent numbers", () => {
    renderSection({ menuNumbers: { latest: submission({ source: "auto", unanswered: 12 }), previous: null } });
    expect(screen.getByText(/Испратено автоматски — непотполно/)).toBeInTheDocument();
    expect(screen.getByText(/12 гости без одговор/)).toBeInTheDocument();
  });

  it("labels numbers entered by the venue", () => {
    renderSection({ menuNumbers: { latest: submission({ source: "venue" }), previous: null } });
    expect(screen.getByText("Внесено од салата")).toBeInTheDocument();
  });

  it("keeps the couple's own label", () => {
    renderSection({ menuNumbers: { latest: submission({}), previous: null } });
    expect(screen.getByText(/Испратено на 20\.10\.2026 од Младенците/)).toBeInTheDocument();
  });

  it("warns and offers a reminder to a manager when nothing was sent", () => {
    renderSection();
    expect(screen.getByText("Бројките уште не се испратени")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Потсети го парот" })).toBeInTheDocument();
  });

  it("shows plain staff the warning but no remind button", () => {
    renderSection({ canConfirm: false });
    expect(screen.getByText("Бројките уште не се испратени")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Потсети го парот" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Внеси бројки" })).not.toBeInTheDocument();
  });

  it("shows no warning outside the 20-day window or once sent", () => {
    renderSection({ eventDate: "2026-12-30" });
    expect(screen.queryByText("Бројките уште не се испратени")).not.toBeInTheDocument();
  });

  it("shows no warning when numbers were sent", () => {
    renderSection({ menuNumbers: { latest: submission({}), previous: null } });
    expect(screen.queryByText("Бројките уште не се испратени")).not.toBeInTheDocument();
  });

  it("after a reminder shows its date and hides the button", async () => {
    const spy = vi.spyOn(changesClient, "remindCoupleViaApi").mockResolvedValue({ remindedAt: "2026-10-31T10:00:00Z" });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Потсети го парот" }));
    expect(await screen.findByText("Потсетено на 31.10.2026")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith("e1", "tok");
    expect(screen.queryByRole("button", { name: "Потсети го парот" })).not.toBeInTheDocument();
  });

  it("shows an earlier reminder's date next to the button", () => {
    renderSection({ lastReminderAt: "2026-10-29T10:00:00Z" });
    expect(screen.getByText("Потсетено на 29.10.2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Потсети го парот" })).toBeInTheDocument();
  });

  it("shows a reminder error as an alert", async () => {
    vi.spyOn(changesClient, "remindCoupleViaApi").mockRejectedValue(new Error("Веќе потсетивте денес."));
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Потсети го парот" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Веќе потсетивте денес.");
  });

  it("enters numbers: one labelled input per menu, posts the counts, then refreshes", async () => {
    const spy = vi.spyOn(changesClient, "enterMenuNumbersViaApi").mockResolvedValue();
    const onChanged = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Внеси бројки" }));
    fireEvent.change(screen.getByLabelText("Класично"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("Вегетаријанско"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај бројки" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith("e1", { m1: 70, m2: 5 }, "tok");
  });

  it("pre-fills Внеси бројки from the latest numbers (0 for a menu not in them)", () => {
    renderSection({ menuNumbers: { latest: submission({}), previous: null } });
    fireEvent.click(screen.getByRole("button", { name: "Внеси бројки" }));
    expect(screen.getByLabelText("Класично")).toHaveValue(80);
    expect(screen.getByLabelText("Вегетаријанско")).toHaveValue(0);
  });

  it("starts Внеси бројки at 0 when nothing was sent", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Внеси бројки" }));
    expect(screen.getByLabelText("Класично")).toHaveValue(0);
  });

  it("shows the couple's phone in the warning when given (manager only)", () => {
    renderSection({ couplePhone: "070111222" });
    expect(screen.getByRole("status")).toHaveTextContent("Телефон на парот: 070111222");
  });

  it("offers Внеси бројки even when numbers exist, but not for a past event or no menus", () => {
    renderSection({ menuNumbers: { latest: submission({}), previous: null } });
    expect(screen.getByRole("button", { name: "Внеси бројки" })).toBeInTheDocument();
  });

  it("hides Внеси бројки for a past event", () => {
    renderSection({ eventDate: "2026-10-01" });
    expect(screen.queryByRole("button", { name: "Внеси бројки" })).not.toBeInTheDocument();
  });

  it("hides Внеси бројки without menus", () => {
    renderSection({ menus: [] });
    expect(screen.queryByRole("button", { name: "Внеси бројки" })).not.toBeInTheDocument();
  });
});
