import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    hiderMode,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
} from "@/lib/context";
import {
    fetchDenverMunicipalities,
    findAdminBoundary,
    findPlacesInZone,
    nearestToQuestion,
    prettifyLocation,
} from "@/maps/api";
import { holedMask, modifyMapData, safeUnion } from "@/maps/geo-utils";
import { geoSpatialVoronoi } from "@/maps/geo-utils";
import {
    elementToPoint,
    findCategoryPlaces,
    findRawPlaces,
} from "@/maps/questions/category-places";
import { isHomeGameType } from "@/maps/questions/home-game-types";
import { resolveTransitMatchingQuestion } from "@/maps/questions/transit";
import { overpassTransitLineMembershipResolver } from "@/maps/questions/transit-overpass";
import { materializeStationsForQuestion } from "@/maps/questions/transit-stations-for-question";
import type {
    APILocations,
    HomeGameMatchingQuestions,
    MatchingQuestion,
} from "@/maps/schema";

export const findMatchingPlaces = async (question: MatchingQuestion) => {
    switch (question.type) {
        case "airport": {
            // Dedup on the raw IATA tag BEFORE projecting (two elements may
            // share an IATA code); projection itself is the shared
            // elementToPoint so it can't drift from the city/*-full paths.
            return _.uniqBy(
                (
                    await findPlacesInZone(
                        '["aeroway"="aerodrome"]["iata"]', // Only commercial airports have IATA codes,
                        "Finding airports...",
                    )
                ).elements,
                (feature: any) => feature.tags.iata,
            ).map(elementToPoint);
        }
        case "major-city": {
            return findRawPlaces(
                '[place=city]["population"~"^[1-9]+[0-9]{6}$"]', // The regex is faster than (if:number(t["population"])>1000000)
                "Finding cities...",
            );
        }
        case "custom-points": {
            return question.geo!;
        }
        case "aquarium-full":
        case "zoo-full":
        case "theme_park-full":
        case "peak-full":
        case "museum-full":
        case "hospital-full":
        case "cinema-full":
        case "library-full":
        case "golf_course-full":
        case "consulate-full":
        case "park-full": {
            const location = question.type.split("-full")[0] as APILocations;
            const result = await findCategoryPlaces(location);

            // The fetch+guard+project lives in findCategoryPlaces; the toast
            // (a UI side effect) stays here so the seam stays side-effect-free.
            if ("error" in result) {
                toast.error(
                    result.error === "too-many"
                        ? `Too many ${prettifyLocation(
                              location,
                              true,
                          ).toLowerCase()} found (${result.count}). Please enable hiding zone mode and switch to the Large Game variation of this question.`
                        : `Error finding ${prettifyLocation(
                              location,
                              true,
                          ).toLowerCase()}. Please enable hiding zone mode and switch to the Large Game variation of this question.`,
                );
                return [];
            }

            return result.points;
        }
    }
};

