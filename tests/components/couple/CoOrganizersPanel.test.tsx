import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CoOrganizersPanel } from "@/components/couple/guests/CoOrganizersPanel";

const bride = { id: "c1", side: "bride" as const, username: "nevesta-ana", created_at: "2027-01-01T10:00:00Z" };

function lastBody() {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
  return JSON.parse(calls[calls.length - 1][1].body);
}

describe("CoOrganizersPanel (A12)", () => {
  it("lists co-organizers and offers only the free side", () => {
    render(<CoOrganizersPanel initial={[bride]} />);
    expect(screen.getByText("nevesta-ana")).toBeInTheDocument();
    expect(screen.getByText("Страна на невестата")).toBeInTheDocument();
    const side = screen.getByLabelText("Страна на ко-организаторот");
    expect(within(side).queryByRole("option", { name: "Страна на невестата" })).not.toBeInTheDocument();
    expect(within(side).getByRole("option", { name: "Страна на младоженецот" })).toBeInTheDocument();
  });

  it("adds one with a generated password and shows the login details to pass on once", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "c2", side: "groom", username: "mladozenec-marko", created_at: "2027-01-02T10:00:00Z" }),
    });
    render(<CoOrganizersPanel initial={[]} />);

    fireEvent.change(screen.getByLabelText("Страна на ко-организаторот"), { target: { value: "groom" } });
    fireEvent.change(screen.getByLabelText("Корисничко име"), { target: { value: "mladozenec-marko" } });
    const password = (screen.getByLabelText("Лозинка") as HTMLInputElement).value;
    expect(password).toMatch(/^[A-Za-z0-9]{12}$/);
    fireEvent.click(screen.getByRole("button", { name: "Додади ко-организатор" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/couple/co-organizers", expect.objectContaining({ method: "POST" })));
    expect(lastBody()).toEqual({ side: "groom", username: "mladozenec-marko", password });
    const details = await screen.findByRole("status");
    expect(details).toHaveTextContent("mladozenec-marko");
    expect(details).toHaveTextContent(password);
    expect(details).toHaveTextContent("/couple/login");
    expect(screen.getAllByText("mladozenec-marko").length).toBeGreaterThan(0);
  });

  it("sets a new password and removes a co-organizer", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<CoOrganizersPanel initial={[bride]} />);

    fireEvent.click(screen.getByRole("button", { name: "Нова лозинка за nevesta-ana" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/couple/co-organizers/c1", expect.objectContaining({ method: "PATCH" })));
    const newPassword = lastBody().password;
    expect(newPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(await screen.findByRole("status")).toHaveTextContent(newPassword);

    fireEvent.click(screen.getByRole("button", { name: "Избриши nevesta-ana" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/couple/co-organizers/c1", expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Избриши nevesta-ana" })).not.toBeInTheDocument());
  });
});
