import { describe, expect, it } from "vitest";

import { questionSchema } from "@/maps/schema";

const stationCoordinates = {
    lat: 39.7392,
    lng: -104.9903,
};

describe("questionSchema station compatibility", () => {
    it.each(["same-length-station", "same-train-line"] as const)(
        "parses old matching payloads for %s",
        (type) => {
            expect(
                questionSchema.parse({
                    id: "matching",
                    data: {
                        ...stationCoordinates,
                        type,
                    },
                }),
            ).toMatchObject({
                id: "matching",
                data: { type },
            });
        },
    );

    it("parses hidden same-first-letter-station matching payloads", () => {
        expect(
            questionSchema.parse({
                id: "matching",
                data: {
                    ...stationCoordinates,
                    hidden: true,
                    type: "same-first-letter-station",
                },
            }),
        ).toMatchObject({
            id: "matching",
            data: {
                hidden: true,
                type: "same-first-letter-station",
            },
        });
    });

    it("parses old measuring payloads for rail-measure", () => {
        expect(
            questionSchema.parse({
                id: "measuring",
                data: {
                    ...stationCoordinates,
                    type: "rail-measure",
                },
            }),
        ).toMatchObject({
            id: "measuring",
            data: { type: "rail-measure" },
        });
    });
});
