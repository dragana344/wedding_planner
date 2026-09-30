import Link from "next/link";

/**
 * Full-page message for errors and unknown URLs (REL-003). Plain markup and
 * Tailwind only, so it also renders inside global-error.tsx, where the root
 * layout (and its fonts/styles) may be the thing that failed.
 */
export function ErrorScreen({
  code,
  title,
  message,
  reference,
  action,
}: {
  code: string;
  title: string;
  message: string;
  reference?: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16 bg-[#faf8f4] text-[#1d1a16]">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-[#a8842c]">{code}</p>
        <h1 className="mt-3 text-2xl font-bold">{title}</h1>
        <p className="mt-3 leading-relaxed text-[#5c554b]">{message}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {action}
          <Link href="/" className="rounded-lg border border-[#d9d2c3] px-4 py-2 text-sm font-semibold hover:bg-white">
            Почетна страница
          </Link>
        </div>
        {reference ? <p className="mt-8 text-xs text-[#8a8275]">Референца: {reference}</p> : null}
      </div>
    </main>
  );
}
