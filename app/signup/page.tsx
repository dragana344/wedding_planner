import { AuthScreen } from "@/components/auth/AuthScreen";
import { DemoRequestForm } from "@/components/auth/DemoRequestForm";

// Public self-signup is closed: the team sets each venue up after a demo.
export default function SignupPage() {
  return (
    <AuthScreen
      theme="landing"
      eyebrow="Побарај демо"
      tagline="Организирајте настани, резервации и гости — сè на едно место."
      title="Побарај демо"
      subtitle="Оставете ни контакт. Ќе ви го покажеме Каде си?, а потоа ние ќе го поставиме вашиот локал."
      switchTo={{ prompt: "Веќе имате сметка?", label: "Најави се", href: "/login" }}
    >
      <DemoRequestForm />
    </AuthScreen>
  );
}
