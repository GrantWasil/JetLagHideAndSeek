import { describe, expect, it } from "vitest";
import * as turf from "@turf/turf";

import {
    filterTransitStationCirclesForMatchingQuestion,
    materializeTransitStations,
    resolveTransitMatchingQuestion,
    transitMeasuringPreviewCircles,
    transitSelectionRequiresBoundedLookup,
    type TransitLineMembershipResolver,
} from "../src/maps/questions/transit";
import type { MatchingQuestion } from "../src/maps/schema";
import type { StationCircle, StationPlace } from "@/maps/api";

const station = (
    id: string,
    name: string,
    coordinates: [number, number],
): StationPlace => ({
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: { id, name },
});

const matchingQuestion = (
    overrides: Partial<MatchingQuestion>,
): MatchingQuestion =>
    ({
        type: "same-train-line",
        lat: 39.7,
        lng: -105,
        same: false,
        drag: false,
        color: "black",
        collapsed: false,
        hidden: false,
        ...overrides,
    }) as MatchingQuestion;

const stationCircle = (place: StationPlace): StationCircle =>
    turf.circle(place.geometry.coordinates, 0.5, {
        units: "miles",
        properties: place,
    }) as StationCircle;

describe("Transit question module", () => {
    it("materializes custom-only Transit stations without default stations", () => {
        const result = materializeTransitStations({
            defaultStations: [station("node/1", "Default Rail", [-105, 39.7])],
            customStations: [
                {
                    id: "custom-1",
                    name: "Manual Stop",
                    lat: 39.71,
                    lng: -105.01,
                },
            ],
            useCustomStations: true,
            includeDefaultStations: false,
        });

        expect(result.map((place) => place.properties.id)).toEqual([
            "custom-1",
        ]);
    });

    it("ignores Transit stations outside the Play Boundary", () => {
        const playBoundary = turf.polygon([
            [
                [-105.02, 39.69],
                [-104.98, 39.69],
                [-104.98, 39.72],
                [-105.02, 39.72],
                [-105.02, 39.69],
            ],
        ]);

        const result = materializeTransitStations({
            defaultStations: [
                station("node/inside", "Inside", [-105, 39.7]),
                station("node/outside", "Outside", [-105.3, 39.7]),
            ],
            customStations: [],
            useCustomStations: false,
            includeDefaultStations: false,
            playBoundary,
        });

        expect(result.map((place) => place.properties.id)).toEqual([
            "node/inside",
        ]);
    });

    it("treats bus-stop Transit selection as requiring bounded lookup", () => {
        expect(
            transitSelectionRequiresBoundedLookup(["[highway=bus_stop]"]),
        ).toBe(true);
        expect(
            transitSelectionRequiresBoundedLookup(["[railway=station]"]),
        ).toBe(false);
    });

    it("answers same Transit line from the nearest selected Transit stops", async () => {
        const stations = [
            station("node/1", "Oak", [-105, 39.7005]),
            station("node/2", "Pine", [-105.01, 39.7105]),
            station("node/3", "Far Rail", [-105.2, 39.9]),
        ];
        const lineMembership = new Map([
            ["node/1", ["RTD:15"]],
            ["node/2", ["RTD:15"]],
            ["node/3", ["RTD:A"]],
        ]);
        const resolveLines: TransitLineMembershipResolver = async (
            transitStation,
        ) => ({
            status: "supported",
            lineKeys: lineMembership.get(transitStation.properties.id) ?? [],
        });

        const result = await resolveTransitMatchingQuestion({
            question: matchingQuestion({
                type: "same-train-line",
                lat: 39.7,
                lng: -105,
            }),
            hiderLocation: { lat: 39.71, lng: -105.01 },
            stations,
            resolveLines,
        });

        expect(result.status).toBe("answered");
        expect(result.question.same).toBe(true);
    });

    it("filters hiding-zone station circles with the same Transit line rule", async () => {
        const stations = [
            station("node/1", "Oak", [-105, 39.7005]),
            station("node/2", "Pine", [-105.01, 39.7105]),
            station("node/3", "Cedar", [-105.02, 39.7205]),
        ];
        const lineMembership = new Map([
            ["node/1", ["RTD:15"]],
            ["node/2", ["RTD:15"]],
            ["node/3", ["RTD:16"]],
        ]);
        const resolveLines: TransitLineMembershipResolver = async (
            transitStation,
        ) => ({
            status: "supported",
            lineKeys: lineMembership.get(transitStation.properties.id) ?? [],
        });

        const filtered = await filterTransitStationCirclesForMatchingQuestion({
            question: matchingQuestion({
                type: "same-train-line",
                lat: 39.7,
                lng: -105,
                same: true,
            }),
            stationCircles: stations.map(stationCircle),
            resolveLines,
        });

        expect(filtered.status).toBe("answered");
        expect(
            filtered.stationCircles.map(
                (circle) => circle.properties.properties.id,
            ),
        ).toEqual(["node/1", "node/2"]);
    });

    it("builds Transit measuring preview circles from the shared station set", () => {
        const stations = [
            station("node/near", "Near", [-105, 39.7]),
            station("node/selected", "Selected", [-105.01, 39.7]),
            station("node/far", "Far", [-105.2, 39.7]),
        ];

        const circles = transitMeasuringPreviewCircles({
            question: {
                type: "rail-measure",
                lat: 39.71,
                lng: -105,
                hiderCloser: true,
                drag: false,
                color: "black",
                collapsed: false,
                hidden: false,
            },
            selectedStationCircle: stationCircle(stations[1]),
            stationCircles: stations.map(stationCircle),
            hidingRadius: 1,
            units: "miles",
        });

        expect(circles).toHaveLength(2);
    });
});
