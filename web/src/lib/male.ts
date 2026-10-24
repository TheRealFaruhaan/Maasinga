import type { Island } from "./islands";

/** Malé City: Malé, Hulhumalé, Vilimalé and the airport island (API "MLE.*"). */
export const isMaleCity = (i: Island | undefined) => !!i && i.id.startsWith("MLE.");
