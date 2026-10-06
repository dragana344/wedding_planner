import { Icon } from "@/components/venue/shell/Icon";
import { IconSprite } from "@/components/venue/shell/IconSprite";
import { NAV_ITEMS } from "@/components/venue/shell/nav";
import { STATUS_META, TYPE_META } from "@/lib/venue/event-display";
import { CopyShield } from "./CopyShield";

// A coded copy of the venue control panel (components/venue/shell/PanelShell +
// components/venue/dashboard/DashboardClient) for the landing page, instead of
// a screenshot: it stays sharp at any size and follows the real navigation,
// status labels and colours. Every size in landing.css's `.dp` block is a
// multiple of one container-relative unit, so the whole thing scales like an
// image. The data below is sample data.

const QUICK = [
  { icon: "plus", title: "КРЕИРАЈ НАСТАН", sub: "Нов настан за секунди", primary: true },
  { icon: "cal-dot", title: "НАСТАНИ", sub: "Сите настани и прослави", primary: false },
  { icon: "tables", title: "РАСПОРЕД НА МАСИ", sub: "План на сала", primary: false },
  { icon: "menu", title: "МЕНИ / ПАКЕТИ", sub: "Менија и јадења", primary: false },
];

const TILES = [
  { icon: "cal-dot", num: "3", lab: "Настани денес", sub: "во сите статуси" },
  { icon: "users", num: "410", lab: "Гости денес", sub: "по проценка" },
  { icon: "occ", num: "78%", lab: "Пополнетост", sub: "320 од 410 места" },
  { icon: "clock", num: "1", lab: "Во подготовка", sub: "потребна потврда" },
];

const DAY_PLAN = [
  { time: "12:00 – 15:00", name: "Крштевка на Лука", type: "baptism", detail: "Мала сала · 60 гости", status: "completed" },
  { time: "18:00 – 02:00", name: "Ана & Марко", type: "wedding", detail: "Голема сала · 320 гости", status: "confirmed" },
  { time: "19:30 – 23:00", name: "Роденден на Ива", type: "birthday", detail: "Тераса · 30 гости", status: "preparation" },
] as const;

// Round tables of the sample hall: [x, y, number, taken].
const TABLES: [number, number, number, boolean][] = [
  [52, 62, 1, true], [104, 62, 2, true], [156, 62, 3, true], [208, 62, 4, false],
  [52, 112, 5, true], [104, 112, 6, true], [156, 112, 7, false], [208, 112, 8, true],
  [52, 162, 9, true], [104, 162, 10, false], [156, 162, 11, true], [208, 162, 12, true],
];

