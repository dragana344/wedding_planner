// Designs for the printable album QR cards and poster (C4). A plain module so
// the server page and the client component share it.
//
// Each design is a full-card background drawn in code (components/couple/
// print-art) with its own colours, heading and heading font. "classic" is the
// plain card every event had before designs existed.
//
// Adding a design: one entry here (colours, heading, spacing) and one drawing
// in components/couple/print-art, registered in PrintDesignArt.tsx.

export type PrintFont = "script" | "serif" | "playful" | "sans" | "hand";

export interface PrintTheme {
  /** Card background. */
  bg: string;
  /** Body text (the scan line). */
  text: string;
  /** Heading and table number. */
  accent: string;
  /** Border of the QR panel. */
  line: string;
  /** Heading size, in percent of the card width. */
  headingSize: number;
  /** Space kept clear above / below the text block, in percent of the card height. */
  padTop: number;
  padBottom: number;
}

export interface PrintDesign {
  id: string;
  label: string;
  /** The event types this design is offered for. */
  eventTypes: string[];
  heading?: { text: string; font: PrintFont };
  theme: PrintTheme;
}

export type PrintDesignId = string;

const BUSINESS = ["corporate", "conference", "presentation", "seminar", "team_building"];
const SHARE = "Споделете ги моментите";

