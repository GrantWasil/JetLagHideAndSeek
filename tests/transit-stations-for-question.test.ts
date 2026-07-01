import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StationPlace } from "@/maps/api";

// materializeStationsForQuestion depends on 5 atoms (@/lib/context) and on
// findTransitStationsAroundPoints (./transit-overpass). We mock both so the
// behavior under test — "when does it fetch defaults vs. not, and does it pass
// the right args through" — is driven by known inputs, not real network/atoms.
// This is the agreed seam (block F): the byte-for-byte block duplicated in
// hiderifyMatching (same-train-line) and hiderifyMeasuring (rail-measure).

const atomValues: Record<string, unknown> = {};
vi.mock("@/lib/context", () => ({
    useCustomStations: { get: () => atomValues.useCustomStations },
    includeDefaultStations: {
        get: () => atomValues.includeDefaultStations,
    },
    displayHidingZonesOptions: {
        get: () => atomValues.displayHidingZonesOptions,
    },
    customStations: { get: () => atomValues.customStations },
    polyGeoJSON: { get: () => atomValues.polyGeoJSON },
}));

const findTransitStationsAroundPoints = vi.fn();
vi.mock("@/maps/questions/transit-overpass", () => ({
    findTransitStationsAroundPoints: (...a: unknown[]) =>
        findTransitStationsAroundPoints(...a),
}));

// Import AFTER mocks are registered.
const { materializeStationsForQuestion } = await import(
    "@/maps/questions/transit-stations-for-question"
);

// Known-good literals (independent source of truth) for the station shapes.
const aStation = (id: string, lat: number, lng: number): StationPlace => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: { id, name: id },
});

const POINTS = [
    { lat: 39.74, lng: -105.0 },
    { lat: 39.75, lng: -104.99 },
];

describe("materializeStationsForQuestion", () => {
    beforeEach(() => {
        findTransitStationsAroundPoints.mockReset();
        // Reset atoms to sane defaults before each test.
        atomValues.useCustomStations = false;
        atomValues.includeDefaultStations = true;
        atomValues.displayHidingZonesOptions = ["[railway=station]"];
        atomValues.customStations = [];
        atomValues.polyGeoJSON = null;
    });

    it("fetches default stations when defaults are wanted and a selection exists", async () => {
        const fetched = [aStation("union", 39.753, -104.999)];
        findTransitStationsAroundPoints.mockResolvedValue(fetched);

        const stations = await materializeStationsForQuestion(POINTS);

        expect(findTransitStationsAroundPoints).toHaveBeenCalledTimes(1);
        // The selection and points are passed straight through.
        const arg = findTransitStationsAroundPoints.mock.calls[0][0];
        expect(arg.selection).toEqual(["[railway=station]"]);
        expect(arg.points).toEqual(POINTS);
        // The fetched station survives into the result.
        expect(stations.some((s) => s.properties.id === "union")).toBe(true);
    });

    it("skips the default-station fetch when no transit selection is configured", async () => {
        atomValues.displayHidingZonesOptions = [];

        const stations = await materializeStationsForQuestion(POINTS);

        expect(findTransitStationsAroundPoints).not.toHaveBeenCalled();
        // With no defaults and no custom stations, the result is empty.
        expect(stations).toEqual([]);
    });

    it("skips the default-station fetch when using custom stations and not including defaults", async () => {
        atomValues.useCustomStations = true;
        atomValues.includeDefaultStations = false;
        atomValues.customStations = [
            { id: "custom-1", lat: 39.8, lng: -105.1, name: "Custom" },
        ];

        const stations = await materializeStationsForQuestion(POINTS);

        expect(findTransitStationsAroundPoints).not.toHaveBeenCalled();
        // The custom station is materialized into the result.
        expect(stations.some((s) => s.properties.id === "custom-1")).toBe(true);
    });
});