export function DashboardPreview() {
  const nav = NAV_ITEMS.filter((item) => item.ready).slice(0, 8);
  return (
    <CopyShield className="dp" label="Контролната табла на Каде си?: настани за денес, пополнетост, дневен план и распоред на маси">
      <IconSprite />
      <div className="dp-in">
        <div className="dp-side">
          <div className="dp-brand">
            <svg viewBox="0 0 42 42">
              <path d="M21 4 34 15.5 21 38 8 15.5 21 4Z" fill="#E0B44E" />
              <path d="M21 4 34 15.5H8L21 4Z" fill="#F2D48A" />
              <path d="M21 38 8 15.5h26L21 38Z" fill="#C9992F" />
              <path d="M21 4 15 15.5 21 38l6-22.5L21 4Z" fill="#F6E3AF" opacity=".55" />
            </svg>
            <div>
              <b>Ресторан Панорама</b>
              <span>ПАНЕЛ ЗА УПРАВУВАЊЕ</span>
            </div>
          </div>
          <div className="dp-nav">
            {nav.map((item, i) => (
              <div key={item.href} className={i === 0 ? "on" : undefined}>
                <Icon name={item.icon} />
                {item.label}
              </div>
            ))}
          </div>
          <div className="dp-quick">
            <b>
              <Icon name="bolt" />
              НОВ НАСТАН
            </b>
            <span>Свадба, роденден, прослава</span>
          </div>
        </div>

        <div className="dp-main">
          <div className="dp-top">
            <div>
              <b>КОНТРОЛНА ТАБЛА</b>
              <span>Преглед на вашиот локал денес</span>
            </div>
            <div className="dp-meta">
              <div>
                <Icon name="cal" size="lg" />
                <span>
                  <small>Денес е</small>
                  <b>13 Јуни 2026</b>
                </span>
              </div>
              <div>
                <Icon name="clock" size="lg" />
                <b>17:42</b>
              </div>
            </div>
          </div>

          <div className="dp-body">
            <div className="dp-qrow">
              {QUICK.map((q) => (
                <div key={q.title} className={q.primary ? "dp-qa primary" : "dp-qa"}>
                  <i>
                    <Icon name={q.icon} size="lg" />
                  </i>
                  <span>
                    <b>{q.title}</b>
                    <small>{q.sub}</small>
                  </span>
                </div>
              ))}
            </div>

            <div className="dp-day">
              <i />
              ДЕНЕС — САБОТА, 13 ЈУНИ 2026
            </div>

            <div className="dp-tiles">
              {TILES.map((t) => (
                <div key={t.lab} className="dp-tile">
                  <i>
                    <Icon name={t.icon} size="lg" />
                  </i>
                  <span>
                    <b>{t.num}</b>
                    {t.lab}
                    <small>{t.sub}</small>
                  </span>
                </div>
              ))}
            </div>

            <div className="dp-grid">
              <div className="dp-panel">
                <div className="dp-panel-h">
                  <b>
                    <Icon name="note" size="sm" /> Дневен план
                  </b>
                  <span>{DAY_PLAN.length} закажани</span>
                </div>
                {DAY_PLAN.map((ev) => (
                  <div key={ev.name} className="dp-row">
                    <i style={{ background: TYPE_META[ev.type].color }} />
                    <time>{ev.time}</time>
                    <span>
                      <b>{ev.name}</b>
                      <small>
                        {TYPE_META[ev.type].label} · {ev.detail}
                      </small>
                    </span>
                    <em className={STATUS_META[ev.status].pill}>{STATUS_META[ev.status].label}</em>
                  </div>
                ))}
              </div>

              <div className="dp-panel">
                <div className="dp-panel-h">
                  <b>
                    <Icon name="tables" size="sm" /> Распоред на маси
                  </b>
                  <span>Голема сала</span>
                </div>
                <div className="dp-legend">
                  <span>
                    <i style={{ background: "#16A34A" }} /> Слободна
                  </span>
                  <span>
                    <i style={{ background: "#DC2626" }} /> Резервирана
                  </span>
                </div>
                <svg className="dp-floor" viewBox="0 0 360 200">
                  <rect x={1} y={1} width={358} height={198} rx={6} fill="#fbfbfc" stroke="#eaeaee" strokeWidth={2} />
                  <rect x={86} y={12} width={100} height={20} rx={4} fill="#6B4BC0" />
                  <text x={136} y={26} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                    МЛАДЕНЦИ
                  </text>
                  <rect x={252} y={44} width={92} height={74} rx={5} fill="#f6e7c7" stroke="#c9992f" strokeWidth={1.5} />
                  <text x={298} y={85} textAnchor="middle" fontSize={10} fontWeight={700} fill="#8a6414">
                    ПОДИУМ
                  </text>
                  <rect x={252} y={134} width={92} height={48} rx={5} fill="#737373" />
                  <text x={298} y={162} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                    МУЗИКА
                  </text>
                  {TABLES.map(([x, y, n, taken]) => (
                    <g key={n}>
                      <circle cx={x} cy={y} r={18} fill={taken ? "#DC2626" : "#16A34A"} />
                      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
                        {n}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CopyShield>
  );
}
