# The Play Boundary atom is never null

"Clear Questions & Cache" (the between-rounds reset in [`PlacePicker.tsx`](../../src/components/PlacePicker.tsx)) reset the Play Boundary to **Denver-the-point** instead of the Denver-metro polygon. The root cause was a single value carrying two meanings:

- **"I've been reset / cleared."** This is what the seven `polyGeoJSON.set(null)` call sites intended — Clear, plus the searched-location / addition-mode flows.
- **"Fall back to the searched Denver point."** This is what the `hidingZone` computed in [`context.ts`](../../src/lib/context.ts) _reinterpreted_ `null` as: its `else` branch swapped in `mapGeoLocation` (a Denver point, upstream's "play in a searched city" model) whenever the polygon was absent.

So pushing the boundary to `null` on clear sent it from "Denver-metro polygon" → `null` → "Denver point." One value, two meanings — that ambiguity is the whole bug class, not just the one button.

## Context

This fork runs one game inside one fixed polygon (`DEFAULT_PLAY_BOUNDARY`, the Denver-metro border from Google My Maps). The searched-location model — `mapGeoLocation` as a point, additional locations, "Reuse Preset Locations", and the `isHidingZone` save shape — is upstream machinery that this fork does not use. It only ever round-trips its own polygon saves. CONTEXT.md already names the Play Boundary the fork's "most load-bearing domain concept" (ADR 0008); letting its state representation be ambiguous undercut that.

## Decision

**Eliminate `null` as a reachable value of `polyGeoJSON`, in both value and type.**

- **The cleared/reset state _is_ `DEFAULT_PLAY_BOUNDARY`.** All seven `polyGeoJSON.set(null)` call sites now set the default boundary. There is no sentinel for "no boundary" — a reset returns the game to the canonical boundary, which is exactly what "reset" should mean here.
- **The atom's TypeScript type drops `| null`** (`persistentAtom<FeatureCollection<Polygon | MultiPolygon>>`). The contract — "always a polygon" — is now compiler-checked, not convention. Every read site's `if ($polyGeoJSON)` / `get() ?? undefined` guard was flattened to its truthy body, so no dead null branch remains for a future contributor to misread.
- **`hidingZone`'s searched-point `else` branch is removed.** It is never reached in this fork, and keeping it would have left the reinterpretation (`null` → Denver point) live — the bug, in waiting. `mapGeoLocation`/`additionalMapGeoLocations` drop out of the computed's dependencies.
- **Stale persisted `null` is migrated on load.** The atom's `decode` is now `decodePlayBoundary`, which structurally validates the parsed value (non-null, `type === "FeatureCollection"`, has `features`) and falls back to `DEFAULT_PLAY_BOUNDARY` for any stale `null` or malformed value. This is a one-time, invisible migration for every returning user: once normalized, the next write persists the canonical boundary.

**Scope: focused, not full cleanup.** The dead searched-location _UI_ (the place search box, add/remove-location toggles, "Reuse Preset Locations" button) and the `mapGeoLocation`/`additionalMapGeoLocations` atoms are left in place — they are now inert (their `set(null)` calls reset to the default, never to a point). Removing them is a separable "delete unused features" refactor; entangling it with this bug fix would balloon the diff and the review surface for no behavioral gain. The cosmetic `$polyGeoJSON`-truthy conditionals in `PlacePicker.tsx` are likewise left as harmless always-true branches for the same reason.

## Alternatives considered

- **Localized fix: repoint only the Clear button to `DEFAULT_PLAY_BOUNDARY`.** Rejected — leaves `null` reachable from six other sites and the `hidingZone` fallback branch live, so the bug class survives. We did not want to fix one door and leave six open.
- **Keep the type `| null`, fix only the runtime value.** Rejected — the type would _lie_ (claim null is possible when the contract says it isn't), and every flattened read would become a permanently-true defensive branch that invites a future null-fallback... reproducing this bug. The type tightening is what makes the guarantee load-bearing.

## Consequence

"Clear Questions & Cache" now resets the boundary to the Denver-metro polygon, as intended, and there is no code path — clear, import, location toggle — that can reintroduce the Denver point. `null` can neither be written nor (after migration) read, and TypeScript enforces it at every call site. The migration is verified by [`tests/play-boundary-atom.test.ts`](../../tests/play-boundary-atom.test.ts); the existing boundary/Overpass tests remain green. Removing the dead searched-location UI + the two location atoms is tracked as a separate follow-up.
