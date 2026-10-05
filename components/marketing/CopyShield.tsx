"use client";

// Wraps a decorative, coded mock-up (the dashboard preview) so it behaves like
// a picture: one labelled image for assistive tech, nothing inside it can be
// focused, selected, dragged or right-clicked, and a transparent cover takes
// every pointer event. It deters casual copying only — the markup is still in
// the page source and a screenshot always works.
export function CopyShield({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  const block = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <div className={`shield ${className}`.trim()} role="img" aria-label={label} onContextMenu={block} onCopy={block} onCut={block} onDragStart={block}>
      <div className="shield-content" inert>
        {children}
      </div>
      <div className="shield-cover" aria-hidden="true" />
    </div>
  );
}
