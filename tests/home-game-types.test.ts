import { describe, expect, it } from "vitest";

import {
    HOME_GAME_TYPES,
    isHomeGameType,
} from "@/maps/questions/home-game-types";

// The "Large Game variation" category types (ADR 0006) — the hiding-zone-based
// questions answered by nearestToQuestion, as opposed to the "-full"
// (Small+Medium Games) variants. This list was duplicated verbatim in
// matching.ts and measuring.ts; isHomeGameType gives it one home.

describe("isHomeGameType", () => {
    it("returns true for every Large Game variation category type", () => {
        // The canonical 11 — these are the exact type strings the twins'
        // hiderify* functions branch on (block E). Independent literal list.
        expect(isHomeGameType("aquarium")).toBe(true);
        expect(isHomeGameType("zoo")).toBe(true);
        expect(isHomeGameType("theme_park")).toBe(true);
        expect(isHomeGameType("peak")).toBe(true);
        expect(isHomeGameType("museum")).toBe(true);
        expect(isHomeGameType("hospital")).toBe(true);
        expect(isHomeGameType("cinema")).toBe(true);
        expect(isHomeGameType("library")).toBe(true);
        expect(isHomeGameType("golf_course")).toBe(true);
        expect(isHomeGameType("consulate")).toBe(true);
        expect(isHomeGameType("park")).toBe(true);
    });

    it("returns false for the -full (Small+Medium Games) variants", () => {
        // These are the Medium-game versions that bypass nearestToQuestion.
        expect(isHomeGameType("museum-full")).toBe(false);
        expect(isHomeGameType("peak-full")).toBe(false);
    });

    it("returns false for station/transit/zone/custom types", () => {
        // The hiderify* functions handle these in separate branches.
        expect(isHomeGameType("same-train-line")).toBe(false);
        expect(isHomeGameType("same-length-station")).toBe(false);
        expect(isHomeGameType("rail-measure")).toBe(false);
        expect(isHomeGameType("zone")).toBe(false);
        expect(isHomeGameType("custom-zone")).toBe(false);
        expect(isHomeGameType("mcdonalds")).toBe(false);
    });

    it("exports the canonical set so callers can iterate or count it", () => {
        // ADR 0006 references this exact set of 11; pinning the size guards
        // against silent drift if someone adds a category to one twin only.
        expect(HOME_GAME_TYPES).toHaveLength(11);
        expect(HOME_GAME_TYPES).toContain("consulate");
    });
});
