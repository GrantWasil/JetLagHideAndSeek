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

const cacheFetch =
    vi.fn<
        (
            url: string,
            loadingText?: string,
            cacheType?: unknown,
        ) => Promise<unknown>
    >();
const mockCache = { put: vi.fn(), match: vi.fn(), delete: vi.fn() };
const determineCache = vi.fn<
    (cacheType?: unknown) => Promise<typeof mockCache>
>(async () => mockCache);
vi.mock("@/maps/api/cache", () => ({
    cacheFetch: (url: string, loadingText?: string, cacheType?: unknown) =>
        cacheFetch(url, loadingText, cacheType),
    determineCache: (cacheType?: unknown) => determineCache(cacheType),
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
    beforeEach(() => {
        cacheFetch.mockReset();
        determineCache.mockReset();
        determineCache.mockResolvedValue(mockCache);
    });

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

    it("keeps the fallback response even if the cache write fails (P2a)", async () => {
        // The fallback host succeeded; but the best-effort cache-put under the
        // primary key can fail if CacheStorage is unavailable. That failure must
        // NOT discard the good fallback response. Previously the cache write sat
        // inside the same try as the fallback fetch, so a put rejection threw to
        // the catch and returned { elements: [] }.
        cacheFetch
            .mockResolvedValueOnce(badResponse(504)) // primary HTTP error
            .mockResolvedValueOnce(okResponse({ elements: [{ id: 7 }] })); // fallback ok
        // determineCache rejects (CacheStorage unavailable).
        vi.mocked(determineCache).mockRejectedValueOnce(
            new Error("caches unavailable"),
        );
        // Silence the expected console.log from the best-effort catch.
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        const data = await getOverpassData("[out:json];node(1);out;");

        expect(data).toEqual({ elements: [{ id: 7 }] });
        logSpy.mockRestore();
    });
});
