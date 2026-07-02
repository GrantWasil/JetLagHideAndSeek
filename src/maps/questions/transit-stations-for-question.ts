import {
    customStations,
    displayHidingZonesOptions,
    includeDefaultStations,
    polyGeoJSON,
    useCustomStations,
} from "@/lib/context";
import type { StationPlace } from "@/maps/api";
import { materializeTransitStations } from "@/maps/questions/transit";
import { findTransitStationsAroundPoints } from "@/maps/questions/transit-overpass";

// The shared core of the transit-station ceremony in hiderifyMatching
// (same-train-line / same-first-letter-station / same-length-station) and
// hiderifyMeasuring (rail-measure). Both functions used to duplicate this
// exact block: build the two points, decide whether default stations are
// needed, fetch them via findTransitStationsAroundPoints, then materialize
// (merge + clip-to-boundary) the default + custom stations.
//
// The only thing the callers do differently is what they feed `stations` into
// afterward (resolveTransitMatchingQuestion vs resolveTransitMeasuringQuestion).
// This module owns the fetch+merge; the caller owns the resolution.
export const materializeStationsForQuestion = async (
    points: { lat: number; lng: number }[],
): Promise<StationPlace[]> => {
    const needsDefaultStations =
        !useCustomStations.get() || includeDefaultStations.get();
    const selection = displayHidingZonesOptions.get();
    const defaultStations =
        needsDefaultStations && selection.length > 0
            ? await findTransitStationsAroundPoints({ selection, points })
            : [];
    return materializeTransitStations({
        defaultStations,
        customStations: customStations.get(),
        useCustomStations: useCustomStations.get(),
        includeDefaultStations: includeDefaultStations.get(),
        playBoundary: polyGeoJSON.get(),
    });
};
