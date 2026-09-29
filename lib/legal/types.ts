// Structured, bilingual legal content (COMP-001). Every string is written as
// a { mk, en } pair so both languages always have the same sections, list
// items and table rows; `localize` turns a bilingual document into one
// language for rendering.

export type Lang = "mk" | "en";

export type Bi = { mk: string; en: string };

export type BiBlock =
  | { type: "p"; text: Bi }
  | { type: "ul"; items: Bi[] }
  | { type: "table"; head: Bi[]; rows: Bi[][] };

export type BiSection = { id: string; heading: Bi; blocks: BiBlock[] };

export type BiDocument = {
  title: Bi;
  description: Bi;
  intro: Bi[];
  sections: BiSection[];
};

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };

export type LegalDocument = {
  lang: Lang;
  title: string;
  description: string;
  intro: string[];
  lastUpdated: string;
  version: string;
  sections: LegalSection[];
};

export function localize(doc: BiDocument, lang: Lang, meta: { lastUpdated: string; version: string }): LegalDocument {
  return {
    lang,
    title: doc.title[lang],
    description: doc.description[lang],
    intro: doc.intro.map((p) => p[lang]),
    lastUpdated: meta.lastUpdated,
    version: meta.version,
    sections: doc.sections.map((s) => ({
      id: s.id,
      heading: s.heading[lang],
      blocks: s.blocks.map((b): LegalBlock => {
        if (b.type === "p") return { type: "p", text: b.text[lang] };
        if (b.type === "ul") return { type: "ul", items: b.items.map((i) => i[lang]) };
        return { type: "table", head: b.head.map((h) => h[lang]), rows: b.rows.map((r) => r.map((c) => c[lang])) };
      }),
    })),
  };
}

/** Plain text of a section (heading + every block), for tests and search. */
export function sectionText(section: LegalSection): string {
  const parts = [section.heading];
  for (const b of section.blocks) {
    if (b.type === "p") parts.push(b.text);
    else if (b.type === "ul") parts.push(...b.items);
    else parts.push(...b.head, ...b.rows.flat());
  }
  return parts.join("\n");
}
