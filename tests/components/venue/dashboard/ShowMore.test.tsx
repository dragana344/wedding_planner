import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePaged } from "@/components/venue/dashboard/ShowMore";

function List({ items, filter }: { items: string[]; filter: string }) {
  const page = usePaged(items, filter);
  return (
    <div>
      <ul>
        {page.visible.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      {page.showMore}
    </div>
  );
}

const items = Array.from({ length: 23 }, (_, i) => `ред ${i + 1}`);

describe("usePaged / ShowMore", () => {
  it("shows 10, adds 10 per click, and hides the control once all are shown", async () => {
    render(<List items={items} filter="a" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("10 од 23")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Прикажи уште 10/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    await userEvent.click(screen.getByRole("button", { name: /Прикажи уште 3/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(23);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("starts over at 10 when the filter changes, and shows nothing extra for short lists", async () => {
    const { rerender } = render(<List items={items} filter="a" />);
    await userEvent.click(screen.getByRole("button", { name: /Прикажи уште/ }));
    rerender(<List items={items} filter="b" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    rerender(<List items={items.slice(0, 4)} filter="c" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
