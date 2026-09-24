import Link from "next/link";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <RecoveryRedirect />
      <h1 className="text-2xl font-semibold">КАДЕ СУМ? — Venue Panel</h1>
      <Link href="/venue" className="text-blue-600 underline">
        Go to venue panel
      </Link>
    </main>
  );
}
