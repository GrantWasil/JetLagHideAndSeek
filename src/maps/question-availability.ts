import { determineUnionizedStrings, NO_GROUP } from "@/maps/schema";

// Deep module owning "is this question type offered for this game?" — the fork's
// question-availability concept. Previously this lived as three hand-maintained
// `Set<string>`s inside three React card components (matching.tsx,
// measuring.tsx, tentacles.tsx), each re-implementing the same
// introspect→filter→project pipeline against the schema. The data, the
// predicate, and the pipeline now have one home here; the cards keep only the
// grouping/rendering logic (which is genuinely view-shaped).
//
// The schema stays purely a validation model — hidden types REMAIN in the
// schema so older saved/shared games still parse (ADR 0006). Availability is a
// picker concern, layered on top of the schema, not baked into it.

export type QuestionCategory = "matching" | "measuring" | "tentacles";

// The single source of truth for question types hidden from the picker for
// this game. Three reasons (see the ADRs cited inline):
//   - void: no valid target inside the Denver game boundary (ADR 0003).
//   - not a real Jet Lag question (ADR 0005).
//   - large-game-only: we're playing a Medium game (ADR 0006).
export const HIDDEN_QUESTION_TYPES: Record<QuestionCategory, Set<string>> = {
    matching: new Set<string>([
        "airport", // commercial airport: DEN is out of bounds; in-bounds airfields aren't bookable (void, ADR 0003)
        "major-city", // not one of the 20 real matching questions; no >=1M city in-bounds (ADR 0005)
        "aquarium", // only 1 in-bounds -> "same" is trivial; also the large-game variant
        "aquarium-full",
        "letter-zone", // "Zone Starts With Same Letter" is not a real Jet Lag question (ADR 0005)
        "same-first-letter-station", // "Station Starts With Same Letter" — not a real question (ADR 0005)
        // Large Game variation of the category questions (hiding-zone based).
        // For a Medium game these are answered with the "-full" versions
        // instead. Station questions stay — the RTD game uses them (ADR 0006).
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
    ]),
    measuring: new Set<string>([
        "coastline", // landlocked: nearest coast is ~1000 mi outside the boundary (void, ADR 0003)
        "airport", // commercial airport: DEN is out of bounds (void, ADR 0003)
        "city", // "major city" is not an official question; no >=1M city in-bounds (ADR 0005)
        "highspeed-measure-shinkansen", // no high-speed rail in Colorado (void, ADR 0003)
        "mcdonalds", // not an official measuring question (show-only, ADR 0005)
        "seven11", // not an official measuring question (show-only, ADR 0005)
        // Large Game variation of the category questions (hiding-zone based).
        // For a Medium game these are answered with the "-full" versions
        // instead. rail-measure (Train Station) stays — the RTD game uses it.
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
    ]),
    tentacles: new Set<string>([
        // "15 Miles (Typically)" categories are the Large Game tentacle; we're
        // playing a Medium game, so only the "1 Mile (Typically)" categories
        // are offered (ADR 0006).
        "theme_park",
        "zoo",
        "aquarium",
    ]),
};

// Pure predicate: is this question type offered in the picker for this game?
export const isQuestionTypeAvailable = (
    category: QuestionCategory,
    type: string,
): boolean => !HIDDEN_QUESTION_TYPES[category].has(type);

// The shared introspect→filter→project pipeline for a schema union's UNGROUPED
// options. Returns the available [value, label] pairs, ready for a <Select>.
// `shapeField` is "type" for matching/measuring and "locationType" for
// tentacles — the field on the schema object that holds the literal union.
//
// The cards call this for their top-level options and a sibling grouping pass
// for their grouped options; the grouping/rendering (the NO_GROUP split and the
// Object.fromEntries/`groups` shape) stays in the card because it's view-shaped.
export const availableOptions = (
    schemaUnion: { options: any[] },
    shapeField: "type" | "locationType",
    category: QuestionCategory,
): [string, string][] =>
    schemaUnion.options
        .filter((x) => x.description === NO_GROUP)
        .flatMap((x) => determineUnionizedStrings(x.shape[shapeField]))
        .filter((x) => isQuestionTypeAvailable(category, (x._def as any).value))
        .map((x) => [(x._def as any).value, x.description] as [string, string]);
