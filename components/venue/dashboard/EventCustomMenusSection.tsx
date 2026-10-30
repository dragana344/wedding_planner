"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "./Modal";
import { PackageBuilder } from "./PackageBuilder";
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";
import { todayIn } from "@/lib/date";
import {
  copyCustomMenuViaApi,
  deleteCustomMenuViaApi,
  saveCustomMenuViaApi,
} from "@/lib/venue/custom-menu-client";
import { COURSE_META, COURSE_ORDER } from "@/lib/venue/menu-display";
import type { EventCustomMenu, MenuItem } from "@/lib/venue/menus";
import { errorMessage } from "@/lib/venue/user-error";

/** "2027-06-14" -> "14.06.2027". */
function formatDotDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Event-only menus built for single events: upcoming first, past ones folded away. */
export function EventCustomMenusSection({
  venueId,
  menus,
  items,
  onChanged,
}: {
  venueId: string;
  menus: EventCustomMenu[];
  items: MenuItem[];
  /** Called after a copy, edit or delete so the page lists reload. */
  onChanged: () => void | Promise<void>;
}) {
  const { managerName, token } = useManagerElevation();
  const isManager = Boolean(managerName);
  const [showPast, setShowPast] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const today = todayIn();
  const sorted = [...menus].sort((a, b) =>
    a.event.event_date.localeCompare(b.event.event_date),
  );
  const upcoming = sorted.filter((m) => m.event.event_date >= today);
  const past = sorted.filter((m) => m.event.event_date < today).reverse();
  const editing = menus.find((m) => m.id === editingId) ?? null;

  async function run(
    menuId: string,
    action: () => Promise<void>,
    fallback: string,
  ) {
    setError(null);
    setNotice(null);
    setBusyId(menuId);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  function renderCard(menu: EventCustomMenu, isPast: boolean) {
    const groups = COURSE_ORDER.map(
      (course) =>
        [course, menu.items.filter((i) => i.course === course)] as const,
    ).filter(([, d]) => d.length > 0);
    const busy = busyId === menu.id;
    return (
      <div key={menu.id} className="mp-pk-card" style={{ cursor: "default" }}>
        <div className="mp-pk-inner">
          <p className="mp-pk-name">{menu.name}</p>
          <p className="mp-pk-desc">{`${menu.event.couple_names} · ${formatDotDate(menu.event.event_date)}`}</p>
          <div className="mp-divider">
            <span />
            <i />
            <span />
          </div>
          {groups.length === 0 ? (
            <p className="mp-pk-dish">Нема јадења</p>
          ) : null}
          {groups.map(([course, dishes]) => (
            <div key={course}>
              <p className="mp-lab mp-pk-course">
                {COURSE_META[course].label.toUpperCase()}
              </p>
              {dishes.map((item) => (
                <p key={item.id} className="mp-pk-dish">
                  {item.name}
                </p>
              ))}
            </div>
          ))}
          {menu.latestCount != null ? (
            <p className="mp-pk-foot">{`${menu.latestCount} гости`}</p>
          ) : null}
          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}
          >
            <Link
              className="btn btn-ghost"
              href={`/venue/events?event=${menu.event.id}`}
            >
              Отвори настан
            </Link>
            {isManager ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setEditingId(menu.id)}
                >
                  Уреди
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    run(
                      menu.id,
                      async () => {
                        await copyCustomMenuViaApi(menu.id, token);
                        setNotice("Стандардниот пакет е создаден.");
                      },
                      "Не успеа создавањето на пакетот.",
                    )
                  }
                >
                  Направи стандарден пакет
                </button>
                {isPast ? (
                  confirmingId === menu.id ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ color: "var(--bad)" }}
                        disabled={busy}
                        onClick={() =>
                          run(
                            menu.id,
                            () => deleteCustomMenuViaApi(menu.id, token),
                            "Не успеа бришењето на менито.",
                          )
                        }
                      >
                        {busy ? "Се брише..." : "Потврди бришење"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => setConfirmingId(null)}
                      >
                        Откажи
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ color: "var(--bad)" }}
                      onClick={() => setConfirmingId(menu.id)}
                    >
                      Избриши
                    </button>
                  )
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <h3 className="panel-t" style={{ margin: "16px 0 8px" }}>
        Сопствени менија за настани
      </h3>
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5 }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" style={{ fontSize: 13.5 }}>
          {notice}
        </p>
      ) : null}
      {menus.length === 0 ? (
        <div className="empty">
          <b>Нема сопствени менија</b>
          Менаџер може да состави мени за одреден настан од страницата на
          настанот.
        </div>
      ) : null}
      {upcoming.length > 0 ? (
        <div className="mp-pk-grid">
          {upcoming.map((m) => renderCard(m, false))}
        </div>
      ) : null}
      {past.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={showPast}
            onClick={() => setShowPast((v) => !v)}
          >
            {`Поминати (${past.length})`}
          </button>
          {showPast ? (
            <div className="mp-pk-grid" style={{ marginTop: 10 }}>
              {past.map((m) => renderCard(m, true))}
            </div>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <Modal
          title={editing.name}
          onClose={() => setEditingId(null)}
          wide
          hideHeader
        >
          <PackageBuilder
            venueId={venueId}
            template={editing}
            initialItemIds={editing.items.map((i) => i.id)}
            items={items}
            allowDelete={false}
            onSave={async ({ name, itemIds }) => {
              await saveCustomMenuViaApi(
                editing.event.id,
                { name, itemIds },
                token,
              );
            }}
            onClose={() => setEditingId(null)}
            onChanged={() => void onChanged()}
          />
        </Modal>
      ) : null}
    </div>
  );
}
