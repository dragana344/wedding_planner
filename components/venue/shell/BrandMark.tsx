// The mark at the top of a panel's sidebar: the venue's own logo when its
// plan includes branding and it uploaded one, otherwise the platform diamond.
export function BrandMark({ logoUrl }: { logoUrl?: string | null }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- public storage URL, any aspect ratio
    return <img className="mark mark-logo" src={logoUrl} alt="" />;
  }
  return (
    <svg className="mark" width="40" height="40" viewBox="0 0 42 42" aria-hidden>
      <path d="M21 4 34 15.5 21 38 8 15.5 21 4Z" fill="#E0B44E" />
      <path d="M21 4 34 15.5H8L21 4Z" fill="#F2D48A" />
      <path d="M21 38 8 15.5h26L21 38Z" fill="#C9992F" />
      <path d="M21 4 15 15.5 21 38l6-22.5L21 4Z" fill="#F6E3AF" opacity=".55" />
    </svg>
  );
}
