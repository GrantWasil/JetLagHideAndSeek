import { beforeEach, describe, expect, it, vi } from "vitest";

import type { APILocations } from "@/maps/schema";

// findCategoryPlaces depends on findPlacesInZone (from @/maps/api). We mock the
// whole barrel and stub findPlacesInZone per-test so the three behaviors under
// test — success, runtime-error, too-many — are driven by known inputs. This is
// the agreed seam (see the twin-collapse work); we never reach inside the
// function under test.
const findPlacesInZone = vi.fn();
vi.mock("@/maps/api", () => ({
    findPlacesInZone: (...args: unknown[]) => findPlacesInZone(...args),
    // The function under test imports these to build the Overpass filter; their
    // real values are exercised by the import-shadow in the module, so the
    // function builds the correct filter string regardless.
    LOCATION_FIRST_TAG: {
        museum: "tourism",
        peak: "natural",
    },
    LOCATION_EXTRA_FILTER: {},
    prettifyLocation: (l: string) => l,
}));

// Import AFTER the mock is registered so the module sees the stubbed barrel.
const { findCategoryPlaces, findRawPlaces } = await import(
    "@/maps/questions/category-places"
);

// A known-good Overpass element: a museum at the Denver Museum of Nature &
// Science. Values are literals (the independent source of truth), not derived.
const museumElement = (id: number, lon: number, lat: number) => ({
    id,
    type: "node",
    lon,
    lat,
    center: { lon, lat },
    tags: { name: `museum-${id}`, tourism: "museum" },
});

describe("findCategoryPlaces", () => {
    beforeEach(() => findPlacesInZone.mockReset());

    it("returns the in-bounds places as GeoJSON Points on success", async () => {
        findPlacesInZone.mockResolvedValue({
            elements: [
                museumElement(1, -104.9462, 39.7482),
                museumElement(2, -104.99, 39.75),
            ],
        });

        const result = await findCategoryPlaces("museum" as APILocations);

        // The success branch: a points array of the right shape.
        expect("points" in result).toBe(true);
        if ("points" in result) {
            expect(result.points).toHaveLength(2);
            expect(result.points[0].geometry.type).toBe("Point");
            expect(result.points[0].geometry.coordinates).toEqual([
                -104.9462, 39.7482,
            ]);
        }
    });

    it('returns { error: "runtime-error" } when Overpass reports a remark error', async () => {
        findPlacesInZone.mockResolvedValue({
            elements: [],
            remark: "runtime error: query timed out",
        });

        const result = await findCategoryPlaces("museum" as APILocations);

        expect(result).toEqual({ error: "runtime-error" });
    });

    it('returns { error: "too-many", count } when the result hits the 1000 guard', async () => {
        findPlacesInZone.mockResolvedValue({
            elements: Array.from({ length: 1000 }, (_, i) =>
                museumElement(i, -105, 39.7),
            ),
        });

        const result = await findCategoryPlaces("museum" as APILocations);

        expect(result).toEqual({ error: "too-many", count: 1000 });
    });

    it("queries Overpass with the location's tag filter (defense against silent filter drift)", async () => {
        findPlacesInZone.mockResolvedValue({ elements: [] });

        await findCategoryPlaces("museum" as APILocations);

        // The first positional arg is the Overpass filter string. For a museum
        // it must key on tourism=museum. This is the value the real
        // LOCATION_FIRST_TAG would produce — an independent literal here.
        expect(findPlacesInZone).toHaveBeenCalledTimes(1);
        const filterArg = findPlacesInZone.mock.calls[0][0];
        expect(filterArg).toContain("[tourism=museum]");
    });
});

describe("findRawPlaces", () => {
    beforeEach(() => findPlacesInZone.mockReset());

    it("projects Overpass elements to GeoJSON Points using the given filter, with no guards", async () => {
        // 2 elements + a remark error + >1000 elements would ALL just project,
        // because airport/city are void-for-this-fork questions with no guard.
        findPlacesInZone.mockResolvedValue({
            elements: [
                museumElement(1, -104.67, 39.86), // Buckley SFB area
                museumElement(2, -104.85, 39.57), // Centennial area
            ],
            // A remark is present but must NOT short-circuit (no guard here).
            remark: "runtime error: something",
        });

        const points = await findRawPlaces(
            '["aeroway"="aerodrome"]["iata"]',
            "Finding airports...",
        );

        expect(points).toHaveLength(2);
        expect(points[0].geometry.type).toBe("Point");
        expect(points[0].geometry.coordinates).toEqual([-104.67, 39.86]);
    });

    it("passes the filter and loading text straight through to findPlacesInZone", async () => {
        findPlacesInZone.mockResolvedValue({ elements: [] });

        await findRawPlaces("[place=city]", "Finding cities...");

        expect(findPlacesInZone).toHaveBeenCalledTimes(1);
        expect(findPlacesInZone.mock.calls[0][0]).toBe("[place=city]");
        expect(findPlacesInZone.mock.calls[0][1]).toBe("Finding cities...");
    });
});
