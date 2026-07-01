import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
    Position,
} from "geojson";

// Deep module owning the Play Boundary's geometry — the fork's most load-bearing
// domain concept (see CONTEXT.md "Play Boundary": any feature outside it is
// treated as if it does not exist). Before this module, that single idea had
// five representations: a clean-but-unused Overpass clause builder, the same
// transform inlined three times in findPlacesInZone, a bbox cap in
// nearestToQuestion, a post-fetch point-in-polygon filter in transit.ts, and a
// value inside the matching/measuring memo cache keys. This is the one home.
//
// Design (see ADR 0008): value-oriented operations, not a stateful facade. The
// atom stays in lib/context.ts (it's session state); callers read it once and
// hand the value to an operation. The atom's `null` is the "no boundary" signal
// — callers own their own fallback (e.g. `b ? clipQuery(b) : ""`).
//
// NOTE: this fork's default boundary (defaultPlayBoundary.ts) is a single
// Polygon with no holes, so all three operations are straightforward for it.
// clipQuery is nonetheless ring-aware (handles holes and MultiPolygons) so an
// imported or hand-drawn boundary with holes clips correctly — a latent bug in
// the previous inline `.flat()` join, which merged outer ring + holes into one
// self-intersecting point list.

export type PlayBoundary = FeatureCollection<Polygon | MultiPolygon>;

// A `(poly:"lat lng lat lng …")` Overpass filter clause for the boundary's
// outer rings, ANDed onto a query's element filters so Overpass excludes
// out-of-bounds features server-side. Holes are intentionally NOT emitted:
// Overpass `poly` matches a closed ring, not a polygon-with-holes, so emitting
// hole rings would create a self-intersecting shape (the previous `.flat()`
// bug). Server-side exclusion by outer ring + the client-side `contains`
// post-filter together give correct in/out behavior.
export const clipQuery = (boundary: PlayBoundary): string => {
    const rings: Position[][] = [];
    for (const feature of boundary.features) {
        const geom = feature.geometry;
        if (geom.type === "Polygon") {
            rings.push(geom.coordinates[0]); // outer ring only
        } else if (geom.type === "MultiPolygon") {
            for (const polygon of geom.coordinates) rings.push(polygon[0]);
        }
    }
    const joined = rings
        .map((ring) => ring.map(([lng, lat]) => `${lat} ${lng}`).join(" "))
        .join(" ");
    return `(poly:"${joined}")`;
};

// True if the point lies inside any of the boundary's polygons (holes honored
// via turf.booleanPointInPolygon). Used as a client-side post-filter, e.g. for
// custom transit stations that bypassed any server-side clip.
export const contains = (
    boundary: PlayBoundary,
    point: Feature<Point>,
): boolean =>
    boundary.features.some((feature) =>
        turf.booleanPointInPolygon(point, feature),
    );

// The maximum search radius (miles) `nearestToQuestion` should expand to before
// giving up: the boundary's bbox diagonal plus a margin. Capped so a feature
// type with no in-bounds instance cannot loop forever.
export const bboxCapMiles = (boundary: PlayBoundary): number => {
    const [minX, minY, maxX, maxY] = turf.bbox(boundary);
    return (
        Math.ceil(
            turf.distance([minX, minY], [maxX, maxY], { units: "miles" }),
        ) + 30
    );
};
