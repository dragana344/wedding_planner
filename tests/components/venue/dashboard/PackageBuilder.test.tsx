import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const lib = vi.hoisted(() => ({ countEventsUsingTemplate: vi.fn(), deleteMenuTemplate: vi.fn() }));
vi.mock("@/lib/venue/menus", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));

import { PackageBuilder } from "@/components/venue/dashboard/PackageBuilder";

const template = { id: "p1", venue_id: "v1", name: "Класичен", description: null };

beforeEach(() => vi.clearAllMocks());

function open() {
  render(<PackageBuilder venueId="v1" template={template} initialItemIds={[]} items={[]} onClose={() => {}} onChanged={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /избриши/i }));
}

describe("PackageBuilder delete", () => {
  // 0181: a package events use is archived, not deleted — they keep it with the guests' choices.
  it("says a package used by events stays on them, and still lets the venue take it off the list (plural)", async () => {
    lib.countEventsUsingTemplate.mockResolvedValue({ upcoming: 3, past: 2 });
    lib.deleteMenuTemplate.mockResolvedValue("archived");
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Пакетот се користи во 5 настани — таму останува (со изборот на гостите), но нема да се нуди за нови настани.",
    );
    fireEvent.click(screen.getByRole("button", { name: /потврди бришење/i }));
    await waitFor(() => expect(lib.deleteMenuTemplate).toHaveBeenCalledWith("p1"));
  });

  it("singular copy for one event", async () => {
    lib.countEventsUsingTemplate.mockResolvedValue({ upcoming: 0, past: 1 });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Пакетот се користи во 1 настан — таму останува (со изборот на гостите), но нема да се нуди за нови настани.",
    );
  });

  it("asks plainly when no event uses it", async () => {
    lib.countEventsUsingTemplate.mockResolvedValue({ upcoming: 0, past: 0 });
    open();
    expect(await screen.findByRole("button", { name: /потврди бришење/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("PackageBuilder onSave", () => {
  it("onSave replaces the default save and hides delete when allowDelete=false", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onChanged = vi.fn();
    const onClose = vi.fn();
    const item = { id: "i1", venue_id: "v1", tiers: [], course: "main" as const, name: "Јадење", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null };
    render(
      <PackageBuilder venueId="v1" template={template} initialItemIds={["i1"]} items={[item]} allowDelete={false} onSave={onSave} onClose={onClose} onChanged={onChanged} />
    );
    expect(screen.queryByRole("button", { name: /избриши/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /зачувај/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: "Класичен", description: null, itemIds: ["i1"] }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
    expect(lib.deleteMenuTemplate).not.toHaveBeenCalled();
  });

  it("custom-menu mode: no description, default name and menu save label", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const item = { id: "i1", venue_id: "v1", tiers: [], course: "main" as const, name: "Јадење", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null };
    render(<PackageBuilder venueId="v1" template={null} initialItemIds={["i1"]} items={[item]} allowDelete={false} onSave={onSave} onClose={() => {}} onChanged={() => {}} />);
    expect(screen.queryByRole("textbox", { name: "Опис" })).not.toBeInTheDocument();
    const nameField = screen.getByRole("textbox", { name: "Име на пакетот" });
    expect(nameField).toHaveValue("Сопствено мени");
    expect(screen.queryByRole("button", { name: "Зачувај пакет" })).not.toBeInTheDocument();
    fireEvent.change(nameField, { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: "Сопствено мени", description: null, itemIds: ["i1"] }));
  });

  it("shows the error when onSave fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Оваа функција не е вклучена во вашиот пакет."));
    render(<PackageBuilder venueId="v1" template={null} initialItemIds={[]} items={[]} onSave={onSave} onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /зачувај/i }));
    expect(await screen.findByText("Оваа функција не е вклучена во вашиот пакет.")).toBeInTheDocument();
  });
});
