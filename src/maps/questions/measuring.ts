import * as turf from "@turf/turf";
import type { Feature, MultiPolygon } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    hiderMode,
    mapGeoJSON,
    polyGeoJSON,
} from "@/lib/context";
import {
    fetchCoastline,
    findPlacesInZone,
    findPlacesSpecificInZone,
    nearestToQuestion,
    prettifyLocation,
    QuestionSpecificLocation,
} from "@/maps/api";
import {
    arcBufferToPoint,
    connectToSeparateLines,
    groupObjects,
    holedMask,
    modifyMapData,
} from "@/maps/geo-utils";
import {
    elementToPoint,
    findCategoryPlaces,
    findRawPlaces,
} from "@/maps/questions/category-places";
import { isHomeGameType } from "@/maps/questions/home-game-types";
import { materializeStationsForQuestion } from "@/maps/questions/transit-stations-for-question";
import type {
    APILocations,
    HomeGameMeasuringQuestions,
    MeasuringQuestion,
} from "@/maps/schema";

import { resolveTransitMeasuringQuestion } from "./transit";

const highSpeedBase = _.memoize(
    (features: Feature[]) => {
        const grouped = groupObjects(features);

        const neighbored = grouped
            .map((group) => {
                return turf.multiLineString(
                    connectToSeparateLines(
                        group
                            .filter((x) => turf.getType(x) === "LineString")
                            .map((x) => x.geometry.coordinates),
                    ),
                );
            })
            .filter((x) => x.geometry.coordinates.length > 0);

        return turf.combine(
            turf.buffer(
                turf.simplify(turf.featureCollection(neighbored), {
                    tolerance: 0.001,
                }),
                0.001,
            )!,
        ).features[0];
    },
    (features) => `${JSON.stringify(features.map((x) => x.geometry))}`,
);

const bboxExtension = (
    bBox: [number, number, number, number],
    distance: number,
): [number, number, number, number] => {
    const buffered = turf.bbox(
        turf.buffer(turf.bboxPolygon(bBox), Math.abs(distance), {
            units: "miles",
        })!,
    );

    const originalDeltaLat = bBox[3] - bBox[1];
    const originalDeltaLng = bBox[2] - bBox[0];

    return [
        buffered[0] - originalDeltaLng,
        buffered[1] - originalDeltaLat,
        buffered[2] + originalDeltaLng,
        buffered[3] + originalDeltaLat,
    ];
};

export const determineMeasuringBoundary = async (
    question: MeasuringQuestion,
) => {
    const bBox = turf.bbox(mapGeoJSON.get()!);

    switch (question.type) {
        case "highspeed-measure-shinkansen": {
            const features = osmtogeojson(
                await findPlacesInZone(
                    "[highspeed=yes]",
                    "Finding high-speed lines...",
                    "nwr",
                    "geom",
                ),
            ).features;

            return [highSpeedBase(features)];
        }
        case "coastline": {
            const coastline = turf.lineToPolygon(
                await fetchCoastline(),
            ) as Feature<MultiPolygon>;

            const distanceToCoastline = turf.pointToPolygonDistance(
                turf.point([question.lng, question.lat]),
                coastline,
                {
                    units: "miles",
                    method: "geodesic",
                },
            );

            return [
                turf.difference(
                    turf.featureCollection([
                        turf.bboxPolygon(bBox),
                        turf.buffer(
                            turf.bboxClip(
                                coastline,
                                bBox
                                    ? bboxExtension(
                                          bBox as any,
                                          distanceToCoastline,
                                      )
                                    : [-180, -90, 180, 90],
                            ),
                            distanceToCoastline,
                            {
                                units: "miles",
                                steps: 64,
                            },
                        )!,
                    ]),
                )!,
            ];
        }
        case "airport":
            return [
                turf.combine(
                    turf.featureCollection(
                        _.uniqBy(
                            (
                                await findPlacesInZone(
                                    '["aeroway"="aerodrome"]["iata"]', // Only commercial airports have IATA codes,
                                    "Finding airports...",
                                )
                            ).elements,
                            (feature: any) => feature.tags.iata,
                        ).map(elementToPoint),
                    ),
                ).features[0],
            ];
        case "city":
            return [
                turf.combine(
                    turf.featureCollection(
                        await findRawPlaces(
                            '[place=city]["population"~"^[1-9]+[0-9]{6}$"]', // The regex is faster than (if:number(t["population"])>1000000)
                            "Finding cities...",
                        ),
                    ),
                ).features[0],
            ];
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
                return [turf.multiPolygon([])];
            }

            return [
                turf.combine(turf.featureCollection(result.points)).features[0],
            ];
        }
        case "custom-measure":
            return turf.combine(
                turf.featureCollection((question as any).geo.features),
            ).features;
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
        case "mcdonalds":
        case "seven11":
        case "rail-measure":
            return false;
    }
};

