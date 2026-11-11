"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/venue/dashboard/Modal";
import { Icon } from "@/components/venue/shell/Icon";
import { WizardRoomLayoutEditor, type DraftElement } from "./WizardRoomLayoutEditor";
import { listFixedElements, type FixedElement } from "@/lib/venue/floorplan";
import { listTableTypes, type TableType } from "@/lib/venue/rooms";
import {
  listRoomPresets,
  getRoomPresetSnapshot,
  saveRoomPresetFromElements,
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

type Slide = { id: string; name: string };

/** Marks the room's already-chosen layout when the manager re-opens it. */
const CURRENT_ID = "current";

/**
 * Opens right after a manager picks a room for a full-capacity event
 * (event-wizard, step "Каде и што ќе се служи?"): resolve that room's
 * starting table layout — either one of its saved presets, or a brand-new
 * one built on the spot — before the wizard can move on. Opens straight on
 * the first saved layout; the arrows flip through the rest, like the menu
 * preview. Nothing here touches the database (except saving a new preset on
 * request); the resolved elements only travel in the wizard's own state
 * until the whole event is created.
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
  const [phase, setPhase] = useState<"loading" | "preview" | "create" | "save-prompt">("loading");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);
  // Loaded layouts by slide id; a preset is fetched the first time it's shown.
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotElement[]>>(
    initialElements ? { [CURRENT_ID]: initialElements } : {},
  );
  const [fixedElements, setFixedElements] = useState<FixedElement[]>([]);
  const [tableTypes, setTableTypes] = useState<TableType[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
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
        const all = [...(initialElements ? [{ id: CURRENT_ID, name: "Тековен распоред" }] : []), ...p.map((x) => ({ id: x.id, name: x.name }))];
        setSlides(all);
        setFixedElements(fixed);
        setTableTypes(types);
        if (all.length > 0) {
          setPhase("preview");
        } else {
          setDraft([]);
          setPhase("create");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const slide = slides[index];
  const slideElements = slide ? snapshots[slide.id] : undefined;

  useEffect(() => {
    if (phase !== "preview" || !slide || snapshots[slide.id]) return;
    let cancelled = false;
    setPickError(null);
    getRoomPresetSnapshot(slide.id, roomId)
      .then((snapshot) => {
        if (!cancelled) setSnapshots((prev) => ({ ...prev, [slide.id]: snapshot.elements }));
      })
      .catch((err) => {
        if (!cancelled) setPickError(errorMessage(err, "Планот не можеше да се вчита."));
      });
    return () => {
      cancelled = true;
    };
  }, [phase, slide, snapshots, roomId]);

  useEffect(() => {
    if (phase !== "preview") return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [phase, slides.length]);

  function confirmPreview() {
    if (slideElements) onResolved(slideElements);
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
    <Modal title={`Распоред за ${roomName}`} onClose={onClose} wide hideHeader className={phase === "save-prompt" || loadError ? "" : "rl-modal"}>
      <div className="rl-head">
        <h2 className="rl-title">{`Распоред за ${roomName}`}</h2>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Затвори">
          <Icon name="x" size="sm" />
        </button>
      </div>
      {loadError ? (
        <p role="alert">{loadError}</p>
      ) : phase === "loading" ? (
        <p className="ev-hint">Се вчитува...</p>
      ) : phase === "preview" && slide ? (
        <>
          <div className="rl-bar">
            <div className="rl-nav">
              <button type="button" className="modal-close" onClick={() => setIndex(index - 1)} disabled={index === 0} aria-label="Претходен распоред">
                <Icon name="left" size="sm" />
              </button>
              <div className="rl-nav-mid">
                <strong className="rl-name">{slide.name}</strong>
                <div className="mp-flip-dots">
                  {slides.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`mp-flip-dot${i === index ? " on" : ""}`}
                      onClick={() => setIndex(i)}
                      aria-label={`Распоред ${i + 1}`}
                    />
                  ))}
                  <span className="mp-flip-count">
                    {index + 1} / {slides.length}
                  </span>
                </div>
              </div>
              <button type="button" className="modal-close" onClick={() => setIndex(index + 1)} disabled={index === slides.length - 1} aria-label="Следен распоред">
                <Icon name="right" size="sm" />
              </button>
            </div>
            <div className="rl-actions">
              <button type="button" className="btn btn-ghost" onClick={openCreateNew}>
                + Нов распоред
              </button>
              <button type="button" className="btn btn-gold" onClick={confirmPreview} disabled={!slideElements}>
                Користи го овој распоред
              </button>
            </div>
          </div>
          {pickError ? <p role="alert" style={{ color: "var(--bad)", fontSize: 14, margin: 0 }}>{pickError}</p> : null}
          <div className="rl-body">
            {slideElements ? (
              <WizardRoomLayoutEditor
                key={slide.id}
                widthCm={widthCm}
                heightCm={heightCm}
                fixedElements={fixedElements}
                tableTypes={tableTypes}
                elements={toDraft(slideElements)}
                onChange={() => {}}
                readOnly
              />
            ) : pickError ? null : (
              <p className="ev-hint">Се вчитува...</p>
            )}
          </div>
        </>
      ) : phase === "create" ? (
        <>
          <div className="rl-bar">
            <div className="rl-nav-mid" style={{ alignItems: "flex-start" }}>
              <strong className="rl-name">Нов распоред</strong>
              {slides.length === 0 ? <span className="ev-hint">Нема зачувани распореди за оваа сала сè уште.</span> : null}
            </div>
            <div className="rl-actions">
              {slides.length > 0 ? (
                <button type="button" className="btn btn-ghost" onClick={() => setPhase("preview")}>
                  Назад
                </button>
              ) : null}
              <button type="button" className="btn btn-gold" onClick={handleDoneCreating}>
                Готово
              </button>
            </div>
          </div>
          <div className="rl-body">
            <WizardRoomLayoutEditor
              widthCm={widthCm}
              heightCm={heightCm}
              fixedElements={fixedElements}
              tableTypes={tableTypes}
              elements={draft}
              onChange={setDraft}
            />
          </div>
        </>
      ) : (
        <form onSubmit={handleSaveAndContinue} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="ev-hint">Да го зачувате овој распоред за да го користите и за други настани во иста сала?</p>
          <div className="ev-field">
            <label className="lab-s" htmlFor="wizard-preset-name">
              Име на планот
            </label>
            <input id="wizard-preset-name" className="fld" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="пр. Стандарден" />
          </div>
          {saveError ? <p role="alert" style={{ color: "var(--bad)", fontSize: 14, margin: 0 }}>{saveError}</p> : null}
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
