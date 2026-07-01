import { describe, expect, it } from "vitest";

import {
    availableOptions,
    HIDDEN_QUESTION_TYPES,
    isQuestionTypeAvailable,
} from "@/maps/question-availability";
import {
    matchingQuestionSchema,
    measuringQuestionSchema,
    tentacleQuestionSchema,
} from "@/maps/schema";

// QuestionAvailability is the single home for "is this question type offered
// for this game?" — previously three hand-maintained Set<string>s in three card
// components (matching.tsx, measuring.tsx, tentacles.tsx), each re-implementing
// the same introspect→filter→project pipeline. The data + the predicate + the
// pipeline now live here; the cards keep only the grouping/rendering.

describe("isQuestionTypeAvailable", () => {
    it("returns false for a void matching type (airport — DEN out of bounds, ADR 0003)", () => {
        expect(isQuestionTypeAvailable("matching", "airport")).toBe(false);
    });

    it("returns false for a non-official matching type (major-city, ADR 0005)", () => {
        expect(isQuestionTypeAvailable("matching", "major-city")).toBe(false);
    });

    it("returns false for a Large-Game-only matching type (museum, ADR 0006)", () => {
        // The hiding-zone-based variant; the -full version stays available.
        expect(isQuestionTypeAvailable("matching", "museum")).toBe(false);
    });

    it("returns true for a Medium-game matching type (museum-full)", () => {
        expect(isQuestionTypeAvailable("matching", "museum-full")).toBe(true);
    });

    it("returns true for a station matching type the RTD game uses (same-train-line)", () => {
        expect(isQuestionTypeAvailable("matching", "same-train-line")).toBe(
            true,
        );
    });

    it("returns false for void measuring types (coastline, airport, high-speed rail)", () => {
        expect(isQuestionTypeAvailable("measuring", "coastline")).toBe(false);
        expect(isQuestionTypeAvailable("measuring", "airport")).toBe(false);
        expect(
            isQuestionTypeAvailable(
                "measuring",
                "highspeed-measure-shinkansen",
            ),
        ).toBe(false);
    });

    it("returns true for a kept measuring type (rail-measure — RTD uses it)", () => {
        expect(isQuestionTypeAvailable("measuring", "rail-measure")).toBe(true);
    });

    it("returns false for the Large-Game tentacle types (15-mile: theme_park/zoo/aquarium)", () => {
        expect(isQuestionTypeAvailable("tentacles", "theme_park")).toBe(false);
        expect(isQuestionTypeAvailable("tentacles", "zoo")).toBe(false);
        expect(isQuestionTypeAvailable("tentacles", "aquarium")).toBe(false);
    });

    it("returns true for a Medium-game tentacle type (museum — 1-mile group)", () => {
        expect(isQuestionTypeAvailable("tentacles", "museum")).toBe(true);
    });
});

describe("HIDDEN_QUESTION_TYPES table", () => {
    it("has exactly the three question categories", () => {
        expect(Object.keys(HIDDEN_QUESTION_TYPES).sort()).toEqual([
            "matching",
            "measuring",
            "tentacles",
        ]);
    });

    it("hides the 11 Large-Game category types in BOTH matching and measuring (ADR 0006)", () => {
        // The same 11 as HOME_GAME_TYPES — a category hidden for one question
        // kind is hidden for the other. Pinning the overlap guards drift.
        const largeGame = [
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
        ];
        for (const type of largeGame) {
            expect(HIDDEN_QUESTION_TYPES.matching.has(type)).toBe(true);
            expect(HIDDEN_QUESTION_TYPES.measuring.has(type)).toBe(true);
        }
    });
});

describe("availableOptions", () => {
    it("returns the ungrouped, available matching options as [value, label] pairs", () => {
        const opts = availableOptions(
            matchingQuestionSchema,
            "type",
            "matching",
        );

        // Every entry is a [value, label] pair.
        for (const [value, label] of opts) {
            expect(typeof value).toBe("string");
            expect(typeof label).toBe("string");
        }

        // A void type is absent.
        const values = opts.map(([v]) => v);
        expect(values).not.toContain("airport");
        expect(values).not.toContain("major-city");
        // A Medium-game type is present.
        expect(values).toContain("museum-full");
        expect(values).toContain("peak-full");
    });

    it("excludes hidden types from the measuring options", () => {
        const values = availableOptions(
            measuringQuestionSchema,
            "type",
            "measuring",
        ).map(([v]) => v);

        expect(values).not.toContain("coastline");
        expect(values).not.toContain("highspeed-measure-shinkansen");
        expect(values).toContain("peak-full");
        // rail-measure lives in the "Hiding Zone Mode" GROUP, so it is NOT in
        // the ungrouped output — the card's grouping pass surfaces it (and
        // applies the same availability filter there). Just confirm it isn't
        // wrongly dropped into the ungrouped list.
        expect(values).not.toContain("rail-measure");
    });

    it("excludes the 15-mile tentacle types from the ungrouped options", () => {
        const values = availableOptions(
            tentacleQuestionSchema,
            "locationType",
            "tentacles",
        ).map(([v]) => v);

        // The 15-mile group is hidden; the 1-mile group (museum etc.) lives in
        // a GROUP, so only `custom` appears ungrouped here. The hidden types
        // must be absent regardless of grouping.
        expect(values).not.toContain("theme_park");
        expect(values).not.toContain("zoo");
        expect(values).not.toContain("aquarium");
        // museum is available but grouped ("1 Mile (Typically)"), so it surfaces
        // via the card's grouping pass, not the ungrouped pipeline.
        expect(values).not.toContain("museum");
    });
});
