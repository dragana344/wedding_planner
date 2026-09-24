// tests/components/couple/InvitationClient.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InvitationClient } from "@/components/couple/InvitationClient";

describe("InvitationClient", () => {
  it("lets the couple pick a template, add a message, and generate a link", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        event_id: "e1",
        template_id: "elegant-gold",
        message: "Се радуваме!",
        photo_path: null,
        public_slug: "abc123",
      }),
    });
    render(<InvitationClient initialInvitation={null} coupleNames="Ана & Марко" eventDate="2027-06-15" />);

    fireEvent.click(screen.getByRole("button", { name: /елегантен златен/i }));
    fireEvent.change(screen.getByPlaceholderText(/message/i), { target: { value: "Се радуваме!" } });
    fireEvent.click(screen.getByRole("button", { name: /generate link/i }));

    await waitFor(() => expect(screen.getByText(/abc123/i)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/invitation",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ template_id: "elegant-gold", message: "Се радуваме!" }),
      })
    );
  });

  it("uploads a photo separately via the photo endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ photo_path: "e1-123.jpg" }) });
    render(
      <InvitationClient
        initialInvitation={{ event_id: "e1", template_id: "romantic-floral", message: null, photo_path: null, public_slug: "existing-slug" }}
        coupleNames="Ана & Марко"
        eventDate="2027-06-15"
      />
    );

    const file = new File(["photo-bytes"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/photo/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/invitation/photo",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("shows the existing link immediately when an invitation already exists", () => {
    render(
      <InvitationClient
        initialInvitation={{ event_id: "e1", template_id: "romantic-floral", message: null, photo_path: null, public_slug: "existing-slug" }}
        coupleNames="Ана & Марко"
        eventDate="2027-06-15"
      />
    );
    expect(screen.getByText(/existing-slug/i)).toBeInTheDocument();
  });

  it("copies the invitation link to the clipboard when the copy-link button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <InvitationClient
        initialInvitation={{ event_id: "e1", template_id: "romantic-floral", message: null, photo_path: null, public_slug: "existing-slug" }}
        coupleNames="Ана & Марко"
        eventDate="2027-06-15"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/invite/existing-slug")));
  });

  it("creates the invitation row first when a photo is picked before any invitation exists", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/couple/invitation") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            event_id: "e1",
            template_id: "romantic-floral",
            message: null,
            photo_path: null,
            public_slug: "new-slug",
          }),
        });
      }
      if (url === "/api/couple/invitation/photo") {
        return Promise.resolve({ ok: true, json: async () => ({ photo_path: "e1-456.jpg" }) });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    render(<InvitationClient initialInvitation={null} coupleNames="Ана & Марко" eventDate="2027-06-15" />);

    const file = new File(["photo-bytes"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/photo/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/invitation",
        expect.objectContaining({ method: "PUT" })
      )
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/invitation/photo",
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
