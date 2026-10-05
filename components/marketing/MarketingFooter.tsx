import Link from "next/link";
import { Wordmark } from "@/components/marketing/BrandLogo";

// The address shown to visitors. SUPPORT_EMAIL (also used by the venue panel's
// support page) wins when set, so the inbox can change without a code change.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@kadesi.mk";

const COLUMNS = [
  {
    title: "Платформа",
    links: [
      { href: "/#platform", label: "За платформата" },
      { href: "/#how", label: "Како работи" },
      { href: "/#pricing", label: "Планови" },
      { href: "/#faq", label: "Често поставувани прашања" },
    ],
  },
  {
    title: "Сметка",
    links: [
      { href: "/login", label: "Најави се" },
      { href: "/signup", label: "Регистрирај се" },
      { href: "/#contact", label: "Контакт" },
    ],
  },
  {
    title: "Правно",
    links: [
      { href: "/privacy", label: "Политика за приватност" },
      { href: "/terms", label: "Услови за користење" },
      { href: "/dpa", label: "Договор за обработка на податоци" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <Wordmark id="footer-word" className="footer-word" tagline={false} />
            <p>Платформа за ресторани и сали за настани: резервации, распоред на маси, покани и гости на едно место.</p>
            <p>
              Поддршка: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2>{column.title}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("/#") ? <a href={link.href}>{link.label}</a> : <Link href={link.href}>{link.label}</Link>}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer-bar">
          <span>© {new Date().getFullYear()} Каде си? Сите права се задржани.</span>
          <span>
            Managed by{" "}
            <a href="https://godevlabagency.com" target="_blank" rel="noopener noreferrer">
              GoDevLab Agency
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
