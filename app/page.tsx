import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";
import { ContactForm } from "@/components/marketing/ContactForm";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { LogoMark, Wordmark } from "@/components/marketing/BrandLogo";
import { montserrat, nunito } from "@/components/marketing/fonts";
import { DashboardPreview } from "@/components/marketing/DashboardPreview";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getPricingCards } from "@/lib/marketing/pricing";
import "./landing.css";

export const metadata: Metadata = {
  title: "Каде си? — Платформа за организирање настани",
  description: "Сè на едно место: настани, резервации, гости, покани, менија и повеќе.",
};

const FEATURES = [
  {
    title: "Организирај",
    desc: "свадби, родендени, матурски, конференции и повеќе.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="var(--red)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <rect x={6} y={9} width={36} height={33} rx={6} />
        <path d="M6 19h36M16 5v8M32 5v8M20 25v12M28 25v12M15 29h18M15 34h18" />
      </svg>
    ),
  },
  {
    title: "Резервирај",
    desc: "простор, маси и термини лесно и брзо.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="var(--teal)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 18h24M16 18v16M32 18v16M5 13v24M5 27h7v10M43 13v24M43 27h-7v10" />
      </svg>
    ),
  },
  {
    title: "Покани и сподели",
    desc: "покани гости и сподели спомени.",
    icon: (
      <svg viewBox="0 0 48 48" fill="var(--purple)">
        <circle cx={17} cy={15} r={7.5} />
        <circle cx={33} cy={15} r={7.5} />
        <path d="M3 38c0-8 6.3-13 14-13s14 5 14 13v2H3zM26 25.6c2-.4 4.3-.6 7-.6 7.7 0 12 5 12 13v2H33.5v-2c0-5-2.5-9.6-7.5-12.4z" />
      </svg>
    ),
  },
  {
    title: "Менија & Пакети",
    desc: "составете менија и пакети за секој настан.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="var(--orange)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 30h32M11 30a13 13 0 0 1 26 0M5 37h38M24 17v-4" />
      </svg>
    ),
  },
];

const POINTS = [
  {
    title: "Сите резервации на едно место",
    desc: "Преглед на сите настани, нивниот статус и достапните термини — без тетратки, пораки и расфрлани евиденции.",
    tint: "var(--red-soft)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={2} strokeLinecap="round">
        <rect x={3} y={4.5} width={18} height={16.5} rx={3} />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </svg>
    ),
  },
  {
    title: "Целосна контрола на просторот",
    desc: "Дигитализиран распоред на сите сали, простории и маси, со јасен увид во нивната зафатеност и капацитет.",
    tint: "#e6f6f4",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={2} strokeLinecap="round">
        <circle cx={12} cy={12} r={4} />
        <circle cx={4} cy={12} r={1.6} />
        <circle cx={20} cy={12} r={1.6} />
        <circle cx={12} cy={4} r={1.6} />
        <circle cx={12} cy={20} r={1.6} />
      </svg>
    ),
  },
  {
    title: "Ажурирани информации во реално време",
    desc: "Следете ги промените во бројот на гости, распоредот на масите и менијата, со помалку време и пропусти.",
    tint: "#f1ebfe",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11A8 8 0 0 0 6.3 6.3M4 5v5h5M4 13a8 8 0 0 0 13.7 4.7M20 19v-5h-5" />
      </svg>
    ),
  },
  {
    title: "Подобра координација со организаторите",
    desc: "Сите важни детали за настанот на едно место — од списокот на гости и потврдите за присуство до распоредот и избраното мени.",
    tint: "#fff3e8",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={9} cy={8} r={3} />
        <path d="M3.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
        <circle cx={17.5} cy={9} r={2.3} />
        <path d="M14.8 13.8c2.5.2 4.7 2 4.7 5.2" />
      </svg>
    ),
  },
  {
    title: "Поефикасна работа и професионална услуга",
    desc: "Намалете ја административната работа, подгответе се навреме за секој настан и понудете модерно дигитално искуство на вашите клиенти.",
    tint: "#eaf2ff",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3 4 14h7l-1 7 9-11h-7z" />
      </svg>
    ),
  },
];

