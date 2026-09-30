import Link from "next/link";
import type { LegalBlock, LegalDocument } from "@/lib/legal/types";
import "@/app/venue/panel.css";

const LABELS = {
  mk: {
    home: "Почетна",
    updated: "Последна измена",
    version: "Верзија",
    contents: "Содржина",
    switchLabel: "English",
    privacy: "Политика за приватност",
    terms: "Услови за користење",
    dpa: "Договор за обработка на лични податоци",
    footer: "Каде сум? Сите права задржани.",
  },
  en: {
    home: "Home",
    updated: "Last updated",
    version: "Version",
    contents: "Contents",
    switchLabel: "Македонски",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    dpa: "Data Processing Agreement",
    footer: "Каде сум? All rights reserved.",
  },
} as const;

function formatDate(iso: string, lang: LegalDocument["lang"]): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "mk" ? "mk-MK" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "p") return <p className="mt-3 leading-relaxed text-[15px]">{block.text}</p>;
  if (block.type === "ul") {
    return (
      <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-[15px]">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px] leading-snug">
        <thead>
          <tr>
            {block.head.map((h) => (
              <th key={h} className="border-b-2 px-3 py-2 align-bottom font-bold" style={{ borderColor: "var(--gold-tint-2)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, i) => (
                <td key={i} className="border-b px-3 py-2 align-top" style={{ borderColor: "var(--line)" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders a privacy policy or terms document (COMP-001). `alternateHref` is
 * the same document in the other language.
 */
export function LegalPage({ doc, alternateHref }: { doc: LegalDocument; alternateHref: string }) {
  const t = LABELS[doc.lang];
  const prefix = doc.lang === "en" ? "/en" : "";
  return (
    <div className="vp min-h-screen" lang={doc.lang}>
      <nav className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-12" style={{ background: "var(--side)" }}>
        <Link href="/" className="font-extrabold tracking-wide text-white no-underline" aria-label={t.home}>
          КАДЕ СУМ?
        </Link>
        <Link
          href={alternateHref}
          hrefLang={doc.lang === "mk" ? "en" : "mk"}
          className="text-[13.5px] font-semibold no-underline"
          style={{ color: "var(--gold-hi)" }}
        >
          {t.switchLabel}
        </Link>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--gold-lo)" }}>
          КАДЕ СУМ?
        </p>
        <h1 className="mt-2 text-[28px] font-extrabold leading-tight sm:text-[32px]">{doc.title}</h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--muted)" }}>
          {t.updated}: {formatDate(doc.lastUpdated, doc.lang)} · {t.version} {doc.version}
        </p>

        {doc.intro.map((p) => (
          <p key={p} className="mt-4 leading-relaxed text-[15px]">
            {p}
          </p>
        ))}

        <nav aria-label={t.contents} className="mt-8 rounded-lg border p-4" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <p className="text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
            {t.contents}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px]">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} style={{ color: "var(--ink-2)" }}>
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((s, i) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-6">
            <h2 className="text-[20px] font-extrabold">
              {i + 1}. {s.heading}
            </h2>
            {s.blocks.map((b, j) => (
              <Block key={j} block={b} />
            ))}
          </section>
        ))}
      </main>

      <footer className="mkt-footer">
        <Link href={`${prefix}/privacy`} style={{ color: "var(--muted)" }}>
          {t.privacy}
        </Link>
        {" · "}
        <Link href={`${prefix}/terms`} style={{ color: "var(--muted)" }}>
          {t.terms}
        </Link>
        {" · "}
        <Link href={`${prefix}/dpa`} style={{ color: "var(--muted)" }}>
          {t.dpa}
        </Link>
        <div className="mt-2">© 2026 {t.footer}</div>
      </footer>
    </div>
  );
}
