import osmtogeojson from "osmtogeojson";

import type { StationPlace } from "@/maps/api";
import { getOverpassData, transitLineNodeFinder } from "@/maps/api";
import { CacheType } from "@/maps/api";

import type { TransitLineMembershipResolver, TransitPoint } from "./transit";

export const buildTransitAroundQuery = ({
    selection,
    point,
    radiusMeters,
    boundaryClause = "",
}: {
    selection: string[];
    point: TransitPoint;
    radiusMeters: number;
    boundaryClause?: string;
}) => `
[out:json][timeout:25];
(
${selection
    .map(
        (filter) =>
            `nwr${filter}(around:${radiusMeters}, ${point.lat}, ${point.lng})${boundaryClause};`,
    )
    .join("\n")}
);
out center;
`;

const stationKey = (station: StationPlace) => {
    const id = station.properties.id;
    if (id) return `id:${id}`;

    return `pt:${station.geometry.coordinates[1]},${station.geometry.coordinates[0]}`;
};

const dedupeStations = (stations: StationPlace[]) => {
    const seen = new Set<string>();
    const deduped: StationPlace[] = [];

    for (const station of stations) {
        const key = stationKey(station);
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(station);
        }
    }

    return deduped;
};

export const findTransitStationsAroundPoint = async ({
    selection,
    point,
    radiusMeters,
    boundaryClause,
    loadingText = "Finding Transit stops...",
}: {
    selection: string[];
    point: TransitPoint;
    radiusMeters: number;
    boundaryClause?: string;
    loadingText?: string;
}): Promise<StationPlace[]> => {
    const data = await getOverpassData(
        buildTransitAroundQuery({
            selection,
            point,
            radiusMeters,
            boundaryClause,
        }),
        loadingText,
        CacheType.ZONE_CACHE,
    );

    return (osmtogeojson(data).features as StationPlace[]).filter(
        (feature) => feature.geometry?.type === "Point",
    );
};

export const findTransitStationsAroundPoints = async ({
    selection,
    points,
    radiiMeters = [1609, 8047, 48280],
    boundaryClause,
}: {
    selection: string[];
    points: TransitPoint[];
    radiiMeters?: number[];
    boundaryClause?: string;
}): Promise<StationPlace[]> => {
    const stations: StationPlace[] = [];

    for (const point of points) {
        for (const radiusMeters of radiiMeters) {
            const pointStations = await findTransitStationsAroundPoint({
                selection,
                point,
                radiusMeters,
                boundaryClause,
            });

            if (pointStations.length > 0) {
                stations.push(...pointStations);
                break;
            }
        }
    }

    return dedupeStations(stations);
};

export const overpassTransitLineMembershipResolver: TransitLineMembershipResolver =
    async (station) => {
        const id = station.properties.id;

        if (!id || !id.includes("/")) {
            return {
                status: "unsupported",
                reason: "Same Transit line requires OSM line metadata.",
            };
        }

        const nodes = await transitLineNodeFinder(id);

        if (nodes.length === 0) {
            return {
                status: "unsupported",
                reason: "No Transit line metadata found for the nearest stop.",
            };
        }

        return {
            status: "supported",
            lineKeys: nodes.map((node) => `node:${node}`),
        };
    };