// The first design listed for an event type is the one a card starts with:
// the elegant, simple one.
export const PRINT_DESIGNS: PrintDesign[] = [
  // Wedding
  {
    id: "wedding-elegant", label: "Елегантен и едноставен", eventTypes: ["wedding"],
    heading: { text: "Forever", font: "serif" },
    theme: { bg: "#fffdf8", text: "#5a4a2a", accent: "#a8832f", line: "#d9c79a", headingSize: 12, padTop: 19, padBottom: 12 },
  },
  {
    id: "wedding-forever", label: "Градина — лисја, прстени и „Forever“", eventTypes: ["wedding"],
    heading: { text: "Forever", font: "script" },
    theme: { bg: "#fbf6ea", text: "#4a5a43", accent: "#a8832f", line: "#d9c79a", headingSize: 15, padTop: 24, padBottom: 13 },
  },
  {
    id: "wedding-romantic", label: "Романтичен — рози и срца", eventTypes: ["wedding"],
    heading: { text: "Love", font: "script" },
    theme: { bg: "#fdf1f0", text: "#7a4048", accent: "#c9606e", line: "#efb3b7", headingSize: 16, padTop: 20, padBottom: 13 },
  },
  // Birthday
  {
    id: "birthday-neutral", label: "Елегантен и едноставен", eventTypes: ["birthday"],
    heading: { text: "Среќен роденден", font: "serif" },
    theme: { bg: "#fbf8f2", text: "#5a4a2a", accent: "#a8832f", line: "#e0cf9f", headingSize: 7.6, padTop: 26, padBottom: 16 },
  },
  {
    id: "birthday-pink", label: "Розев — балони и торта", eventTypes: ["birthday"],
    heading: { text: "Среќен роденден", font: "playful" },
    theme: { bg: "#fff5f8", text: "#7a3350", accent: "#d6457b", line: "#f7a8c4", headingSize: 7.2, padTop: 26, padBottom: 16 },
  },
  {
    id: "birthday-blue", label: "Син — балони и торта", eventTypes: ["birthday"],
    heading: { text: "Среќен роденден", font: "playful" },
    theme: { bg: "#f1f8ff", text: "#24476e", accent: "#2f6db5", line: "#9ecbf5", headingSize: 7.2, padTop: 26, padBottom: 16 },
  },
  // Baby shower
  {
    id: "babyshower-neutral", label: "Нежен — месечина и ѕвезди", eventTypes: ["baby_shower"],
    heading: { text: "Добредојде, бебе", font: "playful" },
    theme: { bg: "#fbf8f2", text: "#5b5a49", accent: "#8a9a7a", line: "#d8d2b8", headingSize: 7.6, padTop: 26, padBottom: 15 },
  },
  {
    id: "babyshower-pink", label: "Розев — мече и облаци", eventTypes: ["baby_shower"],
    heading: { text: "Добредојде, бебе", font: "playful" },
    theme: { bg: "#fff4f7", text: "#7a3350", accent: "#e0709a", line: "#f7bfd2", headingSize: 7.6, padTop: 26, padBottom: 15 },
  },
  {
    id: "babyshower-blue", label: "Син — мече и облаци", eventTypes: ["baby_shower"],
    heading: { text: "Добредојде, бебе", font: "playful" },
    theme: { bg: "#f0f7ff", text: "#24476e", accent: "#4c8fd6", line: "#b6d6f5", headingSize: 7.6, padTop: 26, padBottom: 15 },
  },
  // Baptism
  {
    id: "baptism-gold", label: "Златен — крст и маслинови гранки", eventTypes: ["baptism"],
    heading: { text: "Крштевање", font: "serif" },
    theme: { bg: "#fffcf4", text: "#5a4a2a", accent: "#a8832f", line: "#e0cf9f", headingSize: 12, padTop: 26, padBottom: 14 },
  },
  {
    id: "baptism-blue", label: "Син — гулаб и облаци", eventTypes: ["baptism"],
    heading: { text: "Крштевање", font: "serif" },
    theme: { bg: "#f0f7ff", text: "#24476e", accent: "#3f7fc4", line: "#b6d6f5", headingSize: 12, padTop: 26, padBottom: 14 },
  },
  {
    id: "baptism-pink", label: "Розев — гулаб и облаци", eventTypes: ["baptism"],
    heading: { text: "Крштевање", font: "serif" },
    theme: { bg: "#fff4f7", text: "#7a3350", accent: "#cf5d88", line: "#f7bfd2", headingSize: 12, padTop: 26, padBottom: 14 },
  },
  // Graduation: grown-up and calm
  {
    id: "graduation-navy", label: "Темно сина и златна", eventTypes: ["graduation"],
    heading: { text: "Честитки", font: "serif" },
    theme: { bg: "#1b2a47", text: "#efe6d0", accent: "#d9b85a", line: "#c9a24a", headingSize: 13, padTop: 26, padBottom: 17 },
  },
  {
    id: "graduation-forest", label: "Шумско зелена и златна — отворена книга", eventTypes: ["graduation"],
    heading: { text: "Честитки", font: "serif" },
    theme: { bg: "#1f3b2f", text: "#efe6d0", accent: "#d9b85a", line: "#c9a24a", headingSize: 13, padTop: 26, padBottom: 17 },
  },
  {
    id: "graduation-burgundy", label: "Бордо и златна", eventTypes: ["graduation"],
    heading: { text: "Честитки", font: "serif" },
    theme: { bg: "#5a2230", text: "#f3e6d0", accent: "#e3c070", line: "#d9b85a", headingSize: 13, padTop: 26, padBottom: 17 },
  },
  // Anniversary
  {
    id: "anniversary-gold", label: "Бордо и златно — срца", eventTypes: ["anniversary"],
    heading: { text: "Среќна годишнина", font: "serif" },
    theme: { bg: "#fbf3ea", text: "#5b2a35", accent: "#9a2f4b", line: "#e2c9a0", headingSize: 9, padTop: 25, padBottom: 14 },
  },
  {
    id: "anniversary-silver", label: "Сребрено — чаши и ѕвезди", eventTypes: ["anniversary"],
    heading: { text: "Среќна годишнина", font: "serif" },
    theme: { bg: "#f4f6f9", text: "#39435a", accent: "#6a7894", line: "#c5ccd9", headingSize: 9, padTop: 25, padBottom: 14 },
  },
  {
    id: "anniversary-blush", label: "Нежно розево — рози и срца", eventTypes: ["anniversary"],
    heading: { text: "Среќна годишнина", font: "script" },
    theme: { bg: "#fdf1f0", text: "#7a4048", accent: "#c9606e", line: "#efb3b7", headingSize: 10.5, padTop: 25, padBottom: 14 },
  },
  // Family
  {
    id: "family-sunny", label: "Сончев — сонце и цвеќиња", eventTypes: ["family"],
    heading: { text: "Семејни моменти", font: "hand" },
    theme: { bg: "#fffbe9", text: "#5b4a1d", accent: "#d98a1f", line: "#f1d48a", headingSize: 7.6, padTop: 26, padBottom: 19 },
  },
  {
    id: "family-garden", label: "Градина — тратинчиња", eventTypes: ["family"],
    heading: { text: "Семејни моменти", font: "hand" },
    theme: { bg: "#f3f8ee", text: "#3d5a3a", accent: "#4f8a54", line: "#c3dbb9", headingSize: 7.6, padTop: 26, padBottom: 19 },
  },
  {
    id: "family-warm", label: "Топол — срца и лисја", eventTypes: ["family"],
    heading: { text: "Семејни моменти", font: "hand" },
    theme: { bg: "#fbf1e8", text: "#6a3a28", accent: "#c4623a", line: "#e9c3a8", headingSize: 7.6, padTop: 26, padBottom: 17 },
  },
  // New year
  {
    id: "newyear-midnight", label: "Полноќ — огномет и ѕвезди", eventTypes: ["new_year"],
    heading: { text: "Среќна Нова Година", font: "playful" },
    theme: { bg: "#14213d", text: "#f3ecd8", accent: "#f2c75c", line: "#f2c75c", headingSize: 6.8, padTop: 26, padBottom: 18 },
  },
  {
    id: "newyear-silver", label: "Црно и сребрено — чаши", eventTypes: ["new_year"],
    heading: { text: "Среќна Нова Година", font: "serif" },
    theme: { bg: "#1b1b1f", text: "#e9e9ee", accent: "#d6d8e0", line: "#9a9cab", headingSize: 7.8, padTop: 26, padBottom: 14 },
  },
  {
    id: "newyear-festive", label: "Празничен — зелено, црвено и злато", eventTypes: ["new_year"],
    heading: { text: "Среќна Нова Година", font: "playful" },
    theme: { bg: "#17402f", text: "#f6eed8", accent: "#f2c75c", line: "#f2c75c", headingSize: 6.8, padTop: 26, padBottom: 14 },
  },
  // School
  {
    id: "school-pencils", label: "Моливи и ѕвезди", eventTypes: ["school"],
    heading: { text: "Училишна забава", font: "hand" },
    theme: { bg: "#fffaf0", text: "#3b4a6b", accent: "#e0663a", line: "#f4cf9c", headingSize: 8, padTop: 26, padBottom: 14 },
  },
  {
    id: "school-chalkboard", label: "Табла и јаболко", eventTypes: ["school"],
    heading: { text: "Училишна забава", font: "hand" },
    theme: { bg: "#2f4a3f", text: "#f4f1e6", accent: "#f6d86a", line: "#f4f1e6", headingSize: 8, padTop: 26, padBottom: 14 },
  },
  {
    id: "school-books", label: "Книги и азбука", eventTypes: ["school"],
    heading: { text: "Училишна забава", font: "hand" },
    theme: { bg: "#eef5ff", text: "#2a4a78", accent: "#e8923a", line: "#b6d0f2", headingSize: 8, padTop: 26, padBottom: 14 },
  },
  // Business (corporate, conference, presentation, seminar, team building)
  {
    id: "business-navy", label: "Темно сино и златно", eventTypes: BUSINESS,
    heading: { text: SHARE, font: "sans" },
    theme: { bg: "#fbfbfd", text: "#243556", accent: "#243556", line: "#c9a24a", headingSize: 6.6, padTop: 24, padBottom: 14 },
  },
  {
    id: "business-teal", label: "Модерно — зелено-сино", eventTypes: BUSINESS,
    heading: { text: SHARE, font: "sans" },
    theme: { bg: "#f2f9f8", text: "#1f4b4f", accent: "#15858c", line: "#a8d4d6", headingSize: 6.6, padTop: 24, padBottom: 14 },
  },
  {
    id: "business-graphite", label: "Графит и бакар", eventTypes: BUSINESS,
    heading: { text: SHARE, font: "sans" },
    theme: { bg: "#2c2f36", text: "#ecebe8", accent: "#e0a070", line: "#e0a070", headingSize: 6.6, padTop: 24, padBottom: 14 },
  },
  // Anything else
  {
    id: "other-elegant", label: "Елегантен и едноставен", eventTypes: ["other"],
    heading: { text: SHARE, font: "serif" },
    theme: { bg: "#fffdf8", text: "#5a4a2a", accent: "#a8832f", line: "#d9c79a", headingSize: 7.6, padTop: 20, padBottom: 13 },
  },
  {
    id: "classic", label: "Класичен", eventTypes: [],
    theme: { bg: "#f5efe4", text: "#2b2620", accent: "#8a6a22", line: "#d9c79a", headingSize: 12, padTop: 10, padBottom: 10 },
  },
];

export function printDesign(id: string): PrintDesign {
  return PRINT_DESIGNS.find((d) => d.id === id) ?? PRINT_DESIGNS[PRINT_DESIGNS.length - 1];
}

/** The designs offered for an event type: the ones made for it, then the classic card. */
export function designsFor(eventType: string): PrintDesign[] {
  return PRINT_DESIGNS.filter((d) => d.id === "classic" || d.eventTypes.includes(eventType));
}

/** The design a card starts with: the first one made for the event type, else the classic card. */
export function defaultDesign(eventType: string): PrintDesignId {
  return designsFor(eventType)[0].id;
}

/** Reads ?design=…; an id that isn't a known design, or isn't offered for the event type, is ignored. */
export function parsePrintDesign(params: Record<string, string | string[] | undefined>, eventType: string): PrintDesignId {
  const raw = Array.isArray(params.design) ? params.design[0] : params.design;
  return designsFor(eventType).find((d) => d.id === raw)?.id ?? defaultDesign(eventType);
}
