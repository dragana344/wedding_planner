import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuTemplateForm } from "@/components/venue/MenuTemplateForm";
import * as menus from "@/lib/venue/menus";

describe("MenuTemplateForm", () => {
  it("calls createMenuTemplate with the entered name on submit", async () => {
    const spy = vi.spyOn(menus, "createMenuTemplate").mockResolvedValue({
      id: "t1",
      venue_id: "v1",
      name: "Standard Menu",
      description: null,
    });
    const onSaved = vi.fn();
    render(<MenuTemplateForm venueId="v1" onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText(/Име на менито/i), "Standard Menu");
    await userEvent.click(screen.getByRole("button", { name: /Создади мени/i }));

    expect(spy).toHaveBeenCalledWith("v1", "Standard Menu", "");
    expect(onSaved).toHaveBeenCalled();
  });
});
