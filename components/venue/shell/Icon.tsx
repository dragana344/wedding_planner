/*
 * References a symbol from <IconSprite />. `name` is the sprite id without the
 * "ic-" prefix, e.g. <Icon name="cal" /> → #ic-cal.
 */
export function Icon({
  name,
  size = "md",
  className = "",
  style,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}) {
  const sizeClass = size === "sm" ? "i i-sm" : size === "lg" ? "i i-lg" : "i";
  return (
    <svg className={`${sizeClass} ${className}`.trim()} style={style} aria-hidden>
      <use href={`#ic-${name}`} />
    </svg>
  );
}
