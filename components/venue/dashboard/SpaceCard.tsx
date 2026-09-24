"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "./Modal";
import { Icon } from "@/components/venue/shell/Icon";
import { TableTypeForm } from "@/components/venue/TableTypeForm";
import {
  listTableTypes,
  updateRoomName,
  deleteRoom,
  deleteTableType,
  type RoomWithSeatTotal,
  type TableType,
} from "@/lib/venue/rooms";

export function SpaceCard({ room, onChanged }: { room: RoomWithSeatTotal; onChanged: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)} type="button" className="menu-package-card">
        <b>{room.name}</b>
        <span className="muted">
          {room.tableTypeCount} {room.tableTypeCount === 1 ? "вид маса" : "видови маси"} · {room.seatTotal} места
        </span>
      </button>
      {isOpen ? <RoomDetailModal room={room} onClose={() => setIsOpen(false)} onChanged={onChanged} /> : null}
    </>
  );
}

function RoomDetailModal({
  room,
  onClose,
  onChanged,
}: {
  room: RoomWithSeatTotal;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tableTypes, setTableTypes] = useState<TableType[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(room.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmingDeleteSpace, setConfirmingDeleteSpace] = useState(false);
  const [isDeletingSpace, setIsDeletingSpace] = useState(false);
  const [deleteSpaceError, setDeleteSpaceError] = useState<string | null>(null);
  const [editingTableTypeId, setEditingTableTypeId] = useState<string | null>(null);
  const [confirmingDeleteTableTypeId, setConfirmingDeleteTableTypeId] = useState<string | null>(null);
  const [deleteTableTypeError, setDeleteTableTypeError] = useState<string | null>(null);

  async function refresh() {
    const types = await listTableTypes(room.id);
    setTableTypes(types);
    setShowAddForm(false);
    setEditingTableTypeId(null);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setIsSavingName(true);
    try {
      await updateRoomName(room.id, name);
      setIsEditingName(false);
      onChanged();
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Не успеа преименувањето. Обидете се повторно.");
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleDeleteSpace() {
    setDeleteSpaceError(null);
    setIsDeletingSpace(true);
    try {
      await deleteRoom(room.id);
      onChanged();
      onClose();
    } catch (err) {
      setDeleteSpaceError(err instanceof Error ? err.message : "Не успеа бришењето на просторијата. Обидете се повторно.");
      setIsDeletingSpace(false);
    }
  }

  async function handleDeleteTableType(tableTypeId: string) {
    setDeleteTableTypeError(null);
    try {
      await deleteTableType(tableTypeId);
      setConfirmingDeleteTableTypeId(null);
      await refresh();
      onChanged();
    } catch (err) {
      setDeleteTableTypeError(err instanceof Error ? err.message : "Не успеа бришењето на видот маса. Обидете се повторно.");
    }
  }

  async function handleTableTypeSaved() {
    await refresh();
    onChanged();
  }

  const SHAPE_LABELS: Record<TableType["shape"], string> = {
    round: "тркалезна",
    rectangular: "правоаголна",
  };

  return (
    <Modal title={isEditingName ? "Уреди просторија" : room.name} onClose={onClose}>
      <div className="ev-sections">
        {isEditingName ? (
          <form onSubmit={handleSaveName} className="ev-form">
            <div className="ev-field">
              <label className="lab-s" htmlFor="edit-room-name">
                Име на просторијата
              </label>
              <input
                id="edit-room-name"
                className="fld"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            {nameError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{nameError}</p> : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-gold" disabled={isSavingName}>
                {isSavingName ? "Се зачувува..." : "Зачувај"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setIsEditingName(false)} disabled={isSavingName}>
                Откажи
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIsEditingName(true)}>
              <Icon name="edit" size="sm" /> Преименувај
            </button>
            {confirmingDeleteSpace ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                Да се избрише просторијата?
                <button
                  type="button"
                  onClick={handleDeleteSpace}
                  disabled={isDeletingSpace}
                  className="btn btn-ghost"
                  style={{ color: "var(--bad)" }}
                >
                  {isDeletingSpace ? "Се брише..." : "Да, избриши"}
                </button>
                <button type="button" onClick={() => setConfirmingDeleteSpace(false)} disabled={isDeletingSpace} className="btn btn-ghost">
                  Откажи
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDeleteSpace(true)}
                className="btn btn-ghost"
                style={{ color: "var(--bad)" }}
              >
                <Icon name="trash" size="sm" /> Избриши просторија
              </button>
            )}
          </div>
        )}
        {deleteSpaceError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{deleteSpaceError}</p> : null}

        <Link href={`/venue/rooms/${room.id}/floor-plan`} className="btn btn-gold" style={{ justifyContent: "center" }}>
          <Icon name="pin" size="sm" /> Уреди распоред на масите
        </Link>

        <div>
          <p className="card-t" style={{ marginBottom: 10 }}>
            Видови маси
          </p>
          {tableTypes === null ? (
            <p className="muted">Се вчитува...</p>
          ) : tableTypes.length === 0 ? (
            <p className="muted">Нема видови маси.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tableTypes.map((t) =>
                editingTableTypeId === t.id ? (
                  <TableTypeForm
                    key={t.id}
                    roomId={room.id}
                    editingType={t}
                    onSaved={handleTableTypeSaved}
                    onCancel={() => setEditingTableTypeId(null)}
                  />
                ) : (
                  <div key={t.id} className="pkg-item" style={{ cursor: "default" }}>
                    <div style={{ flex: 1 }}>
                      <b>{t.name}</b>
                      <span className="muted"> — {SHAPE_LABELS[t.shape]}</span>
                    </div>
                    <span className="muted">
                      {t.quantity} × {t.seats} места
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setEditingTableTypeId(t.id)}
                      aria-label={`Уреди ${t.name}`}
                    >
                      <Icon name="edit" size="sm" />
                    </button>
                    {confirmingDeleteTableTypeId === t.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDeleteTableType(t.id)}
                          className="btn btn-ghost"
                          style={{ color: "var(--bad)" }}
                        >
                          Да, избриши
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDeleteTableTypeId(null)}>
                          Откажи
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteTableTypeId(t.id)}
                        className="btn btn-ghost"
                        style={{ color: "var(--bad)" }}
                        aria-label={`Избриши ${t.name}`}
                      >
                        <Icon name="trash" size="sm" />
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          )}
          {deleteTableTypeError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{deleteTableTypeError}</p> : null}
        </div>

        {showAddForm ? (
          <TableTypeForm roomId={room.id} onSaved={handleTableTypeSaved} onCancel={() => setShowAddForm(false)} />
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setShowAddForm(true)}>
            <Icon name="plus" size="sm" /> Додади вид маса
          </button>
        )}
      </div>
    </Modal>
  );
}
