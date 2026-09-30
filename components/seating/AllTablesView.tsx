"use client";

import "./seating-print.css";
import { seatingCsv } from "@/lib/seating/csv";
import { tableTitle, type RoomSeating } from "@/lib/seating/types";

/** Every table's seat list at once; picking a card highlights its table on the plan. */
export function AllTablesView({
  roomName,
  seating,
  highlightedId,
  onHighlight,
}: {
  roomName: string;
  seating: RoomSeating;
  highlightedId: string | null;
  onHighlight: (elementId: string | null) => void;
}) {
  const tables = [...seating.tables].sort((a, b) => a.number - b.number);

  function exportCsv() {
    const blob = new Blob([seatingCsv(roomName, seating)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${roomName} — распоред.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printLists() {
    document.body.classList.add("s3-printing-lists");
    const done = () => {
      document.body.classList.remove("s3-printing-lists");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  return (
    <section className="s3-print-lists mt-6" aria-label="Сите маси">
      <div className="s3-no-print mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-xl text-neutral-900">Сите маси — {roomName}</h2>
        <button type="button" onClick={exportCsv} className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-lilac-dark">
          Извези CSV
        </button>
        <button type="button" onClick={printLists} className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-lilac-dark">
          Печати листи
        </button>
      </div>
      {tables.length === 0 ? <p className="text-sm text-neutral-500">Во салата уште нема маси.</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((t) => {
          const seats = seating.seats.filter((s) => s.elementId === t.elementId).sort((a, b) => a.seatNumber - b.seatNumber);
          const active = highlightedId === t.elementId;
          return (
            <button
              key={t.elementId}
              type="button"
              aria-pressed={active}
              onClick={() => onHighlight(active ? null : t.elementId)}
              className={`s3-table-card rounded-2xl border bg-white p-3 text-left ${active ? "border-[#B8913A] ring-2 ring-[#B8913A]" : "border-neutral-200"}`}
            >
              <span className="mb-1 flex items-baseline justify-between">
                <span className="font-medium text-neutral-900">{tableTitle(t)}</span>
                <span className="text-sm text-neutral-500">
                  {seats.length}/{t.capacity}
                </span>
              </span>
              {seats.length === 0 ? (
                <span className="block text-sm text-neutral-400">Слободна маса</span>
              ) : (
                <ul className="text-sm text-neutral-700">
                  {seats.map((s) => (
                    <li key={s.seatNumber}>
                      {s.seatNumber}. {s.displayName}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
