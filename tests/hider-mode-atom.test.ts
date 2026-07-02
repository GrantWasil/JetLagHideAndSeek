import { describe, expect, it } from "vitest";

import { decodeHiderMode } from "@/lib/context";

describe("decodeHiderMode migration", () => {
    // A returning user from before the `confirmed` field existed has
    // `{latitude, longitude}` persisted. decode must treat that as Pending
    // (confirmed: false), not as invalid state.
    it("migrates a legacy {latitude, longitude} object to Pending", () => {
        const legacy = JSON.stringify({ latitude: 39.74, longitude: -104.98 });
        expect(decodeHiderMode(legacy)).toEqual({
            latitude: 39.74,
            longitude: -104.98,
            confirmed: false,
        });
    });

    it("preserves the false (disabled) sentinel", () => {
        expect(decodeHiderMode(JSON.stringify(false))).toBe(false);
    });

    it("round-trips a Confirmed location unchanged", () => {
        const confirmed = {
            latitude: 39.74,
            longitude: -104.98,
            confirmed: true,
        };
        expect(decodeHiderMode(JSON.stringify(confirmed))).toEqual(confirmed);
    });

    it("round-trips a Pending location unchanged", () => {
        const pending = {
            latitude: 0,
            longitude: 0,
            confirmed: false,
        };
        expect(decodeHiderMode(JSON.stringify(pending))).toEqual(pending);
    });

    it.each([
        ["malformed JSON", "not json {"],
        ["a number", "42"],
        ["a string", '"hider"'],
        ["an object missing latitude", '{"longitude":1,"confirmed":false}'],
        ["an object missing longitude", '{"latitude":1,"confirmed":false}'],
        ["null", "null"],
    ])("falls back to disabled (false) for %s", (_label, raw) => {
        expect(decodeHiderMode(raw)).toBe(false);
    });

    it("ignores a non-boolean confirmed and treats it as Pending", () => {
        const bad = JSON.stringify({
            latitude: 1,
            longitude: 2,
            confirmed: "yes",
        });
        expect(decodeHiderMode(bad)).toEqual({
            latitude: 1,
            longitude: 2,
            confirmed: false,
        });
    });
});
