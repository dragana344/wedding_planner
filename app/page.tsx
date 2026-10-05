import type { Metadata } from "next";
import Link from "next/link";
import { Montserrat, Nunito } from "next/font/google";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";
import { ContactForm } from "@/components/marketing/ContactForm";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { LogoMark, Wordmark } from "@/components/marketing/BrandLogo";
import "./landing.css";

// Cyrillic subsets are required: the whole page is in Macedonian.
const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700", "800"],
  variable: "--font-montserrat",
});
// Rounded face for the Каде си? wordmark.
const nunito = Nunito({
  subsets: ["latin", "cyrillic"],
  weight: ["700", "800", "900"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "Каде си? — Платформа за организирање настани",
  description: "Сè на едно место: настани, резервации, гости, музика, менија и повеќе.",
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
    title: "Музика & Пакети",
    desc: "најдете музичари, фотографи, услуги и пакети.",
    icon: (
      <svg viewBox="0 0 48 48" fill="var(--orange)">
        <path d="M18 8l24-5v28.5a6.5 6.5 0 1 1-4-6V14l-16 3.4V37.5a6.5 6.5 0 1 1-4-6z" />
      </svg>
    ),
  },
];

const POINTS = [
  {
    title: "Настани и резервации",
    desc: "Свадби, родендени, матурски и секојдневни резервации, прегледно на еден календар. Без телефонски повици и хартиени тетратки.",
    tint: "var(--red-soft)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={2} strokeLinecap="round">
        <rect x={3} y={4.5} width={18} height={16.5} rx={3} />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </svg>
    ),
  },
  {
    title: "Распоред на маси",
    desc: "Нацртајте ги просториите и масите еднаш, а потоа распоредувајте ги гостите за секој настан.",
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
    title: "Покани и потврди",
    desc: "Секој пар добива своја табла: дигитална покана со QR код, листа на гости и следење на потврди.",
    tint: "#f1ebfe",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth={2} strokeLinecap="round">
        <path d="M4 6h16v12H4z" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    ),
  },
  {
    title: "Менија и пакети",
    desc: "Изградете менија и пакети што клиентите ги гледаат и избираат директно во платформата.",
    tint: "#fff3e8",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth={2} strokeLinecap="round">
        <path d="M5 11h14M6 11a6 6 0 0 1 12 0M4 15h16M12 5V3.5" />
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

const PRICING = [
  {
    name: "Основен",
    price: "1.500 ден",
    period: "/ месечно",
    features: ["1 локал", "До 2 простории", "Управување со настани", "Резервации", "Распоред на маси"],
    featured: false,
  },
  {
    name: "Про",
    price: "3.500 ден",
    period: "/ месечно",
    features: [
      "Сè од Основен",
      "Менија и пакети",
      "Буџет и чеклиста за парови",
      "Дигитални покани со QR код",
      "Известувања (наскоро)",
    ],
    featured: true,
  },
  {
    name: "Премиум",
    price: "По договор",
    period: null,
    features: ["Сè од Про", "Брендирање по мерка на локалот", "Извештаи и аналитика", "Приоритетна поддршка"],
    featured: false,
  },
];

const FAQ = [
  {
    q: "Дали треба картичка за да пробам?",
    a: "Не. Регистрацијата е бесплатна и веднаш добивате пристап до целосна контролна табла, без внесување платежни податоци.",
  },
  {
    q: "Што точно добивам кога се регистрирам бесплатно?",
    a: "Целосно функционална контролна табла за вашиот локал: настани, резервации, распоред на маси и менија, за да ја истражите платформата пред да одлучите.",
  },
  {
    q: "Како да преминам на платен план?",
    a: "Контактирајте нè преку формата подолу. Нашиот тим ќе ги активира дополнителните функционалности и ќе го персонализира изгледот на вашиот локал.",
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

export default function Home() {
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
            <p className="hero-lead">
              Сè на едно место: настани, резервации, гости, музика, менија и повеќе. Паметно, брзо и едноставно.
            </p>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--eco)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.7L6 11.5M11 19h8.2a1.8 1.8 0 0 0 1.6-2.7L19 13M14 5.5l-1-1.8a1.8 1.8 0 0 0-3.1 0L7.8 7.4" />
                <path d="M8.5 16 11 19l-2.5 3M17.5 10.5 19 13l-3.5 1M5 8.6 7.8 7.4l1.2 3" />
              </svg>
              <Leaf />
              Повеќе организација со:
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
                <circle cx={12} cy={12} r={9.5} fill="#3b8fd9" />
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

      <section id="platform" className="band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">За платформата</p>
            <h2>Една контролна табла за целиот ваш локал</h2>
            <p>Каде си? им служи на ресторани и сали за настани, а преку нив и на секој пар или организатор што слави кај вас.</p>
          </div>
          <div className="platform-grid">
            <div>
              <div className="preview" aria-label="Пример од контролната табла">
                <div className="preview-bar">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="preview-body">
                  <div className="preview-side">
                    <div className="on">Контролна табла</div>
                    <div>Настани</div>
                    <div>Резервации</div>
                    <div>Распоред на маси</div>
                    <div>Мени / Пакети</div>
                  </div>
                  <div className="preview-main">
                    <div className="stats">
                      <div className="stat">
                        <b>12</b>
                        <span>Настани овој месец</span>
                      </div>
                      <div className="stat">
                        <b>184</b>
                        <span>Покането гости</span>
                      </div>
                      <div className="stat">
                        <b>8</b>
                        <span>Резервации денес</span>
                      </div>
                    </div>
                    <div className="rows">
                      <div className="row">
                        <time>13:00</time>
                        <span>Крштевка · Сала Лозја · 60 гости</span>
                        <span className="pill pill-ok">Потврдено</span>
                      </div>
                      <div className="row">
                        <time>19:00</time>
                        <span>Свадба Ана &amp; Марко · 220 гости</span>
                        <span className="pill pill-ok">Потврдено</span>
                      </div>
                      <div className="row">
                        <time>20:30</time>
                        <span>Маса 7 · 6 лица</span>
                        <span className="pill pill-wait">Чека</span>
                      </div>
                    </div>
                  </div>
                </div>
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

      <section id="how" className="band band-tint">
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

      <section id="pricing" className="band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Цени</p>
            <h2>Планови</h2>
            <p>Регистрацијата е бесплатна. Надградете кога ќе ви затреба повеќе.</p>
          </div>
          <div className="plans">
            {PRICING.map((tier) => (
              <article key={tier.name} className={`plan${tier.featured ? " featured" : ""}`}>
                {tier.featured ? <span className="badge">Препорачано</span> : null}
                <h3>{tier.name}</h3>
                <div className="price">
                  {tier.price} {tier.period ? <small>{tier.period}</small> : null}
                </div>
                <ul>
                  {tier.features.map((f) => (
                    <li key={f}>
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

      <section className="band band-tint">
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

      <section id="contact" className="band">
        <div className="wrap contact-grid">
          <div className="contact-side">
            <p className="eyebrow">Да започнеме</p>
            <h2>Контакт</h2>
            <p>Имате прашање за плановите или сакате демо за вашиот локал? Пишете ни и ќе ви одговориме во рок од еден работен ден.</p>
          </div>
          <ContactForm />
        </div>
      </section>

      <section className="cta">
        <div className="wrap">
          <h2>Спремни да го тестирате бесплатно?</h2>
          <p>Регистрирајте го вашиот локал за неколку минути. Без картичка, без обврска.</p>
          <Link href="/signup" className="btn btn-red">
            Започни бесплатно
          </Link>
        </div>
      </section>

    </div>
  );
}
