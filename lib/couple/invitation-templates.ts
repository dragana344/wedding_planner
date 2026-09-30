// lib/couple/invitation-templates.ts
export interface InvitationTemplate {
  id: string;
  name: string;
  accentColor: string;
  borderStyle: "floral" | "gold-frame" | "minimal" | "watercolor" | "rustic" | "royal";
  /** Behind the `invitation_all_templates` package feature (at most three). */
  premium: boolean;
}

export const INVITATION_TEMPLATES: InvitationTemplate[] = [
  { id: "romantic-floral", name: "Романтичен цветен", accentColor: "#C97B84", borderStyle: "floral", premium: false },
  { id: "elegant-gold", name: "Елегантен златен", accentColor: "#B8913A", borderStyle: "gold-frame", premium: true },
  { id: "classic-minimal", name: "Класичен минималист", accentColor: "#2C2C2C", borderStyle: "minimal", premium: false },
  { id: "modern-watercolor", name: "Модерен акварел", accentColor: "#6B9AC4", borderStyle: "watercolor", premium: false },
  { id: "rustic", name: "Рустикално", accentColor: "#7C5A3A", borderStyle: "rustic", premium: true },
  { id: "royal-green", name: "Кралско писмо", accentColor: "#5C6B47", borderStyle: "royal", premium: true },
];

// Every template above renders through the single data-driven layout in
// components/invite/FullInvitation.tsx (theme config keyed by id there) —
// there is no separate per-template component or generic fallback.

export function getInvitationTemplate(id: string): InvitationTemplate {
  return INVITATION_TEMPLATES.find((t) => t.id === id) ?? INVITATION_TEMPLATES[0];
}
