/** Small-calendar marker: one dot per event on that day, in the event's room
 * color (up to three, then a "+"), so a day with two events reads differently
 * from a day with one. */
export function DayDots({ colors }: { colors: string[] }) {
  const count = colors.length;
  if (count === 0) return null;
  const label = count === 1 ? "1 настан" : `${count} настани`;
  return (
    <span className={`mc-dots${count > 1 ? " is-multi" : ""}`} role="img" aria-label={label} title={label}>
      {colors.slice(0, 3).map((color, i) => (
        <i key={i} className="mc-dot" style={{ background: color }} />
      ))}
      {count > 3 ? <b className="mc-more">+</b> : null}
    </span>
  );
}
