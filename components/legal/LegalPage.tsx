import Link from "next/link";
import type { LegalBlock, LegalDocument } from "@/lib/legal/types";
import { LogoMark, Wordmark } from "@/components/marketing/BrandLogo";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { montserrat, nunito } from "@/components/marketing/fonts";
import "@/app/landing.css";

const LABELS = {
  mk: {
    home: "Каде си? почетна",
    back: "Кон почетна",
    eyebrow: "Правни документи",
    updated: "Последна измена",
    version: "Верзија",
    contents: "Содржина",
    switchLabel: "English",
    privacy: "Политика за приватност",
    terms: "Услови за користење",
    dpa: "Договор за обработка на лични податоци",
    footer: "Каде си? Сите права се задржани.",
  },
  en: {
    home: "Каде си? home",
    back: "Back to home",
    eyebrow: "Legal",
    updated: "Last updated",
    version: "Version",
    contents: "Contents",
    switchLabel: "Македонски",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    dpa: "Data Processing Agreement",
    footer: "Каде си? All rights reserved.",
  },
} as const;

function formatDate(iso: string, lang: LegalDocument["lang"]): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "mk" ? "mk-MK" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "p") return <p>{block.text}</p>;
  if (block.type === "ul") {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="legal-table">
      <table>
        <thead>
          <tr>
            {block.head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, i) => (
                <td key={i}>{cell}</td>
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
  const docs = [
    { href: `${prefix}/privacy`, label: t.privacy },
    { href: `${prefix}/terms`, label: t.terms },
    { href: `${prefix}/dpa`, label: t.dpa },
  ];
  return (
    <div className={`lp legal-lp ${montserrat.variable} ${nunito.variable}`} lang={doc.lang}>
      <nav className="nav" aria-label={doc.lang === "mk" ? "Главна навигација" : "Main navigation"}>
        <div className="wrap nav-row">
          <Link className="brand" href="/" aria-label={t.home}>
            <LogoMark id="legal-nav-mark" className="brand-mark" />
            <Wordmark id="legal-nav-word" className="brand-word" />
          </Link>
          <div className="legal-nav-actions">
            <Link href={alternateHref} hrefLang={doc.lang === "mk" ? "en" : "mk"}>
              {t.switchLabel}
            </Link>
            <Link href="/" className="btn btn-outline btn-sm">
              {t.back}
            </Link>
          </div>
        </div>
      </nav>

      <header className="legal-head">
        <div className="wrap legal-wrap">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{doc.title}</h1>
          <p className="legal-meta">
            {t.updated}: {formatDate(doc.lastUpdated, doc.lang)} · {t.version} {doc.version}
          </p>
        </div>
      </header>

      <main className="legal-main">
        <div className="wrap legal-wrap">
          <div className="legal-body">
            {doc.intro.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>

          <nav aria-label={t.contents} className="legal-toc">
            <h2>{t.contents}</h2>
            <ol>
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.heading}</a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="legal-body">
              <h2>
                {i + 1}. {s.heading}
              </h2>
              {s.blocks.map((b, j) => (
                <Block key={j} block={b} />
              ))}
            </section>
          ))}
        </div>
      </main>

      {doc.lang === "mk" ? (
        <MarketingFooter />
      ) : (
        <footer className="footer">
          <div className="wrap">
            <div className="legal-footer-links">
              {docs.map((d) => (
                <Link key={d.href} href={d.href}>
                  {d.label}
                </Link>
              ))}
            </div>
            <div className="footer-bar">
              <span>
                © {new Date().getFullYear()} {t.footer}
              </span>
              <span>
                Managed by{" "}
                <a href="https://godevlabagency.com" target="_blank" rel="noopener noreferrer">
                  GoDevLab Agency
                </a>
              </span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
