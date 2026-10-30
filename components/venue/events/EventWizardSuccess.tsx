"use client";

import { useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { formatMkDateWithWeekday } from "@/lib/date";

const CONFETTI_COLORS = ["#c9992f", "#e0b44e", "#fbf2df", "#1c1e23", "#d49c8a"];
const CONFETTI_COUNT = 60;

/** Deterministic-enough spread for a one-shot celebratory burst — recomputed once per mount, not on every render. */
function makeConfettiPieces() {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${(Math.random() * 0.7).toFixed(2)}s`,
  }));
}

export function EventWizardSuccess({
  typeLabel,
  name,
  date,
  startTime,
  who,
  username,
  password,
  onCreateAnother,
  onDone,
}: {
  typeLabel: string;
  name: string;
  date: string;
  startTime: string;
  who: string;
  username: string;
  password: string;
  onCreateAnother: () => void;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confetti] = useState(makeConfettiPieces);

  const loginUrl = typeof window === "undefined" ? "/couple/login" : `${window.location.origin}/couple/login`;
  const handover = `Најава: ${loginUrl}\nКорисничко име: ${username}\nЛозинка: ${password}`;

  return (
    <div className="ev-wiz-confetti-root">
      {confetti.map((c) => (
        <span key={c.id} className="ev-wiz-cf" style={{ left: c.left, background: c.color, animationDelay: c.delay }} aria-hidden />
      ))}
      <div className="ev-wiz-success ev-wiz-fade" role="status">
        <div className="ev-wiz-success-badge">
          <Icon name="tick" size="lg" />
        </div>
        <p className="ev-wiz-eyebrow" style={{ marginTop: 16 }}>
          НАСТАНОТ Е КРЕИРАН
        </p>
        <p className="ev-wiz-success-name">{name}</p>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
          {typeLabel} · {formatMkDateWithWeekday(date)}
          {startTime ? ` · ${startTime}` : ""}
        </p>
        <div className="ev-wiz-success-creds">
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted)" }}>Податоци за најава на {who}:</p>
          <div className="ev-wiz-success-row">
            <span>Корисничко име</span>
            <span>{username}</span>
          </div>
          <div className="ev-wiz-success-row">
            <span>Лозинка</span>
            <span>{password}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ paddingLeft: 0, marginTop: 6, color: "var(--gold-text)" }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(handover);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Icon name="copy" size="sm" /> {copied ? "Копирано" : "Копирај податоци"}
          </button>
        </div>
        <div className="ev-wiz-success-actions">
          <button type="button" className="btn btn-ghost" onClick={onCreateAnother}>
            Креирај нов настан
          </button>
          <button type="button" className="btn btn-gold" onClick={onDone}>
            Кон настаните
          </button>
        </div>
      </div>
    </div>
  );
}
