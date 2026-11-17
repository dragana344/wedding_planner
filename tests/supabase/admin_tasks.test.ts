// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

const requireAdmin = vi.fn(async () => ({ adminUserId: "a", requestId: null }));
vi.mock("@/lib/admin/guard", () => ({ requireAdmin }));

const { listAdminTasks, getAdminTask, getAdminBadgeCounts, listAdmins } = await import("@/lib/admin/queries");
const { adminTaskActionCore: core } = await import("@/lib/admin/task-actions-core");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let sender: string;
let receiver: string;
let third: string;
let staffUser: string;
const as = (adminUserId: string) => ({ adminUserId, requestId: null });

async function makeAdmin(name: string): Promise<string> {
  const { data } = await db.auth.admin.createUser({
    email: `${name}-${stamp}@test.local`,
    password: "task-admin-1",
    email_confirm: true,
    app_metadata: { role: "platform_admin" },
  });
  return data.user!.id;
}

beforeAll(async () => {
  [sender, receiver, third] = await Promise.all([makeAdmin("sender"), makeAdmin("receiver"), makeAdmin("third")]);
  staffUser = (await db.auth.admin.createUser({ email: `staff-${stamp}@test.local`, password: "task-staff-1", email_confirm: true })).data.user!.id;
});
afterAll(async () => {
  await db.from("admin_tasks").delete().in("created_by", [sender, receiver, third]);
  for (const id of [sender, receiver, third, staffUser]) await db.auth.admin.deleteUser(id);
});

