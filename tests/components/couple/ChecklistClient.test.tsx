import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChecklistClient } from "@/components/couple/ChecklistClient";
import type { ChecklistItem } from "@/lib/couple/checklist";

const items: ChecklistItem[] = [
  { id: "c1", event_id: "e1", title: "Book photographer", due_date: null, is_done: false, created_at: "2026-01-01", subtasks: [] },
];
const stats = { total: 1, open: 1, done: 0, overdue: 0 };

describe("ChecklistClient", () => {
  it("renders the stat tile and tasks, and adds a new task", async () => {
    const newItem = { id: "c2", event_id: "e1", title: "Send invitations", due_date: "2027-01-01", is_done: false, created_at: "2026-01-02", subtasks: [] };
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, json: async () => newItem };
      }
      return {
        ok: true,
        json: async () => ({ items: [...items, newItem], stats: { total: 2, open: 2, done: 0, overdue: 0 } }),
      };
    });
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={items} initialStats={stats} />);

    expect(screen.getByText("Book photographer")).toBeInTheDocument();
    expect(screen.getByText(/1 отворени/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Наслов на задачата"), { target: { value: "Send invitations" } });
    // The second "Додај задача" is the submit; the first folds the card.
    fireEvent.click(screen.getAllByRole("button", { name: "Додај задача" })[1]);

    await waitFor(() => expect(screen.getByText("Send invitations")).toBeInTheDocument());
  });

  it("toggles a task done", async () => {
    const toggledItem = { ...items[0], is_done: true };
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return { ok: true, json: async () => toggledItem };
      }
      return {
        ok: true,
        json: async () => ({ items: [toggledItem], stats: { total: 1, open: 0, done: 1, overdue: 0 } }),
      };
    });
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={items} initialStats={stats} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /book photographer/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/checklist/c1",
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });

  it("edits a task's title and due date", async () => {
    const updatedItem = { ...items[0], title: "Book photographer (booked!)", due_date: "2027-02-01" };
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return { ok: true, json: async () => updatedItem };
      }
      return {
        ok: true,
        json: async () => ({ items: [updatedItem], stats: { total: 1, open: 1, done: 0, overdue: 0 } }),
      };
    });
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={items} initialStats={stats} />);

    fireEvent.click(screen.getByRole("button", { name: /измени book photographer/i }));
    fireEvent.change(screen.getByDisplayValue("Book photographer"), { target: { value: "Book photographer (booked!)" } });
    fireEvent.click(screen.getByRole("button", { name: /зачувај/i }));

    await waitFor(() => expect(screen.getByText("Book photographer (booked!)")).toBeInTheDocument());
  });

  it("deletes a task", async () => {
    global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return {
        ok: true,
        json: async () => ({ items: [], stats: { total: 0, open: 0, done: 0, overdue: 0 } }),
      };
    });
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={items} initialStats={stats} />);

    fireEvent.click(screen.getByRole("button", { name: /избриши book photographer/i }));

    await waitFor(() => expect(screen.queryByText("Book photographer")).not.toBeInTheDocument());
  });

  it("adds, toggles, and deletes a subtask under a task", async () => {
    const withSubtask = {
      ...items[0],
      subtasks: [{ id: "s1", checklist_item_id: "c1", title: "Photographer A", is_done: false, created_at: "2026-01-03" }],
    };
    const withToggledSubtask = {
      ...items[0],
      subtasks: [{ id: "s1", checklist_item_id: "c1", title: "Photographer A", is_done: true, created_at: "2026-01-03" }],
    };
    let currentItems = items;
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.endsWith("/subtasks") && init?.method === "POST") {
        currentItems = [withSubtask];
        return { ok: true, json: async () => withSubtask.subtasks[0] };
      }
      if (typeof url === "string" && url.includes("/subtasks/s1") && init?.method === "PATCH") {
        currentItems = [withToggledSubtask];
        return { ok: true, json: async () => withToggledSubtask.subtasks[0] };
      }
      if (typeof url === "string" && url.includes("/subtasks/s1") && init?.method === "DELETE") {
        currentItems = [items[0]];
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => ({ items: currentItems, stats }) };
    });
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={items} initialStats={stats} />);

    // Subtasks stay folded until "Додај подзадача" opens them.
    expect(screen.queryByPlaceholderText(/додај опција или подзадача/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Додај подзадача за Book photographer" }));
    expect(screen.getByPlaceholderText(/додај опција или подзадача/i)).toHaveFocus();
    expect(screen.getByRole("button", { name: "Подзадачи за Book photographer" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByPlaceholderText(/додај опција или подзадача/i), { target: { value: "Photographer A" } });
    fireEvent.click(screen.getByRole("button", { name: /^додај$/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/checklist/c1/subtasks",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Photographer A" }) })
      )
    );
    expect(await screen.findByText("Photographer A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Photographer A" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/checklist/c1/subtasks/s1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ is_done: true }) })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Избриши Photographer A" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/couple/checklist/c1/subtasks/s1", expect.objectContaining({ method: "DELETE" }))
    );
    await waitFor(() => expect(screen.queryByText("Photographer A")).not.toBeInTheDocument());
  });

  it("visually flags an overdue task", () => {
    const overdueItems = [
      { id: "c3", event_id: "e1", title: "Confirm florist", due_date: "2020-01-01", is_done: false, created_at: "2026-01-01", subtasks: [] },
    ];
    const overdueStats = { total: 1, open: 1, done: 0, overdue: 1 };
    global.fetch = vi.fn();
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={overdueItems} initialStats={overdueStats} />);

    expect(screen.getByText("Confirm florist")).toBeInTheDocument();
    expect(screen.getByText("Задоцнето")).toBeInTheDocument();
  });

  it("shows the couple's names in the header and filters by status and search", () => {
    const mixed: ChecklistItem[] = [
      items[0],
      { id: "c4", event_id: "e1", title: "Order cake", due_date: null, is_done: true, created_at: "2026-01-01", subtasks: [] },
    ];
    global.fetch = vi.fn();
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={mixed} initialStats={{ total: 2, open: 1, done: 1, overdue: 0 }} />);
    expect(screen.getByText("Марко и Ана")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Чеклиста" })).toBeInTheDocument();
    expect(screen.getAllByText("Без рок")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Завршени (1)" }));
    expect(screen.getByRole("button", { name: "Завршени (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Book photographer")).not.toBeInTheDocument();
    expect(screen.getByText("Order cake")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сите (2)" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Пребарај задача" }), { target: { value: "photo" } });
    expect(screen.getByText("Book photographer")).toBeInTheDocument();
    expect(screen.queryByText("Order cake")).not.toBeInTheDocument();
  });

  it("folds the add form away and back", () => {
    global.fetch = vi.fn();
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={items} initialStats={stats} />);
    const toggle = screen.getByRole("button", { name: "Додај задача", expanded: true });
    fireEvent.click(toggle);
    expect(screen.queryByLabelText("Наслов на задачата")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Наслов на задачата")).toBeInTheDocument();
  });

  it("links a task whose title matches a vendor category to the marketplace, pre-filtered", () => {
    const withVendorMatch: ChecklistItem[] = [
      { id: "c5", event_id: "e1", title: "Нарачај цвеќе за црквата", due_date: null, is_done: false, created_at: "2026-01-01", subtasks: [] },
    ];
    global.fetch = vi.fn();
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={withVendorMatch} initialStats={{ total: 1, open: 1, done: 0, overdue: 0 }} />);
    expect(screen.getByRole("link", { name: "Погледни добавувачи" })).toHaveAttribute("href", "/couple/partners?category=florist");
  });

  it("has no vendor link for a task with no matching category", () => {
    global.fetch = vi.fn();
    render(<ChecklistClient coupleNames="Марко и Ана" initialItems={items} initialStats={stats} />);
    expect(screen.queryByRole("link", { name: "Погледни добавувачи" })).not.toBeInTheDocument();
  });
});
