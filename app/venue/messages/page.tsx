import { notFound } from "next/navigation";

// B9: no conversation channel exists yet, so "Пораки" is hidden from the
// navigation and the old placeholder URL is a 404.
export default function Page() {
  notFound();
}
