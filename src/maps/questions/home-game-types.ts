// The "Large Game variation" category question types (ADR 0006): the
// hiding-zone-based questions that `hiderifyMatching`/`hiderifyMeasuring`
// answer via `nearestToQuestion`, as opposed to the "-full"
// (Small+Medium Games) variants answered by `findCategoryPlaces`.
//
// This list was duplicated verbatim in matching.ts and measuring.ts (the
// `hiderify*` functions each inlined the same 11-element array to branch on).
// It is also the set the picker hides for a Medium game via
// HIDDEN_MATCHING_TYPES / HIDDEN_MEASURING_TYPES in the card components.
// One home here means a category can't silently appear in one twin but not
// the other.

export const HOME_GAME_TYPES = [
    "aquarium",
    "zoo",
    "theme_park",
    "peak",
    "museum",
    "hospital",
    "cinema",
    "library",
    "golf_course",
    "consulate",
    "park",
] as const;

export const isHomeGameType = (type: string): boolean =>
    (HOME_GAME_TYPES as readonly string[]).includes(type);
