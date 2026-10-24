"use client";

import { useLang } from "@/lib/i18n";
import { RTL_APP } from "@/lib/apps";
import type { Island } from "@/lib/islands";
import { AppTile, DashSection, EmergencyNumbers } from "./parts";
import { BoatStatusList } from "./boat-status";

/** Dashboard for any island that doesn't have one of its own. */
export function GeneralDashboard({ island }: { island: Island }) {
  const { t } = useLang();
  return (
    <div>
      <BoatStatusList island={island} />

      <DashSection title={t.ferryTickets}>
        <AppTile app={RTL_APP} />
      </DashSection>

      <EmergencyNumbers />
    </div>
  );
}
