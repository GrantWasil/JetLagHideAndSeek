import type { FeatureCollection, Polygon } from "geojson";
import { describe, expect, it } from "vitest";

import {
    decodePlayBoundary,
    isFeatureCollection,
} from "@/lib/context";
import { DEFAULT_PLAY_BOUNDARY } from "@/lib/defaultPlayBoundary";

// A valid boundary distinct from the default, used to prove a real boundary
// round-trips unchanged (the migration must not overwrite legitimate state).
const customBoundary: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {},
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [0, 0],
                        [0, 1],
                        [1, 1],
                        [1, 0],
                        [0, 0],
                    ],
                ],
            },
        },
    ],
};

describe("isFeatureCollection", () => {
    it("accepts a FeatureCollection with a features array", () => {
        expect(isFeatureCollection(customBoundary)).toBe(true);
    });

    it.each([
        ["null", null],
        ["a number", 42],
        ["a plain object", { foo: "bar" }],
        ["a Feature (not a collection)", { type: "Feature", geometry: null, properties: {} }],
        ["a collection missing features", { type: "FeatureCollection" }],
    ])("rejects %s", (_label, value) => {
        expect(isFeatureCollection(value)).toBe(false);
    });
});

describe("decodePlayBoundary migration", () => {
    // The bug this fork shipped to fix: a returning user has `polyGeoJSON: null`
    // persisted in localStorage from before the never-null change. decode must
    // normalize that to the default boundary, not let null leak into state.
    it("migrates a stale persisted null to DEFAULT_PLAY_BOUNDARY", () => {
        expect(decodePlayBoundary(JSON.stringify(null))).toEqual(
            DEFAULT_PLAY_BOUNDARY,
        );
    });

    it("falls back to DEFAULT_PLAY_BOUNDARY on malformed JSON", () => {
        expect(decodePlayBoundary("not json {")).toEqual(DEFAULT_PLAY_BOUNDARY);
    });

    it.each([
        ["null literal", "null"],
        ["a number", "42"],
        ["a non-FeatureCollection object", '{"foo":"bar"}'],
        ["a collection without a features array", '{"type":"FeatureCollection"}'],
    ])("falls back to DEFAULT_PLAY_BOUNDARY for %s", (_label, raw) => {
        expect(decodePlayBoundary(raw)).toEqual(DEFAULT_PLAY_BOUNDARY);
    });

    it("round-trips a valid boundary unchanged", () => {
        expect(decodePlayBoundary(JSON.stringify(customBoundary))).toEqual(
            customBoundary,
        );
    });

    it("round-trips the default boundary unchanged", () => {
        expect(decodePlayBoundary(JSON.stringify(DEFAULT_PLAY_BOUNDARY))).toEqual(
            DEFAULT_PLAY_BOUNDARY,
        );
    });
});
