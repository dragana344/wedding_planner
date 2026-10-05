"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PricingCardRow } from "@/lib/admin/queries";
import { createPricingCard, deletePricingCard, updatePricingCard } from "@/app/admin/(panel)/pricing/actions";

// Must match MAX_PRICING_FEATURES in lib/admin/pricing-actions-core.ts (a
// server-only module, so it can't be imported here).
const MAX_FEATURES = 12;

type Draft = Omit<PricingCardRow, "id">;

const EMPTY: Draft = { name: "", price: "", period: "/ месечно", features: [""], isFeatured: false, isPublished: true, sortOrder: 0 };

// The landing page's price cards (Цени → Планови). One form per card, plus an
// empty one for a new card; saving refreshes the list from the server.
export function PricingCardsEditor({ cards }: { cards: PricingCardRow[] }) {
  const nextSort = cards.length ? Math.max(...cards.map((c) => c.sortOrder)) + 10 : 10;
  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Картички на почетната страница</h2>
          <span className="count">{cards.filter((c) => c.isPublished).length} објавени</span>
        </div>
        <p className="s1-empty" style={{ paddingBottom: 0 }}>
          Ова се картичките во делот „Цени“ на почетната страница. Промените се гледаат веднаш по зачувување. Тие се само текст: што смее
          секоја сала се поставува во „Нивоа“.
        </p>
        {cards.length === 0 ? <p className="s1-empty">Нема картички. Додадете ја првата подолу.</p> : null}
        {cards.map((card) => (
          <CardForm key={card.id} cardId={card.id} initial={card} />
        ))}
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Нова картичка</h2>
        </div>
        {/* Re-keyed on the card count so the form empties after a successful add. */}
        <CardForm key={`new-${cards.length}`} cardId={null} initial={{ ...EMPTY, sortOrder: nextSort }} />
      </section>
    </>
  );
}

function CardForm({ cardId, initial }: { cardId: string | null; initial: Draft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ ...initial, features: initial.features.length ? initial.features : [""] });
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const uid = cardId ?? "new";
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setFeature = (index: number, value: string) => set({ features: draft.features.map((f, i) => (i === index ? value : f)) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setStatus(null);
    const input = { ...draft, period: draft.period?.trim() || null };
    const result = cardId ? await updatePricingCard({ cardId, ...input }) : await createPricingCard(input);
    setPending(false);
    setStatus(result.ok ? "Зачувано." : result.error);
    if (result.ok) router.refresh();
  }

  async function remove() {
    if (!cardId || !window.confirm(`Да се избрише картичката „${draft.name}“?`)) return;
    setPending(true);
    const result = await deletePricingCard({ cardId });
    setPending(false);
    if (result.ok) router.refresh();
    else setStatus(result.error);
  }

  return (
    <form onSubmit={save} className="s1-price-card">
      <div className="s1-price-fields">
        <div>
          <label className="lab-s" htmlFor={`pc-name-${uid}`}>
            Име на планот
          </label>
          <input id={`pc-name-${uid}`} className="fld" value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} required disabled={pending} />
        </div>
        <div>
          <label className="lab-s" htmlFor={`pc-price-${uid}`}>
            Цена
          </label>
          <input
            id={`pc-price-${uid}`}
            className="fld"
            value={draft.price}
            onChange={(e) => set({ price: e.target.value })}
            placeholder="1.500 ден"
            maxLength={40}
            required
            disabled={pending}
          />
        </div>
        <div>
          <label className="lab-s" htmlFor={`pc-period-${uid}`}>
            Период (по желба)
          </label>
          <input
            id={`pc-period-${uid}`}
            className="fld"
            value={draft.period ?? ""}
            onChange={(e) => set({ period: e.target.value })}
            placeholder="/ месечно"
            maxLength={40}
            disabled={pending}
          />
        </div>
        <div>
          <label className="lab-s" htmlFor={`pc-sort-${uid}`}>
            Редослед
          </label>
          <input
            id={`pc-sort-${uid}`}
            className="fld"
            type="number"
            min={0}
            max={1000}
            value={draft.sortOrder}
            onChange={(e) => set({ sortOrder: Number(e.target.value) })}
            disabled={pending}
          />
        </div>
      </div>

      <fieldset className="s1-price-list" disabled={pending}>
        <legend className="lab-s">Што се добива</legend>
        {draft.features.map((feature, i) => (
          <div key={i} className="s1-price-item">
            <span aria-hidden="true">✓</span>
            <input
              className="fld"
              value={feature}
              onChange={(e) => setFeature(i, e.target.value)}
              aria-label={`Ставка ${i + 1}`}
              placeholder="пр. Распоред на маси"
              maxLength={120}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => set({ features: draft.features.filter((_, j) => j !== i) })}
              aria-label={`Отстрани ставка ${i + 1}`}
            >
              Отстрани
            </button>
          </div>
        ))}
        {draft.features.length < MAX_FEATURES ? (
          <button type="button" className="btn btn-ghost" onClick={() => set({ features: [...draft.features, ""] })}>
            + Додади ставка
          </button>
        ) : null}
      </fieldset>

      <div className="s1-price-foot">
        <label>
          <input type="checkbox" checked={draft.isFeatured} onChange={(e) => set({ isFeatured: e.target.checked })} disabled={pending} /> Означи како
          „Препорачано“
        </label>
        <label>
          <input type="checkbox" checked={draft.isPublished} onChange={(e) => set({ isPublished: e.target.checked })} disabled={pending} /> Прикажи на
          почетната страница
        </label>
        <span className="s1-price-actions">
          {status ? (
            <span className="muted" role="status">
              {status}
            </span>
          ) : null}
          {cardId ? (
            <button type="button" className="btn btn-ghost" onClick={remove} disabled={pending}>
              Избриши
            </button>
          ) : null}
          <button type="submit" className="btn btn-gold" disabled={pending || !draft.name.trim() || !draft.price.trim()}>
            {cardId ? "Зачувај" : "Додади картичка"}
          </button>
        </span>
      </div>
    </form>
  );
}
