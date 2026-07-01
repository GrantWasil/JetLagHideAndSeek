import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";

import type { CustomStation, StationCircle, StationPlace } from "@/maps/api";
import { contains, type PlayBoundary } from "@/maps/play-boundary";
import type { MatchingQuestion, MeasuringQuestion } from "@/maps/schema";

export type TransitPoint = {
    lat: number;
    lng: number;
};

export type TransitLineMembership =
    | {
          status: "supported";
          lineKeys: string[];
      }
    | {
          status: "unsupported";
          reason: string;
      };

export type TransitLineMembershipResolver = (
    station: StationPlace,
) => Promise<TransitLineMembership>;

export type TransitQuestionStatus = "answered" | "empty" | "unsupported";

export type TransitQuestionResult<TQuestion> = {
    status: TransitQuestionStatus;
    question: TQuestion;
    reason?: string;
};

export type TransitStationCircleFilterResult =
    TransitQuestionResult<MatchingQuestion> & {
        stationCircles: StationCircle[];
    };

export const transitSelectionRequiresBoundedLookup = (selection: string[]) =>
    selection.some((filter) => filter.includes("highway=bus_stop"));

export const materializeTransitStations = ({
    defaultStations,
    customStations,
    useCustomStations,
    includeDefaultStations,
    playBoundary,
}: {
    defaultStations: StationPlace[];
    customStations: CustomStation[];
    useCustomStations: boolean;
    includeDefaultStations: boolean;
    playBoundary?:
        | Feature<Polygon | MultiPolygon>
        | FeatureCollection<Polygon | MultiPolygon>;
}): StationPlace[] => {
    const customPlaces: StationPlace[] = customStations.map((station) => ({
        type: "Feature",
        geometry: {
            type: "Point",
            coordinates: [station.lng, station.lat],
        },
        properties: {
            id: station.id || `${station.lat},${station.lng}`,
            name: station.name,
        },
    }));

    const insidePlayBoundary = (station: StationPlace) => {
        if (!playBoundary) return true;
        // The play boundary may arrive as a single Feature or a
        // FeatureCollection; normalize so the contains() op (which takes a
        // FeatureCollection) handles both. See src/maps/play-boundary.ts.
        const boundary: PlayBoundary =
            playBoundary.type === "FeatureCollection"
                ? playBoundary
                : {
                      type: "FeatureCollection",
                      features: [playBoundary],
                  };
        return contains(boundary, station);
    };

    const filterToPlayBoundary = (stations: StationPlace[]) =>
        stations.filter(insidePlayBoundary);

    if (!useCustomStations) return filterToPlayBoundary(defaultStations);
    if (!includeDefaultStations) return filterToPlayBoundary(customPlaces);

    const seen = new Set<string>();
    const merged: StationPlace[] = [];

    for (const station of [...defaultStations, ...customPlaces]) {
        const id = station.properties.id;
        const coordinates = station.geometry.coordinates;
        const key =
            id && id.includes("/")
                ? `id:${id}`
                : `pt:${coordinates[1]},${coordinates[0]}`;

        if (!seen.has(key)) {
            seen.add(key);
            merged.push(station);
        }
    }

    return filterToPlayBoundary(merged);
};

export const nearestTransitStation = (
    point: TransitPoint,
    stations: StationPlace[],
): StationPlace | null => {
    if (stations.length === 0) return null;

    return turf.nearestPoint(
        turf.point([point.lng, point.lat]),
        turf.featureCollection(stations),
    ) as unknown as StationPlace;
};

const stationName = (station: StationPlace): string | undefined =>
    station.properties["name:en"] || station.properties.name;

const haveSharedLine = (a: string[], b: string[]) =>
    a.some((lineKey) => b.includes(lineKey));

export const resolveTransitMatchingQuestion = async ({
    question,
    hiderLocation,
    stations,
    resolveLines,
}: {
    question: MatchingQuestion;
    hiderLocation: TransitPoint;
    stations: StationPlace[];
    resolveLines: TransitLineMembershipResolver;
}): Promise<TransitQuestionResult<MatchingQuestion>> => {
    const seekerStation = nearestTransitStation(question, stations);
    const hiderStation = nearestTransitStation(hiderLocation, stations);

    if (!seekerStation || !hiderStation) {
        return { status: "empty", question };
    }

    const nextQuestion = { ...question };

    if (question.type === "same-train-line") {
        const seekerLines = await resolveLines(seekerStation);
        const hiderLines = await resolveLines(hiderStation);

        if (seekerLines.status === "unsupported") {
            return {
                status: "unsupported",
                question,
                reason: seekerLines.reason,
            };
        }

        if (hiderLines.status === "unsupported") {
            return {
                status: "unsupported",
                question,
                reason: hiderLines.reason,
            };
        }

        nextQuestion.same = haveSharedLine(
            seekerLines.lineKeys,
            hiderLines.lineKeys,
        );
        return { status: "answered", question: nextQuestion };
    }

    const seekerName = stationName(seekerStation);
    const hiderName = stationName(hiderStation);

    if (!seekerName || !hiderName) {
        return {
            status: "unsupported",
            question,
            reason: "Nearest Transit station is missing a name.",
        };
    }

    if (question.type === "same-first-letter-station") {
        nextQuestion.same =
            seekerName[0].toUpperCase() === hiderName[0].toUpperCase();
    } else if (question.type === "same-length-station") {
        if (hiderName.length === seekerName.length) {
            nextQuestion.lengthComparison = "same";
        } else if (hiderName.length < seekerName.length) {
            nextQuestion.lengthComparison = "shorter";
        } else {
            nextQuestion.lengthComparison = "longer";
        }
    }

    return { status: "answered", question: nextQuestion };
};

