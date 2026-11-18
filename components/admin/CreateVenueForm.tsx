"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createVenue } from "@/app/admin/(panel)/venues/actions";
import type { CreatedVenue } from "@/lib/admin/venue-actions-core";

type PlanOption = { id: string; name: string; isDefault: boolean };

// "Нов локал" (public signup is closed). Creates the account, the venue and
// the owner's manager login in one go (venueActionCore.create), then shows
// both generated passwords once — they are not stored anywhere readable, so
// leaving this screen loses them (the admin can still reset either one).
export function CreateVenueForm({ plans }: { plans: PlanOption[] }) {
  const router = useRouter();
  const defaultPlan = plans.find((p) => p.isDefault)?.id ?? plans[0]?.id ?? "";
  const [venueName, setVenueName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState(defaultPlan);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedVenue | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await createVenue({ venueName, ownerName, email, phone: phone.trim() || undefined, planId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated(result.data);
    setVenueName("");
    setOwnerName("");
    setEmail("");
    setPhone("");
    setPlanId(defaultPlan);
    router.refresh();
  }

  if (created) return <CreatedVenueCard created={created} onDone={() => setCreated(null)} />;

  return (
    <form onSubmit={submit} className="adm-inline-form" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
      <div>
        <label className="lab-s" htmlFor="new-venue-name">
          Име на локалот
        </label>
        <input id="new-venue-name" className="fld" value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={200} required disabled={pending} />
      </div>
      <div>
        <label className="lab-s" htmlFor="new-venue-owner">
          Сопственик
        </label>
        <input id="new-venue-owner" className="fld" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={100} required disabled={pending} />
      </div>
      <div>
        <label className="lab-s" htmlFor="new-venue-email">
          Е-пошта
        </label>
        <input id="new-venue-email" className="fld" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} required disabled={pending} />
      </div>
      <div>
        <label className="lab-s" htmlFor="new-venue-phone">
          Телефон (не е задолжително)
        </label>
        <input id="new-venue-phone" className="fld" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} disabled={pending} />
      </div>
      <div>
        <label className="lab-s" htmlFor="new-venue-plan">
          Ниво
        </label>
        <select id="new-venue-plan" className="fld" value={planId} onChange={(e) => setPlanId(e.target.value)} required disabled={pending}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-gold" disabled={pending || !venueName.trim() || !ownerName.trim() || !email.trim() || !planId}>
        {pending ? "Се отвора..." : "Отвори локал"}
      </button>
      {error ? (
        <span className="muted" role="alert">
          {" "}
          {error}
        </span>
      ) : null}
    </form>
  );
}

function CreatedVenueCard({ created, onDone }: { created: CreatedVenue; onDone: () => void }) {
  return (
    <div role="status" style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0 }}>
        Локалот е отворен за <b>{created.email}</b>. <Link href={`/admin/venues/${created.venueId}`}>Отвори го локалот</Link>
      </p>
      <SecretRow label="Лозинка за најава" value={created.loginPassword} />
      <SecretRow label={`Лозинка на сопственикот (${created.ownerName})`} value={created.ownerPassword} />
      <p style={{ margin: 0 }}>Испратете ја лозинката на сопственикот; при првото најавување ќе мора да ја смени.</p>
      <p className="muted" style={{ margin: 0 }}>
        Лозинката на сопственикот служи за Поставки и прифаќање на условите; може да ја смени преку менито на сметката. Лозинките се
        прикажуваат само сега.
        {created.emailSent ? " Испратена е и е-пошта со линк за поставување лозинка." : " Е-поштата со линк не беше испратена."}
      </p>
      <div>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Готово
        </button>
      </div>
    </div>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="lab-s">{label}:</span>
      <code style={{ fontSize: 15, userSelect: "all" }}>{value}</code>
      <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
        {copied ? "Копирано" : "Копирај"}
      </button>
    </div>
  );
}
