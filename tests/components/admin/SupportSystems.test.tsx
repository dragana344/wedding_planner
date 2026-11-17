import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }), usePathname: () => "/admin/support" }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth: { signOut: vi.fn() } }) }));
vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn(async () => ({ adminUserId: "me", requestId: null })) }));

const taskActions = vi.hoisted(() => ({
  createAdminTask: vi.fn(async () => ({ ok: true, data: { id: "t9" } })),
  setAdminTaskStatus: vi.fn(async () => ({ ok: true, data: null })),
  commentOnAdminTask: vi.fn(async () => ({ ok: true, data: null })),
  deleteAdminTask: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("@/app/admin/(panel)/support/actions", () => taskActions);

const messageActions = vi.hoisted(() => ({
  setMessageStatus: vi.fn(async () => ({ ok: true, data: null })),
  deleteMessage: vi.fn(async () => ({ ok: true, data: null })),
  setTicketStatus: vi.fn(async () => ({ ok: true, data: null })),
  replyToTicket: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("@/app/admin/(panel)/messages/actions", () => messageActions);

const queries = vi.hoisted(() => ({
  listInbox: vi.fn(),
  listAdminTasks: vi.fn(),
  listAdmins: vi.fn(),
  getAdminTask: vi.fn(),
}));
vi.mock("@/lib/admin/queries", () => queries);

import MessagesPage from "@/app/admin/(panel)/messages/page";
import AdminTasksPage from "@/app/admin/(panel)/support/page";
import AdminTaskPage from "@/app/admin/(panel)/support/[id]/page";
import { AdminTicketThread } from "@/components/admin/InboxDetails";
import { AdminShell } from "@/components/admin/AdminShell";


const task = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Провери фактура",
  description: "За локал X",
  status: "new",
  createdBy: "other",
  createdByEmail: "other@test.mk",
  assignedTo: "me",
  assignedToEmail: "me@test.mk",
  createdAt: "2028-01-01T10:00:00Z",
  updatedAt: "2028-01-01T10:00:00Z",
  completedAt: null,
  createdByUnread: false,
  assignedToUnread: false,
  attachments: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Пораки и барања (inbox)", () => {
  it("lists public messages and tickets together, each linking to its own detail page", async () => {
    queries.listInbox.mockResolvedValue([
      { kind: "ticket", id: "k1", source: "couple", from: "Ана", venueName: "Сала Езеро", coupleNames: "Ана и Петар", subject: "Мени", status: "new", awaitingAdmin: true, lastActivityAt: "2028-01-02T10:00:00Z" },
      { kind: "contact", id: "c1", source: "public", from: "Иван", venueName: null, coupleNames: null, subject: "Цени?", status: "done", awaitingAdmin: false, lastActivityAt: "2028-01-01T10:00:00Z" },
    ]);
    render(await MessagesPage({ searchParams: Promise.resolve({ source: "couple" }) }));
    expect(queries.listInbox).toHaveBeenCalledWith({ status: undefined, source: "couple" });

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Пар")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Ана и Петар · Сала Езеро")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Чека одговор")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: "Отвори" })).toHaveAttribute("href", "/admin/messages/ticket/k1");
    expect(within(rows[1]).getByText("Јавна форма")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Решено")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("link", { name: "Отвори" })).toHaveAttribute("href", "/admin/messages/contact/c1");
  });

  it("an admin replies in a ticket's thread and can move its status", async () => {
    const ticket = {
      id: "k1", venueId: "v1", venueName: "Сала Езеро", eventId: null, coupleNames: null, submittedBy: "venue" as const,
      name: "Марко", problem: "Не работи", description: "Детали", status: "new" as const, awaitingAdmin: true,
      createdAt: "2028-01-01T10:00:00Z", resolvedAt: null,
    };
    render(<AdminTicketThread ticket={ticket} messages={[]} />);
    expect(screen.getByText("Детали")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Одговор"), { target: { value: "Проверуваме" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати одговор" }));
    await waitFor(() => expect(messageActions.replyToTicket).toHaveBeenCalledWith({ id: "k1", body: "Проверуваме" }));

    fireEvent.click(screen.getByRole("button", { name: "Решено" }));
    await waitFor(() => expect(messageActions.setTicketStatus).toHaveBeenCalledWith({ id: "k1", status: "done" }));
  });
});

describe("Тикети за поддршка (admin tasks)", () => {
  it("lists my tasks, with view tabs, and offers every other admin (or everyone) as a receiver", async () => {
    queries.listAdminTasks.mockResolvedValue([task()]);
    queries.listAdmins.mockResolvedValue([
      { id: "me", email: "me@test.mk" },
      { id: "other", email: "other@test.mk" },
    ]);
    render(await AdminTasksPage({ searchParams: Promise.resolve({}) }));
    expect(queries.listAdminTasks).toHaveBeenCalledWith("me", { view: "mine", status: undefined });
    expect(screen.getByRole("link", { name: "Доделени на мене" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Испратени од мене" })).toHaveAttribute("href", "/admin/support?view=sent");
    expect(screen.getByRole("link", { name: "Отвори" })).toHaveAttribute("href", "/admin/support/t1");

    fireEvent.click(screen.getByRole("button", { name: "Нова задача" }));
    const options = within(screen.getByLabelText("Испрати до")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Сите админи (кој прв ќе ја земе)", "other@test.mk"]);

    fireEvent.change(screen.getByLabelText(/Наслов/), { target: { value: "Нова" } });
    fireEvent.change(screen.getByLabelText("Испрати до"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати задача" }));
    await waitFor(() => expect(taskActions.createAdminTask).toHaveBeenCalledWith({ title: "Нова", description: "", assignedTo: "other", files: [] }));
    expect(push).toHaveBeenCalledWith("/admin/support?view=sent");
  });

  it("the receiver gets Во тек / Решено", async () => {
    queries.getAdminTask.mockResolvedValue({ task: task(), comments: [] });
    render(await AdminTaskPage({ params: Promise.resolve({ id: "t1" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Во тек" }));
    await waitFor(() => expect(taskActions.setAdminTaskStatus).toHaveBeenCalledWith({ id: "t1", status: "in_progress" }));
    expect(screen.getByRole("button", { name: "Решено" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Избриши задача" })).not.toBeInTheDocument();
  });

  it("the sender only watches the status (no status buttons) and can delete", async () => {
    queries.getAdminTask.mockResolvedValue({ task: task({ createdBy: "me", createdByEmail: "me@test.mk", assignedTo: "other", assignedToEmail: "other@test.mk", status: "in_progress" }), comments: [] });
    render(await AdminTaskPage({ params: Promise.resolve({ id: "t1" }) }));
    expect(screen.getByText("Во тек")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Решено" })).not.toBeInTheDocument();
    expect(screen.getByText(/Статусот го менува админот што ја доби задачата/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Избриши задача" })).toBeInTheDocument();
  });

  it("a task sent to everyone can be started by another admin, but not by its sender", async () => {
    queries.getAdminTask.mockResolvedValue({ task: task({ assignedTo: null, assignedToEmail: null }), comments: [] });
    const { unmount } = render(await AdminTaskPage({ params: Promise.resolve({ id: "t1" }) }));
    expect(screen.getByText(/до Сите админи/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Во тек" })).toBeInTheDocument();
    unmount();

    queries.getAdminTask.mockResolvedValue({ task: task({ assignedTo: null, assignedToEmail: null, createdBy: "me" }), comments: [] });
    render(await AdminTaskPage({ params: Promise.resolve({ id: "t1" }) }));
    expect(screen.queryByRole("button", { name: "Во тек" })).not.toBeInTheDocument();
  });

  it("comments are added under the task", async () => {
    queries.getAdminTask.mockResolvedValue({
      task: task(),
      comments: [{ id: "c1", authorId: "other", authorEmail: "other@test.mk", body: "Прв коментар", createdAt: "2028-01-01T11:00:00Z", attachments: [] }],
    });
    render(await AdminTaskPage({ params: Promise.resolve({ id: "t1" }) }));
    expect(screen.getByText("Прв коментар")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Коментар"), { target: { value: "Одговор" } });
    fireEvent.click(screen.getByRole("button", { name: "Додај коментар" }));
    await waitFor(() => expect(taskActions.commentOnAdminTask).toHaveBeenCalledWith({ id: "t1", body: "Одговор", files: [] }));
  });

  it("shows the task's and a comment's attachments as links, and sends picked files when commenting", async () => {
    queries.getAdminTask.mockResolvedValue({
      task: task({ attachments: [{ path: "a.jpg", url: "https://x/a.jpg" }, { path: "b.pdf", url: "https://x/b.pdf" }] }),
      comments: [
        { id: "c1", authorId: "other", authorEmail: "other@test.mk", body: "Еве", createdAt: "2028-01-01T11:00:00Z", attachments: [{ path: "c.png", url: "https://x/c.png" }] },
      ],
    });
    render(await AdminTaskPage({ params: Promise.resolve({ id: "t1" }) }));
    // The thumbnails are decorative (alt="") inside a descriptive link, so
    // they're intentionally not in the accessibility tree's "img" role.
    expect(document.querySelectorAll("img")).toHaveLength(2); // a.jpg (task) + c.png (comment)
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute("href", "https://x/b.pdf");

    const picked = new File(["x"], "d.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Коментар"), { target: { value: "Одговор" } });
    fireEvent.change(screen.getByLabelText("Прилози (фотографии или PDF)"), { target: { files: [picked] } });
    fireEvent.click(screen.getByRole("button", { name: "Додај коментар" }));
    await waitFor(() => expect(taskActions.commentOnAdminTask).toHaveBeenCalledWith({ id: "t1", body: "Одговор", files: [picked] }));
  });
});

describe("admin sidebar badges", () => {
  it("shows the inbox and task counts next to their menu items, and nothing for zero", () => {
    const { rerender } = render(
      <AdminShell badges={{ inbox: 3, tasks: 1 }}>
        <p>content</p>
      </AdminShell>
    );
    expect(screen.getByRole("link", { name: "Пораки и барања 3" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Тикети за поддршка 1" })).toBeInTheDocument();

    rerender(
      <AdminShell badges={{ inbox: 0, tasks: 0 }}>
        <p>content</p>
      </AdminShell>
    );
    expect(screen.getByRole("link", { name: "Пораки и барања" })).toBeInTheDocument();
  });
});
