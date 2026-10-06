import { AuthScreen } from "@/components/auth/AuthScreen";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <AuthScreen
      theme="landing"
      eyebrow="Започни бесплатно"
      tagline="Организирајте настани, резервации и гости — сè на едно место."
      title="Создади сметка"
      subtitle="Бесплатна сметка за вашиот локал, без картичка."
      switchTo={{ prompt: "Веќе имате сметка?", label: "Најави се", href: "/login" }}
    >
      <SignupForm />
    </AuthScreen>
  );
}
