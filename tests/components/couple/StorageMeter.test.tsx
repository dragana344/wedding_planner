import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorageMeter } from "@/components/couple/StorageMeter";

// C5: the album's space, shown like a phone plan's data meter.
const GB = 1024 ** 3;

describe("StorageMeter", () => {
  it("shows the limit, what is used, and the split into photos, videos and free space", () => {
    render(<StorageMeter usage={{ limitBytes: 20 * GB, photoBytes: 12 * GB, videoBytes: 1.2 * GB }} />);
    expect(screen.getByText("Ваш простор: 20 GB")).toBeInTheDocument();
    expect(screen.getByText("Искористено: 13,2 GB / 20 GB")).toBeInTheDocument();
    expect(screen.getByLabelText("Фотографии 60 %")).toBeInTheDocument();
    expect(screen.getByLabelText("Видеа 6 %")).toBeInTheDocument();
    expect(screen.getByLabelText("Останато 34 %")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Активирајте дополнителен пакет за повеќе простор" })).toHaveAttribute("href", "/couple/packages");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns when the album is full", () => {
    render(<StorageMeter usage={{ limitBytes: 5 * GB, photoBytes: 5 * GB, videoBytes: 0 }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Просторот е полн");
  });
});
