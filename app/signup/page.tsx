import { AuthScreen } from "@/components/auth/AuthScreen";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <AuthScreen
      eyebrow="Започни бесплатно"
      tagline="Организирајте настани, резервации и гости — сè на едно место."
      title="Создади сметка"
    >
      <SignupForm />
    </AuthScreen>
  );
}
