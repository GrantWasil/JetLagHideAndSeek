import * as turf from "@turf/turf";
import { expect, test } from "vitest";

import { DEFAULT_PLAY_BOUNDARY } from "@/lib/defaultPlayBoundary";
import { bboxCapMiles, clipQuery, contains } from "@/maps/play-boundary";

// A square play boundary with a square hole in the middle. Used to prove the
// operations honor holes (the previous inline `.flat()` join did not — it
// merged outer ring + hole into one self-intersecting point list).
const boundaryWithHole = turf.featureCollection([
    turf.polygon([
        [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
        ], // outer
        [
            [3, 3],
            [7, 3],
            [7, 7],
            [3, 7],
            [3, 3],
        ], // hole
    ]),
]);

// ---------- clipQuery ----------

test('clipQuery emits an Overpass (poly:"...") clause', () => {
    const boundary = turf.featureCollection([
        turf.polygon([
            [
                [-105, 39],
                [-105, 40],
                [-104, 40],
                [-104, 39],
                [-105, 39],
            ],
        ]),
    ]);
    const clause = clipQuery(boundary);
    expect(clause.startsWith(`(poly:"`)).toBe(true);
    expect(clause.endsWith(`")`)).toBe(true);
    // Overpass wants "lat lng" pairs (lat first); GeoJSON is [lng, lat].
    expect(clause).toContain("39 -105");
});

test("clipQuery emits the outer ring only, NOT the hole — fixes the .flat() bug", () => {
    const clause = clipQuery(boundaryWithHole);
    // The outer ring's corners (0 and 10) must appear.
    expect(clause).toContain("0 0");
    expect(clause).toContain("10 10");
    // The hole's corners (3 and 7) must NOT appear — emitting them would create
    // a self-intersecting Overpass polygon (the previous inline transform).
    expect(clause).not.toContain("3 3");
    expect(clause).not.toContain("7 7");
});

test("clipQuery handles a MultiPolygon by emitting each outer ring", () => {
    const multi = turf.featureCollection([
        turf.multiPolygon([
            [
                [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 1],
                    [0, 0],
                ],
            ],
            [
                [
                    [10, 10],
                    [11, 10],
                    [11, 11],
                    [10, 11],
                    [10, 10],
                ],
            ],
        ]),
    ]);
    const clause = clipQuery(multi);
    expect(clause).toContain("0 0");
    expect(clause).toContain("10 10");
});

test("clipQuery emits all vertices of the real Denver default boundary", () => {
    // The fork's actual boundary is a single 76-vertex closed ring (no holes).
    const clause = clipQuery(DEFAULT_PLAY_BOUNDARY);
    // First and last coordinate of the ring, in "lat lng" form.
    expect(clause).toContain("39.6853795 -104.7283707");
    // Every outer-ring vertex should round-trip — count approximates by
    // checking the clause is non-trivially long (76 coords * ~22 chars).
    expect(clause.length).toBeGreaterThan(1000);
});

// ---------- contains ----------

test("contains is true for a point inside the boundary", () => {
    const inside = turf.point([5, 5]);
    // A solid square (no hole): center is inside.
    const solid = turf.featureCollection([
        turf.polygon([
            [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
            ],
        ]),
    ]);
    expect(contains(solid, inside)).toBe(true);
});

test("contains honors holes — a point in the hole is NOT contained", () => {
    const inTheHole = turf.point([5, 5]);
    expect(contains(boundaryWithHole, inTheHole)).toBe(false);
});

test("contains is true for a point in the ring between outer edge and hole", () => {
    const inTheRing = turf.point([1, 1]); // between outer (0..10) and hole (3..7)
    expect(contains(boundaryWithHole, inTheRing)).toBe(true);
});

test("contains is false for a point outside the boundary", () => {
    const outside = turf.point([50, 50]);
    expect(contains(boundaryWithHole, outside)).toBe(false);
});

test("contains is true for a point inside the real Denver default boundary", () => {
    // Downtown Denver (~Union Station) is well inside the default boundary.
    const downtown = turf.point([-105.0, 39.75]);
    expect(contains(DEFAULT_PLAY_BOUNDARY, downtown)).toBe(true);
});

test("contains is false for a point outside the real Denver default boundary", () => {
    // Colorado Springs is well south of the boundary.
    const springs = turf.point([-104.82, 38.83]);
    expect(contains(DEFAULT_PLAY_BOUNDARY, springs)).toBe(false);
});

// ---------- bboxCapMiles ----------

test("bboxCapMiles returns the bbox diagonal in miles plus a 30-mile margin", () => {
    // A ~1 degree square near the equator for predictable geometry.
    const boundary = turf.featureCollection([
        turf.polygon([
            [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
            ],
        ]),
    ]);
    const cap = bboxCapMiles(boundary);
    const diagonal = turf.distance([0, 0], [1, 1], { units: "miles" });
    expect(cap).toBeCloseTo(Math.ceil(diagonal) + 30, 0);
});

test("bboxCapMiles caps the expanding search sensibly for the Denver boundary", () => {
    // The Denver metro boundary is small (~42-mile bbox diagonal), so the cap
    // is well under the 300-mile default used when no boundary is set. This is
    // the whole point of capping nearestToQuestion to the boundary: a metro
    // game gives up the search much sooner than a region-scale game would.
    const cap = bboxCapMiles(DEFAULT_PLAY_BOUNDARY);
    expect(cap).toBeGreaterThan(40); // diagonal alone
    expect(cap).toBeLessThan(120); // diagonal + 30 margin, metro-sized
});
