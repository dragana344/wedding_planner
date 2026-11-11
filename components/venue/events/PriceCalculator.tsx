"use client";

import { useState } from "react";
import { Modal } from "@/components/venue/dashboard/Modal";
import { Icon } from "@/components/venue/shell/Icon";
import { LogoMark } from "@/components/marketing/BrandLogo";

type Operator = "+" | "−" | "×" | "÷";

function compute(a: number, op: Operator, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? 0 : a / b;
  }
}

/** A plain +/−/×/÷ keypad, like a phone's calculator app — for any ad-hoc
 * math the per-guest tab doesn't cover. */
function Keypad({ onApply }: { onApply: (total: number) => void }) {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [overwrite, setOverwrite] = useState(true);

  function pressDigit(d: string) {
    if (overwrite) {
      setDisplay(d);
      setOverwrite(false);
    } else {
      setDisplay((prev) => (prev === "0" ? d : prev + d));
    }
  }

  function pressDot() {
    if (overwrite) {
      setDisplay("0.");
      setOverwrite(false);
      return;
    }
    setDisplay((prev) => (prev.includes(".") ? prev : prev + "."));
  }

  function pressOperator(op: Operator) {
    const current = Number(display);
    if (stored !== null && operator) {
      setStored(compute(stored, operator, current));
    } else {
      setStored(current);
    }
    setOperator(op);
    setOverwrite(true);
  }

  function pressEquals() {
    if (stored === null || !operator) return;
    const result = compute(stored, operator, Number(display));
    setDisplay(String(result));
    setStored(null);
    setOperator(null);
    setOverwrite(true);
  }

  function pressClear() {
    setDisplay("0");
    setStored(null);
    setOperator(null);
    setOverwrite(true);
  }

  function pressBackspace() {
    if (overwrite) return;
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  }

  const digit = (d: string) => (
    <button key={d} type="button" className="ev-calc-key" onClick={() => pressDigit(d)}>
      {d}
    </button>
  );
  const op = (symbol: Operator) => (
    <button type="button" className="ev-calc-key ev-calc-key-op" onClick={() => pressOperator(symbol)}>
      {symbol}
    </button>
  );

  return (
    <div className="ev-calc-keypad">
      <div className="ev-calc-display">{display}</div>
      <div className="ev-calc-grid">
        <button type="button" className="ev-calc-key ev-calc-key-clear" onClick={pressClear}>
          C
        </button>
        <button type="button" className="ev-calc-key ev-calc-key-clear" onClick={pressBackspace}>
          ⌫
        </button>
        {op("÷")}
        {op("×")}
        {["7", "8", "9"].map(digit)}
        {op("−")}
        {["4", "5", "6"].map(digit)}
        {op("+")}
        {["1", "2", "3"].map(digit)}
        <button type="button" className="ev-calc-key ev-calc-key-eq" onClick={pressEquals}>
          =
        </button>
        {digit("0")}
        <button type="button" className="ev-calc-key" onClick={pressDot}>
          .
        </button>
      </div>
      <button type="button" className="btn btn-primary ev-calc-apply" onClick={() => onApply(Number(display) || 0)}>
        Примени во вкупна цена
      </button>
    </div>
  );
}

/** Multiplies a per-guest price by the guest count already entered earlier
 * in the wizard — the natural way venues price an event. */
function PerGuest({ guestCount, onApply }: { guestCount: number; onApply: (total: number) => void }) {
  const [perGuest, setPerGuest] = useState("");
  const [guests, setGuests] = useState(String(guestCount));
  const total = (Number(perGuest) || 0) * (Number(guests) || 0);

  return (
    <div className="ev-calc-per-guest">
      <div className="ev-field">
        <label className="lab-s" htmlFor="ev-calc-per-guest">
          Цена по гостин
        </label>
        <div className="ev-wiz-cur">
          <input id="ev-calc-per-guest" className="fld" type="number" min={0} value={perGuest} onChange={(e) => setPerGuest(e.target.value)} placeholder="0" autoFocus />
          <span>МКД</span>
        </div>
      </div>
      <div className="ev-calc-multiply">×</div>
      <div className="ev-field">
        <label className="lab-s" htmlFor="ev-calc-guests">
          Број на гости
        </label>
        <input id="ev-calc-guests" className="fld" type="number" min={0} value={guests} onChange={(e) => setGuests(e.target.value)} />
      </div>
      <p className="ev-calc-total">
        Вкупно <b>{total.toLocaleString("mk-MK")} МКД</b>
      </p>
      <button type="button" className="btn btn-primary ev-calc-apply" onClick={() => onApply(total)}>
        Примени во вкупна цена
      </button>
    </div>
  );
}

/** Опционален помошник за пополнување на „Вкупна цена“ во чекорот за цена
 * на настанот — цена по гостин × број на гости, или обичен калкулатор за
 * било каква друга пресметка. Бара посебно барање на клиентот. */
export function PriceCalculator({ guestCount, onApply }: { guestCount: number; onApply: (total: number) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"per-guest" | "keypad">("per-guest");

  return (
    <>
      <button type="button" className="btn btn-ghost ev-calc-trigger" onClick={() => setOpen(true)}>
        <LogoMark id="price-calc-trigger-logo" className="ev-calc-trigger-logo" />
        Калкулатор
      </button>
      {open ? (
        <Modal title="Калкулатор" onClose={() => setOpen(false)} hideHeader className="ev-calc-modal">
          <div className="ev-calc-card">
            <button type="button" className="modal-close ev-calc-close" onClick={() => setOpen(false)} aria-label="Затвори">
              <Icon name="x" size="sm" />
            </button>
            <div className="ev-calc-head">
              <i className="ev-calc-head-spark" aria-hidden="true" />
              <LogoMark id="price-calc-logo" className="ev-calc-logo" />
              <i className="ev-calc-head-spark" aria-hidden="true" />
            </div>
            <div className="ev-calc-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "per-guest"} className={`ev-calc-tab${tab === "per-guest" ? " on" : ""}`} onClick={() => setTab("per-guest")}>
                По гостин
              </button>
              <button type="button" role="tab" aria-selected={tab === "keypad"} className={`ev-calc-tab${tab === "keypad" ? " on" : ""}`} onClick={() => setTab("keypad")}>
                Калкулатор
              </button>
            </div>
            {tab === "per-guest" ? (
              <PerGuest
                guestCount={guestCount}
                onApply={(total) => {
                  onApply(total);
                  setOpen(false);
                }}
              />
            ) : (
              <Keypad
                onApply={(total) => {
                  onApply(total);
                  setOpen(false);
                }}
              />
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
