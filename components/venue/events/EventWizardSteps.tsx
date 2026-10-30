"use client";

import { Icon } from "@/components/venue/shell/Icon";
import { TYPE_META } from "@/lib/venue/event-display";
import { STATUS_OPTIONS } from "@/lib/venue/event-display";
import { formatDen } from "@/lib/money";
import { formatPrice } from "@/lib/venue/menu-display";
import type { EventType, EventStatus } from "@/lib/venue/events";
import type { Room } from "@/lib/venue/rooms";
import type { MenuTemplate, MenuItem } from "@/lib/venue/menus";
import { LockedBanner } from "@/components/entitlements/LockedBanner";

export type MenuTemplateWithItems = MenuTemplate & { items: MenuItem[] };

const NAME_PLACEHOLDERS: Record<EventType, string> = {
  wedding: "пр. Ивана & Марко",
  birthday: "пр. Првиот роденден на Ива",
  graduation: "пр. Матурска вечер 2027",
  baptism: "пр. Крштевање на Лука",
  anniversary: "пр. 25 години заедно",
  family: "пр. Семеен ручек",
  corporate: "пр. Годишна вечера на фирмата",
  conference: "пр. Tech конференција",
  presentation: "пр. Промоција на производ",
  seminar: "пр. Обука за продажба",
  team_building: "пр. Team building на тимот",
  new_year: "пр. Дочек 2027",
  school: "пр. Крај на учебната година",
  baby_shower: "пр. Baby shower за Ана",
  other: "пр. Име на прославата",
};

export function EventTypeStep({ selected, onSelect }: { selected: EventType | null; onSelect: (type: EventType) => void }) {
  return (
    <div className="ev-wiz-types">
      {(Object.entries(TYPE_META) as [EventType, (typeof TYPE_META)[EventType]][]).map(([key, meta]) => (
        <button
          key={key}
          type="button"
          className={`ev-wiz-ty${selected === key ? " on" : ""}`}
          aria-pressed={selected === key}
          onClick={() => onSelect(key)}
        >
          <span className="ev-wiz-ty-ic">
            <Icon name={meta.icon} size="lg" />
          </span>
          {meta.label}
        </button>
      ))}
    </div>
  );
}

export function NameStep({
  type,
  name,
  onChange,
}: {
  type: EventType | null;
  name: string;
  onChange: (value: string) => void;
}) {
  const isWedding = type === "wedding";
  return (
    <div>
      <label className="lab-s" htmlFor="ev-wiz-name">
        {isWedding ? "Имиња на младенците" : "Име на прославата"} <span className="req">*</span>
      </label>
      <input
        id="ev-wiz-name"
        className="ev-wiz-big"
        value={name}
        onChange={(e) => onChange(e.target.value)}
        placeholder={type ? NAME_PLACEHOLDERS[type] : ""}
        autoComplete="off"
      />
    </div>
  );
}

