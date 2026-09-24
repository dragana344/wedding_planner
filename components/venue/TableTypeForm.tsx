"use client";

import { useState } from "react";
import { upsertTableType, updateTableType, type TableType, type TableTypeInput } from "@/lib/venue/rooms";

export function TableTypeForm({
  roomId,
  editingType,
  onSaved,
  onCancel,
}: {
  roomId: string;
  editingType?: TableType;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(editingType?.name ?? "");
  const [shape, setShape] = useState<TableTypeInput["shape"]>(editingType?.shape ?? "round");
  const [seats, setSeats] = useState(editingType?.seats ?? 10);
  const [widthCm, setWidthCm] = useState(editingType?.width_cm ?? 150);
  const [lengthCm, setLengthCm] = useState(editingType?.length_cm ?? 150);
  const [quantity, setQuantity] = useState(editingType?.quantity ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const input: TableTypeInput = {
        room_id: roomId,
        name,
        shape,
        seats,
        width_cm: widthCm,
        length_cm: lengthCm,
        quantity,
      };
      if (editingType) {
        await updateTableType(editingType.id, input);
      } else {
        await upsertTableType(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на видот маса. Обидете се повторно.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ev-form">
      <div className="ev-form-grid">
        <div className="ev-field ev-field-wide">
          <label className="lab-s" htmlFor="table-type-name">
            Име на видот маса <span className="req">*</span>
          </label>
          <input
            id="table-type-name"
            className="fld"
            placeholder="пр. Кружна-8"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="table-type-shape">
            Облик
          </label>
          <select
            id="table-type-shape"
            className="fld"
            value={shape}
            onChange={(e) => setShape(e.target.value as TableTypeInput["shape"])}
          >
            <option value="round">Тркалезна</option>
            <option value="rectangular">Правоаголна</option>
          </select>
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="table-type-seats">
            Места
          </label>
          <input
            id="table-type-seats"
            className="fld"
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
          />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="table-type-width">
            Ширина (см)
          </label>
          <input
            id="table-type-width"
            className="fld"
            type="number"
            min={1}
            value={widthCm}
            onChange={(e) => setWidthCm(Number(e.target.value))}
          />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="table-type-length">
            Должина (см)
          </label>
          <input
            id="table-type-length"
            className="fld"
            type="number"
            min={1}
            value={lengthCm}
            onChange={(e) => setLengthCm(Number(e.target.value))}
          />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="table-type-quantity">
            Количина
          </label>
          <input
            id="table-type-quantity"
            className="fld"
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </div>
      </div>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-gold" disabled={isSubmitting}>
          {isSubmitting ? "Се зачувува..." : editingType ? "Зачувај промени" : "Зачувај вид маса"}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isSubmitting}>
            Откажи
          </button>
        ) : null}
      </div>
    </form>
  );
}
