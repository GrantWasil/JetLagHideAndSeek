# Denver Hide & Seek — tuning plan & status

Fork tuned for one Medium-size Hide & Seek game in the **western Denver metro** on **RTD** transit. Context/decisions: see [CONTEXT.md](CONTEXT.md) and [docs/adr/](docs/adr/). Scope: **correctness first (A, B, E, counties); features C/D as stretch.**

## Deployment

**Live:** https://grantwasil.github.io/JetLagHideAndSeek/ — static GitHub Pages, built by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (Node 24 + pnpm). Rationale + gotchas: [ADR 0007](docs/adr/0007-host-on-github-pages.md).

- **Deploy a change:** commit to `main`, then `gh workflow run deploy.yml --ref main` — a plain `git push` does **not** reliably trigger the workflow in this fork (see ADR 0007) — then `gh run watch <id>`. Verify live by `curl`-ing the URL and grepping the served `_astro/*.js`.
- **Local build/preview** needs the Node-25 workaround (`NODE_OPTIONS="--localstorage-file=..."`, see Environment note below); CI builds fine on Node 24.
- **Game-day polish shipped:** initial map zoom 5 → 10 (frames the Denver metro, not the continent) + viewport `initial-scale=1` for phones.
- **Teardown after the game:** Settings → Pages → Source → "None", or make the repo private.

### Known runtime dependencies & risks (game-day)

The app is fully client-side and calls third parties directly from the browser; any of these can be blocked by venue Wi-Fi or a privacy blocker:

- **Overpass API** (OSM data for every non-transit question) — primary `overpass-api.de`; the configured fallback `overpass.private.coffee` was **unreachable** when tested, and `src/maps/api/cache.ts` uses a bare `fetch()` with **no client-side timeout**, so a stalled host shows an endless "Loading map data…" toast rather than an error. Highest risk with ~6 players sharing one IP (rate-limiting → 429). *Mitigation if needed:* add an ~20s `AbortController` timeout and/or repoint the fallback at a live mirror.
- **ArcGIS CDN** (`js.arcgis.com`) — serves the geometry `pe-wasm.wasm` (see ADR 0007).
- **Google Fonts / GTM / Clarity** + **upstream-hosted icons** (`taibeled.github.io`) — inherited from upstream; non-fatal if blocked (degrades typography/analytics/icons only).

## Prerequisite (no app code)
- [x] Convert the 3 Google My Maps KMLs → GeoJSON. Output in [`denver-game/`](denver-game/):
  - `denver-border.hidingzone.json` — the border, emitted in the tool's **save-file shape** (FeatureCollection + `disabledStations:[]` etc.) so it imports via Options → Load without tripping the loader's unguarded `disabledStations.constructor` access. Geometry validated (DEN/Boulder/Colorado Springs out; downtown/Golden/Denver Zoo in).
  - `denver-counties.geojson` — 7 counties, `properties.name` per feature (reference; counties use OSM).
  - `denver-municipalities.geojson` — 36 municipalities incl. "Uninc. <County>" (input for workstream C).
- [ ] In-app: Options → Load `denver-border.hidingzone.json` to set the boundary (`polyGeoJSON`). This is what makes feature queries clip.
- [ ] Counties (1st admin): built-in "same zone" question, **OSM Zone = 6**. Municipalities (2nd): needs workstream C.

## Environment note
The sandbox has **Node 25.9.0** but this project requires **Node <25** (`package.json` engines). Node 25's experimental `localStorage` breaks `@nanostores/persistent` during SSR/prerender, so `astro build`/`astro dev` fail there (confirmed identical on clean `master` — not a regression). Workarounds: use Node <25, or `NODE_OPTIONS="--localstorage-file=/some/path" pnpm build`. The client-rendered app itself runs fine (verified via `astro preview`).

## In-app verification (A+B+E, via `astro preview`)
- Measuring picker: 26 options, void types **absent** (Coastline, Commercial Airport, Major City, High-Speed Rail); Aquarium **kept** (distance).
- Matching picker: 27 options, **absent** Commercial Airport, Major City, Aquarium (both variants); Zone/Custom/stations retained.
- New-question default is **Mountain** (peak-full), not the hidden airport/coastline.
- Questions run + render end-to-end; the ≥1000-results guard fires on country-scale maps (expected; bounded on the Denver polygon).

## Workstreams

