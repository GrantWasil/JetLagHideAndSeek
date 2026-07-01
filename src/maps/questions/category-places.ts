import * as turf from "@turf/turf";
import type { Feature, Point } from "geojson";

import {
    findPlacesInZone,
    LOCATION_EXTRA_FILTER,
    LOCATION_FIRST_TAG,
    prettifyLocation,
} from "@/maps/api";
import type { APILocations } from "@/maps/schema";

// The shared core of the matching/measuring `*-full` question lookups.
//
// Both twins (src/maps/questions/matching.ts and measuring.ts) used to
// duplicate the same block: build the Overpass filter for a category, fetch,
// guard the runtime-error remark, guard the >=1000-results cap, and project
// the elements to GeoJSON Points. The ONLY thing that differed was how the
// caller shaped the result (matching wants the points; measuring wraps them in
// a combine().features[0]). This module owns the shared fetch+guard+project;
// the caller owns the toast (side effect) and the result shaping.
//
// The function detects and reports the two failure modes as a discriminated
// union; it does NOT toast — that keeps it a clean, side-effect-free seam.

export type CategoryPlaceResult =
    | { points: Feature<Point>[] }
    | { error: "runtime-error" }
    | { error: "too-many"; count: number };

// Project an Overpass element (node/way with optional `center`) to a GeoJSON
// Point. This is the shared atom of BOTH the guarded (*-full) and unguarded
// (airport/city) category lookups — factored out so the projection can't drift
// between the two callers (matching.ts and measuring.ts) as it did before.
// Exported because the airport case dedups on the raw `tags.iata` *before*
// projecting, so it needs the projection as a separate step.
export const elementToPoint = (x: any): Feature<Point> =>
    turf.point([
        x.center ? x.center.lon : x.lon,
        x.center ? x.center.lat : x.lat,
    ]);

export const findCategoryPlaces = async (
    location: APILocations,
): Promise<CategoryPlaceResult> => {
    const data = await findPlacesInZone(
        `[${LOCATION_FIRST_TAG[location]}=${location}]${LOCATION_EXTRA_FILTER[location] ?? ""}`,
        `Finding ${prettifyLocation(location, true).toLowerCase()}...`,
        "nwr",
        "center",
        [],
        60,
    );

    if (data.remark && data.remark.startsWith("runtime error")) {
        return { error: "runtime-error" };
    }

    if (data.elements.length >= 1000) {
        return { error: "too-many", count: data.elements.length };
    }

    return { points: data.elements.map(elementToPoint) };
};

// Fetch + project for a raw Overpass filter, with NO guards. Used by the
// airport/city cases, which are void-for-this-fork questions (ADR 0003) and
// have neither the >=1000 cap nor the runtime-error remark check. Airport's
// uniqBy(iata) dedup stays in the caller (it needs the tag, not the point).
export const findRawPlaces = async (
    filter: string,
    loadingText: string,
): Promise<Feature<Point>[]> => {
    const { elements } = await findPlacesInZone(filter, loadingText);
    return elements.map(elementToPoint);
};
