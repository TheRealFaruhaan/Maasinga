import type { HarbourBoat } from "@/lib/data";

export const TYPE: Record<HarbourBoat["type"], string> = { fast: "Speedboat", dhoni: "Dhoni or ferry", slow: "Slow boat" };

/** A duration in days, hours and minutes: "44 min", "5h 20m", "2d 7h". */
export function stay(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const r = m % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function median(xs: number[]) {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}
