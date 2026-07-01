import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// cacheFetch is the seam between the app and the network. Its resilience
// contract (ADR 0011): enforce a 20s timeout, and PROPAGATE fetch rejections
// so callers like getOverpassData can fall back to a mirror host.
//
// The previous implementation had a wide outer catch that swallowed fetch
// rejections (including AbortSignal.timeout) and retried the SAME url — so a
// timed-out primary was hit twice (~40s) before any fallback, defeating the
// fallback policy. These tests exercise the REAL cacheFetch with a mocked
// global fetch + a stubbed CacheStorage, because mocking cacheFetch itself
// (as the overpass-fetch tests do) hides exactly this composition bug.

// Stub the CacheStorage API so determineCache + cache.match/put/delete work.
const mockCache = {
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
};
vi.stubGlobal("caches", {
    open: vi.fn(async () => mockCache),
});

// Stub toast.promise so it just awaits the fetch (no UI).
vi.mock("react-toastify", () => ({
    toast: {
        error: vi.fn(),
        warning: vi.fn(),
        promise: (p: Promise<unknown>) => p,
    },
}));

const { cacheFetch } = await import("@/maps/api/cache");

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

describe("cacheFetch resilience contract", () => {
    beforeEach(() => {
        mockCache.match.mockResolvedValue(undefined); // cache miss by default
        mockCache.put.mockResolvedValue(undefined);
        mockCache.delete.mockResolvedValue(undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the fetched response on success", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(okResponse({ elements: [1] }));
        vi.stubGlobal("fetch", fetchMock);

        const res = await cacheFetch("https://example.com/q", undefined);

        expect(res.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("PROPAGATES a fetch rejection instead of retrying the same url (P1 fix)", async () => {
        // The bug: a fetch rejection (timeout/DNS/CORS) was caught by the outer
        // catch and retried against the SAME url. The contract is to PROPAGATE
        // so getOverpassData can fall back to the mirror. fetch must be called
        // exactly ONCE for the primary, not twice.
        const fetchMock = vi.fn().mockRejectedValue(new Error("network hang"));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            cacheFetch("https://example.com/q", undefined),
        ).rejects.toThrow("network hang");

        // The load-bearing assertion: the primary was hit ONCE, not retried.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "https://example.com/q",
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });
});
