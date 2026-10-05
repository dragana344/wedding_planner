// Amounts in Macedonian denars as people write them: "120.000 ден".
// Formatted by hand, not with Intl: Node and browsers group mk-MK numbers
// differently, which breaks hydration in client components.
export function formatDen(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${rounded < 0 ? "-" : ""}${digits} ден`;
}