describe("admin tasks", () => {
  it("lists only platform admins as possible receivers", async () => {
    const admins = await listAdmins();
    expect(admins.map((a) => a.id)).toEqual(expect.arrayContaining([sender, receiver, third]));
    expect(admins.map((a) => a.id)).not.toContain(staffUser);
  });

  it("a task sent to one admin: only the receiver changes its status, and the sender sees each change", async () => {
    const { data } = await core.create({ title: "Провери фактура", description: "За локал X", assignedTo: receiver }, as(sender));

    expect((await listAdminTasks(receiver, { view: "mine" })).map((t) => t.id)).toContain(data.id);
    expect((await listAdminTasks(third, { view: "mine" })).map((t) => t.id)).not.toContain(data.id);
    expect((await listAdminTasks(sender, { view: "sent" })).map((t) => t.id)).toContain(data.id);

    await expect(core.setStatus({ id: data.id, status: "in_progress" }, as(sender))).rejects.toThrow("Статусот го менува админот што ја доби задачата.");
    await expect(core.setStatus({ id: data.id, status: "in_progress" }, as(third))).rejects.toThrow();

    await core.setStatus({ id: data.id, status: "in_progress" }, as(receiver));
    let seenBySender = (await listAdminTasks(sender, { view: "sent" })).find((t) => t.id === data.id)!;
    expect(seenBySender.status).toBe("in_progress");
    expect(seenBySender.assignedToEmail).toBe(`receiver-${stamp}@test.local`);

    await core.setStatus({ id: data.id, status: "done" }, as(receiver));
    seenBySender = (await listAdminTasks(sender, { view: "sent" })).find((t) => t.id === data.id)!;
    expect(seenBySender.status).toBe("done");
    expect(seenBySender.completedAt).not.toBeNull();

    // Reopening clears the completion time.
    await core.setStatus({ id: data.id, status: "in_progress" }, as(receiver));
    expect((await getAdminTask(data.id))!.task.completedAt).toBeNull();
  });

  it("a task sent to every admin: anyone but the sender can start it, and starting it claims it", async () => {
    const { data } = await core.create({ title: "Отворена задача", description: "", assignedTo: null }, as(sender));

    expect((await listAdminTasks(receiver, { view: "mine" })).map((t) => t.id)).toContain(data.id);
    expect((await listAdminTasks(third, { view: "mine" })).map((t) => t.id)).toContain(data.id);
    // The sender follows it under "sent", not under "mine".
    expect((await listAdminTasks(sender, { view: "mine" })).map((t) => t.id)).not.toContain(data.id);
    await expect(core.setStatus({ id: data.id, status: "in_progress" }, as(sender))).rejects.toThrow();

    await core.setStatus({ id: data.id, status: "in_progress" }, as(third));
    const task = (await getAdminTask(data.id))!.task;
    expect(task.assignedTo).toBe(third);
    // Once claimed, the other admins can no longer change it.
    await expect(core.setStatus({ id: data.id, status: "done" }, as(receiver))).rejects.toThrow();
    expect((await listAdminTasks(receiver, { view: "mine" })).map((t) => t.id)).not.toContain(data.id);
  });

  it("refuses sending a task to yourself or to a non-admin", async () => {
    await expect(core.create({ title: "Сам", description: "", assignedTo: sender }, as(sender))).rejects.toThrow("Задачата се праќа на друг админ.");
    await expect(core.create({ title: "Не-админ", description: "", assignedTo: staffUser }, as(sender))).rejects.toThrow("Избраниот примач не е админ.");
  });

  it("any admin can comment; comments come back oldest first with the author's e-mail", async () => {
    const { data } = await core.create({ title: "Со коментари", description: "", assignedTo: receiver }, as(sender));
    await core.comment({ id: data.id, body: "Ти треба ли телефонот?" }, as(receiver));
    await core.comment({ id: data.id, body: "Да, прати." }, as(sender));
    const { comments } = (await getAdminTask(data.id))!;
    expect(comments.map((c) => [c.authorEmail, c.body])).toEqual([
      [`receiver-${stamp}@test.local`, "Ти треба ли телефонот?"],
      [`sender-${stamp}@test.local`, "Да, прати."],
    ]);
  });

  it("only the sender can delete a task", async () => {
    const { data } = await core.create({ title: "За бришење", description: "", assignedTo: receiver }, as(sender));
    await expect(core.remove({ id: data.id }, as(receiver))).rejects.toThrow("Задачата може да ја избрише само админот што ја испратил.");
    await core.remove({ id: data.id }, as(sender));
    expect(await getAdminTask(data.id)).toBeNull();
  });

  it("the tasks badge counts new tasks waiting for me (mine, or open to everyone and not sent by me)", async () => {
    const before = await getAdminBadgeCounts(third);
    const direct = await core.create({ title: "Директна", description: "", assignedTo: third }, as(sender));
    await core.create({ title: "За сите", description: "", assignedTo: null }, as(sender));
    await core.create({ title: "Моја за сите", description: "", assignedTo: null }, as(third));
    expect((await getAdminBadgeCounts(third)).tasks).toBe(before.tasks + 2);
    await core.setStatus({ id: direct.data.id, status: "in_progress" }, as(third));
    expect((await getAdminBadgeCounts(third)).tasks).toBe(before.tasks + 1);
  });

  it("a comment flags the other side's unread flag, and the badge counts it; opening the task clears your own side", async () => {
    const { data } = await core.create({ title: "Со известување", description: "", assignedTo: receiver }, as(sender));
    await core.setStatus({ id: data.id, status: "in_progress" }, as(receiver));

    const beforeSender = await getAdminBadgeCounts(sender);
    await core.comment({ id: data.id, body: "Прашање?" }, as(receiver));
    let task = (await getAdminTask(data.id))!.task;
    expect(task.createdByUnread).toBe(true);
    expect(task.assignedToUnread).toBe(false);
    expect((await getAdminBadgeCounts(sender)).tasks).toBe(beforeSender.tasks + 1);

    // Opening it as the sender clears the sender's own flag...
    task = (await getAdminTask(data.id, sender))!.task;
    expect(task.createdByUnread).toBe(false);
    expect((await getAdminBadgeCounts(sender)).tasks).toBe(beforeSender.tasks);

    // ...and the sender replying flags the receiver's side instead.
    const beforeReceiver = await getAdminBadgeCounts(receiver);
    await core.comment({ id: data.id, body: "Да, еве." }, as(sender));
    expect((await getAdminTask(data.id))!.task.assignedToUnread).toBe(true);
    expect((await getAdminBadgeCounts(receiver)).tasks).toBe(beforeReceiver.tasks + 1);
    task = (await getAdminTask(data.id, receiver))!.task;
    expect(task.assignedToUnread).toBe(false);
    expect((await getAdminBadgeCounts(receiver)).tasks).toBe(beforeReceiver.tasks);
  });

  it("commenting on a pooled, unclaimed task flags the sender but leaves no assignee to flag", async () => {
    const { data } = await core.create({ title: "Отворена со коментар", description: "", assignedTo: null }, as(sender));
    await core.comment({ id: data.id, body: "Некој друг прашува" }, as(third));
    const task = (await getAdminTask(data.id))!.task;
    expect(task.createdByUnread).toBe(true);
    expect(task.assignedToUnread).toBe(false);
  });

  it("refuses the task list when the admin guard refuses", async () => {
    const refusal = new Error("Admin access required.");
    requireAdmin.mockRejectedValueOnce(refusal);
    await expect(listAdminTasks(sender, {})).rejects.toBe(refusal);
  });

  describe("photo/PDF attachments (0153)", () => {
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = (bytes: BlobPart, name: string, type: string) => new File([bytes], name, { type });

    async function listBucket(prefix = "") {
      const { data, error } = await db.storage.from("admin-task-attachments").list(prefix);
      if (error) throw error;
      return data ?? [];
    }

    it("a photo and a PDF on a new task come back with working signed links", async () => {
      const { data } = await core.create(
        { title: "Со прилози", description: "", assignedTo: receiver, files: [file(JPEG, "a.jpg", "image/jpeg"), file(PDF, "b.pdf", "application/pdf")] },
        as(sender),
      );
      const { task } = (await getAdminTask(data.id))!;
      expect(task.attachments).toHaveLength(2);
      expect(task.attachments.map((a) => a.path.split(".").pop())).toEqual(["jpg", "pdf"]);
      for (const a of task.attachments) {
        expect(a.url).toMatch(/^https?:\/\//);
        const res = await fetch(a.url);
        expect(res.status).toBe(200);
      }
    });

    it("a comment's attachment shows up on that comment, not the task", async () => {
      const { data } = await core.create({ title: "Коментар со прилог", description: "", assignedTo: receiver }, as(sender));
      await core.comment({ id: data.id, body: "Еве слика", files: [file(JPEG, "c.jpg", "image/jpeg")] }, as(receiver));
      const { task, comments } = (await getAdminTask(data.id))!;
      expect(task.attachments).toEqual([]);
      expect(comments[0].attachments).toHaveLength(1);
      expect(comments[0].attachments[0].url).toMatch(/^https?:\/\//);
    });

    it("refuses more than 5 attachments, and an unsupported file type — neither creates anything nor leaves an orphaned upload", async () => {
      const before = await listBucket();
      const tooMany = Array.from({ length: 6 }, (_, i) => file(JPEG, `${i}.jpg`, "image/jpeg"));
      await expect(core.create({ title: "Премногу", description: "", assignedTo: null, files: tooMany }, as(sender))).rejects.toThrow("Најмногу 5 прилози.");

      const unsupported = file(new TextEncoder().encode("not a photo or pdf"), "x.txt", "text/plain");
      await expect(core.create({ title: "Погрешен тип", description: "", assignedTo: null, files: [unsupported] }, as(sender))).rejects.toThrow(
        "Неподдржан тип прилог. Изберете JPEG, PNG, WebP или PDF.",
      );
      expect(await listBucket()).toHaveLength(before.length);
    });

    it("refuses a file over 8 MB", async () => {
      const big = new Uint8Array(8 * 1024 * 1024 + 1);
      big.set(JPEG);
      await expect(
        core.create({ title: "Преголема", description: "", assignedTo: null, files: [file(big, "big.jpg", "image/jpeg")] }, as(sender)),
      ).rejects.toThrow("Прилогот е преголем (најмногу 8 MB).");
    });

    it("deleting a task removes its own and its comments' attachments from storage", async () => {
      const { data } = await core.create({ title: "За бришење со прилог", description: "", assignedTo: receiver, files: [file(JPEG, "d.jpg", "image/jpeg")] }, as(sender));
      await core.comment({ id: data.id, body: "Прилог", files: [file(PDF, "e.pdf", "application/pdf")] }, as(receiver));
      const { task, comments } = (await getAdminTask(data.id))!;
      const paths = [...task.attachments.map((a) => a.path), ...comments[0].attachments.map((a) => a.path)];
      expect(paths).toHaveLength(2);

      await core.remove({ id: data.id }, as(sender));
      const remaining = (await listBucket()).map((f) => f.name);
      for (const p of paths) expect(remaining).not.toContain(p);
    });
  });
});
