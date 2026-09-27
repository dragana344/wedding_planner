import Link from "next/link";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";
import { ContactForm } from "@/components/marketing/ContactForm";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Icon } from "@/components/venue/shell/Icon";
import { IconSprite } from "@/components/venue/shell/IconSprite";
import "@/app/venue/panel.css";

const FEATURES = [
  { icon: "cal-dot", title: "Организирај настани", desc: "Свадби, родендени, матурски, конференции — сите настани на вашиот локал, на едно место." },
  { icon: "book", title: "Резервации", desc: "Прегледувајте и потврдувајте резервации без телефонски повици и хартиени тетратки." },
  { icon: "users", title: "Гости и покани", desc: "Секој клиент добива своја контролна табла за да ги покани своите гости и следи потврди." },
  { icon: "menu", title: "Менија & Пакети", desc: "Изградете менија и пакети кои клиентите ги гледаат и избираат директно во платформата." },
];

const STEPS = [
  "Создадете бесплатна сметка за Вашиот локал",
  "Поставете ги Вашите простории, маси и менија",
  "Управувајте со настани и резервации на едно место",
  "Поканете ги паровите да ја користат нивната своја контролна табла",
];

const PRICING = [
  {
    name: "Основен",
    price: "1.500 ден/месечно",
    features: ["1 локал", "До 2 простории", "Управување со настани", "Резервации", "Распоред на маси"],
    featured: false,
  },
  {
    name: "Про",
    price: "3.500 ден/месечно",
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
    features: ["Сè од Про", "Брендирање по мерка на локалот", "Извештаи и аналитика", "Приоритетна поддршка"],
    featured: false,
  },
];

const FAQ = [
  {
    q: "Дали треба картичка за да пробам?",
    a: "Не. Регистрацијата е бесплатна и веднаш добивате пристап до целосна контролна табла — без внесување платежни податоци.",
  },
  {
    q: "Што точно добивам кога се регистрирам бесплатно?",
    a: "Целосно функционална контролна табла за вашиот локал — настани, резервации, распоред на маси и менија — за да ја истражите платформата пред да одлучите.",
  },
  {
    q: "Како да преминам на платен план?",
    a: "Контактирајте нè преку формата подолу. Нашиот тим ќе ги активира дополнителните функционалности и ќе го персонализира изгледот на вашиот локал.",
  },
  {
    q: "Може ли подоцна да го брендирам изгледот на локалот?",
    a: "Да — по договор, логото и боите на вашиот локал се применуваат рачно од нашиот тим, дел од Премиум планот.",
  },
];