### A — Boundary-bypass fix — ✅ DONE (verified)
Feature queries no longer leak out-of-bounds instances, and the runaway search loop can't hang.
- `overpass.ts`: added `boundaryPolyClause()`; `findTentacleLocations` now clips to `polyGeoJSON`; `nearestToQuestion` is capped (bbox-diagonal + margin) and returns `null` when a type has no in-bounds instance.
- `matching.ts` / `measuring.ts`: `hiderify*` guard the `null` (void) case.
- `ZoneSidebar.tsx`: guarded the `null`, capped the duplicate loop, skip station when nothing in-bounds.
- Verified: `tsc` introduces 0 new errors (10 pre-existing, unrelated); `vitest` 17/17 pass.

### B — Hide void questions — ✅ DONE (verified)
- `matching.tsx` / `measuring.tsx`: filter the schema-driven picker via `HIDDEN_MATCHING_TYPES` / `HIDDEN_MEASURING_TYPES` (airport, major-city/city, high-speed rail, coastline).
- `schema.ts`: repointed the two ordinary-question defaults off the now-hidden `airport`/`coastline` → `peak-full`.

### E — Minor accuracy — ✅ DONE (verified)
- Foreign consulate: new `LOCATION_EXTRA_FILTER` in `constants.ts` appends `["consulate"!="honorary_consul"]` at all 3 query sites → keeps the 2 real (Mexico, Perú), drops honorary.
- Aquarium: matching variant hidden (folded into `HIDDEN_MATCHING_TYPES`); distance-to-aquarium kept.
- `-full` measuring variants are the boundary-safe ones shown by default.

Verification for A+B+E: `tsc` 0 new errors (10 pre-existing), `vitest` 17/17, Prettier clean, ESLint clean.

### C — Municipalities as a "Denver Municipalities" option in the Zone question — ✅ DONE (verified)
Folded into the existing Zone / Zone-starts-with-same-letter matching question — no separate matching type (see [ADR 0002](docs/adr/0002-admin-zones-county-osm-municipality-custom.md)):
- `schema.ts`: `cat.adminLevel` gains a `"denver-municipalities"` sentinel alongside the OSM levels 2–10.
- `matching.ts`: the `zone` case picks the bundled municipality polygon containing the seeker; the `letter-zone` case unions all municipalities whose name starts with the same letter. `modifyMapData` + the generic hider-mode path handle same/different unchanged.
- Municipalities are **bundled**: `public/denver-municipalities.geojson` (~1.2 MB, 36 zones) served + fetched via `fetchDenverMunicipalities()`. No per-game file load; nothing bulky stored in the question/localStorage/shares.
- `matching.tsx`: the zone-level dropdown gains a "Denver Municipalities" entry (non-numeric value handled in `onValueChange`); the ±360 ft simplification warning is hidden for it. The standalone `same-named-zone` type, its card UI, and the GeoJSON file-import were removed.
- Verified end-to-end in-app: **Zone** + "Denver Municipalities" narrows to the seeker's municipality (Lakewood); **letter-zone** unions same-first-letter municipalities (L → Lakewood/Lakeside/Littleton/Lone Tree/Lafayette). 0 new type errors, 17/17 tests, lint clean.
- **To use:** add a Matching question → type **Zone** (or **Zone Starts With Same Letter**) → zone-level dropdown → **Denver Municipalities**. (Re-generate the bundled file: `python3 denver-game/convert_kml_to_geojson.py <dir-with-kmls>`.)

### D — RTD bus + rail transit — ⬜ STRETCH
Wire station matching to the transit selection (`matching.ts:326`, node→nwr); add `route=bus` line matching (ref + network=RTD); **nearest-stop via bounded query** (4,473 stops > 1,000-element guard). See [ADR 0004](docs/adr/0004-model-rtd-bus-lines.md).

### F — Rules parity — ✅ audit done; embellishments hidden, gaps backlogged
Audited every tool option vs the official 20 Matching + 20 Measuring + Radar/Thermometer/Tentacle. See [ADR 0005](docs/adr/0005-question-parity.md).
- **Hidden as non-official:** Zone/Station "starts with same letter", Major City, McDonald's, 7-Eleven (added to the `HIDDEN_*` sets).
- **Backlog (official questions not yet built, deferred):** Sea Level (altitude), Body of Water, Street or Path, Metro-line tentacle, 1st/2nd admin-division *border* distance. (International Border and Landmass are void/irrelevant for this boundary.)

## Verification
`pnpm exec tsc --noEmit` (expect 10 pre-existing errors) · `pnpm exec vitest run` (17 tests).
