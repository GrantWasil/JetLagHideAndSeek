# Counties from OSM admin level 6; municipalities from a custom named-zone type

For this game the administrative hierarchy is shifted down a level: **county = 1st division, municipality = 2nd division** (a state-level division is useless at metro scale). We source the two levels differently:

- **Counties (1st):** use the existing "same zone" question with the OSM admin-level dropdown set to **6**. OSM has complete, authoritative boundaries for the seven in-play counties, so this needs **zero code**.
- **Municipalities (2nd):** add a new **`same-named-zone`** matching type that loads the user's own municipality GeoJSON and answers "same named zone as the hider" by name-equality of the containing polygon.

**Why the asymmetry:** OSM has no relation for *unincorporated* county land, so an OSM admin-level-8 municipality question errors on any point between incorporated places. The user's GeoJSON includes explicit "Unincorporated <County>" catch-all zones, giving full coverage. The existing "custom zone" option can't be reused because it merges all polygons into one blob (`turf.combine`) and only answers a single in/out boolean — it can't distinguish *which* named municipality contains a point.

**Consequence:** the new type must store the raw FeatureCollection (no `turf.combine`, preserving `properties.name`) and compare containing-feature names for seeker vs hider, mirroring the existing home-game name-equality pattern.
