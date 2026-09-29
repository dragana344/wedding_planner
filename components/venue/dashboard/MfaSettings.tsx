"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// SEC-016: opt-in TOTP (authenticator app) for venue staff. Once a factor is
// verified, the login asks for a code and an aal1 session sees no venue data
// (proxy.ts + migration 0044).

type Enrolment = { factorId: string; qrCode: string; secret: string };
type State =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "enrolling"; enrolment: Enrolment }
  | { kind: "on"; factorId: string };

const CODE_PATTERN = /^\d{6}$/;
const GENERIC_ERROR = "Нешто тргна наопаку. Обидете се повторно.";

function message(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    if (/invalid.*code|invalid totp/i.test(err.message)) return "Кодот не е точен. Обидете се повторно.";
    return err.message;
  }
  return GENERIC_ERROR;
}

export function MfaSettings() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: listError } = await createBrowserSupabaseClient().auth.mfa.listFactors();
        if (listError) throw listError;
        const verified = data.totp.find((factor) => factor.status === "verified");
        if (!cancelled) setState(verified ? { kind: "on", factorId: verified.id } : { kind: "off" });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "off" });
          setError(message(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function reset() {
    setCode("");
    setError(null);
    setStatus(null);
  }

  async function handleStart() {
    reset();
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      // A previous attempt that was never confirmed leaves an unverified
      // factor behind; clear it so enrolment can start over.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const factor of existing?.all ?? []) {
        if (factor.factor_type === "totp" && factor.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (enrollError) throw enrollError;
      setState({
        kind: "enrolling",
        enrolment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
      });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(enrolment: Enrolment) {
    reset();
    setState({ kind: "off" });
    await createBrowserSupabaseClient()
      .auth.mfa.unenroll({ factorId: enrolment.factorId })
      .catch(() => undefined);
  }

  async function handleVerify(e: React.FormEvent, enrolment: Enrolment) {
    e.preventDefault();
    if (!CODE_PATTERN.test(code)) {
      setError("Внесете го 6-цифрениот код од апликацијата.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: verifyError } = await createBrowserSupabaseClient().auth.mfa.challengeAndVerify({
        factorId: enrolment.factorId,
        code,
      });
      if (verifyError) throw verifyError;
      setCode("");
      setState({ kind: "on", factorId: enrolment.factorId });
      setStatus("Двофакторската автентикација е вклучена. Следниот пат при најава ќе ви биде побаран код.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  // Removing the factor needs a fresh aal2: the current code is verified
  // first (proving the device is still at hand), then the factor is removed.
  async function handleDisable(e: React.FormEvent, factorId: string) {
    e.preventDefault();
    if (!CODE_PATTERN.test(code)) {
      setError("Внесете го 6-цифрениот код од апликацијата.");
      return;
    }
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) throw verifyError;
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) throw unenrollError;
      setCode("");
      setState({ kind: "off" });
      setStatus("Двофакторската автентикација е исклучена.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const codeField = (id: string) => (
    <div className="ev-field ev-field-wide">
      <label className="lab-s" htmlFor={id}>
        Код од апликацијата
      </label>
      <input
        id={id}
        className="fld"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        required
      />
    </div>
  );

  const feedback = (
    <>
      {status ? <p className="muted" style={{ margin: 0 }}>{status}</p> : null}
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>
          {error}
        </p>
      ) : null}
    </>
  );

  return (
    <section className="panel">
      <div className="panel-h">
        <h2 className="panel-t">Двофакторска автентикација</h2>
      </div>

      {state.kind === "loading" ? (
        <div className="ev-form" style={{ padding: "16px 20px" }}>
          <p className="muted" style={{ margin: 0 }}>
            Се вчитува...
          </p>
        </div>
      ) : null}

      {state.kind === "off" ? (
        <div className="ev-form" style={{ padding: "16px 20px" }}>
          <p className="ev-hint" style={{ margin: 0 }}>
            Статус: <b>исклучена</b>. Со вклучена двофакторска автентикација, при најава покрај лозинката се бара и
            код од апликација за автентикација (Google Authenticator, Microsoft Authenticator, 1Password и сл.).
          </p>
          {feedback}
          <button type="button" className="btn btn-gold" onClick={handleStart} disabled={busy}>
            {busy ? "Се подготвува..." : "Вклучи двофакторска автентикација"}
          </button>
        </div>
      ) : null}

      {state.kind === "enrolling" ? (
        <form onSubmit={(e) => handleVerify(e, state.enrolment)} className="ev-form" style={{ padding: "16px 20px" }}>
          <p className="ev-hint" style={{ margin: 0 }}>
            1. Скенирајте го QR-кодот со апликацијата за автентикација.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an SVG data URI */}
          <img
            src={state.enrolment.qrCode}
            alt="QR-код за апликацијата за автентикација"
            width={180}
            height={180}
            style={{ background: "#fff", borderRadius: 8, padding: 8 }}
          />
          <p className="ev-hint" style={{ margin: 0 }}>
            Не можете да скенирате? Внесете го овој клуч рачно:{" "}
            <code data-testid="mfa-secret" style={{ wordBreak: "break-all", userSelect: "all" }}>
              {state.enrolment.secret}
            </code>
          </p>
          <p className="ev-hint" style={{ margin: 0 }}>
            2. Внесете го 6-цифрениот код што го прикажува апликацијата.
          </p>
          {codeField("settings-mfa-code")}
          {feedback}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button type="submit" className="btn btn-gold" disabled={busy}>
              {busy ? "Се проверува..." : "Потврди и вклучи"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => handleCancel(state.enrolment)} disabled={busy}>
              Откажи
            </button>
          </div>
        </form>
      ) : null}

      {state.kind === "on" ? (
        <form onSubmit={(e) => handleDisable(e, state.factorId)} className="ev-form" style={{ padding: "16px 20px" }}>
          <p className="ev-hint" style={{ margin: 0 }}>
            Статус: <b>вклучена</b>. При секоја најава се бара код од апликацијата за автентикација.
          </p>
          {feedback}
          <p className="ev-hint" style={{ margin: 0 }}>
            За да ја исклучите, внесете тековен код од апликацијата.
          </p>
          {codeField("settings-mfa-disable-code")}
          <button type="submit" className="btn btn-ghost" style={{ color: "var(--bad)" }} disabled={busy}>
            {busy ? "Се исклучува..." : "Исклучи двофакторска автентикација"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
