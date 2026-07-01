# Own the Play Boundary's geometry in one deep module

The **Play Boundary** is this fork's most load-bearing domain concept: any feature outside it is treated as if it does not exist (CONTEXT.md). Before this change, that single idea had **five representations** spread across the code — a clean-but-barely-used Overpass clause builder, the same coordinate transform inlined three times in `findPlacesInZone`, a bbox diagonal cap in `nearestToQuestion`, a post-fetch point-in-polygon filter in `materializeTransitStations`, and a JSON-stringified value inside the matching/measuring memo cache keys. Understanding "how does the boundary affect one question" meant bouncing across four files; the boundary logic had **zero tests**.

We introduce [`src/maps/play-boundary.ts`](../../src/maps/play-boundary.ts), a deep module that owns the boundary's **geometry** behind three value-oriented operations:

- **`clipQuery(boundary)`** — the Overpass `(poly:"…")` filter clause, server-side exclusion.
- **`contains(boundary, point)`** — point-in-polygon test, client-side post-filter (honors holes).
- **`bboxCapMiles(boundary)`** — the bbox-diagonal-plus-margin cap for the expanding search.

## Decision

- **Value-oriented operations, not a stateful facade.** The atom (`polyGeoJSON`) stays in [`src/lib/context.ts`](../../src/lib/context.ts) — it's session state. Callers read it once and hand the value to an operation (`b ? clipQuery(b) : ""`). This keeps the interface as the test surface and composes with `transit.ts`'s existing value-injection (`playBoundary` parameter). A facade that read the atom internally would have been harder to test and would hide a data dependency that is genuinely meaningful (the boundary changes between games).
- **Lean interface: three operations only.** No `bbox()` primitive, no `orElse()` fallback helper, no `cacheKey()`. Each of the three maps onto exactly one existing call site; the caller still owns its own fallback. We resist widening until a second caller asks.
- **Type alias, not a branded nominal type.** `PlayBoundary = FeatureCollection<Polygon | MultiPolygon>` — literally the atom's type, renamed. The atom's `null` is already the "no boundary" signal; a brand would create a second representation of the same idea (unbranded-raw vs branded-valid) and force a `parse()` at every read.
- **The memo cache key stays where it is.** `determineMatchingBoundary` / `bufferedDeterminer` key on `{type, lat, lng, cat, geo, entirety: polyGeoJSON.get() ?? mapGeoLocation.get()}`. That key mingles boundary + map location + question fields — it's the *question evaluator's* identity, not the boundary's. Forcing it through `PlayBoundary` would couple geometry to a caching strategy. (Collapsing the duplicated `polyGeoJSON ?? mapGeoLocation` fallback belongs to a future matching/measuring merge, not here.)
- **The dead `boundaryClause` seam in `transit-overpass.ts` stays dead.** `buildTransitAroundQuery` accepts a `boundaryClause` param no caller passes. Wiring it up (server-side clip for transit too) would change network behavior; out of scope for this refactor. The client-side `contains` post-filter remains as belt-and-suspenders, and is the *only* clip for custom transit stations that bypass Overpass entirely.

## Side fix: hole-aware `clipQuery`

The previous inline transform — `turf.getCoords(...).flatMap(...).flat().map(...).join(" ")` — joined a polygon's outer ring and any holes into **one self-intersecting point list**, which Overpass interprets as a single polygon ring. `clipQuery` emits **outer rings only** (holes intentionally omitted: Overpass `poly` matches a closed ring, not a polygon-with-holes). This was **latent** for this fork — the default boundary is a single ring with no holes — but a hand-drawn or imported holed/MultiPolygon boundary would have clipped incorrectly. Server-side exclusion by outer ring + client-side `contains` post-filter together give correct in/out behavior.

## Consequence

A reader can now trace "how does the boundary affect a question" through one module. The five representations collapse to three operations, each with direct unit tests ([`tests/play-boundary.test.ts`](../../tests/play-boundary.test.ts), 12 tests — up from zero). Adding a new boundary behavior (e.g. wiring the transit `boundaryClause`, or a "frame the map on the boundary" feature) lands in one file. This is also foundational for future architecture work: collapsing the `matching.ts`/`measuring.ts` fork-pair is easier once the boundary has a single home.
