"use client";

import { ActionButton } from "@/components/admin/ActionButton";
import { setMaintenanceMode } from "@/app/admin/(panel)/system/actions";

export function MaintenanceToggle({ enabled }: { enabled: boolean }) {
  return (
    <ActionButton
      label={enabled ? "Исклучи одржување" : "Вклучи одржување"}
      confirm={
        enabled
          ? undefined
          : "Ова ќе ја прикаже страницата за одржување на сите сали, парови и гости. Админ панелот не е засегнат. Промената важи за најмногу 30 секунди. Продолжи?"
      }
      action={() => setMaintenanceMode({ enabled: !enabled })}
    />
  );
}
