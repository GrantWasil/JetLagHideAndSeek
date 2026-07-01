import * as turf from "@turf/turf";
import { afterEach, describe, expect, it, vi } from "vitest";

// The play boundary's outer rings are emitted as a server-side (poly:"...")
// clause, but Overpass matches points inside holes too. The contract (ADR 0008)
// is that server-side outer-ring clipping PLUS a client-side contains()
// post-filter together give correct in/out behavior. findPlacesInZone and
// findTentacleLocations must drop points that fall inside a hole (or, as a
// defense-in-depth, outside the outer ring).
//
// These tests exercise the post-filter by mocking the network seam
// (getOverpassData) and the boundary atom (polyGeoJSON), feeding in a point
// inside a hole and asserting it is filtered out.

// A square boundary with a square hole: outer [0..10], hole [3..7].
const boundaryWithHole = turf.featureCollection([
    turf.polygon([
        [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
        ],
        [
            [3, 3],
            [7, 3],
            [7, 7],
            [3, 7],
            [3, 3],
        ],
    ]),
]);

// Mock the boundary atom so the boundary-with-hole is "active" for the query.
const polyGeoJSONAtom = { get: () => boundaryWithHole, set: vi.fn() };
vi.mock("@/lib/context", () => ({
    polyGeoJSON: polyGeoJSONAtom,
    mapGeoLocation: {
        get: () => ({ properties: { osm_id: 1, osm_type: "relation" } }),
    },
    additionalMapGeoLocations: { get: () => [] },
}));

// Stub toast.
vi.mock("react-toastify", () => ({
    toast: {
        error: vi.fn(),
        warning: vi.fn(),
        promise: (p: Promise<unknown>) => p,
    },
}));

// Mock the cache seam so getOverpassData resolves to our canned elements.
// getOverpassData calls cacheFetch -> returns a Response whose .json() yields
// { elements }. determineCache is used for the fallback cache.put, stubbed.
const elementsInHole = [
    // A museum INSIDE the hole — must be filtered out.
    {
        id: 1,
        type: "node",
        lon: 5,
        lat: 5,
        center: { lon: 5, lat: 5 },
        tags: { name: "Hole Museum", tourism: "museum" },
    },
    // A museum in the solid ring between outer and hole — must be kept.
    {
        id: 2,
        type: "node",
        lon: 1,
        lat: 1,
        center: { lon: 1, lat: 1 },
        tags: { name: "Ring Museum", tourism: "museum" },
    },
];
const cannedResponse = {
    ok: true,
    status: 200,
    clone() {
        return cannedResponse;
    },
    json: async () => ({ elements: elementsInHole }),
};
vi.mock("@/maps/api/cache", () => ({
    cacheFetch: async () => cannedResponse,
    determineCache: async () => ({ put: async () => undefined }),
}));

describe("findPlacesInZone boundary post-filter (P2)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("drops points inside a boundary hole and keeps points in the solid ring", async () => {
        const { findPlacesInZone } = await import("@/maps/api/overpass");

        const data = await findPlacesInZone(
            '["tourism"="museum"]',
            "Finding museums...",
            "nwr",
            "center",
        );

        const names = data.elements.map((e: any) => e.tags?.name);
        // The hole point is filtered out; the ring point survives.
        expect(names).not.toContain("Hole Museum");
        expect(names).toContain("Ring Museum");
    });
});
