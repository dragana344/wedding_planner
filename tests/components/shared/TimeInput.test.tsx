import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeInput, parseTime24 } from "@/components/shared/TimeInput";

describe("parseTime24", () => {
  it("reads the ways people type a time, always as 24h", () => {
    expect(parseTime24("18:30")).toBe("18:30");
    expect(parseTime24("9")).toBe("09:00");
    expect(parseTime24("930")).toBe("09:30");
    expect(parseTime24("1830")).toBe("18:30");
    expect(parseTime24("18.30")).toBe("18:30");
    expect(parseTime24("0:05")).toBe("00:05");
  });

  it("refuses what isn't a time", () => {
    for (const bad of ["24:00", "18:60", "abc", "6pm", "12345", ""]) expect(parseTime24(bad)).toBeNull();
  });
});

function Harness({ initial = "", spy }: { initial?: string; spy: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TimeInput aria-label="Време" value={value} onChange={(v) => { spy(v); setValue(v); }} />
      <button type="button" onClick={() => setValue("20:00")}>Preset</button>
    </>
  );
}

describe("TimeInput", () => {
  it("is a plain text field (no AM/PM picker) and drops seconds from the stored value", () => {
    render(<TimeInput aria-label="Време" value="18:00:00" onChange={() => {}} />);
    const input = screen.getByLabelText("Време");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("18:00");
  });

  it("emits a complete time as soon as it is typed, and normalizes on blur", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const input = screen.getByLabelText("Време");
    fireEvent.change(input, { target: { value: "1" } });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "18:30" } });
    expect(spy).toHaveBeenLastCalledWith("18:30");

    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.blur(input);
    expect(spy).toHaveBeenLastCalledWith("09:00");
    expect(input).toHaveValue("09:00");
  });

  it("puts back the last good time when the text isn't one, and clearing emits empty", () => {
    const spy = vi.fn();
    render(<Harness initial="11:00" spy={spy} />);
    const input = screen.getByLabelText("Време");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("11:00");
    expect(spy).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "" } });
    expect(spy).toHaveBeenLastCalledWith("");
  });

  it("shows a value set from outside (a preset button)", () => {
    render(<Harness initial="11:00" spy={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Preset" }));
    expect(screen.getByLabelText("Време")).toHaveValue("20:00");
  });
});