export const resolveTransitMeasuringQuestion = ({
    question,
    hiderLocation,
    stations,
}: {
    question: MeasuringQuestion;
    hiderLocation: TransitPoint;
    stations: StationPlace[];
}): TransitQuestionResult<MeasuringQuestion> => {
    const seekerStation = nearestTransitStation(question, stations);
    const hiderStation = nearestTransitStation(hiderLocation, stations);

    if (!seekerStation || !hiderStation) {
        return { status: "empty", question };
    }

    const seeker = turf.point([question.lng, question.lat]);
    const hider = turf.point([hiderLocation.lng, hiderLocation.lat]);
    const nextQuestion = { ...question };

    nextQuestion.hiderCloser =
        turf.distance(hider, hiderStation) <
        turf.distance(seeker, seekerStation);

    return { status: "answered", question: nextQuestion };
};

export const transitMeasuringPreviewCircles = ({
    question,
    selectedStationCircle,
    stationCircles,
    hidingRadius,
    units,
}: {
    question: MeasuringQuestion;
    selectedStationCircle: StationCircle;
    stationCircles: StationCircle[];
    hidingRadius: number;
    units: turf.Units;
}): Feature<Polygon>[] => {
    const stations = stationCircles.map((circle) => circle.properties);
    const nearestStation = nearestTransitStation(question, stations);

    if (!nearestStation) return [];

    const seeker = turf.point([question.lng, question.lat]);
    const distance = turf.distance(seeker, nearestStation, { units });
    const selectedStation = selectedStationCircle.properties;

    return stationCircles
        .filter(
            (circle) =>
                turf.distance(selectedStation, circle.properties, { units }) <
                distance + hidingRadius,
        )
        .map((circle) =>
            turf.circle(circle.properties, distance, {
                units,
            }),
        );
};

const transitMatchingPredicate = async ({
    question,
    referenceStation,
    candidateStation,
    resolveLines,
}: {
    question: MatchingQuestion;
    referenceStation: StationPlace;
    candidateStation: StationPlace;
    resolveLines: TransitLineMembershipResolver;
}): Promise<TransitQuestionResult<boolean>> => {
    if (question.type === "same-train-line") {
        const referenceLines = await resolveLines(referenceStation);
        const candidateLines = await resolveLines(candidateStation);

        if (referenceLines.status === "unsupported") {
            return {
                status: "unsupported",
                question: false,
                reason: referenceLines.reason,
            };
        }

        if (candidateLines.status === "unsupported") {
            return {
                status: "unsupported",
                question: false,
                reason: candidateLines.reason,
            };
        }

        const shared = haveSharedLine(
            referenceLines.lineKeys,
            candidateLines.lineKeys,
        );
        return {
            status: "answered",
            question: question.same ? shared : !shared,
        };
    }

    const referenceName = stationName(referenceStation);
    const candidateName = stationName(candidateStation);

    if (!referenceName || !candidateName) {
        return {
            status: "unsupported",
            question: false,
            reason: "Nearest Transit station is missing a name.",
        };
    }

    if (question.type === "same-first-letter-station") {
        const shared =
            referenceName[0].toUpperCase() === candidateName[0].toUpperCase();
        return {
            status: "answered",
            question: question.same ? shared : !shared,
        };
    }

    if (question.type === "same-length-station") {
        const comparison = question.lengthComparison;
        const candidateLength = candidateName.length;
        const referenceLength = referenceName.length;

        return {
            status: "answered",
            question:
                (comparison === "same" &&
                    candidateLength === referenceLength) ||
                (comparison === "shorter" &&
                    candidateLength < referenceLength) ||
                (comparison === "longer" && candidateLength > referenceLength),
        };
    }

    return { status: "answered", question: true };
};

export const filterTransitStationCirclesForMatchingQuestion = async ({
    question,
    stationCircles,
    resolveLines,
}: {
    question: MatchingQuestion;
    stationCircles: StationCircle[];
    resolveLines: TransitLineMembershipResolver;
}): Promise<TransitStationCircleFilterResult> => {
    const referenceStation = nearestTransitStation(
        question,
        stationCircles.map((circle) => circle.properties),
    );

    if (!referenceStation) {
        return { status: "empty", question, stationCircles };
    }

    const keptCircles: StationCircle[] = [];

    for (const circle of stationCircles) {
        const predicate = await transitMatchingPredicate({
            question,
            referenceStation,
            candidateStation: circle.properties,
            resolveLines,
        });

        if (predicate.status === "unsupported") {
            return {
                status: "unsupported",
                question,
                stationCircles,
                reason: predicate.reason,
            };
        }

        if (predicate.question) {
            keptCircles.push(circle);
        }
    }

    return { status: "answered", question, stationCircles: keptCircles };
};
