import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhoneQuickContact } from "@/components/shared/PhoneQuickContact";

describe("PhoneQuickContact", () => {
  it("links WhatsApp to the number in international form and Viber to forward", () => {
    render(<PhoneQuickContact phone="070 111 222" />);
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/38970111222");
    expect(screen.getByRole("link", { name: "Viber" })).toHaveAttribute("href", "viber://forward");
  });

  it("renders nothing without a usable phone number", () => {
    const { container } = render(<PhoneQuickContact phone={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
