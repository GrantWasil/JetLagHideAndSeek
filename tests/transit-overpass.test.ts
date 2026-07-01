import { describe, expect, it } from "vitest";

import { buildTransitAroundQuery } from "../src/maps/questions/transit-overpass";

describe("Transit Overpass adapter", () => {
    it("builds bounded point lookup for selected Transit filters", () => {
        const query = buildTransitAroundQuery({
            selection: ["[highway=bus_stop]", "[railway=station]"],
            point: { lat: 39.7, lng: -105 },
            radiusMeters: 1609,
        });

        expect(query).toContain("around:1609, 39.7, -105");
        expect(query).toContain("nwr[highway=bus_stop]");
        expect(query).toContain("nwr[railway=station]");
        expect(query).toContain("out center;");
    });
});
