# Make the Overpass fetch resilient: timeout + fallback on any rejection

The Overpass fetch path had two real reliability defects (Candidate 05), both flagged as the top game-day risk in `PLAN.md`:

1. **No client timeout.** `cacheFetch` called bare `fetch(url)` ([`cache.ts`](../../src/maps/api/cache.ts)). The Overpass queries embed a server-side `[timeout:25]`, but that only helps if the server *accepts* the request — a host that accepts the TCP connection but never responds hung forever, leaving an endless "Loading map data…" toast. The same bare-fetch path served `fetchCoastline` and `fetchDenverMunicipalities`, so all three were exposed.
2. **The fallback host was unreachable on the failures that matter.** `getOverpassData` tried the fallback (`OVERPASS_API_FALLBACK`) only when the primary returned an HTTP non-ok status ([`overpass.ts`](../../src/maps/api/overpass.ts)). A network rejection (the timeout above, DNS failure, CORS block) threw *before* the `!response.ok` check and escaped `getOverpassData` entirely — so the configured fallback never fired in exactly the hang/network failure modes that motivate having a fallback.

## Decision

Two focused fixes, each testable through the `getOverpassData` seam:

- **`cacheFetch` now passes `AbortSignal.timeout(20000)` to every `fetch`.** A stalled host rejects after 20s instead of hanging indefinitely. This benefits every `cacheFetch` caller (Overpass, coastline, municipalities). 20s is generous for a real query and well under a user's patience threshold; the server-side `[timeout:25]` is retained as a backstop.
- **`getOverpassData` wraps the primary fetch in try/catch and falls back on ANY primary failure** — a network rejection *or* an HTTP non-ok response both route to the fallback host. Previously only the latter did. The fallback's cache-put-under-primary-key dedup is preserved.

## Consequence

A flaky or stalled Overpass host no longer hangs the app: it times out at 20s, falls back to the mirror, and only surfaces an error if both fail. The fallback policy is now directly unit-tested (4 tests in [`tests/overpass-fetch.test.ts`](../../tests/overpass-fetch.test.ts), the first network-path tests in the API layer — up from zero). This is fix-the-bug territory done with a clean tested seam rather than a large refactor; the `cacheFetch` dedup/inflight logic is intentionally untouched.
