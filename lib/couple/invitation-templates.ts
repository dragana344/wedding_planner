// lib/couple/invitation-templates.ts
export interface InvitationTemplate {
  id: string;
  name: string;
  accentColor: string;
  borderStyle: "floral" | "gold-frame" | "minimal" | "watercolor" | "rustic";
}

export const INVITATION_TEMPLATES: InvitationTemplate[] = [
  { id: "romantic-floral", name: "Романтичен цветен", accentColor: "#C97B84", borderStyle: "floral" },
  { id: "elegant-gold", name: "Елегантен златен", accentColor: "#C9992F", borderStyle: "gold-frame" },
  { id: "classic-minimal", name: "Класичен минималист", accentColor: "#2C2C2C", borderStyle: "minimal" },
  { id: "modern-watercolor", name: "Модерен акварел", accentColor: "#6B9AC4", borderStyle: "watercolor" },
  { id: "rustic", name: "Рустикално", accentColor: "#7C5A3A", borderStyle: "rustic" },
];

export function getInvitationTemplate(id: string): InvitationTemplate {
  return INVITATION_TEMPLATES.find((t) => t.id === id) ?? INVITATION_TEMPLATES[0];
}
