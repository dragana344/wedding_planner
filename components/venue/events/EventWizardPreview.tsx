"use client";

import { Icon } from "@/components/venue/shell/Icon";
import { TYPE_META } from "@/lib/venue/event-display";
import { formatMkDateWithWeekday } from "@/lib/date";
import { formatDen } from "@/lib/money";
import type { WizardState } from "@/lib/venue/event-wizard";
import type { Room } from "@/lib/venue/rooms";
import type { MenuTemplate } from "@/lib/venue/menus";

function PreviewRow({ icon, value, placeholder }: { icon: string; value: string; placeholder: string }) {
  const empty = !value;
  return (
    <div className={`ev-wiz-pl${empty ? " empty" : ""}`}>
      <span className="ev-wiz-pl-ic">
        <Icon name={icon} size="sm" />
      </span>
      <span>{empty ? placeholder : value}</span>
    </div>
  );
}

/**
 * The event card on the right of the wizard, filling in live as each step is
 * answered. `maxStepReached` gates the guests/menu rows so their non-empty
 * defaults (120 guests, "Без мени") don't show before the venue has actually
 * reached that step — otherwise the card would look "done" from step 0.
 */
export function EventWizardPreview({
  state,
  rooms,
  menuTemplates,
  maxStepReached,
}: {
  state: WizardState;
  rooms: Room[];
  menuTemplates: MenuTemplate[];
  maxStepReached: number;
}) {
  const meta = state.type ? TYPE_META[state.type] : null;
  const roomNames = state.roomIds
    .map((id) => rooms.find((r) => r.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");
  const pickedMenuNames = [
    ...state.menuTemplateIds
      .map((id) => menuTemplates.find((m) => m.id === id)?.name)
      .filter((name): name is string => Boolean(name)),
    ...(state.customMenu ? [state.customMenu.name] : []),
  ];
  const menuNames = maxStepReached >= 4 ? (pickedMenuNames.length > 0 ? pickedMenuNames.join(", ") : "Без мени") : "";
  const timeValue = state.startTime ? `${state.startTime}${state.endTime ? ` – ${state.endTime}` : ""}` : "";
  const total = Number(state.totalPrice) || 0;
  const deposit = Number(state.depositPaid) || 0;
  const priceValue = total ? `${formatDen(total)}${deposit ? ` · капар ${formatDen(deposit)}` : ""}` : "";

  return (
    <div className="ev-wiz-preview">
      <div className="ev-wiz-preview-inner">
        <div className="ev-wiz-preview-ic">
          <Icon name={meta?.icon ?? "sparkles"} />
        </div>
        <p className="ev-wiz-preview-eyebrow">{meta ? meta.label.toUpperCase() : "НОВ НАСТАН"}</p>
        <p className={`ev-wiz-preview-name${state.name ? "" : " empty"}`}>{state.name || "Име на настанот"}</p>
        <div className="ev-wiz-preview-div">
          <span className="ev-wiz-preview-div-line" />
          <span className="ev-wiz-preview-div-dot" />
          <span className="ev-wiz-preview-div-line" />
        </div>
        <div className="ev-wiz-preview-list">
          <PreviewRow icon="cal" value={state.date ? formatMkDateWithWeekday(state.date) : ""} placeholder="Датум" />
          <PreviewRow icon="clock" value={timeValue} placeholder="Време" />
          <PreviewRow icon="users" value={maxStepReached >= 3 ? `~${state.guestCount} гости` : ""} placeholder="Гости" />
          <PreviewRow icon="building" value={roomNames} placeholder="Простории" />
          <PreviewRow icon="menu" value={menuNames} placeholder="Мени" />
          <PreviewRow icon="coin" value={priceValue} placeholder="Цена" />
          <PreviewRow icon="key" value={state.username} placeholder="Пристап" />
          <PreviewRow icon="mail" value={state.contactEmail || state.contactPhone} placeholder="Контакт" />
        </div>
      </div>
    </div>
  );
}
