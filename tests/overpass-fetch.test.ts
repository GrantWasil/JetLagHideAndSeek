import { beforeEach, describe, expect, it, vi } from "vitest";

// getOverpassData owns the Overpass fallback policy. Its two real bugs
// (Candidate 05): (1) no client timeout — a stalled host hangs forever;
// (2) the fallback fires only on HTTP non-ok, NOT on a network rejection
// (timeout/DNS/CORS), so the configured fallback host is unreachable in
// exactly the failure modes that motivate having one.
//
// We test the fallback policy by mocking ./cache (cacheFetch + determineCache)
// so we can drive each branch: primary ok, primary rejects (network hang),
// both fail. This is the agreed seam.

const cacheFetch = vi.fn();
const mockCache = { put: vi.fn(), match: vi.fn(), delete: vi.fn() };
vi.mock("@/maps/api/cache", () => ({
    cacheFetch: (...a: unknown[]) => cacheFetch(...a),
    determineCache: async () => mockCache,
}));

// Stub toast so the error-path side effect doesn't surface in test output.
vi.mock("react-toastify", () => ({
    toast: {
        error: vi.fn(),
        warning: vi.fn(),
        promise: (p: Promise<unknown>) => p,
    },
}));

const { getOverpassData } = await import("@/maps/api/overpass");

const okResponse = (body: unknown) =>
    ({
        ok: true,
        status: 200,
        statusText: "OK",
        clone() {
            return okResponse(body);
        },
        json: async () => body,
    }) as any;

const badResponse = (status = 500) =>
    ({
        ok: false,
        status,
        statusText: "Server Error",
        clone() {
            return badResponse(status);
        },
    }) as any;

describe("getOverpassData fallback policy", () => {
    beforeEach(() => cacheFetch.mockReset());

    it("returns the primary response's data when the primary succeeds", async () => {
        cacheFetch.mockResolvedValue(okResponse({ elements: [{ id: 1 }] }));

        const data = await getOverpassData("[out:json];node(1);out;");

        expect(data).toEqual({ elements: [{ id: 1 }] });
        // Only the primary URL was hit — no fallback.
        expect(cacheFetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to the fallback host when the primary rejects (network hang/timeout)", async () => {
        // The bug: a network rejection used to escape getOverpassData entirely,
        // skipping the fallback. The fix wraps the primary in try/catch.
        cacheFetch
            .mockRejectedValueOnce(new Error("network hang")) // primary rejects
            .mockResolvedValueOnce(okResponse({ elements: [{ id: 2 }] })); // fallback ok

        const data = await getOverpassData("[out:json];node(1);out;");

        expect(data).toEqual({ elements: [{ id: 2 }] });
        expect(cacheFetch).toHaveBeenCalledTimes(2); // primary then fallback
    });

    it("falls back when the primary returns HTTP non-ok (the original behavior, preserved)", async () => {
        cacheFetch
            .mockResolvedValueOnce(badResponse(504)) // primary HTTP error
            .mockResolvedValueOnce(okResponse({ elements: [{ id: 3 }] })); // fallback ok

        const data = await getOverpassData("[out:json];node(1);out;");

        expect(data).toEqual({ elements: [{ id: 3 }] });
        expect(cacheFetch).toHaveBeenCalledTimes(2);
    });

    it("returns { elements: [] } when both primary and fallback fail", async () => {
        cacheFetch
            .mockRejectedValueOnce(new Error("primary down"))
            .mockRejectedValueOnce(new Error("fallback down"));

        const data = await getOverpassData("[out:json];node(1);out;");

        expect(data).toEqual({ elements: [] });
        expect(cacheFetch).toHaveBeenCalledTimes(2);
    });
});