export function DateTimeStep({
  date,
  startTime,
  endTime,
  onDateChange,
  onStartChange,
  onEndChange,
}: {
  date: string;
  startTime: string;
  endTime: string;
  onDateChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  return (
    <div className="ev-form-grid">
      <div className="ev-field ev-field-wide">
        <label className="lab-s" htmlFor="ev-wiz-date">
          Датум <span className="req">*</span>
        </label>
        <input id="ev-wiz-date" className="fld" type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
      </div>
      <div className="ev-field">
        <label className="lab-s" htmlFor="ev-wiz-start">
          Почеток
        </label>
        <input id="ev-wiz-start" className="fld" type="time" value={startTime} onChange={(e) => onStartChange(e.target.value)} />
      </div>
      <div className="ev-field">
        <label className="lab-s" htmlFor="ev-wiz-end">
          Крај
        </label>
        <input id="ev-wiz-end" className="fld" type="time" value={endTime} onChange={(e) => onEndChange(e.target.value)} />
      </div>
    </div>
  );
}

const GUEST_CHIPS = [50, 100, 150, 200, 300, 400];

export function GuestsStep({ guestCount, onChange }: { guestCount: number; onChange: (count: number) => void }) {
  return (
    <div>
      <div style={{ textAlign: "center", padding: "4px 0 10px" }}>
        <span className="ev-wiz-guest-num">~{guestCount}</span>
        <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 8 }}>гости</span>
      </div>
      <input
        type="range"
        className="ev-wiz-range"
        min={10}
        max={600}
        step={10}
        value={guestCount}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Број на гости"
      />
      <div className="ev-wiz-chips">
        {GUEST_CHIPS.map((g) => (
          <button key={g} type="button" className={`ev-wiz-chip${guestCount === g ? " on" : ""}`} onClick={() => onChange(g)}>
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RoomsMenuStep({
  rooms,
  menuTemplates,
  selectedRoomIds,
  menuTemplateIds,
  onToggleRoom,
  onToggleMenu,
  onClearMenus,
  onViewMenu,
  customMenu,
  customMenuEnabled,
  customMenuError,
  onOpenCustomMenu,
  onRemoveCustomMenu,
}: {
  rooms: Room[];
  menuTemplates: MenuTemplateWithItems[];
  selectedRoomIds: string[];
  /** Several menus can be picked at once (e.g. classic + посно for mixed diets). */
  menuTemplateIds: string[];
  onToggleRoom: (roomId: string) => void;
  onToggleMenu: (menuTemplateId: string) => void;
  onClearMenus: () => void;
  onViewMenu: (index: number) => void;
  /** The event's own menu, built here; saved together with the event. */
  customMenu: { name: string; itemIds: string[] } | null;
  /** Whether the plan includes the custom menu; null while unknown. */
  customMenuEnabled: boolean | null;
  customMenuError: string | null;
  onOpenCustomMenu: () => void;
  onRemoveCustomMenu: () => void;
}) {
  const noMenu = menuTemplateIds.length === 0 && !customMenu;
  return (
    <div>
      <p className="lab-s" style={{ marginBottom: 10 }}>
        ПРОСТОРИИ
      </p>
      {rooms.length === 0 ? (
        <p className="ev-hint" style={{ marginBottom: 20 }}>
          Нема дефинирани простории за овој локал.
        </p>
      ) : (
        <div className="ev-wiz-opts cols-2" style={{ marginBottom: 20 }}>
          {rooms.map((room) => {
            const on = selectedRoomIds.includes(room.id);
            return (
              <button key={room.id} type="button" className={`ev-wiz-opt${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggleRoom(room.id)}>
                <span className="ev-wiz-opt-ic">
                  <Icon name="building" size="sm" />
                </span>
                {room.name}
                <span className="ev-wiz-tick">{on ? <Icon name="tick" size="sm" /> : null}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="lab-s" style={{ marginBottom: 10 }}>
        МЕНИ
      </p>
      <p className="ev-hint" style={{ marginBottom: 10 }}>
        Можете да изберете повеќе менија — на пример класично и посно, за гости со различна исхрана.
      </p>
      <div className="ev-wiz-opts">
        <button
          type="button"
          className={`ev-wiz-opt${noMenu ? " on" : ""}`}
          aria-pressed={noMenu}
          onClick={onClearMenus}
        >
          <span className="ev-wiz-opt-ic">
            <Icon name="ban" size="sm" />
          </span>
          Без мени
          <span className="ev-wiz-tick">{noMenu ? <Icon name="tick" size="sm" /> : null}</span>
        </button>
        {menuTemplates.map((template, index) => {
          const on = menuTemplateIds.includes(template.id);
          const vegCount = template.items.filter((i) => i.is_vegetarian).length;
          const total = template.items.reduce((sum, i) => sum + (i.price ?? 0), 0);
          return (
            <div key={template.id} className={`ev-wiz-opt ev-wiz-opt-row${on ? " on" : ""}`}>
              <button
                type="button"
                className="ev-wiz-opt-main"
                aria-pressed={on}
                aria-label={template.name}
                onClick={() => onToggleMenu(template.id)}
              >
                <span className="ev-wiz-opt-ic">
                  <Icon name="cutlery" size="sm" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span>{template.name}</span>
                  <span className="ev-wiz-opt-sub">
                    {template.items.length} јадења · {vegCount} вегетаријански · ≈ {formatPrice(total)} по гостин
                  </span>
                </span>
              </button>
              <button type="button" className="ev-wiz-opt-view" aria-label={`Погледни што содржи ${template.name}`} onClick={() => onViewMenu(index)}>
                <Icon name="eye" size="sm" /> Погледни
              </button>
              <button
                type="button"
                className="ev-wiz-tick"
                aria-pressed={on}
                aria-label={on ? `Отстрани го ${template.name}` : `Избери го ${template.name}`}
                onClick={() => onToggleMenu(template.id)}
              >
                {on ? <Icon name="tick" size="sm" /> : null}
              </button>
            </div>
          );
        })}
        {customMenu ? (
          <div className="ev-wiz-opt ev-wiz-opt-row on">
            <button type="button" className="ev-wiz-opt-main" aria-label={`Уреди го ${customMenu.name}`} onClick={onOpenCustomMenu}>
              <span className="ev-wiz-opt-ic">
                <Icon name="cutlery" size="sm" />
              </span>
              <span style={{ minWidth: 0 }}>
                <span>{customMenu.name}</span>
                <span className="ev-wiz-opt-sub">Сопствено мени · {customMenu.itemIds.length} јадења</span>
              </span>
            </button>
            <button type="button" className="ev-wiz-opt-view" onClick={onOpenCustomMenu}>
              <Icon name="edit" size="sm" /> Уреди
            </button>
            <button type="button" className="ev-wiz-tick" aria-label={`Отстрани го ${customMenu.name}`} onClick={onRemoveCustomMenu}>
              <Icon name="tick" size="sm" />
            </button>
          </div>
        ) : customMenuEnabled !== false ? (
          <button type="button" className="ev-wiz-opt" onClick={onOpenCustomMenu}>
            <span className="ev-wiz-opt-ic">
              <Icon name="plus" size="sm" />
            </span>
            <span style={{ minWidth: 0 }}>
              <span>Сопствено мени</span>
              <span className="ev-wiz-opt-sub">Мени само за овој настан, составено со парот</span>
            </span>
          </button>
        ) : null}
      </div>
      {customMenuEnabled === false && !customMenu ? (
        <div style={{ marginTop: 10 }}>
          <LockedBanner audience="venue" />
        </div>
      ) : null}
      {customMenuError ? (
        <p role="alert" className="ev-wiz-err" style={{ marginTop: 8 }}>
          {customMenuError}
        </p>
      ) : null}
    </div>
  );
}

export function PriceStep({
  totalPrice,
  depositPaid,
  onTotalChange,
  onDepositChange,
}: {
  totalPrice: string;
  depositPaid: string;
  onTotalChange: (value: string) => void;
  onDepositChange: (value: string) => void;
}) {
  const total = Number(totalPrice) || 0;
  const deposit = Number(depositPaid) || 0;
  const pct = total ? Math.min(100, (deposit / total) * 100) : 0;
  return (
    <div>
      <div className="ev-form-grid">
        <div className="ev-field">
          <label className="lab-s" htmlFor="ev-wiz-total">
            Вкупна цена
          </label>
          <div className="ev-wiz-cur">
            <input id="ev-wiz-total" className="fld" type="number" min={0} value={totalPrice} onChange={(e) => onTotalChange(e.target.value)} placeholder="0" />
            <span>МКД</span>
          </div>
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="ev-wiz-deposit">
            Платен капар
          </label>
          <div className="ev-wiz-cur">
            <input id="ev-wiz-deposit" className="fld" type="number" min={0} value={depositPaid} onChange={(e) => onDepositChange(e.target.value)} placeholder="0" />
            <span>МКД</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        {total ? (
          <>
            <div className="ev-wiz-rem-row">
              <span>Платено {Math.round(pct)}%</span>
              <span>
                Преостанато <b style={{ fontWeight: 500, color: "var(--ink)" }}>{formatDen(Math.max(0, total - deposit))}</b>
              </span>
            </div>
            <div className="ev-wiz-rem-track">
              <div className="ev-wiz-rem-fill" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Внесете цена за да видите колку е платено.</p>
        )}
      </div>
    </div>
  );
}

export function CredentialsStep({
  username,
  usernameTouched,
  password,
  onUsernameChange,
  onPasswordChange,
  onGenerate,
}: {
  username: string;
  usernameTouched: boolean;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onGenerate: () => void;
}) {
  const passwordLength = password.length;
  return (
    <div>
      <label className="lab-s" htmlFor="ev-wiz-username">
        Корисничко име <span className="req">*</span>
      </label>
      <input
        id="ev-wiz-username"
        className="fld"
        style={{ fontFamily: "var(--data)" }}
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        placeholder="пр. ivana-marko"
        autoComplete="off"
      />
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "5px 0 16px" }}>
        {!usernameTouched && username ? "Предлог од името, може да се смени" : " "}
      </p>
      <label className="lab-s" htmlFor="ev-wiz-password">
        Лозинка <span className="req">*</span>
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <input
          id="ev-wiz-password"
          className="fld"
          style={{ fontFamily: "var(--data)" }}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="off"
        />
        <button type="button" className="btn btn-ghost" onClick={onGenerate}>
          <Icon name="wand" size="sm" /> Генерирај
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 0" }}>
        {passwordLength >= 10 ? (
          <span style={{ color: "var(--gold-text)" }}>
            <Icon name="check" size="sm" /> Доволно долга
          </span>
        ) : (
          `Најмалку 10 знаци${passwordLength ? ` (уште ${10 - passwordLength})` : ""}`
        )}
      </p>
    </div>
  );
}

export function ContactStep({
  email,
  email2,
  phone,
  status,
  onEmailChange,
  onEmail2Change,
  onPhoneChange,
  onStatusChange,
}: {
  email: string;
  email2: string;
  phone: string;
  status: EventStatus;
  onEmailChange: (value: string) => void;
  onEmail2Change: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onStatusChange: (value: EventStatus) => void;
}) {
  return (
    <div className="ev-form-grid">
      <div className="ev-field ev-field-wide">
        <input className="fld" aria-label="Email на парот" placeholder="Email на парот" type="email" required value={email} onChange={(e) => onEmailChange(e.target.value)} />
      </div>
      <div className="ev-field">
        <label className="lab-s" htmlFor="ev-wiz-email2">
          Втора е-пошта (по желба)
        </label>
        <input id="ev-wiz-email2" className="fld" aria-label="Втора е-пошта (по желба)" type="email" value={email2} onChange={(e) => onEmail2Change(e.target.value)} />
      </div>
      <div className="ev-field">
        <input className="fld" aria-label="Телефон на парот" placeholder="Телефон на парот" type="tel" required value={phone} onChange={(e) => onPhoneChange(e.target.value)} />
      </div>
      <div className="ev-field ev-field-wide">
        <label className="lab-s" htmlFor="ev-wiz-status">
          Статус на настанот
        </label>
        <select id="ev-wiz-status" className="fld" value={status} onChange={(e) => onStatusChange(e.target.value as EventStatus)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