export const determineMatchingBoundary = _.memoize(
    async (question: MatchingQuestion) => {
        let boundary;

        switch (question.type) {
            case "aquarium":
            case "zoo":
            case "theme_park":
            case "peak":
            case "museum":
            case "hospital":
            case "cinema":
            case "library":
            case "golf_course":
            case "consulate":
            case "park":
            case "same-first-letter-station":
            case "same-length-station":
            case "same-train-line": {
                return false;
            }
            case "custom-zone": {
                boundary = question.geo;
                break;
            }
            case "zone": {
                if (question.cat.adminLevel === "denver-municipalities") {
                    // Bundled Denver municipalities: the boundary is the
                    // municipality polygon that contains the seeker's marker.
                    const point = turf.point([question.lng, question.lat]);
                    boundary = (
                        await fetchDenverMunicipalities()
                    ).features.find((feature) =>
                        turf.booleanPointInPolygon(point, feature),
                    );
                    // Marker isn't inside any municipality — nothing to narrow.
                    if (!boundary) return false;
                    break;
                }

                boundary = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    question.cat.adminLevel,
                );

                if (!boundary) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }
                break;
            }
            case "letter-zone": {
                if (question.cat.adminLevel === "denver-municipalities") {
                    // Bundled Denver municipalities: union every municipality
                    // whose name starts with the same letter as the seeker's.
                    const collection = await fetchDenverMunicipalities();
                    const point = turf.point([question.lng, question.lat]);
                    const containingName = collection.features.find((feature) =>
                        turf.booleanPointInPolygon(point, feature),
                    )?.properties?.name;

                    if (!containingName) return false;

                    const letter = containingName[0].toUpperCase();
                    boundary = safeUnion(
                        turf.featureCollection(
                            collection.features.filter(
                                (feature) =>
                                    feature.properties?.name?.[0]?.toUpperCase() ===
                                    letter,
                            ),
                        ),
                    );
                    break;
                }

                const zone = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    question.cat.adminLevel,
                );

                if (!zone) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }

                let englishName = zone.properties?.["name:en"];

                if (!englishName) {
                    const name = zone.properties?.name;

                    if (/^[a-zA-Z]$/.test(name[0])) {
                        englishName = name;
                    } else {
                        toast.error("No English name found for this zone");
                        throw new Error("No English name");
                    }
                }

                const letter = englishName[0].toUpperCase();

                boundary = turf.featureCollection(
                    osmtogeojson(
                        await findPlacesInZone(
                            `[admin_level=${question.cat.adminLevel}]["name:en"~"^${letter}.+"]`, // Regex is faster than filtering afterward
                            `Finding zones that start with the same letter (${letter})...`,
                            "relation",
                            "geom",
                            [
                                `[admin_level=${question.cat.adminLevel}]["name"~"^${letter}.+"]`,
                            ], // Regex is faster than filtering afterward
                        ),
                    ).features.filter(
                        (x): x is Feature<Polygon | MultiPolygon> =>
                            x.geometry &&
                            (x.geometry.type === "Polygon" ||
                                x.geometry.type === "MultiPolygon"),
                    ),
                );

                // It's either simplify or crash. Technically this could be bad if someone's hiding zone was inside multiple zones, but that's unlikely.
                boundary = safeUnion(
                    turf.simplify(boundary, {
                        tolerance: 0.001,
                        highQuality: true,
                        mutate: true,
                    }),
                );

                break;
            }
            case "airport":
            case "major-city":
            case "aquarium-full":
            case "zoo-full":
            case "theme_park-full":
            case "peak-full":
            case "museum-full":
            case "hospital-full":
            case "cinema-full":
            case "library-full":
            case "golf_course-full":
            case "consulate-full":
            case "park-full":
            case "custom-points": {
                const data = await findMatchingPlaces(question);

                const voronoi = geoSpatialVoronoi(data);
                const point = turf.point([question.lng, question.lat]);

                for (const feature of voronoi.features) {
                    if (turf.booleanPointInPolygon(point, feature)) {
                        boundary = feature;
                        break;
                    }
                }
                break;
            }
        }

        return boundary;
    },
    (question: MatchingQuestion & { geo?: unknown; cat?: unknown }) =>
        JSON.stringify({
            type: question.type,
            lat: question.lat,
            lng: question.lng,
            cat: question.cat,
            geo: question.geo,
            entirety: polyGeoJSON.get()
                ? polyGeoJSON.get()
                : mapGeoLocation.get(),
        }),
);

export const adjustPerMatching = async (
    question: MatchingQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    const boundary = await determineMatchingBoundary(question);

    if (boundary === false) {
        return mapData;
    }

    return modifyMapData(mapData, boundary, question.same);
};

export const hiderifyMatching = async (question: MatchingQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    if (isHomeGameType(question.type)) {
        const questionNearest = await nearestToQuestion(
            question as HomeGameMatchingQuestions,
        );
        const hiderNearest = await nearestToQuestion({
            lat: $hiderMode.latitude,
            lng: $hiderMode.longitude,
            same: true,
            type: (question as HomeGameMatchingQuestions).type,
            drag: false,
            color: "black",
            collapsed: false,
            hidden: false,
        });

        if (!questionNearest || !hiderNearest) {
            // No in-bounds instance of this feature type: void for this game,
            // so there is nothing to compare. Leave the answer untouched.
            return question;
        }

        question.same =
            questionNearest.properties.name === hiderNearest.properties.name;

        return question;
    }

    if (
        question.type === "same-first-letter-station" ||
        question.type === "same-length-station" ||
        question.type === "same-train-line"
    ) {
        const points = [
            { lat: question.lat, lng: question.lng },
            { lat: $hiderMode.latitude, lng: $hiderMode.longitude },
        ];
        const stations = await materializeStationsForQuestion(points);
        const result = await resolveTransitMatchingQuestion({
            question,
            hiderLocation: {
                lat: $hiderMode.latitude,
                lng: $hiderMode.longitude,
            },
            stations,
            resolveLines: overpassTransitLineMembershipResolver,
        });

        if (result.status === "unsupported" && result.reason) {
            toast.warning(result.reason);
        }

        return result.question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    let feature = null;

    try {
        feature = holedMask((await adjustPerMatching(question, $mapGeoJSON))!);
    } catch {
        try {
            feature = await adjustPerMatching(question, {
                type: "FeatureCollection",
                features: [holedMask($mapGeoJSON)],
            });
        } catch {
            return question;
        }
    }

    if (feature === null || feature === undefined) return question;

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

    if (turf.booleanPointInPolygon(hiderPoint, feature)) {
        question.same = !question.same;
    }

    return question;
};

export const matchingPlanningPolygon = async (question: MatchingQuestion) => {
    try {
        const boundary = await determineMatchingBoundary(question);

        if (boundary === false) {
            return false;
        }

        return turf.polygonToLine(boundary);
    } catch {
        return false;
    }
};
