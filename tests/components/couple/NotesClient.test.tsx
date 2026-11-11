import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotesClient } from "@/components/couple/NotesClient";
import type { Note } from "@/lib/couple/notes";

const notes: Note[] = [
  {
    id: "n1",
    event_id: "e1",
    title: "Прашања за локал",
    content: "Дали е слободен датумот?",
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
  },
  {
    id: "n2",
    event_id: "e1",
    title: "Идеи за декорација",
    content: "Цветни аранжмани",
    created_at: "2026-01-02T10:00:00.000Z",
    updated_at: "2026-01-02T10:00:00.000Z",
  },
];

describe("NotesClient", () => {
  it("renders the note count and list, filtered by search", () => {
    render(<NotesClient coupleNames="Ана и Марко" initialNotes={notes} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Прашања за локал")).toBeInTheDocument();
    expect(screen.getByText("Идеи за декорација")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Пребарај белешки"), { target: { value: "декор" } });
    expect(screen.queryByText("Прашања за локал")).not.toBeInTheDocument();
    expect(screen.getByText("Идеи за декорација")).toBeInTheDocument();
  });

  it("loads a note into the editor when selected", async () => {
    render(<NotesClient coupleNames="Ана и Марко" initialNotes={notes} />);

    fireEvent.click(screen.getByText("Идеи за декорација"));
    await waitFor(() => expect(screen.getByLabelText("Наслов")).toHaveValue("Идеи за декорација"));
    expect(screen.getByLabelText("Белешка")).toHaveValue("Цветни аранжмани");
  });

  it("starts a blank draft when clicking Нова белешка", async () => {
    render(<NotesClient coupleNames="Ана и Марко" initialNotes={notes} />);

    fireEvent.click(screen.getByText("Прашања за локал"));
    await waitFor(() => expect(screen.getByLabelText("Наслов")).toHaveValue("Прашања за локал"));

    fireEvent.click(screen.getByRole("button", { name: /нова белешка/i }));
    await waitFor(() => expect(screen.getByLabelText("Наслов")).toHaveValue(""));
    expect(screen.getByLabelText("Белешка")).toHaveValue("");
  });

  it("creates a new note via the form", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "n3",
        event_id: "e1",
        title: "Контакти",
        content: "ДЈ бендови",
        created_at: "2026-01-03T10:00:00.000Z",
        updated_at: "2026-01-03T10:00:00.000Z",
      }),
    });
    render(<NotesClient coupleNames="Ана и Марко" initialNotes={[]} />);

    fireEvent.change(screen.getByLabelText("Наслов"), { target: { value: "Контакти" } });
    fireEvent.change(screen.getByLabelText("Белешка"), { target: { value: "ДЈ бендови" } });
    fireEvent.click(screen.getByRole("button", { name: /^Зачувај$/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/notes",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Контакти", content: "ДЈ бендови" }),
        })
      )
    );
  });
});