const ACRONYM = [
  {
    letter: "К",
    title: "Контрола",
    desc: "Комплетен увид во резервациите, настаните и работните активности.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x={3} y={4.5} width={18} height={16.5} rx={3} />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4M8.5 15l2.5 2.5 4.5-5" />
      </svg>
    ),
  },
  {
    letter: "А",
    title: "Автоматизација",
    desc: "Поедноставено управување со резервации и организациски процеси.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={3} />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </svg>
    ),
  },
  {
    letter: "Д",
    title: "Дигитализација",
    desc: "Дигитален приказ на просторот, масите, салите и распоредот.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x={3} y={3} width={18} height={18} rx={2.5} />
        <path d="M3 9h18M9 9v12" />
      </svg>
    ),
  },
  {
    letter: "Е",
    title: "Ефикасност",
    desc: "Побрзо и точно планирање, подобра организација и заштеда на време.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={9} />
        <path d="M12 7v5l3.5 2" />
      </svg>
    ),
  },
  {
    letter: "С",
    title: "Синхронизација",
    desc: "Усогласеност на информациите и увид во реално време за целиот тим.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={9} cy={8} r={3} />
        <path d="M3.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
        <circle cx={17.5} cy={9} r={2.3} />
        <path d="M14.8 13.8c2.5.2 4.7 2 4.7 5.2" />
      </svg>
    ),
  },
  {
    letter: "И",
    title: "Интегрираност",
    desc: "Сите клучни функции за управување со ресторанот на едно место.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x={3} y={4} width={13} height={9} rx={1.5} />
        <path d="M7 19h5M9.5 13v6" />
        <circle cx={19} cy={16} r={3} />
        <path d="M19 14.3v2l1.3 1.3" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    title: "Регистрирај го локалот",
    desc: "Бесплатна сметка за неколку минути, без картичка.",
    icon: <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8h13v-8M10 20v-4.5h4V20" />,
  },
  {
    title: "Постави сали и менија",
    desc: "Нацртај ги просториите и масите, додај менија и пакети.",
    icon: (
      <>
        <rect x={3} y={3} width={18} height={18} rx={3} />
        <circle cx={8.5} cy={8.5} r={2.2} />
        <circle cx={15.5} cy={8.5} r={2.2} />
        <rect x={6.5} y={14} width={11} height={4} rx={1.2} />
      </>
    ),
  },
  {
    title: "Управувај со настани",
    desc: "Настани и резервации на едно место, на еден календар.",
    icon: (
      <>
        <rect x={3} y={4.5} width={18} height={16.5} rx={3} />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4M8.5 15l2.5 2.5 4.5-5" />
      </>
    ),
  },
  {
    title: "Покани ги паровите",
    desc: "Секој пар добива своја табла за гости, покани и маси.",
    icon: (
      <>
        <rect x={3} y={5} width={18} height={14} rx={2.5} />
        <path d="m3.5 6.5 8.5 6 8.5-6" />
        <path d="M12 17.2c-2.3-1.5-2.6-3.3-1.4-3.7.6-.2 1.1.2 1.4.7.3-.5.8-.9 1.4-.7 1.2.4.9 2.2-1.4 3.7Z" fill="currentColor" stroke="none" />
      </>
    ),
  },
];

const FAQ = [
  {
    q: "Дали треба картичка за да пробам?",
    a: "Не. Регистрацијата е бесплатна и веднаш добивате пробна сметка со контролна табла, без внесување платежни податоци.",
  },
  {
    q: "Што точно добивам кога се регистрирам бесплатно?",
    a: "Пробна сметка за вашиот локал: една просторија со распоред на маси, еден активен настан со до 30 гости, резервации, дигитална покана, агенда и чеклиста за парот. Доволно за да ја испробате платформата на вистински настан пред да одлучите.",
  },
  {
    q: "Како да преминам на платен план?",
    a: "Контактирајте нè преку формата подолу. Нашиот тим ќе ги тргне ограничувањата на пробната сметка и ќе ги активира функционалностите од избраниот план. Сè што сте внеле останува.",
  },
  {
    q: "Може ли подоцна да го брендирам изгледот на локалот?",
    a: "Да. По договор, логото и боите на вашиот локал ги применува нашиот тим, како дел од Премиум планот.",
  },
];

