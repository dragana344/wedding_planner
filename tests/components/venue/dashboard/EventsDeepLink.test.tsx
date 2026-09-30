import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { EventsClient } from "@/components/venue/dashboard/EventsClient";
import type { EventDetail } from "@/lib/venue/events";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
// The edit form loads photos and the couple's username on mount; stub them so
// a unit test never sends a request to Supabase.
vi.mock("@/lib/venue/showcase", async (orig) => ({ ...(await orig<object>()), listShowcasePhotos: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/venue/credentials", async (orig) => ({ ...(await orig<object>()), getEventUsername: vi.fn().mockResolvedValue("ana-marko") }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const event: EventDetail = {
  id: "e1", couple_names: "Ана & Марко", event_date: "2027-06-12", start_time: null, end_time: null, status: "confirmed",
  event_type: "wedding", guest_count_estimate: 100, menu_template_id: null, customMenuItems: [], room_ids: [],
  hasShowcasePhotos: false, seatedCount: 0, contact_email: null, contact_email_2: null, contact_phone: null, total_price: null, deposit_paid: null,
};

describe("EventsClient deep link (B9 notifications)", () => {
  it("opens the event named in ?event=", () => {
    const { container } = render(<EventsClient venueId="v1" initialEvents={[event]} rooms={[]} menuTemplates={[]} initialFilter="all" initialEventId="e1" />);
    expect(container.ownerDocument.querySelector(".modal-panel")).not.toBeNull();
  });

  it("ignores an unknown id", () => {
    const { container } = render(<EventsClient venueId="v1" initialEvents={[event]} rooms={[]} menuTemplates={[]} initialFilter="all" initialEventId="nope" />);
    expect(container.ownerDocument.querySelector(".modal-panel")).toBeNull();
  });
});
