"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/venue/dashboard/Modal";
import { WizardRoomLayoutEditor, type DraftElement } from "./WizardRoomLayoutEditor";
import { listFixedElements, type FixedElement } from "@/lib/venue/floorplan";
import { listTableTypes, type TableType } from "@/lib/venue/rooms";
import {
  listRoomPresets,
  getRoomPresetSnapshot,
  saveRoomPresetFromElements,
  type RoomPreset,
  type SnapshotElement,
} from "@/lib/venue/room-presets";
import { errorMessage } from "@/lib/venue/user-error";

const LOAD_ERROR = "Податоците не можеа да се вчитаат.";

function stripDraft(elements: DraftElement[]): SnapshotElement[] {
  return elements.map((el) => ({
    element_type: el.element_type,
    table_type_id: el.table_type_id,
    x_cm: el.x_cm,
    y_cm: el.y_cm,
    width_cm: el.width_cm,
    length_cm: el.length_cm,
    rotation_deg: el.rotation_deg,
    label: el.label,
    group_id: el.group_id,
    table_role: el.table_role,
  }));
}

function toDraft(elements: SnapshotElement[]): DraftElement[] {
  return elements.map((el, i) => ({ ...el, localId: `seed-${i}`, createdAt: String(i).padStart(12, "0") }));
}

/**
 * Opens right after a manager picks a room for a full-capacity event
 * (event-wizard, step "Каде и што ќе се служи?"): resolve that room's
 * starting table layout — either one of its saved presets, or a brand-new
 * one built on the spot — before the wizard can move on. Nothing here
 * touches the database; the resolved elements only travel in the wizard's
 * own state until the whole event is created.
 */
export function EventRoomLayoutModal({
  roomId,
  roomName,
  widthCm,
  heightCm,
  initialElements,
  onResolved,
  onClose,
}: {
  roomId: string;
  roomName: string;
  widthCm: number;
  heightCm: number;
  /** Already-resolved elements, if the manager is re-opening this room to change their choice. */
  initialElements?: SnapshotElement[];
  onResolved: (elements: SnapshotElement[]) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"pick" | "preset-preview" | "create" | "save-prompt">("pick");
  const [presets, setPresets] = useState<RoomPreset[]>([]);
  const [fixedElements, setFixedElements] = useState<FixedElement[]>([]);
  const [tableTypes, setTableTypes] = useState<TableType[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [previewElements, setPreviewElements] = useState<SnapshotElement[] | null>(null);
  const [draft, setDraft] = useState<DraftElement[]>([]);
  const [presetName, setPresetName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [builtElements, setBuiltElements] = useState<SnapshotElement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRoomPresets(roomId), listFixedElements(roomId), listTableTypes(roomId)])
      .then(([p, fixed, types]) => {
        if (cancelled) return;
        setPresets(p);
        setFixedElements(fixed);
        setTableTypes(types);
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function handlePreviewPreset(presetId: string) {
    setPickError(null);
    setPickBusy(true);
    try {
      const snapshot = await getRoomPresetSnapshot(presetId, roomId);
      setPreviewElements(snapshot.elements);
      setPhase("preset-preview");
    } catch (err) {
      setPickError(errorMessage(err, "Планот не можеше да се вчита."));
    } finally {
      setPickBusy(false);
    }
  }

  function confirmPreview() {
    if (previewElements) onResolved(previewElements);
  }

  function openCreateNew() {
    setDraft(toDraft(initialElements ?? []));
    setPhase("create");
  }

  function handleDoneCreating() {
    setBuiltElements(stripDraft(draft));
    setPhase("save-prompt");
  }

  function finishWithoutSaving() {
    if (builtElements) onResolved(builtElements);
  }

  async function handleSaveAndContinue(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const name = presetName.trim();
    if (!name) {
      setSaveError("Внесете име за планот.");
      return;
    }
    if (!builtElements) return;
    setSaveBusy(true);
    try {
      await saveRoomPresetFromElements(roomId, name, builtElements);
      onResolved(builtElements);
    } catch (err) {
      setSaveError(errorMessage(err, "Планот не можеше да се зачува."));
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <Modal title={`Распоред за ${roomName}`} onClose={onClose} wide>
      {loadError ? (
        <p role="alert">{loadError}</p>
      ) : phase === "pick" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="ev-hint">
            Изберете еден од зачуваните распореди на маси за оваа сала, или создајте нов за овој настан.
          </p>
          {presets.length > 0 ? (
            <div className="ev-wiz-opts cols-2">
              {presets.map((p) => (
                <button key={p.id} type="button" className="ev-wiz-opt" disabled={pickBusy} onClick={() => handlePreviewPreset(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="ev-hint">Нема зачувани распореди за оваа сала сè уште.</p>
          )}
          {pickError ? <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{pickError}</p> : null}
          <button type="button" className="btn btn-gold" onClick={openCreateNew}>
            + Нов распоред
          </button>
        </div>
      ) : phase === "preset-preview" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <WizardRoomLayoutEditor
            widthCm={widthCm}
            heightCm={heightCm}
            fixedElements={fixedElements}
            tableTypes={tableTypes}
            elements={toDraft(previewElements ?? [])}
            onChange={() => {}}
            readOnly
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setPhase("pick")}>
              Назад
            </button>
            <button type="button" className="btn btn-gold" onClick={confirmPreview}>
              Користи го овој распоред
            </button>
          </div>
        </div>
      ) : phase === "create" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <WizardRoomLayoutEditor
            widthCm={widthCm}
            heightCm={heightCm}
            fixedElements={fixedElements}
            tableTypes={tableTypes}
            elements={draft}
            onChange={setDraft}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setPhase("pick")}>
              Назад
            </button>
            <button type="button" className="btn btn-gold" onClick={handleDoneCreating}>
              Готово
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSaveAndContinue} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="ev-hint">Да го зачувате овој распоред за да го користите и за други настани во иста сала?</p>
          <div className="ev-field">
            <label className="lab-s" htmlFor="wizard-preset-name">
              Име на планот
            </label>
            <input id="wizard-preset-name" className="fld" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="пр. Стандарден" />
          </div>
          {saveError ? <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{saveError}</p> : null}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost" onClick={finishWithoutSaving} disabled={saveBusy}>
              Продолжи без зачувување
            </button>
            <button type="submit" className="btn btn-gold" disabled={saveBusy}>
              {saveBusy ? "Се зачувува..." : "Зачувај и продолжи"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