const bufferedDeterminer = _.memoize(
    async (question: MeasuringQuestion) => {
        const placeData = await determineMeasuringBoundary(question);

        if (placeData === false || placeData === undefined) return false;

        return arcBufferToPoint(
            turf.featureCollection(placeData as any),
            question.lat,
            question.lng,
        );
    },
    (question) =>
        JSON.stringify({
            type: question.type,
            lat: question.lat,
            lng: question.lng,
            entirety: polyGeoJSON.get(),
            geo: (question as any).geo,
        }),
);

export const adjustPerMeasuring = async (
    question: MeasuringQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    const buffer = await bufferedDeterminer(question);

    if (buffer === false) return mapData;

    return modifyMapData(mapData, buffer, question.hiderCloser);
};

export const hiderifyMeasuring = async (question: MeasuringQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    if (isHomeGameType(question.type)) {
        const questionNearest = await nearestToQuestion(
            question as HomeGameMeasuringQuestions,
        );
        const hiderNearest = await nearestToQuestion({
            lat: $hiderMode.latitude,
            lng: $hiderMode.longitude,
            hiderCloser: true,
            type: (question as HomeGameMeasuringQuestions).type,
            drag: false,
            color: "black",
            collapsed: false,
            hidden: false,
        });

        if (!questionNearest || !hiderNearest) {
            // No in-bounds instance of this feature type: void for this game.
            return question;
        }

        question.hiderCloser =
            questionNearest.properties.distanceToPoint >
            hiderNearest.properties.distanceToPoint;

        return question;
    }

    if (question.type === "rail-measure") {
        const points = [
            { lat: question.lat, lng: question.lng },
            { lat: $hiderMode.latitude, lng: $hiderMode.longitude },
        ];
        const stations = await materializeStationsForQuestion(points);
        const result = resolveTransitMeasuringQuestion({
            question,
            hiderLocation: {
                lat: $hiderMode.latitude,
                lng: $hiderMode.longitude,
            },
            stations,
        });

        return result.question;
    }

    if (question.type === "mcdonalds" || question.type === "seven11") {
        const points = await findPlacesSpecificInZone(
            question.type === "mcdonalds"
                ? QuestionSpecificLocation.McDonalds
                : QuestionSpecificLocation.Seven11,
        );

        const seeker = turf.point([question.lng, question.lat]);
        const nearest = turf.nearestPoint(seeker, points as any);

        const distance = turf.distance(seeker, nearest, {
            units: "miles",
        });

        const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
        const hiderNearest = turf.nearestPoint(hider, points as any);

        const hiderDistance = turf.distance(hider, hiderNearest, {
            units: "miles",
        });

        question.hiderCloser = hiderDistance < distance;
        return question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    let feature = null;

    try {
        feature = holedMask((await adjustPerMeasuring(question, $mapGeoJSON))!);
    } catch {
        try {
            feature = await adjustPerMeasuring(question, {
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
        question.hiderCloser = !question.hiderCloser;
    }

    return question;
};

export const measuringPlanningPolygon = async (question: MeasuringQuestion) => {
    try {
        const buffered = await bufferedDeterminer(question);

        if (buffered === false) return false;

        return turf.polygonToLine(buffered);
    } catch {
        return false;
    }
};
