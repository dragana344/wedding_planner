import { ErrorScreen } from "@/components/ErrorScreen";

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="Страницата не е пронајдена"
      message="Линкот можеби е погрешен или страницата повеќе не постои."
    />
  );
}
