import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ChangeNotice } from "@/components/couple/ChangeNotice";

const props = {
  section: "menus" as const,
  title: "Мени",
  lines: [{ key: "c1", text: "31.10.2026 14:05 · Додадено: Класично" }],
  upTo: "2026-10-31T13:05:00.123456+00:00",
};
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
});

describe("ChangeNotice", () => {
  it("shows the title and lines in a labelled region", () => {
    render(<ChangeNotice {...props} />);
    expect(screen.getByRole("region", { name: "Мени" })).toBeInTheDocument();
    expect(screen.getByText("31.10.2026 14:05 · Додадено: Класично")).toBeInTheDocument();
  });

  it("Видено posts the section and the unchanged up_to, then refreshes", async () => {
    const fetchMock = vi.fn(() => json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChangeNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/couple/changes/seen");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ section: "menus", up_to: props.upTo });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says there are newer changes when the server flags them, and still refreshes", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ ok: true, newer: true })));
    render(<ChangeNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Има нови промени — освежете.");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an error and does not refresh when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ error: "Не успеа." }, false)));
    render(<ChangeNotice {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не успеа.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
