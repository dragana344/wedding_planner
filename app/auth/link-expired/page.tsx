import type { Metadata } from "next";
import Link from "next/link";
import { ErrorScreen } from "@/components/ErrorScreen";

export const metadata: Metadata = { title: "Линкот не важи — Каде си?", robots: { index: false } };

export default function LinkExpiredPage() {
  return (
    <ErrorScreen
      code="ЛИНК"
      title="Линкот повеќе не важи"
      message="Линкот од пораката е искористен, истечен или е отворен во друг прелистувач од оној во кој го побаравте. Побарајте нов и отворете го на истиот уред."
      action={
        <Link href="/login" className="rounded-lg bg-[#1d1a16] px-4 py-2 text-sm font-semibold text-white hover:bg-black">
          Кон најава
        </Link>
      }
    />
  );
}
