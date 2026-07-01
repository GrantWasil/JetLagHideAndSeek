import _ from "lodash";
import { toast } from "react-toastify";

import { CacheType } from "./types";

// Client-side deadline for every fetch through cacheFetch. A stalled host
// (Overpass, coastline, municipalities) used to hang forever — the server-side
// Overpass `[timeout:25]` only helps if the server accepts the request; a host
// that accepts the TCP connection but never responds was indefinite. This turns
// that hang into a rejection after 20s, which getOverpassData then turns into a
// fallback to the mirror host (see overpass.ts). 20s is generous for a real
// query and well under a user's patience threshold.
const FETCH_TIMEOUT_MS = 20000;

const determineQuestionCache = _.memoize(() => caches.open(CacheType.CACHE));
const determineZoneCache = _.memoize(() => caches.open(CacheType.ZONE_CACHE));
const determinePermanentCache = _.memoize(() =>
    caches.open(CacheType.PERMANENT_CACHE),
);

const inFlightFetches = new Map<string, Promise<Response>>();

export const determineCache = async (cacheType: CacheType) => {
    switch (cacheType) {
        case CacheType.CACHE:
            return await determineQuestionCache();
        case CacheType.ZONE_CACHE:
            return await determineZoneCache();
        case CacheType.PERMANENT_CACHE:
            return await determinePermanentCache();
    }
};

export const cacheFetch = async (
    url: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    // The CacheStorage API (caches.open/match/put) can be unavailable in some
    // environments. If so, fall back to a plain fetch with the timeout. This
    // catch is scoped to the CACHE-ACCESS setup only — a network/fetch
    // rejection (timeout, DNS, CORS) from the fetch below must PROPAGATE so
    // callers like getOverpassData can fall back to a mirror host. Previously
    // this catch wrapped the fetch too, swallowing the rejection and retrying
    // the SAME url (so a timed-out primary was hit twice before any fallback).
    let cache: Cache | null = null;
    try {
        cache = await determineCache(cacheType);
        const cachedResponse = await cache.match(url);
        if (cachedResponse) {
            if (!cachedResponse.ok) {
                await cache.delete(url);
            } else {
                return cachedResponse.clone();
            }
        }
    } catch (e) {
        console.log(e); // Probably a caches not supported error
    }

    const inflightKey = `${cacheType}:${url}`;
    const existingFetch = inFlightFetches.get(inflightKey);
    if (existingFetch) {
        const response = await existingFetch;
        return response.clone();
    }

    const fetchAndMaybeCache = async () => {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        // Cache writes are best-effort: if the cache API is unavailable (cache
        // is null) or the write throws, the response still returns. The fetch
        // itself rejecting PROPAGATES (no catch here) per the resilience
        // contract in ADR 0011.
        try {
            if (response.ok) {
                await cache?.put(url, response.clone());
            } else {
                await cache?.delete(url);
            }
        } catch (e) {
            console.log(e); // Probably a caches not supported error
        }
        return response;
    };

    const fetchPromise = fetchAndMaybeCache();
    inFlightFetches.set(inflightKey, fetchPromise);

    try {
        const response = await (loadingText
            ? toast.promise(fetchPromise, {
                  pending: loadingText,
              })
            : fetchPromise);

        return response.clone();
    } finally {
        inFlightFetches.delete(inflightKey);
    }
};

export const clearCache = async (cacheType: CacheType = CacheType.CACHE) => {
    try {
        const cache = await determineCache(cacheType);
        await cache.keys().then((keys) => {
            keys.forEach((key) => {
                cache.delete(key);
            });
        });
    } catch (e) {
        console.log(e); // Probably a caches not supported error
    }
};
