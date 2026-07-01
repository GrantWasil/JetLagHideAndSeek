# Counties from OSM admin level 6; municipalities as a bundled option in the Zone question

For this game the administrative hierarchy is shifted down a level: **county = 1st division, municipality = 2nd division** (a state-level division is useless at metro scale). Both levels live in the existing **Zone / Zone-starts-with-same-letter** matching question, chosen via its zone-level dropdown:

- **Counties (1st):** dropdown set to OSM **Zone 6** (labeled "Counties in Colorado"). OSM has complete, authoritative boundaries for the seven in-play counties, so this needs **zero code**.
- **Municipalities (2nd):** a **"Denver Municipalities"** dropdown option (a `denver-municipalities` sentinel in `cat.adminLevel`) that uses the bundled `public/denver-municipalities.geojson` instead of an OSM admin relation — the `zone` case picks the municipality polygon containing the seeker, and the `letter-zone` case unions all municipalities whose name starts with the same letter.

**Why not OSM level 8, and why bundled:** OSM has no relation for *unincorporated* county land, so an OSM admin-level-8 municipality question errors on any point between incorporated places. The bundled file includes explicit "Unincorporated <County>" catch-all zones for full coverage, and shipping it means no per-game file load.

**Why fold into Zone rather than a separate matching type:** an earlier iteration added a standalone `same-named-zone` type; it was removed in favor of this option so all administrative-division matching lives under one question. The tool's generic hider-mode path already handles any type that produces a boundary via `determineMatchingBoundary`, so the `zone`/`letter-zone` cases needed only a municipality branch. (The existing "custom zone" option is still unsuitable for this — it merges all polygons into one blob via `turf.combine` and only answers a single in/out boolean.)