export default function Home() {
  return (
    <div className="vp">
      <RecoveryRedirect />
      <IconSprite />

      <MarketingNav />

      <header id="home" className="mkt-hero">
        <p style={{ letterSpacing: "0.2em", fontSize: 12, textTransform: "uppercase", color: "var(--gold-hi)" }}>where @re you?</p>
        <h1>КАДЕ СУМ?</h1>
        <p>Дигитална контролна табла за вашиот ресторан или сала — управувајте со резервации, настани, маси и менија, и понудете им на организаторите модерно искуство.</p>
        <div className="mkt-hero-ctas">
          <Link href="/signup" className="btn btn-gold">Започни бесплатно</Link>
          <Link href="/login" className="btn btn-ghost" style={{ background: "transparent", borderColor: "#fff", color: "#fff" }}>
            Најави се
          </Link>
        </div>
      </header>

      <div className="mkt-preview-section">
        <div className="mkt-preview">
          <div className="mkt-preview-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="mkt-preview-body">
            <div className="mkt-preview-side">
              <div className="mkt-preview-side-item on">
                <Icon name="home" size="sm" />
                Контролна табла
              </div>
              <div className="mkt-preview-side-item">
                <Icon name="cal-dot" size="sm" />
                Настани
              </div>
              <div className="mkt-preview-side-item">
                <Icon name="tables" size="sm" />
                Распоред на маси
              </div>
              <div className="mkt-preview-side-item">
                <Icon name="menu" size="sm" />
                Мени / Пакети
              </div>
            </div>
            <div className="mkt-preview-main">
              <div className="mkt-preview-stats">
                <div>
                  <b>12</b>
                  <span>Настани овој месец</span>
                </div>
                <div>
                  <b>184</b>
                  <span>Гости покането</span>
                </div>
                <div>
                  <b>8</b>
                  <span>Резервации денес</span>
                </div>
              </div>
              <div className="mkt-preview-rows">
                <div className="mkt-preview-row" />
                <div className="mkt-preview-row" />
                <div className="mkt-preview-row" />
              </div>
            </div>
          </div>
        </div>
        <p className="mkt-preview-caption">Ова е контролната табла што ја добивате веднаш штом ќе се регистрирате.</p>
      </div>

      <div className="mkt-band mkt-band-white">
        <section id="platform" className="mkt-section">
          <ScrollReveal>
            <p className="mkt-eyebrow">Зошто Каде сум?</p>
            <h2 className="mkt-section-title">За платформата</h2>
            <div className="mkt-feature-grid">
              {FEATURES.map((f) => (
                <div key={f.title} className="mkt-feature-card">
                  <div className="mkt-feature-icon">
                    <Icon name={f.icon} size="lg" />
                  </div>
                  <b>{f.title}</b>
                  <p style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 8 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>
      </div>

      <section id="how" className="mkt-section">
        <ScrollReveal>
          <p className="mkt-eyebrow">Процес</p>
          <h2 className="mkt-section-title">Како работи</h2>
          <div className="mkt-feature-grid">
            {STEPS.map((step, i) => (
              <div key={step} className="mkt-feature-card">
                <div style={{ color: "var(--gold-lo)", fontWeight: 800, fontSize: 22 }}>{i + 1}</div>
                <p style={{ fontSize: 13.5, marginTop: 8 }}>{step}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      <div className="mkt-band mkt-band-gold">
        <section id="pricing" className="mkt-section">
          <ScrollReveal>
            <p className="mkt-eyebrow">Цени</p>
            <h2 className="mkt-section-title">Планови</h2>
            <div className="mkt-pricing-grid">
              {PRICING.map((tier) => (
                <div key={tier.name} className={`mkt-pricing-card${tier.featured ? " featured" : ""}`}>
                  {tier.featured ? <div className="mkt-pricing-badge">Препорачано</div> : null}
                  <b>{tier.name}</b>
                  <div className="price">{tier.price}</div>
                  <ul>
                    {tier.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <a href="#contact" className="btn btn-ghost">Контактирајте нè</a>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>
      </div>

      <div className="mkt-band mkt-band-white">
        <section className="mkt-section">
          <ScrollReveal>
            <p className="mkt-eyebrow">Прашања</p>
            <h2 className="mkt-section-title">Често поставувани прашања</h2>
            <div className="mkt-faq">
              {FAQ.map((item) => (
                <div key={item.q} className="mkt-faq-item">
                  <div className="mkt-faq-q">{item.q}</div>
                  <p className="mkt-faq-a">{item.a}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>
      </div>

      <section id="contact" className="mkt-section">
        <ScrollReveal>
          <p className="mkt-eyebrow">Да започнеме</p>
          <h2 className="mkt-section-title">Контакт</h2>
          <ContactForm />
        </ScrollReveal>
      </section>

      <div className="mkt-cta-band">
        <h2>Спремни да го тестирате бесплатно?</h2>
        <p>Регистрирајте го вашиот локал за неколку минути — без картичка, без обврска.</p>
        <Link href="/signup" className="btn btn-gold">Започни бесплатно</Link>
      </div>

      <footer className="mkt-footer">© 2026 Каде сум? Сите права задржани.</footer>
    </div>
  );
}
