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

  it("refuses the task list when the admin guard refuses", async () => {
    const refusal = new Error("Admin access required.");
    requireAdmin.mockRejectedValueOnce(refusal);
    await expect(listAdminTasks(sender, {})).rejects.toBe(refusal);
  });
});
