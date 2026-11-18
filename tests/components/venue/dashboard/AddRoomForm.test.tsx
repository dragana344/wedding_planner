import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/venue/rooms", () => ({ createRoom: vi.fn() }));

import { createRoom } from "@/lib/venue/rooms";
import { AddRoomForm } from "@/components/venue/dashboard/AddRoomForm";

const create = vi.mocked(createRoom);

describe("AddRoomForm", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 1000, height_cm: 800 });
  });

  it("saves the room with its address and map link (0157)", async () => {
    const onSaved = vi.fn();
    render(<AddRoomForm venueId="v1" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Име на просторијата/), { target: { value: "Голема сала" } });
    fireEvent.change(screen.getByLabelText("Адреса на просторијата (опционално)"), { target: { value: "Водно бб" } });
    fireEvent.change(screen.getByLabelText("Линк до мапа (опционално)"), { target: { value: "https://maps.example/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај просторија" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith("v1", "Голема сала", { address: "Водно бб", map_url: "https://maps.example/x" });
  });

  it("still works with just a name", async () => {
    const onSaved = vi.fn();
    render(<AddRoomForm venueId="v1" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Име на просторијата/), { target: { value: "Мала сала" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај просторија" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith("v1", "Мала сала", { address: "", map_url: "" });
  });

  it("shows the map-link error from the server", async () => {
    create.mockRejectedValue(new Error("Линкот до мапата мора да почнува со http:// или https://."));
    render(<AddRoomForm venueId="v1" onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Име на просторијата/), { target: { value: "Сала" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај просторија" }));
    expect(await screen.findByText(/http:\/\/ или https:\/\//)).toBeInTheDocument();
  });
});
