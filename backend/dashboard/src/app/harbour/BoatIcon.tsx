import type { HarbourBoat } from "@/lib/data";

/** Line icons for the three boat types, drawn in the type's colour (currentColor). */
export default function BoatIcon({ type, size = 22 }: { type: HarbourBoat["type"]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {type === "fast" && (
        <>
          <path d="M2 14h15l5-4.5H10.5L8 12H2z" />
          <path d="M12 9.5l1.6-2.5H17" />
          <path d="M2 18.5c1.7 0 1.7-1 3.4-1s1.7 1 3.4 1 1.7-1 3.4-1" />
        </>
      )}
      {type === "dhoni" && (
        <>
          <path d="M2.5 12.5c3.5 3.5 14 3.5 17.5 0l1.5-5" />
          <path d="M7 12.8V8.5h9v4.6" />
          <path d="M6 8.5h11" />
          <path d="M2 19c1.7 0 1.7-1 3.4-1s1.7 1 3.4 1 1.7-1 3.4-1 1.7 1 3.4 1" />
        </>
      )}
      {type === "slow" && (
        <>
          <path d="M2 13h20l-2.5 4.5h-15z" />
          <path d="M5 13V8.5h6V13" />
          <path d="M12.5 13v-3h5.5v3" />
        </>
      )}
    </svg>
  );
}
