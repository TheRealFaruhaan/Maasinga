"use client";

import { useLang } from "@/lib/i18n";
import type { Island } from "@/lib/islands";
import { DashSection, EmergencyNumbers, PlaceApps } from "./parts";
import { SeaForecast } from "./sea";
import { BoatStatusList } from "./boat-status";

/** Dashboard for any island that doesn't have one of its own. */
export function GeneralDashboard({ island }: { island: Island }) {
  const { t } = useLang();
  return (
    <div>
      <SeaForecast island={island} />

      <BoatStatusList island={island} />

      <DashSection title={t.ferryTickets}>
        <PlaceApps place={island.id} category="ferry" layout="rows" />
      </DashSection>

      <EmergencyNumbers />
    </div>
  );
}
