# Collapse the matching/measuring fork-pair (extract shared seams, keep distinct shapes)

`src/maps/questions/matching.ts` and `measuring.ts` were **forked twins** — two files that answered the same kinds of questions but shaped their answers differently (matching: a `same` boolean; measuring: a `hiderCloser` distance comparison). Eight concept-blocks were copy-pasted between them, mutating only in the return shape. Every Denver fix had to land twice and the copies were already drifting (measuring read `mapGeoJSON` for its bbox while matching read `polyGeoJSON`).

This change collapses the duplicated blocks into tested seams, done in **vertical slices under TDD** (one failing test → one extraction → repeat), leaving each twin with only what genuinely differs: the shape of the answer.

## Extracted seams

| Block | Was duplicated at | Now lives in | Tests |
|---|---|---|---|
| A — `>=1000` guard + runtime-error remark | matching `findMatchingPlaces`, measuring `determineMeasuringBoundary` | `findCategoryPlaces` | 6 |
| B — `*-full` find+project block | same | `findCategoryPlaces` | (covered above) |
| C — airport/city query+point construction | both | `findRawPlaces` + `elementToPoint` | (covered above) |
| E — the 11-element "Large Game variation" type list | both `hiderify*` | `isHomeGameType` / `HOME_GAME_TYPES` | 4 |
| F — transit-station ceremony (5 atom reads + fetch + materialize) | both `hiderify*` | `materializeStationsForQuestion` | 3 |

Each seam returns at a natural boundary; the caller keeps the part that's genuinely its own — the toast side-effect (A/B), the airport-specific `uniqBy(iata)` dedup (C), the result shaping (`points` vs `combine(points).features[0]`), and the resolution (`resolveTransitMatchingQuestion` vs `resolveTransitMeasuringQuestion`).

## Design decisions

- **The seams detect/report; callers react.** `findCategoryPlaces` returns a discriminated union `{ points } | { error }` and does NOT toast — the side-effect stays in the caller. This keeps the seam side-effect-free and testable through its return value alone.
- **Airport's `uniqBy(iata)` stays in the caller.** The dedup operates on the raw Overpass `tags.iata` *before* projection, so it can't share `findRawPlaces`'s shape. The shared atom — the element→Point projection — is exported as `elementToPoint` instead, so it can't drift.
- **`HOME_GAME_TYPES` is the single source for the 11-type list.** It was inlined in both twins *and* referenced (conceptually) by the picker's `HIDDEN_*` sets (ADR 0006). One home means a category can't silently appear in one twin but not the other.
- **`materializeStationsForQuestion` owns the 5 atom reads.** This is the seam that reads `useCustomStations`, `includeDefaultStations`, `displayHidingZonesOptions`, `customStations`, `polyGeoJSON`. Tests mock the atoms; the function is pure given the atom layer.

## Deferred — blocks G and H

Two duplications were **deliberately left in place**, documented so a future reviewer doesn't re-suggest them:

- **Block G — the `holedMask` try/catch/try/catch tail** (matching `hiderifyMatching`, measuring `hiderifyMeasuring`). Structurally identical, but each is tightly coupled to its local `question`/`$mapGeoJSON` and to a different flag flip (`question.same` vs `question.hiderCloser`). Extracting it would require passing both an adjuster callback and a flag-flip callback — a wide interface for marginal gain. Left until a third caller appears.
- **Block H — the `_.memoize` key resolver** (`polyGeoJSON.get() ?? mapGeoLocation.get()` in both `determineMatchingBoundary` and `bufferedDeterminer`). This is the *question evaluator's* cache identity, mangled with map-location and question fields — not the boundary's concern (ADR 0008 settled that the boundary module does not own the cache key). Left alone.

## Consequence

The twins shrank (matching 449→~370, measuring 447→~365 lines) and the shared logic is now **53 tests deep** (up from zero on these two files at the start of this work). A Denver fix to category-place lookup, the Large-Game type list, or transit-station materialization now lands in one tested module. This composes with the Play Boundary module (ADR 0008): the boundary has one home, and the question lookups that consume it now have shared seams.