function Leaf({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" style={{ color: "var(--eco)", transform: flip ? "scaleX(-1)" : undefined }}>
      <path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" fill="currentColor" />
      <path d="M5 19l8-8" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The price cards come from the database (admin → Ценовник), so this page is
// rendered per request rather than at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const pricing = await getPricingCards();
  return (
    <div className={`lp ${montserrat.variable} ${nunito.variable}`}>
      <RecoveryRedirect />
      <MarketingNav />

      <header id="home" className="hero">
        <div className="wrap hero-grid">
          <LogoMark id="hero-mark" className="hero-mark" />
          <div className="hero-copy">
            <Wordmark id="hero-word" className="hero-word" />
            <h1>Платформа за организирање на вашите посебни моменти</h1>
            <div className="hero-ctas">
              <Link href="/signup" className="btn btn-red">
                Започни бесплатно
              </Link>
              <a href="#how" className="btn btn-outline">
                <svg className="play" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx={12} cy={12} r={10} />
                  <path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" />
                </svg>
                Како работи?
              </a>
            </div>
          </div>
        </div>
      </header>

      <section className="features" aria-label="Што нуди платформата">
        <div className="wrap feat-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feat">
              {f.icon}
              <div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="eco" aria-label="Зелена организација">
        <div className="wrap">
          <div className="eco-row">
            <div className="eco-item eco-lead">
              <Leaf />
              Повеќе организација со:
              <Leaf flip />
            </div>
            <div className="eco-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--eco)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
                <path d="M14 3v5h5M8.5 12.5h7M8.5 16h7" />
              </svg>
              Помалку хартија
            </div>
            <div className="eco-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--eco)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8h2.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 0 3 0V8l-3-3" />
              </svg>
              Помалку гориво
            </div>
            <div className="eco-item">
              <svg viewBox="0 0 24 24">
                <circle cx={12} cy={12} r={9.5} fill="var(--eco)" />
                <path
                  d="M6 6.5c2 .3 3 1.6 2.6 3.2-.3 1.3 1 2 2 2.6 1.3.8.6 2.6-.4 3.4-.9.8-.9 2.5-.2 3.7M14 3.2c-.6 1.4.3 2.8 1.8 3 1.6.3 1.8 2 .8 3-1.1 1.1-.2 2.8 1.3 3 1.3.1 2.5-.4 3.4-1.1"
                  fill="none"
                  stroke="var(--eco)"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
              </svg>
              Зелена иднина
            </div>
            <div className="eco-item eco-tag">
              <Leaf />
              За нас. За природата. За подобра иднина.
              <Leaf flip />
            </div>
          </div>
        </div>
      </section>

      <section id="kadesi" className="band" aria-label="КАДЕСИ накратко">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Повеќе од обична платформа</p>
            <h2>КАДЕСИ, накратко</h2>
          </div>
          <Image
            src="/marketing/kadesi-flower.png"
            alt="К-А-Д-Е-С-И: Контрола, Автоматизација, Дигитализација, Ефикасност, Синхронизација, Интегрираност — истите шест зборови, околу знакот на платформата."
            width={1392}
            height={1130}
            className="flower-photo"
            sizes="(max-width: 880px) 100vw, 720px"
          />

          <div className="acronym-grid">
            {ACRONYM.map((a, i) => (
              <article key={a.letter} className={`acronym-card ${i % 2 ? "gold" : "green"}`}>
                <Leaf />
                <span className="acronym-badge">
                  <span className="acronym-letter">{a.letter}</span>
                  <span className="acronym-icon">{a.icon}</span>
                </span>
                <h3>{a.title}</h3>
                <p>{a.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="band band-tint">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">За платформата</p>
            <h2>Што добива вашиот ресторан со „Каде си?“</h2>
            <p>Дигитална работна алатка за организација, координација и контрола на настаните — достапна 24/7.</p>
          </div>
          <div className="platform-grid">
            <div>
              <div className="preview">
                <div className="preview-bar">
                  <span />
                  <span />
                  <span />
                </div>
                <DashboardPreview />
              </div>
              <p className="caption">Ова е контролната табла што ја добивате веднаш штом ќе се регистрирате. Бројките се пример.</p>
            </div>
            <div className="points">
              {POINTS.map((p) => (
                <div key={p.title} className="point">
                  <i style={{ background: p.tint }}>{p.icon}</i>
                  <div>
                    <h3>{p.title}</h3>
                    <p>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Процес</p>
            <h2>Како работи</h2>
            <p>Од регистрација до првиот настан за едно попладне.</p>
          </div>
          <ol className="timeline">
            {STEPS.map((step, i) => (
              <li key={step.title} className={`step-${i + 1}`}>
                <span className="timeline-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    {step.icon}
                  </svg>
                  <span className="timeline-num">{i + 1}</span>
                </span>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {pricing.length > 0 ? (
        <section id="pricing" className="band band-tint">
          <div className="wrap">
            <div className="section-head">
              <p className="eyebrow">Пакети за ресторани</p>
              <h2>Планови</h2>
              <p>Пакетите подолу се наменети за ресторани и сали за настани. Контактирајте нè за да дознаете кој пакет одговара на вашиот локал.</p>
            </div>
            <div className="plans" data-count={pricing.length}>
              {pricing.map((tier) => (
                <article key={tier.id} className={`plan${tier.featured ? " featured" : ""}`}>
                  {tier.featured ? <span className="badge">Препорачано</span> : null}
                  <h3>{tier.name}</h3>
                  <ul>
                    {tier.features.map((f, i) => (
                      <li key={i}>
                        <Check />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href="#contact" className={`btn ${tier.featured ? "btn-red" : "btn-ghost"}`}>
                    Контактирајте нè
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="faq" className="band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Прашања</p>
            <h2>Често поставувани прашања</h2>
          </div>
          <div className="faq">
            {FAQ.map((item, i) => (
              <details key={item.q} open={i === 0}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="band band-tint">
        <div className="wrap contact-grid">
          <div className="contact-side">
            <p className="eyebrow">Да започнеме</p>
            <h2>Контакт</h2>
            <p className="contact-lead">Имате прашање за плановите или сакате демо за вашиот локал? Пишете ни и ќе ви одговориме во рок од еден работен ден.</p>
            <p className="contact-direct">
              Или пишете директно на{" "}
              <a href="mailto:support@kadesi.mk">support@kadesi.mk</a>
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      <section className="cta">
        <div className="wrap">
          <div className="cta-taglines">
            <span>Повеќе прегледност.</span>
            <span>Подобра организација.</span>
            <span>Поголема контрола.</span>
          </div>
          <h2>Спремни да го тестирате бесплатно?</h2>
          <p>Регистрирајте го вашиот локал за неколку минути. Без картичка, без обврска.</p>
          <Link href="/signup" className="btn btn-red">
            Започни бесплатно
          </Link>
          <p className="cta-sun">☼ Организирајте ја вашата прослава со помалку грижи. Повеќе време за убавите моменти! ☼</p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
